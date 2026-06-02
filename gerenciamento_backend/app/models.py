"""
Models do gerenciamento (banca / apostas).

A identidade do usuário NÃO mora aqui: ela vem da tabela `subscriptions` do
roleta3 (PK: user_id VARCHAR, gerenciada pelos webhooks Hubla/Kirvano).
Todas as tabelas abaixo usam user_id VARCHAR FK -> subscriptions(user_id).
"""

import pytz
from . import db
from sqlalchemy.dialects.postgresql import JSON
from datetime import datetime
from decimal import Decimal


def _now_sp():
    return datetime.now(pytz.timezone('America/Sao_Paulo'))


class UserPreferences(db.Model):
    """Preferências/perfil leve do usuário do gerenciamento.

    PK = user_id (VARCHAR) referencia subscriptions.user_id.
    Aqui ficam só campos não-financeiros (avatar, último reset, etc).
    """
    __tablename__ = 'gerenciamento_user_preferences'

    user_id = db.Column(
        # FK para subscriptions.user_id existe no DDL (ver migration 0001).
        # Não declaramos como ForeignKey aqui porque a tabela `subscriptions`
        # é gerenciada pelo roleta3, não pelo nosso SQLAlchemy metadata.
        db.String(64),
        primary_key=True,
    )
    profile_photo = db.Column(db.String(50))
    last_bank_reset = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False,
    )


class BettingProfile(db.Model):
    __tablename__ = 'gerenciamento_betting_profiles'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        # FK para subscriptions.user_id existe no DDL (ver migration 0001).
        # Não declaramos como ForeignKey aqui porque a tabela `subscriptions`
        # é gerenciada pelo roleta3, não pelo nosso SQLAlchemy metadata.
        db.String(64),
        nullable=False,
    )

    profile_type = db.Column(db.String(20), nullable=False)
    title = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    risk_level = db.Column(db.Integer, nullable=False)

    initial_balance = db.Column(db.Numeric(12, 2), nullable=False, default=Decimal('1000.00'))
    stop_loss = db.Column(db.Numeric(12, 2), default=Decimal('0.00'))
    stop_loss_percentage = db.Column(db.Numeric(10, 2), nullable=True, default=0)
    profit_target = db.Column(db.Numeric(12, 2), default=Decimal('0.00'))

    features = db.Column(JSON)
    color = db.Column(db.String(9), default='#2f00ffff')
    icon_name = db.Column(db.String(50), default='dice')

    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False,
    )

    __table_args__ = (
        db.Index('idx_gerprofile_user', 'user_id'),
        db.Index(
            'idx_gerprofile_active_unique',
            'user_id',
            unique=True,
            postgresql_where=db.text('is_active = true'),
        ),
    )


class Transaction(db.Model):
    __tablename__ = 'gerenciamento_transactions'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        # FK para subscriptions.user_id existe no DDL (ver migration 0001).
        # Não declaramos como ForeignKey aqui porque a tabela `subscriptions`
        # é gerenciada pelo roleta3, não pelo nosso SQLAlchemy metadata.
        db.String(64),
        nullable=False,
    )

    type = db.Column(db.String(20), nullable=False)  # deposit / withdraw / gains / losses
    amount = db.Column(db.Numeric(12, 2), nullable=False)
    category = db.Column(db.String(50))
    description = db.Column(db.Text)

    is_initial_bank = db.Column(db.Boolean, default=False, nullable=False)
    betting_session_id = db.Column(db.String(50))
    game_type = db.Column(db.String(30))

    balance_before = db.Column(db.Numeric(12, 2))
    balance_after = db.Column(db.Numeric(12, 2))

    meta = db.Column(JSON)
    tags = db.Column(JSON)

    date = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False,
    )

    __table_args__ = (
        db.Index('idx_gertx_user_date', 'user_id', 'date'),
        db.Index('idx_gertx_user_type', 'user_id', 'type'),
        db.Index('idx_gertx_user_category', 'user_id', 'category'),
        db.Index(
            'idx_gertx_initial_bank_unique',
            'user_id',
            unique=True,
            postgresql_where=db.text('is_initial_bank = true'),
        ),
    )


