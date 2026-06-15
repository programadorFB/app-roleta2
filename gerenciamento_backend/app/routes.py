"""
Routes do gerenciamento.

Autenticação: 100% via gateway (X-User-Id assinado). Não há /auth/login,
/auth/register, /auth/reset-password — o ciclo de vida do usuário é
controlado pela tabela `subscriptions` (webhooks Hubla/Kirvano no roleta3).
"""

import base64
import uuid
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation

from flask import Blueprint, request, jsonify
from sqlalchemy import desc, func, extract, text

from . import db
from .gateway import gateway_required
from .models import (
    BettingProfile,
    Transaction,
    Objective,
    BettingSession,
    UserPreferences,
)


main = Blueprint('main', __name__)


# =============================================================================
# Helpers
# =============================================================================

def _ensure_preferences(user_id):
    prefs = db.session.get(UserPreferences, user_id)
    if prefs is None:
        prefs = UserPreferences(user_id=user_id)
        db.session.add(prefs)
        db.session.flush()
    return prefs


def _get_user_balance(user_id):
    """Saldo atual = (depósitos + ganhos) - (saques + perdas)."""
    total_inflow = db.session.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
        Transaction.user_id == user_id,
        Transaction.type.in_(['deposit', 'gains']),
    ).scalar() or Decimal('0.00')

    total_outflow = db.session.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
        Transaction.user_id == user_id,
        Transaction.type.in_(['withdraw', 'losses']),
    ).scalar() or Decimal('0.00')

    return Decimal(total_inflow) - Decimal(total_outflow)


def _get_user_initial_bank(user_id):
    initial_tx = Transaction.query.filter_by(
        user_id=user_id, is_initial_bank=True,
    ).first()
    if initial_tx:
        return initial_tx.amount

    profile = BettingProfile.query.filter_by(user_id=user_id, is_active=True).first()
    if profile:
        return profile.initial_balance

    return Decimal('0.00')


def _safe_decimal(value, default='0'):
    if value in (None, '', 'undefined', 'null', 'NaN'):
        return Decimal(default)
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return Decimal(default)


# =============================================================================
# Health (sem auth — usado pelo healthcheck do compose)
# =============================================================================

@main.route('/health', methods=['GET'])
def health_check():
    try:
        db.session.execute(text('SELECT 1'))
        db_ok = True
    except Exception:
        db_ok = False
    return jsonify({
        'status': 'healthy' if db_ok else 'degraded',
        'db': 'up' if db_ok else 'down',
        'timestamp': datetime.utcnow().isoformat(),
    }), (200 if db_ok else 503)


# =============================================================================
# User profile / preferences
# =============================================================================

@main.route('/user/profile', methods=['GET'])
@gateway_required
def get_user_profile(current_user_id):
    prefs = _ensure_preferences(current_user_id)
    db.session.commit()
    return jsonify({
        'success': True,
        'user': {
            'id': current_user_id,
            'profile_photo': prefs.profile_photo,
            'last_bank_reset': prefs.last_bank_reset.isoformat() if prefs.last_bank_reset else None,
            'initial_bank': str(_get_user_initial_bank(current_user_id)),
            'current_balance': str(_get_user_balance(current_user_id)),
        },
    })


@main.route('/user/profile', methods=['PUT'])
@gateway_required
def update_user_profile(current_user_id):
    data = request.get_json() or {}
    prefs = _ensure_preferences(current_user_id)

    if data.get('remove_profile_photo'):
        prefs.profile_photo = None
    elif data.get('profile_photo'):
        photo_id = str(data['profile_photo']).strip()
        if photo_id:
            prefs.profile_photo = photo_id

    initial_bank_value = data.get('initial_bank')
    if initial_bank_value is not None:
        new_bank = _safe_decimal(initial_bank_value)
        if new_bank > 0:
            initial_tx = Transaction.query.filter_by(
                user_id=current_user_id, is_initial_bank=True,
            ).first()
            if initial_tx:
                initial_tx.amount = new_bank
                initial_tx.balance_after = new_bank
            else:
                db.session.add(Transaction(
                    user_id=current_user_id,
                    type='deposit',
                    amount=new_bank,
                    category='initial_bank',
                    description='Banca Inicial',
                    is_initial_bank=True,
                    balance_before=Decimal('0.00'),
                    balance_after=new_bank,
                    date=datetime.utcnow(),
                ))
            active_profile = BettingProfile.query.filter_by(
                user_id=current_user_id, is_active=True,
            ).first()
            if active_profile:
                active_profile.initial_balance = new_bank

    db.session.commit()

    return jsonify({
        'success': True,
        'user': {
            'id': current_user_id,
            'profile_photo': prefs.profile_photo,
            'initial_bank': str(_get_user_initial_bank(current_user_id)),
        },
    })


