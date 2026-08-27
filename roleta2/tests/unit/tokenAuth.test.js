// tests/unit/tokenAuth.test.js
// Cobertura dos helpers puros da autenticação por token.
// O ponto central: o email deixa de ser afirmado na query e passa a ser
// provado pelo token — então o que importa é nunca aceitar um payload
// não-verificado como prova.

import { describe, it, expect } from 'vitest';
import { extractBearer, peekEmailFromToken } from '../../server/authService.js';

const makeToken = (payload) =>
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  Buffer.from(JSON.stringify(payload)).toString('base64').replace(/=+$/, '') +
  '.assinatura_falsa';

describe('extractBearer', () => {
  it('extrai o token do header Authorization', () => {
    expect(extractBearer({ headers: { authorization: 'Bearer abc.def.ghi' } })).toBe('abc.def.ghi');
  });

  it('aceita "bearer" minúsculo', () => {
    expect(extractBearer({ headers: { authorization: 'bearer xyz' } })).toBe('xyz');
  });

  it('ignora espaços em volta', () => {
    expect(extractBearer({ headers: { authorization: '  Bearer   tok123  ' } })).toBe('tok123');
  });

  it('retorna null sem header', () => {
    expect(extractBearer({ headers: {} })).toBeNull();
  });

  it('retorna null para esquema que não é Bearer', () => {
    expect(extractBearer({ headers: { authorization: 'Basic dXNlcjpwYXNz' } })).toBeNull();
  });

  it('retorna null para header vazio', () => {
    expect(extractBearer({ headers: { authorization: '' } })).toBeNull();
  });
});

describe('peekEmailFromToken', () => {
  it('lê o email do payload', () => {
    expect(peekEmailFromToken(makeToken({ email: 'Joao@Exemplo.COM' }))).toBe('joao@exemplo.com');
  });

  it('cai para sub quando não há email', () => {
    expect(peekEmailFromToken(makeToken({ sub: 'maria@x.com' }))).toBe('maria@x.com');
  });

  it('retorna null para token malformado', () => {
    expect(peekEmailFromToken('nao-e-um-jwt')).toBeNull();
    expect(peekEmailFromToken('')).toBeNull();
    expect(peekEmailFromToken(null)).toBeNull();
  });

  it('retorna null quando o payload não tem identidade', () => {
    expect(peekEmailFromToken(makeToken({ foo: 'bar' }))).toBeNull();
  });

  it('NÃO valida assinatura — por isso não serve como prova', () => {
    // Payload forjado, assinatura inventada: peek devolve o que está escrito.
    // É exatamente por isso que o middleware confirma no emissor antes de
    // liberar; peek só serve para telemetria e para descartar cedo.
    const forjado = makeToken({ email: 'vitima@exemplo.com' });
    expect(peekEmailFromToken(forjado)).toBe('vitima@exemplo.com');
  });
});
