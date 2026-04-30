// emailService.js — Premium Welcome Email with embedded logo
import nodemailer from 'nodemailer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = path.join(__dirname, '..', 'src', 'assets', 'backlogin.png');

// ── Transporter (lazy init) ──────────────────────────────────────
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn('⚠️ [EMAIL] SMTP não configurado — emails desabilitados');
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });

  console.log(`📧 [EMAIL] Transporter criado: ${host}:${port}`);
  return transporter;
}

// ── Ornament helpers ─────────────────────────────────────────────
const diamond = (size = 6, opacity = 0.5) =>
  `<div style="width:${size}px;height:${size}px;background:#c9a052;transform:rotate(45deg);display:inline-block;opacity:${opacity};"></div>`;

const ornamentLine = (width = 80) => `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>
    <td style="width:${width}px;height:1px;background:linear-gradient(90deg,transparent,rgba(201,160,82,0.35));"></td>
    <td style="padding:0 14px;">${diamond(7, 0.6)}</td>
    <td style="width:${width}px;height:1px;background:linear-gradient(270deg,transparent,rgba(201,160,82,0.35));"></td>
  </tr></table>`;

const ornamentTriple = (width = 60) => `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>
    <td style="width:${width}px;height:1px;background:linear-gradient(90deg,transparent,rgba(201,160,82,0.25));"></td>
    <td style="padding:0 8px;">${diamond(4, 0.3)}</td>
    <td style="padding:0 6px;">${diamond(6, 0.6)}</td>
    <td style="padding:0 8px;">${diamond(4, 0.3)}</td>
    <td style="width:${width}px;height:1px;background:linear-gradient(270deg,transparent,rgba(201,160,82,0.25));"></td>
  </tr></table>`;

const goldLine = `<tr><td style="height:2px;background:linear-gradient(90deg,transparent 2%,#c9a052 30%,#c9a052 70%,transparent 98%);"></td></tr>`;

const thinDivider = `
  <tr><td align="center" style="padding:0 40px;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
      <td style="height:1px;background:linear-gradient(90deg,transparent,rgba(201,160,82,0.12),transparent);"></td>
    </tr></table>
  </td></tr>`;