# =============================================================================
# Betting profiles
# =============================================================================

@main.route('/betting-profiles', methods=['POST'])
@gateway_required
def create_betting_profile(current_user_id):
    data = request.get_json() or {}
    profile_data = data.get('profile', {}) or {}

    risk_level = int(data.get('riskValue', data.get('riskLevel', 5)))
    initial_balance = _safe_decimal(data.get('bankroll'))
    stop_loss = _safe_decimal(data.get('stopLoss'))
    stop_loss_percentage = _safe_decimal(data.get('stopLossPercentage'))
    profit_target = _safe_decimal(data.get('profitTarget'))

    existing = BettingProfile.query.filter_by(
        user_id=current_user_id, is_active=True,
    ).first()

    icon = profile_data.get('icon') or {}
    icon_name = (icon.get('name') if isinstance(icon, dict) else None) or 'dice'

    if existing:
        existing.profile_type = profile_data.get('id', 'balanced')
        existing.title = profile_data.get('title', 'Perfil Personalizado')
        existing.description = profile_data.get('description', '')
        existing.risk_level = risk_level
        existing.initial_balance = initial_balance
        existing.stop_loss = stop_loss
        existing.stop_loss_percentage = stop_loss_percentage
        existing.profit_target = profit_target
        existing.features = profile_data.get('features', [])
        existing.color = profile_data.get('color', '#2f00ffff')
        existing.icon_name = icon_name
        profile = existing
    else:
        BettingProfile.query.filter_by(
            user_id=current_user_id, is_active=True,
        ).update({'is_active': False})

        profile = BettingProfile(
            user_id=current_user_id,
            profile_type=profile_data.get('id', 'balanced'),
            title=profile_data.get('title', 'Perfil Personalizado'),
            description=profile_data.get('description', ''),
            risk_level=risk_level,
            initial_balance=initial_balance,
            stop_loss=stop_loss,
            stop_loss_percentage=stop_loss_percentage,
            profit_target=profit_target,
            features=profile_data.get('features', []),
            color=profile_data.get('color', '#2f00ffff'),
            icon_name=icon_name,
            is_active=True,
        )
        db.session.add(profile)

    db.session.commit()

    return jsonify({
        'success': True,
        'data': _serialize_profile(profile),
    }), 201


@main.route('/betting-profiles', methods=['GET'])
@gateway_required
def get_betting_profile(current_user_id):
    profile = BettingProfile.query.filter_by(
        user_id=current_user_id, is_active=True,
    ).first()
    if not profile:
        return jsonify({'error': 'No active betting profile found'}), 404
    return jsonify({'success': True, 'data': _serialize_profile(profile)})


@main.route('/betting-profiles/<int:profile_id>', methods=['PUT'])
@gateway_required
def update_betting_profile(current_user_id, profile_id):
    profile = BettingProfile.query.filter_by(
        id=profile_id, user_id=current_user_id,
    ).first()
    if not profile:
        return jsonify({'error': 'Profile not found'}), 404

    data = request.get_json() or {}
    if 'stopLoss' in data:
        profile.stop_loss = _safe_decimal(data['stopLoss'])
    if 'profitTarget' in data:
        profile.profit_target = _safe_decimal(data['profitTarget'])
    if 'riskValue' in data or 'riskLevel' in data:
        profile.risk_level = int(data.get('riskValue', data.get('riskLevel')))
    if 'stopLossPercentage' in data:
        profile.stop_loss_percentage = _safe_decimal(data['stopLossPercentage'])

    db.session.commit()
    return jsonify({'success': True})


def _serialize_profile(p):
    return {
        'id': p.id,
        'profile_type': p.profile_type,
        'title': p.title,
        'description': p.description,
        'risk_level': p.risk_level,
        'initial_balance': str(p.initial_balance),
        'stop_loss': str(p.stop_loss),
        'stop_loss_percentage': str(p.stop_loss_percentage or 0),
        'profit_target': str(p.profit_target),
        'features': p.features,
        'color': p.color,
        'icon_name': p.icon_name,
        'created_at': p.created_at.isoformat() if p.created_at else None,
        'updated_at': p.updated_at.isoformat() if p.updated_at else None,
    }


# =============================================================================
# Transactions — paginação keyset
# =============================================================================

