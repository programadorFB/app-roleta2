"""Ancora `date` das transações existentes ao meio-dia (fix de timezone).

Transações antigas foram gravadas misturando a data local escolhida com a
hora UTC corrente (ex.: '2026-06-15T21:21:00'). No frontend, conversões de
timezone (new Date(date).toISOString()) empurravam o dia para frente.

Este backfill normaliza o horário para 12:00, PRESERVANDO o dia já gravado.
Idempotente: rodar de novo não muda nada (já está ao meio-dia).

Revision ID: 0002_anchor_dates
Revises: 0001_initial
Create Date: 2026-06-15
"""

from alembic import op


revision = '0002_anchor_dates'
down_revision = '0001_initial'
branch_labels = None
depends_on = None


def upgrade():
    # date_trunc('day', date) zera a hora; + 12h ancora ao meio-dia do MESMO dia.
    op.execute(
        "UPDATE gerenciamento_transactions "
        "SET date = date_trunc('day', date) + interval '12 hours' "
        "WHERE date <> date_trunc('day', date) + interval '12 hours'"
    )


def downgrade():
    # Sem downgrade: o horário original (hora UTC espúria) não é recuperável
    # nem desejável. No-op.
    pass
