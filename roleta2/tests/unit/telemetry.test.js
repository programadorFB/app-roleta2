// tests/unit/telemetry.test.js
// Cobertura das duas funções puras da telemetria.
//
// sanitizeEvent é a fronteira com payload vindo do cliente — o que passa aqui
// vira linha no banco. stitchSessions decide o que conta como "uma visita", e
// é o que separa "1 visita de 8min" de "2 sessões de 4min" no painel.

import { describe, it, expect } from 'vitest';
import { sanitizeEvent, stitchSessions, ALLOWED_EVENTS } from '../../server/telemetryService.js';

describe('sanitizeEvent — whitelist', () => {
  it('aceita os eventos conhecidos', () => {
    for (const event of ALLOWED_EVENTS) {
      expect(sanitizeEvent({ event })).toMatchObject({ event });
    }
  });

  it('descarta evento fora da whitelist', () => {
    expect(sanitizeEvent({ event: 'drop_table' })).toBeNull();
    expect(sanitizeEvent({ event: '' })).toBeNull();
    expect(sanitizeEvent({})).toBeNull();
  });

  it('descarta payload que não é objeto', () => {
    expect(sanitizeEvent(null)).toBeNull();
    expect(sanitizeEvent('alive')).toBeNull();
    expect(sanitizeEvent(42)).toBeNull();
  });
});

describe('sanitizeEvent — limites de campo', () => {
  it('corta view em 40 caracteres', () => {
    const r = sanitizeEvent({ event: 'view_change', view: 'x'.repeat(200) });
    expect(r.view).toHaveLength(40);
  });

  it('descarta meta acima do teto em vez de truncar', () => {
    // Truncar JSON pela metade produziria string inválida na coluna jsonb.
    const r = sanitizeEvent({ event: 'alive', meta: { blob: 'y'.repeat(2000) } });
    expect(r.meta).toBeNull();
  });

  it('mantém meta pequena', () => {
    const r = sanitizeEvent({ event: 'game_open', meta: { gameId: 102 } });
    expect(r.meta).toEqual({ gameId: 102 });
  });

  it('rejeita meta que não é objeto simples', () => {
    expect(sanitizeEvent({ event: 'alive', meta: [1, 2, 3] }).meta).toBeNull();
    expect(sanitizeEvent({ event: 'alive', meta: 'texto' }).meta).toBeNull();
  });

  it('view ausente vira null, não undefined', () => {
    expect(sanitizeEvent({ event: 'login' }).view).toBeNull();
  });
});

describe('stitchSessions — costura de reconexão', () => {
  const t = (iso) => new Date(`2026-08-27T${iso}Z`).toISOString();
  const row = (start, end, extra = {}) => ({
    user_email: 'a@b.com',
    started_at: t(start),
    ended_at: t(end),
    is_premium: true,
    ...extra,
  });

  it('junta reconexão dentro da janela numa visita só', () => {
    // O socket é recriado a cada troca de roleta no app — sem a costura, trocar
    // de mesa 5 vezes viraria 5 "sessões".
    const v = stitchSessions([
      row('10:00:00', '10:04:00'),
      row('10:04:10', '10:08:00'),
    ]);
    expect(v).toHaveLength(1);
    expect(v[0].durationSeconds).toBe(480);
    expect(v[0].reconnects).toBe(1);
  });

  it('separa quando o intervalo passa da janela', () => {
    const v = stitchSessions([
      row('10:00:00', '10:04:00'),
      row('10:10:00', '10:14:00'),
    ]);
    expect(v).toHaveLength(2);
    expect(v[0].durationSeconds).toBe(240);
    expect(v[1].durationSeconds).toBe(240);
  });

  it('respeita a janela configurada', () => {
    const rows = [row('10:00:00', '10:04:00'), row('10:06:00', '10:08:00')];
    expect(stitchSessions(rows, 60)).toHaveLength(2);
    expect(stitchSessions(rows, 300)).toHaveLength(1);
  });

  it('usa last_seen_at quando a sessão não fechou', () => {
    // Sessão órfã: o worker morreu sem disconnect e ended_at ficou nulo.
    const v = stitchSessions([
      { user_email: 'a@b.com', started_at: t('10:00:00'), ended_at: null, last_seen_at: t('10:03:00'), is_premium: false },
    ]);
    expect(v[0].durationSeconds).toBe(180);
  });

  it('não deixa duração negativa', () => {
    const v = stitchSessions([row('10:05:00', '10:00:00')]);
    expect(v[0].durationSeconds).toBe(0);
  });

  it('lida com lista vazia', () => {
    expect(stitchSessions([])).toEqual([]);
  });

  it('sessão contida na anterior não encurta a visita', () => {
    // Duas conexões simultâneas (duas abas): a segunda fecha antes da primeira.
    const v = stitchSessions([
      row('10:00:00', '10:10:00'),
      row('10:01:00', '10:02:00'),
    ]);
    expect(v).toHaveLength(1);
    expect(v[0].durationSeconds).toBe(600);
  });
});