def _encode_cursor(dt: datetime, tx_id: int) -> str:
    raw = f'{dt.isoformat()}|{tx_id}'.encode('utf-8')
    return base64.urlsafe_b64encode(raw).decode('ascii')


def _decode_cursor(cursor: str):
    try:
        raw = base64.urlsafe_b64decode(cursor.encode('ascii')).decode('utf-8')
        date_str, id_str = raw.split('|', 1)
        return datetime.fromisoformat(date_str), int(id_str)
    except Exception:
        return None


@main.route('/transactions', methods=['GET'])
@gateway_required
def get_transactions(current_user_id):
    """Lista paginada por keyset (date DESC, id DESC).

    Query params:
      limit  → default 50, max 200
      cursor → opaque (de uma resposta anterior); ausente = primeira página.
    """
    try:
        limit = max(1, min(int(request.args.get('limit', 50)), 200))
    except ValueError:
        limit = 50

    q = Transaction.query.filter_by(user_id=current_user_id)

    cursor = request.args.get('cursor')
    if cursor:
        decoded = _decode_cursor(cursor)
        if decoded is None:
            return jsonify({'success': False, 'error': 'cursor inválido'}), 400
        cursor_date, cursor_id = decoded
        q = q.filter(
            (Transaction.date < cursor_date)
            | ((Transaction.date == cursor_date) & (Transaction.id < cursor_id))
        )

    rows = q.order_by(desc(Transaction.date), desc(Transaction.id)).limit(limit + 1).all()

    has_more = len(rows) > limit
    rows = rows[:limit]
    next_cursor = _encode_cursor(rows[-1].date, rows[-1].id) if has_more and rows else None

    return jsonify({
        'success': True,
        'data': [_serialize_tx(t) for t in rows],
        'pagination': {
            'limit': limit,
            'next_cursor': next_cursor,
            'has_more': has_more,
        },
    })


def _parse_transaction_date(value):
    """Converte a data informada pelo usuário (data-only 'YYYY-MM-DD' ou ISO)
    num datetime ancorado ao MEIO-DIA.

    O campo `date` representa o DIA da transação (o `created_at` guarda o
    instante real). Ancorar ao meio-dia evita que conversões de timezone no
    frontend (ex.: `new Date(date).toISOString()`) empurrem a data para o dia
    anterior/seguinte — qualquer offset de fuso até ±12h permanece no mesmo dia.
    Retorna None se o valor for inválido/ausente.
    """
    if not value:
        return None
    try:
        # Considera só a parte da data (YYYY-MM-DD), ignorando hora/timezone.
        d = datetime.strptime(str(value).strip()[:10], '%Y-%m-%d')
    except (ValueError, TypeError):
        return None
    return d.replace(hour=12, minute=0, second=0, microsecond=0)


@main.route('/transactions', methods=['POST'])
@gateway_required
def create_transaction(current_user_id):
    data = request.get_json() or {}
    tx_type = data.get('type')
    amount = _safe_decimal(data.get('amount'))

    if tx_type not in ('deposit', 'withdraw', 'gains', 'losses'):
        return jsonify({'success': False, 'error': 'Tipo inválido'}), 400
    if amount <= 0:
        return jsonify({'success': False, 'error': 'Valor deve ser > 0'}), 400

    transaction_date = _parse_transaction_date(data.get('date')) or datetime.utcnow()

    current_balance = _get_user_balance(current_user_id)
    if tx_type in ('deposit', 'gains'):
        new_balance = current_balance + amount
    else:
        new_balance = current_balance - amount

    new_tx = Transaction(
        user_id=current_user_id,
        type=tx_type,
        amount=amount,
        category=data.get('category'),
        description=data.get('description'),
        is_initial_bank=bool(data.get('isInitialBank', data.get('is_initial_bank', False))),
        betting_session_id=data.get('bettingSessionId'),
        game_type=data.get('gameType'),
        balance_before=current_balance,
        balance_after=new_balance,
        meta=data.get('meta', {}),
        date=transaction_date,
    )
    db.session.add(new_tx)
    db.session.commit()

    return jsonify({'success': True, 'data': _serialize_tx(new_tx)}), 201


