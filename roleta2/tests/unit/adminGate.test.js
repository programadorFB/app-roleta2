// tests/unit/adminGate.test.js
// Cobertura do casamento de IP/CIDR da cerca de rede do painel.
//
// Errar aqui tem os dois lados ruins: uma regra frouxa demais abre o painel
// para a internet, e uma estrita demais tranca o admin para fora do próprio
// sistema. O caso do IPv4 mapeado em IPv6 já apareceu de verdade — o Express
// entrega "::ffff:1.2.3.4" e a comparação crua barrava o IP recém-liberado.

import { describe, it, expect } from 'vitest';
import { ipCombina } from '../../server/adminGate.js';

describe('ipCombina — IP exato', () => {
  it('aceita o mesmo IP', () => {
    expect(ipCombina('189.10.20.30', '189.10.20.30')).toBe(true);
  });

  it('rejeita IP vizinho', () => {
    expect(ipCombina('189.10.20.31', '189.10.20.30')).toBe(false);
  });

  it('aceita IPv4 mapeado em IPv6', () => {
    expect(ipCombina('::ffff:189.10.20.30', '189.10.20.30')).toBe(true);
  });
});

describe('ipCombina — CIDR', () => {
  it('aceita dentro do /16', () => {
    expect(ipCombina('201.50.3.7', '201.50.0.0/16')).toBe(true);
    expect(ipCombina('201.50.255.255', '201.50.0.0/16')).toBe(true);
  });

  it('rejeita fora do /16', () => {
    expect(ipCombina('201.51.0.1', '201.50.0.0/16')).toBe(false);
  });

  it('respeita /8 e /24', () => {
    expect(ipCombina('10.255.255.1', '10.0.0.0/8')).toBe(true);
    expect(ipCombina('11.0.0.1', '10.0.0.0/8')).toBe(false);
    expect(ipCombina('192.168.1.50', '192.168.1.0/24')).toBe(true);
    expect(ipCombina('192.168.2.50', '192.168.1.0/24')).toBe(false);
  });

  it('/32 equivale a IP exato', () => {
    expect(ipCombina('8.8.8.8', '8.8.8.8/32')).toBe(true);
    expect(ipCombina('8.8.8.9', '8.8.8.8/32')).toBe(false);
  });

  it('/0 libera qualquer IPv4', () => {
    // Caso de borda real: em JS, deslocar 32 bits é no-op e daria falso negativo.
    expect(ipCombina('1.2.3.4', '0.0.0.0/0')).toBe(true);
    expect(ipCombina('255.255.255.255', '0.0.0.0/0')).toBe(true);
  });

  it('aceita IPv4 mapeado contra CIDR', () => {
    expect(ipCombina('::ffff:201.50.3.7', '201.50.0.0/16')).toBe(true);
  });
});

describe('ipCombina — entrada inválida nunca libera', () => {
  const invalidos = [
    ['1.2.3.4', 'lixo'],
    ['1.2.3.4', '10.0.0.0/33'],
    ['1.2.3.4', '10.0.0.0/-1'],
    ['1.2.3.4', '10.0.0.0/abc'],
    ['1.2.3.4', '999.0.0.0/8'],
    ['nao-e-ip', '10.0.0.0/8'],
    ['1.2.3', '10.0.0.0/8'],
    ['', '1.2.3.4'],
    ['1.2.3.4', ''],
    [null, '1.2.3.4'],
    ['1.2.3.4', null],
    [undefined, undefined],
  ];

  for (const [ip, regra] of invalidos) {
    it(`nega ${JSON.stringify(ip)} contra ${JSON.stringify(regra)}`, () => {
      expect(ipCombina(ip, regra)).toBe(false);
    });
  }
});