class Objective(db.Model):
    __tablename__ = 'gerenciamento_objectives'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        # FK para subscriptions.user_id existe no DDL (ver migration 0001).
        # Não declaramos como ForeignKey aqui porque a tabela `subscriptions`
        # é gerenciada pelo roleta3, não pelo nosso SQLAlchemy metadata.
        db.String(64),
        nullable=False,
    )

    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    target_amount = db.Column(db.Numeric(12, 2), nullable=False)
    current_amount = db.Column(db.Numeric(12, 2), default=Decimal('0.00'))

    target_date = db.Column(db.Date)
    priority = db.Column(db.String(10), default='medium')

    status = db.Column(db.String(20), default='active')
    is_achieved = db.Column(db.Boolean, default=False)
    achievement_date = db.Column(db.DateTime)

    category = db.Column(db.String(50))
    color = db.Column(db.String(9), default='#2f00ffff')
    icon_name = db.Column(db.String(50), default='flag')

    meta = db.Column(JSON)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False,
    )

    __table_args__ = (
        db.Index('idx_gerobj_user_status', 'user_id', 'status'),
        db.Index('idx_gerobj_user_target_date', 'user_id', 'target_date'),
    )


class BettingSession(db.Model):
    __tablename__ = 'gerenciamento_betting_sessions'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        # FK para subscriptions.user_id existe no DDL (ver migration 0001).
        # Não declaramos como ForeignKey aqui porque a tabela `subscriptions`
        # é gerenciada pelo roleta3, não pelo nosso SQLAlchemy metadata.
        db.String(64),
        nullable=False,
    )
    session_id = db.Column(db.String(50), unique=True, nullable=False)

    game_type = db.Column(db.String(30), nullable=False)
    start_balance = db.Column(db.Numeric(12, 2), nullable=False)
    end_balance = db.Column(db.Numeric(12, 2))

    total_bets = db.Column(db.Integer, default=0)
    winning_bets = db.Column(db.Integer, default=0)
    losing_bets = db.Column(db.Integer, default=0)
    total_wagered = db.Column(db.Numeric(12, 2), default=Decimal('0.00'))
    net_result = db.Column(db.Numeric(12, 2), default=Decimal('0.00'))

    started_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    ended_at = db.Column(db.DateTime)
    duration_seconds = db.Column(db.Integer)

    risk_level = db.Column(db.Integer)
    stop_loss_hit = db.Column(db.Boolean, default=False)
    profit_target_hit = db.Column(db.Boolean, default=False)

    meta = db.Column(JSON)

    status = db.Column(db.String(20), default='active')
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False,
    )

    __table_args__ = (
        db.Index('idx_gersess_user_started', 'user_id', 'started_at'),
        db.Index('idx_gersess_user_status', 'user_id', 'status'),
    )


class BettingStats(db.Model):
    __tablename__ = 'gerenciamento_betting_stats'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        # FK para subscriptions.user_id existe no DDL (ver migration 0001).
        # Não declaramos como ForeignKey aqui porque a tabela `subscriptions`
        # é gerenciada pelo roleta3, não pelo nosso SQLAlchemy metadata.
        db.String(64),
        nullable=False,
    )

    period_type = db.Column(db.String(10), nullable=False)
    period_date = db.Column(db.Date, nullable=False)

    starting_balance = db.Column(db.Numeric(12, 2), default=Decimal('0.00'))
    ending_balance = db.Column(db.Numeric(12, 2), default=Decimal('0.00'))
    total_deposits = db.Column(db.Numeric(12, 2), default=Decimal('0.00'))
    total_withdrawals = db.Column(db.Numeric(12, 2), default=Decimal('0.00'))
    net_profit_loss = db.Column(db.Numeric(12, 2), default=Decimal('0.00'))

    total_sessions = db.Column(db.Integer, default=0)
    winning_sessions = db.Column(db.Integer, default=0)
    losing_sessions = db.Column(db.Integer, default=0)
    total_bets = db.Column(db.Integer, default=0)
    win_rate = db.Column(db.Numeric(5, 2), default=Decimal('0.00'))

    stop_losses_hit = db.Column(db.Integer, default=0)
    profit_targets_hit = db.Column(db.Integer, default=0)
    max_drawdown = db.Column(db.Numeric(12, 2), default=Decimal('0.00'))
    max_profit = db.Column(db.Numeric(12, 2), default=Decimal('0.00'))

    meta = db.Column(JSON)

    created_at = db.Column(db.DateTime, default=_now_sp, nullable=False)
    updated_at = db.Column(db.DateTime, default=_now_sp, onupdate=_now_sp, nullable=False)

    __table_args__ = (
        db.UniqueConstraint(
            'user_id', 'period_type', 'period_date', name='uq_gerstats_user_period',
        ),
        db.Index('idx_gerstats_user_period', 'user_id', 'period_type', 'period_date'),
    )