@main.route('/transactions/<int:transaction_id>', methods=['PUT'])
@gateway_required
def update_transaction(current_user_id, transaction_id):
    tx = Transaction.query.filter_by(id=transaction_id, user_id=current_user_id).first()
    if not tx:
        return jsonify({'success': False, 'error': 'Transação não encontrada'}), 404

    data = request.get_json() or {}

    if tx.is_initial_bank:
        if 'amount' not in data:
            return jsonify({
                'success': False, 'error': 'Informe o novo valor da banca inicial',
            }), 400
        new_amount = _safe_decimal(data['amount'])
        if new_amount <= 0:
            return jsonify({'success': False, 'error': 'Valor deve ser > 0'}), 400
        tx.amount = new_amount
        tx.balance_after = new_amount
        if 'description' in data:
            tx.description = data['description']

        active_profile = BettingProfile.query.filter_by(
            user_id=current_user_id, is_active=True,
        ).first()
        if active_profile:
            active_profile.initial_balance = new_amount

        db.session.commit()
        return jsonify({'success': True, 'data': _serialize_tx(tx)})

    if 'amount' in data:
        new_amount = _safe_decimal(data['amount'])
        if new_amount <= 0:
            return jsonify({'success': False, 'error': 'Valor deve ser > 0'}), 400
        tx.amount = new_amount
    if 'category' in data:
        tx.category = (data['category'] or '').strip() or None
    if 'description' in data:
        tx.description = data['description']
    if 'type' in data:
        if data['type'] not in ('deposit', 'withdraw', 'gains', 'losses'):
            return jsonify({'success': False, 'error': 'Tipo inválido'}), 400
        tx.type = data['type']
    if 'date' in data:
        parsed_date = _parse_transaction_date(data['date'])
        if parsed_date is None:
            return jsonify({'success': False, 'error': 'Data inválida'}), 400
        tx.date = parsed_date

    db.session.commit()
    return jsonify({'success': True, 'data': _serialize_tx(tx)})


@main.route('/transactions/<int:transaction_id>', methods=['DELETE'])
@gateway_required
def delete_transaction(current_user_id, transaction_id):
    tx = Transaction.query.filter_by(id=transaction_id, user_id=current_user_id).first()
    if not tx:
        return jsonify({'success': False, 'error': 'Transação não encontrada'}), 404
    if tx.is_initial_bank:
        return jsonify({
            'success': False, 'error': 'Não é possível excluir a banca inicial',
        }), 400
    db.session.delete(tx)
    db.session.commit()
    return jsonify({'success': True})


@main.route('/transactions/summary', methods=['GET'])
@gateway_required
def get_transactions_summary(current_user_id):
    deposit_count = Transaction.query.filter_by(
        user_id=current_user_id, type='deposit',
    ).count()
    withdraw_count = Transaction.query.filter_by(
        user_id=current_user_id, type='withdraw',
    ).count()
    last_tx = Transaction.query.filter_by(user_id=current_user_id).order_by(
        desc(Transaction.date),
    ).first()

    today = datetime.utcnow().date()
    today_transactions = Transaction.query.filter(
        Transaction.user_id == current_user_id,
        func.date(Transaction.date) == today,
    ).count()

    popular_categories = db.session.query(
        Transaction.category, func.count(Transaction.id).label('count'),
    ).filter(
        Transaction.user_id == current_user_id,
        Transaction.category.isnot(None),
    ).group_by(Transaction.category).order_by(desc('count')).limit(5).all()

    return jsonify({
        'success': True,
        'data': {
            'total_transactions': deposit_count + withdraw_count,
            'deposit_count': deposit_count,
            'withdraw_count': withdraw_count,
            'today_transactions': today_transactions,
            'last_transaction': _serialize_tx(last_tx) if last_tx else None,
            'popular_categories': [
                {'category': c, 'count': n} for (c, n) in popular_categories
            ],
        },
    })


def _serialize_tx(tx):
    return {
        'id': tx.id,
        'type': tx.type,
        'amount': str(tx.amount),
        'balance_before': str(tx.balance_before) if tx.balance_before is not None else None,
        'balance_after': str(tx.balance_after) if tx.balance_after is not None else None,
        'category': tx.category,
        'description': tx.description,
        'is_initial_bank': tx.is_initial_bank,
        'date': tx.date.isoformat(),
        'meta': tx.meta,
    }


# =============================================================================
# Balance / dashboard / analytics
# =============================================================================

@main.route('/balance', methods=['GET'])
@gateway_required
def get_balance(current_user_id):
    current_balance = _get_user_balance(current_user_id)
    initial_bank = _get_user_initial_bank(current_user_id)
    return jsonify({
        'success': True,
        'balance': str(current_balance),
        'initial_bank': str(initial_bank),
        'profit_loss': str(current_balance - initial_bank),
    })


