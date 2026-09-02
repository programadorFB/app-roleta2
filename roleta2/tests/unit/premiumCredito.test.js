// tests/unit/premiumCredito.test.js
//
// Cobertura das duas funções que traduzem dado bruto em número na tela do
// painel — as duas são puras e nenhuma toca o banco.
//
// `comPremium` responde "essa pessoa tem acesso, e por quantos dias ainda?".
// Errar aqui é pior do que não mostrar nada: o atendimento renova quem não
// precisa e deixa cair quem estava para vencer.
//
// `resumirCredito` calcula a variação do saldo de uma pessoa. A série chega do
// banco do mais NOVO para o mais antigo, e inverter isso troca o sinal do
// resultado — quem ganhou aparece perdendo.

import { describe, it, expect } from 'vitest';
import { comPremium, resumirCredito } from '../../server/adminService.js';

const emDias = (n) => new Date(Date.now() + n * 86_400_000);

describe('comPremium — acesso e contagem de dias', () => {
  it('conta os dias que faltam de uma assinatura ativa', () => {
    const r = comPremium({ status: 'active', expires_at: emDias(12) });
    expect(r.premium_ativo).toBe(true);
    expect(r.dias_restantes).toBe(12);
  });

  it('arredonda para cima: faltando horas, ainda é um dia', () => {
    // Arredondar para baixo diria "0 dias" para quem ainda tem acesso.
    const r = comPremium({ status: 'paid', expires_at: new Date(Date.now() + 6 * 3600_000) });
    expect(r.dias_restantes).toBe(1);
    expect(r.premium_ativo).toBe(true);
  });

  it('sem data de vencimento é acesso sem prazo, não acesso vencido', () => {
    const r = comPremium({ status: 'active', expires_at: null });
    expect(r.premium_ativo).toBe(true);
    expect(r.dias_restantes).toBeNull();
  });

  it('status ativo com data no passado NÃO dá acesso', () => {
    const r = comPremium({ status: 'active', expires_at: emDias(-3) });
    expect(r.premium_ativo).toBe(false);
    expect(r.dias_restantes).toBeLessThan(0);
  });

  it('cancelado com data no futuro NÃO dá acesso', () => {
    // O caso que engana quem olha só o `expires_at`: a data ainda não chegou,
    // mas o status já tirou o acesso.
    const r = comPremium({ status: 'canceled', expires_at: emDias(20) });
    expect(r.premium_ativo).toBe(false);
  });

  it('trial conta como premium enquanto durar', () => {
    expect(comPremium({ status: 'trialing', expires_at: emDias(2) }).premium_ativo).toBe(true);
  });

  it('sem assinatura devolve nulo em vez de inventar uma', () => {
    expect(comPremium(null)).toBeNull();
  });
});

describe('resumirCredito — variação do saldo', () => {
  // Como vem do banco: mais NOVO primeiro.
  const pontos = [
    { saldo: '150.00', lido_em: '2026-09-02T12:00:00Z', delta: '50.00' },
    { saldo: '100.00', lido_em: '2026-09-02T11:00:00Z', delta: '-80.00' },
    { saldo: '180.00', lido_em: '2026-09-01T10:00:00Z', delta: null },
  ];

  it('a variação é do mais antigo para o mais novo', () => {
    // 180 -> 150 é uma PERDA de 30. Ler a série na ordem errada devolveria +30.
    expect(resumirCredito(pontos).variacao).toBe(-30);
  });

  it('acha o pico e o fundo do período', () => {
    const r = resumirCredito(pontos);
    expect(r.pico).toBe(180);
    expect(r.fundo).toBe(100);
  });

  it('carimba a primeira e a última leitura', () => {
    const r = resumirCredito(pontos);
    expect(r.primeiraEm).toBe('2026-09-01T10:00:00Z');
    expect(r.ultimaEm).toBe('2026-09-02T12:00:00Z');
    expect(r.leituras).toBe(3);
  });

  it('sem histórico devolve vazio, não zero', () => {
    // Zero seria uma afirmação sobre o dinheiro da pessoa; vazio é a verdade.
    const r = resumirCredito([]);
    expect(r.leituras).toBe(0);
    expect(r.variacao).toBeNull();
    expect(r.pico).toBeNull();
  });

  it('uma leitura só não tem variação a mostrar', () => {
    const r = resumirCredito([{ saldo: '90.00', lido_em: '2026-09-02T12:00:00Z', delta: null }]);
    expect(r.variacao).toBe(0);
    expect(r.pico).toBe(90);
    expect(r.fundo).toBe(90);
  });
});
