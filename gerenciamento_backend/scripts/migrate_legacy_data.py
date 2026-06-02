#!/usr/bin/env python3
"""Migra dados do schema legado do gerenciamento para o novo schema unificado.

Schema antigo (gerenciamento standalone):
  users(id INTEGER PK, email, name, password_hash, profile_photo, last_bank_reset)
  betting_profiles(id, user_id INTEGER FK -> users.id, ...)
  transactions(id, user_id INTEGER FK -> users.id, ...)
  objectives(id, user_id INTEGER FK -> users.id, ...)
  betting_sessions(id, user_id INTEGER FK -> users.id, ...)
  betting_stats(id, user_id INTEGER FK -> users.id, ...)

Schema novo (no banco do roleta3, depois das migrations do gerenciamento_backend):
  subscriptions(user_id VARCHAR PK, email, status, ...)   ← já existe
  gerenciamento_user_preferences(user_id VARCHAR PK FK -> subscriptions.user_id)
  gerenciamento_betting_profiles(id, user_id VARCHAR FK -> subscriptions.user_id)
  gerenciamento_transactions(id, user_id VARCHAR FK -> subscriptions.user_id)
  gerenciamento_objectives(id, user_id VARCHAR FK -> subscriptions.user_id)
  gerenciamento_betting_sessions(id, user_id VARCHAR FK -> subscriptions.user_id)
  gerenciamento_betting_stats(id, user_id VARCHAR FK -> subscriptions.user_id)

Mapeamento:
  old.users.email  →  subscriptions.email  →  subscriptions.user_id  (FK alvo)
  registros sem subscription correspondente são pulados e logados.

Uso:
  LEGACY_DATABASE_URL='postgresql://user:pass@host:5432/gerenciamento_old' \\
  TARGET_DATABASE_URL='postgresql://user:pass@host:5432/fuzabalta_roulette' \\
  python migrate_legacy_data.py [--dry-run]
"""

import argparse
import os
import sys
from contextlib import contextmanager

import psycopg2
import psycopg2.extras
from psycopg2.extras import Json


def _adapt(v):
    """Converte dict/list em wrapper Json pro psycopg2 serializar como JSON/JSONB.

    Necessário porque o schema novo armazena `features`, `meta` e `tags`
    como json/jsonb, enquanto o legado os retorna como list/dict nativos
    (ou text[] no caso de features) — sem adapter o psycopg2 levanta
    "can't adapt type 'dict'" ou erro de cast text[] -> json.
    """
    if isinstance(v, (dict, list)):
        return Json(v)
    return v


LEGACY_DB_URL = os.environ.get('LEGACY_DATABASE_URL', '')
TARGET_DB_URL = os.environ.get('TARGET_DATABASE_URL', '')


@contextmanager
def cursor(conn):
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        yield cur
    finally:
        cur.close()


def build_email_to_user_id(target_conn):
    """email (lowercase) -> subscriptions.user_id."""
    with cursor(target_conn) as cur:
        cur.execute("SELECT user_id, LOWER(email) AS email FROM subscriptions")
        return {row['email']: row['user_id'] for row in cur.fetchall() if row['email']}


def build_legacy_user_map(legacy_conn, email_to_uid):
    """users.id (INTEGER) -> subscriptions.user_id (VARCHAR)."""
    with cursor(legacy_conn) as cur:
        cur.execute("SELECT id, LOWER(email) AS email, profile_photo, last_bank_reset FROM users")
        rows = cur.fetchall()
    mapping = {}
    skipped = []
    for row in rows:
        uid = email_to_uid.get(row['email'])
        if uid:
            mapping[row['id']] = {
                'user_id': uid,
                'profile_photo': row['profile_photo'],
                'last_bank_reset': row['last_bank_reset'],
            }
        else:
            skipped.append(row['email'])
    return mapping, skipped