@main.route('/user/bank-reset-status', methods=['GET'])
@gateway_required
def get_bank_reset_status(current_user_id):
    prefs = _ensure_preferences(current_user_id)
    last_reset = prefs.last_bank_reset
    now = datetime.utcnow()
    days_since = (now - last_reset).days
    days_until = max(0, 30 - days_since)
    db.session.commit()
    return jsonify({
        'success': True,
        'days_until_reset': days_until,
        'days_since_reset': days_since,
        'reset_due': days_until == 0,
        'last_reset_date': last_reset.isoformat(),
    })


@main.route('/users/reset-bank', methods=['POST'])
@gateway_required
def force_reset_bank(current_user_id):
    prefs = _ensure_preferences(current_user_id)
    current_balance = _get_user_balance(current_user_id)
    old_initial = _get_user_initial_bank(current_user_id)

    Transaction.query.filter_by(user_id=current_user_id).delete()
    db.session.add(Transaction(
        user_id=current_user_id,
        type='deposit',
        amount=current_balance,
        category='initial_bank',
        description='Reset de banca - nova banca inicial',
        is_initial_bank=True,
        balance_before=Decimal('0.00'),
        balance_after=current_balance,
        date=datetime.utcnow(),
    ))

    active_profile = BettingProfile.query.filter_by(
        user_id=current_user_id, is_active=True,
    ).first()
    if active_profile:
        active_profile.initial_balance = current_balance

    prefs.last_bank_reset = datetime.utcnow()
    db.session.commit()

    return jsonify({
        'success': True,
        'reset_info': {
            'old_initial_bank': str(old_initial),
            'new_initial_bank': str(current_balance),
            'profit_loss': str(current_balance - old_initial),
            'reset_date': prefs.last_bank_reset.isoformat(),
        },
    })


@main.route('/users/reset-all', methods=['POST'])
@gateway_required
def reset_all(current_user_id):
    """Reset geral: apaga TODAS as transações (zera a banca, saldo R$ 0).

    Mantém objetivos e o perfil de risco (risk_level, stop_loss, etc.); apenas
    zera o initial_balance do perfil ativo para que a banca volte a R$ 0.
    """
    deleted_transactions = Transaction.query.filter_by(user_id=current_user_id).delete()

    active_profile = BettingProfile.query.filter_by(
        user_id=current_user_id, is_active=True,
    ).first()
    if active_profile:
        active_profile.initial_balance = Decimal('0.00')

    prefs = _ensure_preferences(current_user_id)
    prefs.last_bank_reset = datetime.utcnow()
    db.session.commit()

    return jsonify({
        'success': True,
        'deleted_counts': {'transactions': deleted_transactions},
    })


@main.route('/dashboard/overview', methods=['GET'])
@gateway_required
def get_dashboard_overview(current_user_id):
    current_balance = _get_user_balance(current_user_id)
    initial_bank = _get_user_initial_bank(current_user_id)
    profit_loss = current_balance - initial_bank
    roi = (profit_loss / initial_bank * 100) if initial_bank > 0 else Decimal('0')

    profile = BettingProfile.query.filter_by(
        user_id=current_user_id, is_active=True,
    ).first()

    total_deposits = db.session.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
        Transaction.user_id == current_user_id, Transaction.type == 'deposit',
    ).scalar() or Decimal('0.00')
    total_withdrawals = db.session.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
        Transaction.user_id == current_user_id, Transaction.type == 'withdraw',
    ).scalar() or Decimal('0.00')

    total_transactions = Transaction.query.filter_by(user_id=current_user_id).count()
    last_tx = Transaction.query.filter_by(user_id=current_user_id).order_by(
        desc(Transaction.date),
    ).first()

    return jsonify({
        'success': True,
        'data': {
            'current_balance': str(current_balance),
            'initial_bank': str(initial_bank),
            'profit_loss': str(profit_loss),
            'roi_percentage': round(float(roi), 2),
            'total_deposits': str(total_deposits),
            'total_withdrawals': str(total_withdrawals),
            'total_transactions': total_transactions,
            'profile': {
                'risk_level': profile.risk_level,
                'stop_loss': str(profile.stop_loss),
                'stop_loss_percentage': str(profile.stop_loss_percentage or 0),
                'profit_target': str(profile.profit_target),
                'title': profile.title,
            } if profile else None,
            'last_transaction': _serialize_tx(last_tx) if last_tx else None,
            'account_status': {
                'is_profitable': profit_loss > 0,
                'has_initial_bank': initial_bank > 0,
            },
        },
    })


