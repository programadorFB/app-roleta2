// tests/unit/adminAuth.test.js
// Cobertura do hash de senha do painel administrativo.
//
// É a credencial que dá acesso a banir usuários, alterar assinaturas e ver a
// banca de todo mundo. O que estes testes garantem: senha errada nunca passa,
// o hash nunca é determinístico (dois cadastros da mesma senha geram hashes
// diferentes) e nenhuma entrada malformada vira exceção — porque uma exceção
// não tratada no verify viraria 500 no lugar de 401.

import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../../server/adminAuthService.js';

describe('hashPassword — formato', () => {
  it('gera o formato scrypt$N$r$p$salt$hash', () => {
    const partes = hashPassword('uma-senha-qualquer').split('$');
    expect(partes).toHaveLength(6);
    expect(partes[0]).toBe('scrypt');
    expect(Number(partes[1])).toBeGreaterThanOrEqual(16384);
  });

  it('salt diferente a cada chamada', () => {
    // Sem isso, duas contas com a mesma senha teriam o mesmo hash — e um
    // vazamento do banco entregaria quem compartilha senha.
    const a = hashPassword('mesma-senha-123');
    const b = hashPassword('mesma-senha-123');
    expect(a).not.toBe(b);
    expect(verifyPassword('mesma-senha-123', a)).toBe(true);
    expect(verifyPassword('mesma-senha-123', b)).toBe(true);
  });
});

describe('verifyPassword — aceita e rejeita', () => {
  const stored = hashPassword('senha-correta-12345');

  it('aceita a senha certa', () => {
    expect(verifyPassword('senha-correta-12345', stored)).toBe(true);
  });

  it('rejeita senha errada', () => {
    expect(verifyPassword('senha-errada-12345', stored)).toBe(false);
  });

  it('rejeita prefixo da senha certa', () => {
    expect(verifyPassword('senha-correta-1234', stored)).toBe(false);
  });

  it('rejeita senha vazia', () => {
    expect(verifyPassword('', stored)).toBe(false);
  });

  it('é sensível a maiúsculas', () => {
    expect(verifyPassword('SENHA-CORRETA-12345', stored)).toBe(false);
  });
});

describe('verifyPassword — entrada malformada não lança', () => {
  // Cada um destes chegaria como 500 se o verify estourasse; o contrato é
  // devolver false e deixar a rota responder 401.
  const lixo = [
    '',
    'nao-e-hash',
    'scrypt$so$tres$campos',
    'bcrypt$16384$8$1$abc$def',      // algoritmo diferente
    'scrypt$naonumero$8$1$abc$def',  // N inválido
    'scrypt$16384$8$1$$',            // salt e hash vazios
    null,
    undefined,
    123,
    {},
  ];

  for (const stored of lixo) {
    it(`retorna false para ${JSON.stringify(stored)}`, () => {
      expect(verifyPassword('qualquer-senha', stored)).toBe(false);
    });
  }

  it('não lança nem com senha não-string', () => {
    const valido = hashPassword('senha-de-teste-123');
    expect(() => verifyPassword(null, valido)).not.toThrow();
    expect(() => verifyPassword({}, valido)).not.toThrow();
  });
});