def migrate_user_preferences(target_conn, user_map, dry_run):
    sql = """
        INSERT INTO gerenciamento_user_preferences
            (user_id, profile_photo, last_bank_reset, created_at, updated_at)
        VALUES (%(user_id)s, %(profile_photo)s, %(last_bank_reset)s, NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE
        SET profile_photo = EXCLUDED.profile_photo,
            last_bank_reset = EXCLUDED.last_bank_reset,
            updated_at = NOW()
    """
    n = 0
    with cursor(target_conn) as cur:
        for info in user_map.values():
            if dry_run:
                print(f'[dry] user_preferences <- {info["user_id"]}')
            else:
                cur.execute(sql, info)
            n += 1
    return n


def migrate_table(
    legacy_conn, target_conn, user_map,
    legacy_table, target_table, columns, dry_run,
):
    """Copia legacy_table -> target_table substituindo user_id pelo VARCHAR.

    `columns`: lista de (col_legacy, col_target). user_id é tratado separadamente.
    """
    cols_select = ', '.join(c[0] for c in columns)
    cols_insert = ', '.join(['user_id'] + [c[1] for c in columns])
    cols_placeholders = ', '.join(['%s'] * (len(columns) + 1))
    insert_sql = (
        f'INSERT INTO {target_table} ({cols_insert}) '
        f'VALUES ({cols_placeholders}) ON CONFLICT DO NOTHING'
    )
    select_sql = f'SELECT user_id AS _uid, {cols_select} FROM {legacy_table}'

    n_inserted = 0
    n_skipped = 0
    with cursor(legacy_conn) as src, cursor(target_conn) as dst:
        src.execute(select_sql)
        for row in src:
            mapped = user_map.get(row['_uid'])
            if not mapped:
                n_skipped += 1
                continue
            values = [mapped['user_id']] + [_adapt(row[c[0]]) for c in columns]
            if dry_run:
                print(f'[dry] {target_table} <- user={mapped["user_id"]}')
            else:
                try:
                    dst.execute(insert_sql, values)
                    target_conn.commit()
                    n_inserted += 1
                except Exception as e:
                    print(f'[erro] {target_table}: {e}', file=sys.stderr)
                    target_conn.rollback()
                    continue
    return n_inserted, n_skipped


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true',
                        help='Apenas exibe o que seria migrado.')
    args = parser.parse_args()

    if not LEGACY_DB_URL or not TARGET_DB_URL:
        print('LEGACY_DATABASE_URL e TARGET_DATABASE_URL são obrigatórias.',
              file=sys.stderr)
        sys.exit(2)

    legacy = psycopg2.connect(LEGACY_DB_URL)
    target = psycopg2.connect(TARGET_DB_URL)

    try:
        print('[1/4] Construindo email → subscriptions.user_id...')
        email_to_uid = build_email_to_user_id(target)
        print(f'  {len(email_to_uid)} emails em subscriptions.')

        print('[2/4] Mapeando users legados → subscriptions...')
        user_map, skipped = build_legacy_user_map(legacy, email_to_uid)
        print(f'  {len(user_map)} mapeados, {len(skipped)} sem subscription:')
        for e in skipped[:20]:
            print(f'    - {e}')
        if len(skipped) > 20:
            print(f'    ... +{len(skipped) - 20}')

        print('[3/4] Migrando user_preferences...')
        n = migrate_user_preferences(target, user_map, args.dry_run)
        if not args.dry_run:
            target.commit()
        print(f'  {n} preferences.')

        print('[4/4] Migrando demais tabelas...')

        tables = [
            (
                'betting_profiles', 'gerenciamento_betting_profiles',
                [
                    ('profile_type', 'profile_type'),
                    ('title', 'title'), ('description', 'description'),
                    ('risk_level', 'risk_level'),
                    ('initial_balance', 'initial_balance'),
                    ('stop_loss', 'stop_loss'),
                    ('stop_loss_percentage', 'stop_loss_percentage'),
                    ('profit_target', 'profit_target'),
                    ('features', 'features'),
                    ('color', 'color'), ('icon_name', 'icon_name'),
                    ('is_active', 'is_active'),
                    ('created_at', 'created_at'),
                    ('updated_at', 'updated_at'),
                ],
            ),
            (
                'transactions', 'gerenciamento_transactions',
                [
                    ('type', 'type'), ('amount', 'amount'),
                    ('category', 'category'), ('description', 'description'),
                    ('is_initial_bank', 'is_initial_bank'),
                    ('betting_session_id', 'betting_session_id'),
                    ('game_type', 'game_type'),
                    ('balance_before', 'balance_before'),
                    ('balance_after', 'balance_after'),
                    ('meta', 'meta'), ('tags', 'tags'),
                    ('date', 'date'),
                    ('created_at', 'created_at'),
                    ('updated_at', 'updated_at'),
                ],
            ),
            (
                'objectives', 'gerenciamento_objectives',
                [
                    ('title', 'title'), ('description', 'description'),
                    ('target_amount', 'target_amount'),
                    ('current_amount', 'current_amount'),
                    ('target_date', 'target_date'),
                    ('priority', 'priority'), ('status', 'status'),
                    ('is_achieved', 'is_achieved'),
                    ('achievement_date', 'achievement_date'),
                    ('category', 'category'),
                    ('color', 'color'), ('icon_name', 'icon_name'),
                    ('meta', 'meta'),
                    ('created_at', 'created_at'),
                    ('updated_at', 'updated_at'),
                ],
            ),
            (
                'betting_sessions', 'gerenciamento_betting_sessions',
                [
                    ('session_id', 'session_id'),
                    ('game_type', 'game_type'),
                    ('start_balance', 'start_balance'),
                    ('end_balance', 'end_balance'),
                    ('total_bets', 'total_bets'),
                    ('winning_bets', 'winning_bets'),
                    ('losing_bets', 'losing_bets'),
                    ('total_wagered', 'total_wagered'),
                    ('net_result', 'net_result'),
                    ('started_at', 'started_at'),
                    ('ended_at', 'ended_at'),
                    ('duration_seconds', 'duration_seconds'),
                    ('risk_level', 'risk_level'),
                    ('stop_loss_hit', 'stop_loss_hit'),
                    ('profit_target_hit', 'profit_target_hit'),
                    ('meta', 'meta'), ('status', 'status'),
                    ('created_at', 'created_at'),
                    ('updated_at', 'updated_at'),
                ],
            ),
            (
                'betting_stats', 'gerenciamento_betting_stats',
                [
                    ('period_type', 'period_type'),
                    ('period_date', 'period_date'),
                    ('starting_balance', 'starting_balance'),
                    ('ending_balance', 'ending_balance'),
                    ('total_deposits', 'total_deposits'),
                    ('total_withdrawals', 'total_withdrawals'),
                    ('net_profit_loss', 'net_profit_loss'),
                    ('total_sessions', 'total_sessions'),
                    ('winning_sessions', 'winning_sessions'),
                    ('losing_sessions', 'losing_sessions'),
                    ('total_bets', 'total_bets'),
                    ('win_rate', 'win_rate'),
                    ('stop_losses_hit', 'stop_losses_hit'),
                    ('profit_targets_hit', 'profit_targets_hit'),
                    ('max_drawdown', 'max_drawdown'),
                    ('max_profit', 'max_profit'),
                    ('meta', 'meta'),
                    ('created_at', 'created_at'),
                    ('updated_at', 'updated_at'),
                ],
            ),
        ]

        total_inserted = 0
        for legacy_t, target_t, cols in tables:
            n_ins, n_skip = migrate_table(
                legacy, target, user_map,
                legacy_t, target_t, cols, args.dry_run,
            )
            if not args.dry_run:
                target.commit()
            total_inserted += n_ins
            print(f'  {legacy_t:20s} -> {target_t:42s} : {n_ins} ins, {n_skip} skip')

        print(f'\nTotal: {total_inserted} linhas migradas '
              f'({len(skipped)} usuários sem subscription).')

    finally:
        legacy.close()
        target.close()


if __name__ == '__main__':
    main()