@main.route('/analytics/overview', methods=['GET'])
@gateway_required
def get_analytics_overview(current_user_id):
    current_balance = _get_user_balance(current_user_id)
    initial_bank = _get_user_initial_bank(current_user_id)
    profile = BettingProfile.query.filter_by(
        user_id=current_user_id, is_active=True,
    ).first()

    total_deposits = db.session.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
        Transaction.user_id == current_user_id, Transaction.type == 'deposit',
    ).scalar() or Decimal('0.00')
    total_withdrawals = db.session.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
        Transaction.user_id == current_user_id, Transaction.type == 'withdraw',
    ).scalar() or Decimal('0.00')

    real_profit = current_balance - initial_bank
    roi = (real_profit / initial_bank * 100) if initial_bank > 0 else Decimal('0')

    return jsonify({
        'success': True,
        'data': {
            'current_balance': str(current_balance),
            'initial_balance': str(initial_bank),
            'total_deposits': str(total_deposits),
            'total_withdrawals': str(total_withdrawals),
            'real_profit': str(real_profit),
            'roi_percentage': round(float(roi), 2),
            'stop_loss': str(profile.stop_loss) if profile else '0.00',
            'profit_target': str(profile.profit_target) if profile else '0.00',
            'risk_level': profile.risk_level if profile else 5,
        },
    })


@main.route('/analytics/monthly', methods=['GET'])
@gateway_required
def get_monthly_analytics(current_user_id):
    try:
        months = int(request.args.get('months', 6))
    except ValueError:
        months = 6
    start_date = datetime.utcnow() - timedelta(days=months * 30)

    rows = db.session.query(
        extract('year', Transaction.date).label('year'),
        extract('month', Transaction.date).label('month'),
        Transaction.type,
        func.sum(Transaction.amount).label('total'),
    ).filter(
        Transaction.user_id == current_user_id,
        Transaction.date >= start_date,
    ).group_by(
        extract('year', Transaction.date),
        extract('month', Transaction.date),
        Transaction.type,
    ).all()

    result = {}
    for year, month, tx_type, total in rows:
        key = f'{int(year)}-{int(month):02d}'
        bucket = result.setdefault(key, {'deposits': 0, 'withdraws': 0, 'month': key})
        if tx_type == 'deposit':
            bucket['deposits'] = float(total)
        elif tx_type == 'withdraw':
            bucket['withdraws'] = float(total)

    for bucket in result.values():
        bucket['balance'] = bucket['deposits'] - bucket['withdraws']

    return jsonify({'success': True, 'data': list(result.values())})


# =============================================================================
# Objectives
# =============================================================================

@main.route('/objectives', methods=['GET'])
@gateway_required
def get_objectives(current_user_id):
    objectives = Objective.query.filter_by(user_id=current_user_id).all()
    return jsonify({
        'success': True,
        'data': [_serialize_objective(o) for o in objectives],
    })


@main.route('/objectives', methods=['POST'])
@gateway_required
def create_objective(current_user_id):
    data = request.get_json() or {}
    obj = Objective(
        user_id=current_user_id,
        title=data.get('title'),
        description=data.get('description'),
        target_amount=_safe_decimal(data.get('target_amount')),
        current_amount=_safe_decimal(data.get('current_amount')),
        target_date=(
            datetime.strptime(data['target_date'], '%Y-%m-%d').date()
            if data.get('target_date') else None
        ),
        priority=data.get('priority', 'medium'),
        category=data.get('category'),
        color=data.get('color', '#2f00ffff'),
        icon_name=data.get('icon_name', 'flag'),
        meta=data.get('meta', {}),
    )
    db.session.add(obj)
    db.session.commit()
    return jsonify({'success': True, 'data': _serialize_objective(obj)}), 201


@main.route('/objectives/<int:objective_id>', methods=['PUT'])
@gateway_required
def update_objective(current_user_id, objective_id):
    obj = Objective.query.filter_by(id=objective_id, user_id=current_user_id).first()
    if not obj:
        return jsonify({'error': 'Objective not found'}), 404

    data = request.get_json() or {}
    if 'title' in data:
        obj.title = (data['title'] or '').strip()
    if 'target_amount' in data:
        obj.target_amount = _safe_decimal(data['target_amount'])
    if 'current_amount' in data:
        obj.current_amount = _safe_decimal(data['current_amount'])
    if 'target_date' in data and data['target_date']:
        obj.target_date = datetime.strptime(data['target_date'], '%Y-%m-%d').date()

    obj.priority = data.get('priority', obj.priority)
    obj.category = data.get('category', obj.category)
    obj.status = 'completed' if obj.current_amount >= obj.target_amount else 'active'

    db.session.commit()
    return jsonify({'success': True, 'data': _serialize_objective(obj)})