// ── Build premium HTML ───────────────────────────────────────────
function buildWelcomeEmail({ name, email, planName, expiresAt, amount }) {
  const firstName = name
    ? name.split(' ')[0].charAt(0).toUpperCase() + name.split(' ')[0].slice(1).toLowerCase()
    : email.split('@')[0];

  const expDate = expiresAt instanceof Date
    ? expiresAt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : expiresAt
      ? new Date(expiresAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
      : null;

  const amountStr = amount ? `R$ ${(amount / 100).toFixed(2).replace('.', ',')}` : null;
  const appUrl             = process.env.FRONTEND_URL;
  const brandGerenciamento = process.env.BRAND_GERENCIAMENTO_URL;
  const brandLaboratorio   = process.env.BRAND_LABORATORIO_URL;
  const brandAcademy       = process.env.BRAND_ACADEMY_URL;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Bem-vindo &agrave; Smart Analise</title>
</head>
<body style="margin:0;padding:0;background:#06050a;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#e8dcc8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#06050a;">
<tr><td align="center" style="padding:40px 16px;">

<!-- ═══════════ OUTER BORDER FRAME ═══════════ -->
<table role="presentation" width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;border:2px solid rgba(201,160,82,0.18);background:#06050a;">
<tr><td style="padding:8px;">

<!-- ═══════════ INNER BORDER FRAME ═══════════ -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0d0b08;border:1px solid rgba(201,160,82,0.10);">

  <!-- GOLD TOP LINE -->
  ${goldLine}

  <!-- CORNER ORNAMENT TOP -->
  <tr><td align="center" style="padding:28px 40px 0;">
    ${ornamentTriple(70)}
  </td></tr>

  <!-- LOGO -->
  <tr><td align="center" style="padding:24px 40px 8px;">
    <div style="display:inline-block;padding:12px;border:1px solid rgba(201,160,82,0.15);">
      <div style="padding:4px;border:1px solid rgba(201,160,82,0.08);">
        <img src="cid:logo" alt="Smart Analise" width="130" height="130" style="display:block;width:130px;height:130px;object-fit:contain;" />
      </div>
    </div>
  </td></tr>

  <!-- ORNAMENT BELOW LOGO -->
  <tr><td align="center" style="padding:12px 40px 6px;">
    ${ornamentLine(50)}
  </td></tr>

  <!-- BADGE -->
  <tr><td align="center" style="padding:8px 40px 12px;">
    <div style="display:inline-block;padding:5px 20px;border:1px solid rgba(201,160,82,0.22);color:#c9a052;font-size:9px;font-weight:700;letter-spacing:4px;text-transform:uppercase;background:rgba(201,160,82,0.03);">
      &#9830;&ensp;ACESSO EXCLUSIVO&ensp;&#9830;
    </div>
  </td></tr>

  <!-- TITLE -->
  <tr><td align="center" style="padding:4px 40px 4px;">
    <h1 style="margin:0;font-size:11px;font-weight:300;letter-spacing:7px;text-transform:uppercase;color:rgba(232,220,200,0.35);">
      BEM-VINDO AO
    </h1>
  </td></tr>
  <tr><td align="center" style="padding:0 40px 8px;">
    <h2 style="margin:0;font-size:38px;font-weight:800;letter-spacing:-1px;color:#fff;line-height:1.1;">
      Smart Analise
    </h2>
  </td></tr>

  <!-- SUBTITLE -->
  <tr><td align="center" style="padding:0 40px 6px;">
    <p style="margin:0;font-size:11px;color:rgba(232,220,200,0.3);letter-spacing:2px;text-transform:uppercase;">
      Ecossistema Premium de Intelig&ecirc;ncia
    </p>
  </td></tr>

  <!-- ORNAMENT BELOW TITLE -->
  <tr><td align="center" style="padding:16px 40px 0;">
    ${ornamentTriple(80)}
  </td></tr>

  ${thinDivider}

  <!-- WELCOME MESSAGE -->
  <tr><td style="padding:28px 44px 20px;">

    <p style="margin:0 0 20px;font-size:19px;color:#fff;font-weight:600;">
      Ol&aacute;, ${firstName}
    </p>

    <p style="margin:0 0 14px;font-size:14px;line-height:1.85;color:rgba(232,220,200,0.55);">
      Sua entrada foi confirmada. A partir de agora, voc&ecirc; faz parte de um seleto grupo que utiliza
      <span style="color:#c9a052;font-weight:600;">tecnologia de ponta</span> para transformar dados
      em vantagem real nas roletas ao vivo.
    </p>

    <p style="margin:0;font-size:14px;line-height:1.85;color:rgba(232,220,200,0.55);">
      Este n&atilde;o &eacute; apenas um acesso &mdash; &eacute; um
      <span style="color:#c9a052;font-weight:600;">convite para operar em outro n&iacute;vel.</span>
      Cada ferramenta foi projetada para lhe dar clareza, precis&atilde;o e controle onde a maioria
      opera no escuro.
    </p>

  </td></tr>

  ${thinDivider}

  <!-- PLAN DETAILS CARD -->
  <tr><td style="padding:24px 44px 28px;">

    <!-- Card ornament -->
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:14px;"><tr>
      <td style="padding-right:8px;">${diamond(4, 0.35)}</td>
      <td style="font-size:9px;font-weight:700;letter-spacing:3px;color:rgba(201,160,82,0.45);text-transform:uppercase;">SEU ACESSO</td>
    </tr></table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:rgba(201,160,82,0.025);border:1px solid rgba(201,160,82,0.1);">
      <!-- inner gold accent line -->
      <tr><td style="height:1px;background:linear-gradient(90deg,rgba(201,160,82,0.2),rgba(201,160,82,0.05));"></td></tr>
      <tr><td style="padding:18px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:7px 0;border-bottom:1px solid rgba(201,160,82,0.06);font-size:12px;color:rgba(232,220,200,0.4);width:100px;">Plano</td>
            <td style="padding:7px 0;border-bottom:1px solid rgba(201,160,82,0.06);font-size:13px;color:#fff;font-weight:600;text-align:right;">${planName || 'Premium'}</td>
          </tr>
          <tr>
            <td style="padding:7px 0;border-bottom:1px solid rgba(201,160,82,0.06);font-size:12px;color:rgba(232,220,200,0.4);">Status</td>
            <td style="padding:7px 0;border-bottom:1px solid rgba(201,160,82,0.06);text-align:right;">
              <span style="display:inline-block;padding:2px 12px;background:rgba(52,211,153,0.08);border:1px solid rgba(52,211,153,0.18);color:#34d399;font-size:9px;font-weight:700;letter-spacing:2px;">ATIVO</span>
            </td>
          </tr>
          ${amountStr ? `<tr>
            <td style="padding:7px 0;border-bottom:1px solid rgba(201,160,82,0.06);font-size:12px;color:rgba(232,220,200,0.4);">Valor</td>
            <td style="padding:7px 0;border-bottom:1px solid rgba(201,160,82,0.06);font-size:13px;color:#c9a052;font-weight:700;text-align:right;">${amountStr}</td>
          </tr>` : ''}
          ${expDate ? `<tr>
            <td style="padding:7px 0;font-size:12px;color:rgba(232,220,200,0.4);">Validade</td>
            <td style="padding:7px 0;font-size:13px;color:rgba(232,220,200,0.65);text-align:right;">${expDate}</td>
          </tr>` : ''}
        </table>
      </td></tr>
    </table>

  </td></tr>

  <!-- ORNAMENT BEFORE CTA -->
  <tr><td align="center" style="padding:20px 44px 4px;">
    ${ornamentLine(40)}
  </td></tr>

  <!-- CTA BUTTON -->
  <tr><td align="center" style="padding:16px 44px 6px;">
    <a href="${appUrl}" target="_blank"
       style="display:inline-block;padding:15px 52px;background:linear-gradient(135deg,#c9a052,#a07830);color:#0d0b08;font-size:12px;font-weight:800;letter-spacing:3px;text-transform:uppercase;text-decoration:none;border:1px solid rgba(255,220,130,0.2);">
      &#9830;&ensp;ACESSAR AGORA&ensp;&#8594;
    </a>
  </td></tr>

  <!-- LINKS -->
  <tr><td align="center" style="padding:14px 44px 24px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="padding:0 6px;">
        <a href="${appUrl}" target="_blank" style="font-size:10px;color:rgba(201,160,82,0.45);text-decoration:none;letter-spacing:0.5px;">Ferramenta</a>
      </td>
      <td style="color:rgba(201,160,82,0.12);font-size:10px;">&#9830;</td>
      <td style="padding:0 6px;">
        <a href="${brandGerenciamento}" target="_blank" style="font-size:10px;color:rgba(201,160,82,0.45);text-decoration:none;letter-spacing:0.5px;">Gerenciamento</a>
      </td>
      <td style="color:rgba(201,160,82,0.12);font-size:10px;">&#9830;</td>
      <td style="padding:0 6px;">
        <a href="${brandLaboratorio}" target="_blank" style="font-size:10px;color:rgba(201,160,82,0.45);text-decoration:none;letter-spacing:0.5px;">Laborat&oacute;rio</a>
      </td>
      <td style="color:rgba(201,160,82,0.12);font-size:10px;">&#9830;</td>
      <td style="padding:0 6px;">
        <a href="${brandAcademy}" target="_blank" style="font-size:10px;color:rgba(201,160,82,0.45);text-decoration:none;letter-spacing:0.5px;">Academy</a>
      </td>
    </tr></table>
  </td></tr>

  ${thinDivider}

  <!-- QUOTE -->
  <tr><td align="center" style="padding:24px 52px;">
    <p style="margin:0;font-size:13px;font-style:italic;color:rgba(232,220,200,0.25);line-height:1.8;">
      &ldquo;Onde outros v&ecirc;em sorte, n&oacute;s vemos dados.<br/>
      Onde outros apostam, n&oacute;s calculamos.&rdquo;
    </p>
  </td></tr>

  <!-- SUPPORT -->
  <tr><td align="center" style="padding:4px 44px 24px;">
    <p style="margin:0 0 10px;font-size:10px;color:rgba(232,220,200,0.2);letter-spacing:0.5px;">
      D&uacute;vidas? Fale com nosso suporte exclusivo:
    </p>
    <a href="https://wa.me/5551981794138?text=Fala%20Fuza!%20Vim%20pela%20ferramenta%20e%20estou%20com%20d%C3%BAvidas..." target="_blank"
       style="display:inline-block;padding:8px 28px;border:1px solid rgba(52,211,153,0.18);color:#34d399;font-size:10px;font-weight:700;letter-spacing:2px;text-decoration:none;">
      WHATSAPP&ensp;&#8599;
    </a>
  </td></tr>

  ${thinDivider}

  <!-- FOOTER -->
  <tr><td align="center" style="padding:24px 44px 16px;">

    ${ornamentTriple(50)}

    <!-- LOGO FOOTER -->
    <div style="margin:14px 0 8px;">
      <img src="cid:logo" alt="SA" width="36" height="36" style="display:inline-block;width:36px;height:36px;object-fit:contain;opacity:0.3;" />
    </div>

    <p style="margin:0 0 3px;font-size:12px;font-weight:700;color:#c9a052;letter-spacing:1.5px;">Smart Analise</p>
    <p style="margin:0 0 14px;font-size:8px;color:rgba(232,220,200,0.18);letter-spacing:4px;text-transform:uppercase;">Tecnologia &amp; Precis&atilde;o</p>
    <p style="margin:0;font-size:8px;color:rgba(232,220,200,0.1);line-height:1.6;">
      Este email foi enviado para <span style="color:rgba(232,220,200,0.18);">${email}</span><br/>
      por ter adquirido acesso ao ecossistema Smart Analise.
    </p>
  </td></tr>

  <!-- GOLD BOTTOM LINE -->
  ${goldLine}

</table>
<!-- END INNER FRAME -->

</td></tr>
</table>
<!-- END OUTER FRAME -->

</td></tr>
</table>
</body>
</html>`;
}

// ── Send welcome email ───────────────────────────────────────────
export async function sendWelcomeEmail({ name, email, planName, expiresAt, amount }) {
  const transport = getTransporter();
  if (!transport) {
    console.log('⚠️ [EMAIL] SMTP não configurado — email de boas-vindas não enviado');
    return false;
  }

  const senderName  = process.env.SMTP_SENDER_NAME || 'Smart Analise';
  const senderEmail = process.env.SMTP_USER;

  const html = buildWelcomeEmail({ name, email, planName, expiresAt, amount });

  try {
    const info = await transport.sendMail({
      from: `"${senderName}" <${senderEmail}>`,
      to: email,
      subject: `Bem-vindo ao Smart Analise — Seu acesso está ativo`,
      html,
      attachments: [{
        filename: 'logo.png',
        path: LOGO_PATH,
        cid: 'logo',
      }],
    });
    console.log(`📧 [EMAIL] Boas-vindas enviado para ${email} (${info.messageId})`);
    return true;
  } catch (err) {
    console.error(`❌ [EMAIL] Falha ao enviar para ${email}:`, err.message);
    return false;
  }
}

// ── Build expiration reminder HTML ───────────────────────────────
function buildExpirationReminderEmail({ name, email, planName, expiresAt, daysLeft, checkoutUrl }) {
  const firstName = name
    ? name.split(' ')[0].charAt(0).toUpperCase() + name.split(' ')[0].slice(1).toLowerCase()
    : email.split('@')[0];

  const expDate = expiresAt instanceof Date
    ? expiresAt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : expiresAt
      ? new Date(expiresAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
      : null;

  const daysLabel = daysLeft === 1 ? '1 dia' : `${daysLeft} dias`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sua assinatura vence em ${daysLabel}</title>
</head>
<body style="margin:0;padding:0;background:#06050a;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#e8dcc8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#06050a;">
<tr><td align="center" style="padding:40px 16px;">

<!-- OUTER -->
<table role="presentation" width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;border:2px solid rgba(201,160,82,0.18);background:#06050a;">
<tr><td style="padding:8px;">

<!-- INNER -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0d0b08;border:1px solid rgba(201,160,82,0.10);">

  ${goldLine}

  <tr><td align="center" style="padding:28px 40px 0;">
    ${ornamentTriple(70)}
  </td></tr>

  <!-- LOGO -->
  <tr><td align="center" style="padding:24px 40px 8px;">
    <div style="display:inline-block;padding:12px;border:1px solid rgba(201,160,82,0.15);">
      <div style="padding:4px;border:1px solid rgba(201,160,82,0.08);">
        <img src="cid:logo" alt="Smart Analise" width="130" height="130" style="display:block;width:130px;height:130px;object-fit:contain;" />
      </div>
    </div>
  </td></tr>

  <tr><td align="center" style="padding:12px 40px 6px;">
    ${ornamentLine(50)}
  </td></tr>

  <!-- BADGE -->
  <tr><td align="center" style="padding:8px 40px 12px;">
    <div style="display:inline-block;padding:5px 20px;border:1px solid rgba(251,191,36,0.28);color:#fbbf24;font-size:9px;font-weight:700;letter-spacing:4px;text-transform:uppercase;background:rgba(251,191,36,0.04);">
      &#9830;&ensp;AVISO DE VENCIMENTO&ensp;&#9830;
    </div>
  </td></tr>

  <!-- TITLE -->
  <tr><td align="center" style="padding:4px 40px 4px;">
    <h1 style="margin:0;font-size:11px;font-weight:300;letter-spacing:7px;text-transform:uppercase;color:rgba(232,220,200,0.35);">
      SUA ASSINATURA VENCE EM
    </h1>
  </td></tr>
  <tr><td align="center" style="padding:0 40px 8px;">
    <h2 style="margin:0;font-size:54px;font-weight:800;letter-spacing:-1px;color:#fbbf24;line-height:1.1;text-shadow:0 0 24px rgba(251,191,36,0.15);">
      ${daysLabel}
    </h2>
  </td></tr>

  <tr><td align="center" style="padding:0 40px 6px;">
    <p style="margin:0;font-size:11px;color:rgba(232,220,200,0.3);letter-spacing:2px;text-transform:uppercase;">
      N&atilde;o perca o acesso ao ecossistema
    </p>
  </td></tr>

  <tr><td align="center" style="padding:16px 40px 0;">
    ${ornamentTriple(80)}
  </td></tr>

  ${thinDivider}

  <!-- MESSAGE -->
  <tr><td style="padding:28px 44px 20px;">

    <p style="margin:0 0 20px;font-size:19px;color:#fff;font-weight:600;">
      Ol&aacute;, ${firstName}
    </p>

    <p style="margin:0 0 14px;font-size:14px;line-height:1.85;color:rgba(232,220,200,0.55);">
      Este &eacute; um aviso amig&aacute;vel: sua assinatura do
      <span style="color:#c9a052;font-weight:600;">Smart Analise</span>
      vence em ${expDate ? `<strong style="color:#fbbf24;">${expDate}</strong>` : `<strong style="color:#fbbf24;">${daysLabel}</strong>`}.
    </p>

    <p style="margin:0 0 14px;font-size:14px;line-height:1.85;color:rgba(232,220,200,0.55);">
      Para manter acesso <span style="color:#c9a052;font-weight:600;">ininterrupto</span>
      &agrave;s ferramentas, dashboards e sinais em tempo real, basta renovar agora &mdash; sem
      perder configura&ccedil;&otilde;es, hist&oacute;rico ou progresso.
    </p>

    <p style="margin:0;font-size:14px;line-height:1.85;color:rgba(232,220,200,0.55);">
      Se a renova&ccedil;&atilde;o for autom&aacute;tica, voc&ecirc; pode ignorar este aviso &mdash; o
      sistema se atualizar&aacute; sozinho ap&oacute;s a confirma&ccedil;&atilde;o do pagamento.
    </p>

  </td></tr>

  ${thinDivider}

  <!-- CARD -->
  <tr><td style="padding:24px 44px 28px;">

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:14px;"><tr>
      <td style="padding-right:8px;">${diamond(4, 0.35)}</td>
      <td style="font-size:9px;font-weight:700;letter-spacing:3px;color:rgba(201,160,82,0.45);text-transform:uppercase;">DETALHES DO ACESSO</td>
    </tr></table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:rgba(201,160,82,0.025);border:1px solid rgba(201,160,82,0.1);">
      <tr><td style="height:1px;background:linear-gradient(90deg,rgba(251,191,36,0.25),rgba(201,160,82,0.05));"></td></tr>
      <tr><td style="padding:18px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:7px 0;border-bottom:1px solid rgba(201,160,82,0.06);font-size:12px;color:rgba(232,220,200,0.4);width:140px;">Plano</td>
            <td style="padding:7px 0;border-bottom:1px solid rgba(201,160,82,0.06);font-size:13px;color:#fff;font-weight:600;text-align:right;">${planName || 'Premium'}</td>
          </tr>
          <tr>
            <td style="padding:7px 0;border-bottom:1px solid rgba(201,160,82,0.06);font-size:12px;color:rgba(232,220,200,0.4);">Status atual</td>
            <td style="padding:7px 0;border-bottom:1px solid rgba(201,160,82,0.06);text-align:right;">
              <span style="display:inline-block;padding:2px 12px;background:rgba(52,211,153,0.08);border:1px solid rgba(52,211,153,0.18);color:#34d399;font-size:9px;font-weight:700;letter-spacing:2px;">ATIVO</span>
            </td>
          </tr>
          ${expDate ? `<tr>
            <td style="padding:7px 0;border-bottom:1px solid rgba(201,160,82,0.06);font-size:12px;color:rgba(232,220,200,0.4);">Vence em</td>
            <td style="padding:7px 0;border-bottom:1px solid rgba(201,160,82,0.06);font-size:13px;color:#fbbf24;font-weight:700;text-align:right;">${expDate}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:7px 0;font-size:12px;color:rgba(232,220,200,0.4);">Tempo restante</td>
            <td style="padding:7px 0;font-size:13px;color:#fbbf24;font-weight:700;text-align:right;">${daysLabel}</td>
          </tr>
        </table>
      </td></tr>
    </table>

  </td></tr>

  <tr><td align="center" style="padding:20px 44px 4px;">
    ${ornamentLine(40)}
  </td></tr>

  <!-- CTA -->
  <tr><td align="center" style="padding:16px 44px 6px;">
    <a href="${checkoutUrl}" target="_blank"
       style="display:inline-block;padding:15px 52px;background:linear-gradient(135deg,#c9a052,#a07830);color:#0d0b08;font-size:12px;font-weight:800;letter-spacing:3px;text-transform:uppercase;text-decoration:none;border:1px solid rgba(255,220,130,0.2);">
      &#9830;&ensp;RENOVAR AGORA&ensp;&#8594;
    </a>
  </td></tr>

  <tr><td align="center" style="padding:10px 44px 24px;">
    <p style="margin:0;font-size:10px;color:rgba(232,220,200,0.28);letter-spacing:0.5px;">
      Renova&ccedil;&atilde;o r&aacute;pida e segura pela Hubla
    </p>
  </td></tr>

  ${thinDivider}

  <!-- SUPPORT -->
  <tr><td align="center" style="padding:24px 44px 24px;">
    <p style="margin:0 0 10px;font-size:10px;color:rgba(232,220,200,0.28);letter-spacing:0.5px;">
      Problemas para renovar ou quer um plano diferente?
    </p>
    <a href="https://wa.me/5551981794138?text=Fala%20Fuza!%20Quero%20renovar%20minha%20assinatura..." target="_blank"
       style="display:inline-block;padding:8px 28px;border:1px solid rgba(52,211,153,0.18);color:#34d399;font-size:10px;font-weight:700;letter-spacing:2px;text-decoration:none;">
      FALAR NO WHATSAPP&ensp;&#8599;
    </a>
  </td></tr>

  ${thinDivider}

  <!-- FOOTER -->
  <tr><td align="center" style="padding:24px 44px 16px;">

    ${ornamentTriple(50)}

    <div style="margin:14px 0 8px;">
      <img src="cid:logo" alt="SA" width="36" height="36" style="display:inline-block;width:36px;height:36px;object-fit:contain;opacity:0.3;" />
    </div>

    <p style="margin:0 0 3px;font-size:12px;font-weight:700;color:#c9a052;letter-spacing:1.5px;">Smart Analise</p>
    <p style="margin:0 0 14px;font-size:8px;color:rgba(232,220,200,0.18);letter-spacing:4px;text-transform:uppercase;">Tecnologia &amp; Precis&atilde;o</p>
    <p style="margin:0;font-size:8px;color:rgba(232,220,200,0.1);line-height:1.6;">
      Este aviso foi enviado para <span style="color:rgba(232,220,200,0.18);">${email}</span><br/>
      porque sua assinatura est&aacute; pr&oacute;xima do vencimento.
    </p>
  </td></tr>

  ${goldLine}

</table>

</td></tr>
</table>

</td></tr>
</table>
</body>
</html>`;
}

// ── Send expiration reminder ─────────────────────────────────────
export async function sendExpirationReminderEmail({ name, email, planName, expiresAt, daysLeft }) {
  const transport = getTransporter();
  if (!transport) {
    console.log('⚠️ [EMAIL] SMTP não configurado — aviso de vencimento não enviado');
    return false;
  }

  const senderName  = process.env.SMTP_SENDER_NAME || 'Smart Analise';
  const senderEmail = process.env.SMTP_USER;
  const checkoutUrl = process.env.HUBLA_CHECKOUT_URL || process.env.FRONTEND_URL;

  const html = buildExpirationReminderEmail({ name, email, planName, expiresAt, daysLeft, checkoutUrl });
  const daysLabel = daysLeft === 1 ? '1 dia' : `${daysLeft} dias`;

  try {
    const info = await transport.sendMail({
      from: `"${senderName}" <${senderEmail}>`,
      to: email,
      subject: `Sua assinatura vence em ${daysLabel} — renove e mantenha o acesso`,
      html,
      attachments: [{
        filename: 'logo.png',
        path: LOGO_PATH,
        cid: 'logo',
      }],
    });
    console.log(`📧 [EMAIL] Aviso de vencimento enviado para ${email} (${daysLabel}) — ${info.messageId}`);
    return true;
  } catch (err) {
    console.error(`❌ [EMAIL] Falha ao enviar aviso para ${email}:`, err.message);
    return false;
  }
}

export default { sendWelcomeEmail, sendExpirationReminderEmail };
