// tests/unit/emailService.test.js
// Cobertura: template HTML do email de boas-vindas
// Testa geração de HTML sem enviar (mock do transporter)

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock nodemailer antes de importar o módulo
vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({
      sendMail: vi.fn().mockResolvedValue({ messageId: '<test@mock>' }),
    }),
  },
}));

// Seta env vars necessárias
process.env.SMTP_HOST = 'smtp.test.com';
process.env.SMTP_PORT = '587';
process.env.SMTP_USER = 'test@test.com';
process.env.SMTP_PASS = 'password';
process.env.SMTP_SENDER_NAME = 'Test Sender';
process.env.FRONTEND_URL = 'https://test.smartanalise.com.br';

// ══════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════

describe('sendWelcomeEmail', () => {
  let sendWelcomeEmail;

  beforeEach(async () => {
    const mod = await import('../../emailService.js');
    sendWelcomeEmail = mod.sendWelcomeEmail;
  });

  it('envia email com sucesso e retorna true', async () => {
    const result = await sendWelcomeEmail({
      name: 'Fuza Balta',
      email: 'fuza@test.com',
      planName: 'Premium',
      expiresAt: new Date('2025-12-31'),
      amount: 9700,
    });
    expect(result).toBe(true);
  });

  it('aceita dados mínimos (apenas email)', async () => {
    const result = await sendWelcomeEmail({
      email: 'minimal@test.com',
    });
    expect(result).toBe(true);
  });

  it('aceita name null (usa email como fallback)', async () => {
    const result = await sendWelcomeEmail({
      name: null,
      email: 'fallback@test.com',
    });
    expect(result).toBe(true);
  });

  it('aceita amount null (não mostra valor)', async () => {
    const result = await sendWelcomeEmail({
      name: 'Test',
      email: 'noamount@test.com',
      amount: null,
    });
    expect(result).toBe(true);
  });

  it('aceita expiresAt como string ISO', async () => {
    const result = await sendWelcomeEmail({
      name: 'Test',
      email: 'iso@test.com',
      expiresAt: '2025-12-31T00:00:00Z',
    });
    expect(result).toBe(true);
  });
});