@main.route('/objectives/<int:objective_id>', methods=['DELETE'])
@gateway_required
def delete_objective(current_user_id, objective_id):
    obj = Objective.query.filter_by(id=objective_id, user_id=current_user_id).first()
    if not obj:
        return jsonify({'error': 'Objective not found'}), 404
    db.session.delete(obj)
    db.session.commit()
    return jsonify({'success': True})


def _serialize_objective(o):
    return {
        'id': o.id,
        'title': o.title,
        'description': o.description,
        'target_amount': str(o.target_amount),
        'current_amount': str(o.current_amount),
        'target_date': o.target_date.isoformat() if o.target_date else None,
        'priority': o.priority,
        'status': o.status,
        'category': o.category,
        'color': o.color,
        'icon_name': o.icon_name,
        'created_at': o.created_at.isoformat() if o.created_at else None,
    }


# =============================================================================
# Betting sessions
# =============================================================================

@main.route('/betting-sessions', methods=['POST'])
@gateway_required
def start_betting_session(current_user_id):
    data = request.get_json() or {}
    current_balance = _get_user_balance(current_user_id)
    session = BettingSession(
        user_id=current_user_id,
        session_id=str(uuid.uuid4()),
        game_type=data.get('game_type', 'roulette'),
        start_balance=current_balance,
        risk_level=int(data.get('risk_level', 5)),
        meta=data.get('meta', {}),
    )
    db.session.add(session)
    db.session.commit()
    return jsonify({
        'success': True,
        'session_id': session.session_id,
        'start_balance': str(session.start_balance),
    }), 201


@main.route('/betting-sessions/<session_id>/end', methods=['POST'])
@gateway_required
def end_betting_session(current_user_id, session_id):
    session = BettingSession.query.filter_by(
        user_id=current_user_id, session_id=session_id, status='active',
    ).first()
    if not session:
        return jsonify({'error': 'Session not found'}), 404

    current_balance = _get_user_balance(current_user_id)
    session.end_balance = current_balance
    session.ended_at = datetime.utcnow()
    session.duration_seconds = int(
        (session.ended_at - session.started_at).total_seconds(),
    )
    session.net_result = current_balance - session.start_balance
    session.status = 'completed'
    db.session.commit()

    return jsonify({
        'success': True,
        'data': {
            'session_id': session.session_id,
            'start_balance': str(session.start_balance),
            'end_balance': str(session.end_balance),
            'net_result': str(session.net_result),
            'duration_seconds': session.duration_seconds,
        },
    })


# =============================================================================
# Stats
# =============================================================================

@main.route('/stats/performance', methods=['GET'])
@gateway_required
def get_performance_stats(current_user_id):
    period = request.args.get('period', 'monthly')
    now = datetime.utcnow()
    if period == 'daily':
        start_date = now - timedelta(days=30)
    elif period == 'weekly':
        start_date = now - timedelta(weeks=12)
    elif period == 'monthly':
        start_date = now - timedelta(days=365)
    else:
        start_date = now - timedelta(days=365 * 3)

    stats = db.session.query(
        func.count(BettingSession.id).label('total_sessions'),
        func.coalesce(func.sum(BettingSession.net_result), 0).label('total_profit'),
        func.coalesce(func.avg(BettingSession.net_result), 0).label('avg_session_result'),
        func.coalesce(func.max(BettingSession.net_result), 0).label('best_session'),
        func.coalesce(func.min(BettingSession.net_result), 0).label('worst_session'),
    ).filter(
        BettingSession.user_id == current_user_id,
        BettingSession.started_at >= start_date,
        BettingSession.status == 'completed',
    ).first()

    winning = db.session.query(func.count(BettingSession.id)).filter(
        BettingSession.user_id == current_user_id,
        BettingSession.started_at >= start_date,
        BettingSession.net_result > 0,
        BettingSession.status == 'completed',
    ).scalar() or 0

    total = stats.total_sessions or 0
    win_rate = (winning / total * 100) if total > 0 else 0
    initial_bank = _get_user_initial_bank(current_user_id)
    profile = BettingProfile.query.filter_by(
        user_id=current_user_id, is_active=True,
    ).first()

    return jsonify({
        'success': True,
        'data': {
            'period': period,
            'total_sessions': total,
            'winning_sessions': winning,
            'win_rate': round(win_rate, 2),
            'total_profit': str(stats.total_profit or 0),
            'avg_session_result': str(stats.avg_session_result or 0),
            'best_session': str(stats.best_session or 0),
            'worst_session': str(stats.worst_session or 0),
            'initial_balance': str(initial_bank),
            'current_stop_loss': str(profile.stop_loss) if profile else '0.00',
            'current_profit_target': str(profile.profit_target) if profile else '0.00',
        },
    })


