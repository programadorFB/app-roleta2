"""Initial schema do gerenciamento (FK -> subscriptions.user_id).

Cria as 6 tabelas (user_preferences, betting_profiles, transactions,
objectives, betting_sessions, betting_stats) + índices propostos.
Pressupõe que a tabela `subscriptions` (PK user_id VARCHAR) já exista —
ela é criada pelo init-local.sql do roleta3.

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-19
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = '0001_initial'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # ---------- user_preferences ----------
    op.create_table(
        'gerenciamento_user_preferences',
        sa.Column('user_id', sa.String(length=64), nullable=False),
        sa.Column('profile_photo', sa.String(length=50), nullable=True),
        sa.Column('last_bank_reset', sa.DateTime(),
                  server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('created_at', sa.DateTime(),
                  server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(),
                  server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['subscriptions.user_id'],
                                ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id'),
    )

    # ---------- betting_profiles ----------
    op.create_table(
        'gerenciamento_betting_profiles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.String(length=64), nullable=False),
        sa.Column('profile_type', sa.String(length=20), nullable=False),
        sa.Column('title', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('risk_level', sa.Integer(), nullable=False),
        sa.Column('initial_balance', sa.Numeric(12, 2),
                  server_default=sa.text("'1000.00'"), nullable=False),
        sa.Column('stop_loss', sa.Numeric(12, 2),
                  server_default=sa.text("'0.00'"), nullable=True),
        sa.Column('stop_loss_percentage', sa.Numeric(10, 2),
                  server_default=sa.text('0'), nullable=True),
        sa.Column('profit_target', sa.Numeric(12, 2),
                  server_default=sa.text("'0.00'"), nullable=True),
        sa.Column('features', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('color', sa.String(length=9),
                  server_default=sa.text("'#2f00ffff'"), nullable=True),
        sa.Column('icon_name', sa.String(length=50),
                  server_default=sa.text("'dice'"), nullable=True),
        sa.Column('is_active', sa.Boolean(),
                  server_default=sa.text('true'), nullable=True),
        sa.Column('created_at', sa.DateTime(),
                  server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(),
                  server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['subscriptions.user_id'],
                                ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_gerprofile_user', 'gerenciamento_betting_profiles',
                    ['user_id'])
    op.create_index(
        'idx_gerprofile_active_unique', 'gerenciamento_betting_profiles',
        ['user_id'], unique=True,
        postgresql_where=sa.text('is_active = true'),
    )

    # ---------- transactions ----------
    op.create_table(
        'gerenciamento_transactions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.String(length=64), nullable=False),
        sa.Column('type', sa.String(length=20), nullable=False),
        sa.Column('amount', sa.Numeric(12, 2), nullable=False),
        sa.Column('category', sa.String(length=50), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_initial_bank', sa.Boolean(),
                  server_default=sa.text('false'), nullable=False),
        sa.Column('betting_session_id', sa.String(length=50), nullable=True),
        sa.Column('game_type', sa.String(length=30), nullable=True),
        sa.Column('balance_before', sa.Numeric(12, 2), nullable=True),
        sa.Column('balance_after', sa.Numeric(12, 2), nullable=True),
        sa.Column('meta', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('tags', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('date', sa.DateTime(),
                  server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('created_at', sa.DateTime(),
                  server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(),
                  server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['subscriptions.user_id'],
                                ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_gertx_user_date', 'gerenciamento_transactions',
                    ['user_id', 'date'])
    op.create_index('idx_gertx_user_type', 'gerenciamento_transactions',
                    ['user_id', 'type'])
    op.create_index('idx_gertx_user_category', 'gerenciamento_transactions',
                    ['user_id', 'category'])
    op.create_index(
        'idx_gertx_initial_bank_unique', 'gerenciamento_transactions',
        ['user_id'], unique=True,
        postgresql_where=sa.text('is_initial_bank = true'),
    )

    # ---------- objectives ----------
    op.create_table(
        'gerenciamento_objectives',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.String(length=64), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('target_amount', sa.Numeric(12, 2), nullable=False),
        sa.Column('current_amount', sa.Numeric(12, 2),
                  server_default=sa.text("'0.00'"), nullable=True),
        sa.Column('target_date', sa.Date(), nullable=True),
        sa.Column('priority', sa.String(length=10),
                  server_default=sa.text("'medium'"), nullable=True),
        sa.Column('status', sa.String(length=20),
                  server_default=sa.text("'active'"), nullable=True),
        sa.Column('is_achieved', sa.Boolean(),
                  server_default=sa.text('false'), nullable=True),
        sa.Column('achievement_date', sa.DateTime(), nullable=True),
        sa.Column('category', sa.String(length=50), nullable=True),
        sa.Column('color', sa.String(length=9),
                  server_default=sa.text("'#2f00ffff'"), nullable=True),
        sa.Column('icon_name', sa.String(length=50),
                  server_default=sa.text("'flag'"), nullable=True),
        sa.Column('meta', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(),
                  server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(),
                  server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['subscriptions.user_id'],
                                ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_gerobj_user_status', 'gerenciamento_objectives',
                    ['user_id', 'status'])
    op.create_index('idx_gerobj_user_target_date', 'gerenciamento_objectives',
                    ['user_id', 'target_date'])

    # ---------- betting_sessions ----------
    op.create_table(
        'gerenciamento_betting_sessions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.String(length=64), nullable=False),
        sa.Column('session_id', sa.String(length=50), nullable=False),
        sa.Column('game_type', sa.String(length=30), nullable=False),
        sa.Column('start_balance', sa.Numeric(12, 2), nullable=False),
        sa.Column('end_balance', sa.Numeric(12, 2), nullable=True),
        sa.Column('total_bets', sa.Integer(),
                  server_default=sa.text('0'), nullable=True),
        sa.Column('winning_bets', sa.Integer(),
                  server_default=sa.text('0'), nullable=True),
        sa.Column('losing_bets', sa.Integer(),
                  server_default=sa.text('0'), nullable=True),
        sa.Column('total_wagered', sa.Numeric(12, 2),
                  server_default=sa.text("'0.00'"), nullable=True),
        sa.Column('net_result', sa.Numeric(12, 2),
                  server_default=sa.text("'0.00'"), nullable=True),
        sa.Column('started_at', sa.DateTime(),
                  server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('ended_at', sa.DateTime(), nullable=True),
        sa.Column('duration_seconds', sa.Integer(), nullable=True),
        sa.Column('risk_level', sa.Integer(), nullable=True),
        sa.Column('stop_loss_hit', sa.Boolean(),
                  server_default=sa.text('false'), nullable=True),
        sa.Column('profit_target_hit', sa.Boolean(),
                  server_default=sa.text('false'), nullable=True),
        sa.Column('meta', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('status', sa.String(length=20),
                  server_default=sa.text("'active'"), nullable=True),
        sa.Column('created_at', sa.DateTime(),
                  server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(),
                  server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['subscriptions.user_id'],
                                ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('session_id'),
    )
    op.create_index('idx_gersess_user_started', 'gerenciamento_betting_sessions',
                    ['user_id', 'started_at'])
    op.create_index('idx_gersess_user_status', 'gerenciamento_betting_sessions',
                    ['user_id', 'status'])

    # ---------- betting_stats ----------
    op.create_table(
        'gerenciamento_betting_stats',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.String(length=64), nullable=False),
        sa.Column('period_type', sa.String(length=10), nullable=False),
        sa.Column('period_date', sa.Date(), nullable=False),
        sa.Column('starting_balance', sa.Numeric(12, 2),
                  server_default=sa.text("'0.00'"), nullable=True),
        sa.Column('ending_balance', sa.Numeric(12, 2),
                  server_default=sa.text("'0.00'"), nullable=True),
        sa.Column('total_deposits', sa.Numeric(12, 2),
                  server_default=sa.text("'0.00'"), nullable=True),
        sa.Column('total_withdrawals', sa.Numeric(12, 2),
                  server_default=sa.text("'0.00'"), nullable=True),
        sa.Column('net_profit_loss', sa.Numeric(12, 2),
                  server_default=sa.text("'0.00'"), nullable=True),
        sa.Column('total_sessions', sa.Integer(),
                  server_default=sa.text('0'), nullable=True),
        sa.Column('winning_sessions', sa.Integer(),
                  server_default=sa.text('0'), nullable=True),
        sa.Column('losing_sessions', sa.Integer(),
                  server_default=sa.text('0'), nullable=True),
        sa.Column('total_bets', sa.Integer(),
                  server_default=sa.text('0'), nullable=True),
        sa.Column('win_rate', sa.Numeric(5, 2),
                  server_default=sa.text("'0.00'"), nullable=True),
        sa.Column('stop_losses_hit', sa.Integer(),
                  server_default=sa.text('0'), nullable=True),
        sa.Column('profit_targets_hit', sa.Integer(),
                  server_default=sa.text('0'), nullable=True),
        sa.Column('max_drawdown', sa.Numeric(12, 2),
                  server_default=sa.text("'0.00'"), nullable=True),
        sa.Column('max_profit', sa.Numeric(12, 2),
                  server_default=sa.text("'0.00'"), nullable=True),
        sa.Column('meta', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(),
                  server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(),
                  server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['subscriptions.user_id'],
                                ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'period_type', 'period_date',
                            name='uq_gerstats_user_period'),
    )
    op.create_index('idx_gerstats_user_period', 'gerenciamento_betting_stats',
                    ['user_id', 'period_type', 'period_date'])


def downgrade():
    op.drop_table('gerenciamento_betting_stats')
    op.drop_table('gerenciamento_betting_sessions')
    op.drop_table('gerenciamento_objectives')
    op.drop_table('gerenciamento_transactions')
    op.drop_table('gerenciamento_betting_profiles')
    op.drop_table('gerenciamento_user_preferences')