@main.route('/stats/risk-analysis', methods=['GET'])
@gateway_required
def get_risk_analysis(current_user_id):
    profile = BettingProfile.query.filter_by(
        user_id=current_user_id, is_active=True,
    ).first()
    if not profile:
        return jsonify({'error': 'No betting profile found'}), 404

    current_balance = _get_user_balance(current_user_id)
    initial_bank = _get_user_initial_bank(current_user_id)
    stop_loss = profile.stop_loss or Decimal('0')
    profit_target = profile.profit_target or Decimal('0')

    stop_loss_distance = (current_balance - stop_loss) if stop_loss > 0 else None
    stop_loss_pct = (
        (current_balance - stop_loss) / initial_bank * 100
        if stop_loss > 0 and initial_bank > 0 else None
    )
    target_balance = initial_bank + profit_target
    profit_target_distance = (target_balance - current_balance) if profit_target > 0 else None
    profit_target_pct = (
        current_balance / target_balance * 100
        if profit_target > 0 and target_balance > 0 else None
    )

    if stop_loss > 0 and current_balance <= stop_loss:
        risk_status = 'stop_loss_hit'
    elif stop_loss > 0 and stop_loss_distance is not None \
            and stop_loss_distance < (initial_bank * Decimal('0.1')):
        risk_status = 'high_risk'
    elif profit_target > 0 and current_balance >= target_balance:
        risk_status = 'target_achieved'
    else:
        risk_status = 'safe'

    max_balance = db.session.query(func.max(Transaction.balance_after)).filter(
        Transaction.user_id == current_user_id,
    ).scalar() or initial_bank
    drawdown = max_balance - current_balance
    drawdown_pct = (drawdown / max_balance * 100) if max_balance > 0 else 0

    return jsonify({
        'success': True,
        'data': {
            'current_balance': str(current_balance),
            'initial_balance': str(initial_bank),
            'risk_level': profile.risk_level,
            'risk_status': risk_status,
            'stop_loss': {
                'value': str(stop_loss),
                'distance': str(stop_loss_distance) if stop_loss_distance is not None else None,
                'percentage': round(float(stop_loss_pct), 2) if stop_loss_pct is not None else None,
                'is_active': stop_loss > 0,
            },
            'profit_target': {
                'value': str(target_balance),
                'distance': str(profit_target_distance) if profit_target_distance is not None else None,
                'percentage': round(float(profit_target_pct), 2) if profit_target_pct is not None else None,
                'is_active': profit_target > 0,
            },
            'drawdown': {
                'current': str(drawdown),
                'percentage': round(float(drawdown_pct), 2),
                'max_balance': str(max_balance),
            },
        },
    })


# =============================================================================
# Utilities
# =============================================================================

@main.route('/categories', methods=['GET'])
@gateway_required
def get_categories(current_user_id):
    categories = db.session.query(Transaction.category).filter(
        Transaction.user_id == current_user_id,
        Transaction.category.isnot(None),
    ).distinct().all()
    return jsonify({'success': True, 'data': [c[0] for c in categories if c[0]]})


@main.route('/game-types', methods=['GET'])
def get_game_types():
    return jsonify({
        'success': True,
        'data': [
            {'id': 'roulette', 'name': 'Roleta', 'icon': 'casino'},
            {'id': 'blackjack', 'name': 'Blackjack', 'icon': 'spade'},
            {'id': 'poker', 'name': 'Poker', 'icon': 'diamond'},
            {'id': 'slots', 'name': 'Caça-níqueis', 'icon': 'slot-machine'},
            {'id': 'baccarat', 'name': 'Baccarat', 'icon': 'cards'},
            {'id': 'sports', 'name': 'Apostas Esportivas', 'icon': 'sports-soccer'},
            {'id': 'other', 'name': 'Outros', 'icon': 'casino-chip'},
        ],
    })


# =============================================================================
# Error handlers
# =============================================================================

@main.errorhandler(400)
def _bad_request(e):
    return jsonify({'error': 'Bad request', 'message': str(e)}), 400


@main.errorhandler(401)
def _unauthorized(e):
    return jsonify({'error': 'Unauthorized'}), 401


@main.errorhandler(404)
def _not_found(e):
    return jsonify({'error': 'Not found'}), 404


@main.errorhandler(500)
def _internal(e):
    db.session.rollback()
    return jsonify({'error': 'Internal server error'}), 500
