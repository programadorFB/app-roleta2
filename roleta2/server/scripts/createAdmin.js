/**
 * createAdmin.js — Cria (ou redefine a senha de) uma conta do painel admin.
 *
 * Uso:
 *   node server/scripts/createAdmin.js <email> <senha> ["Nome"]
 *   node server/scripts/createAdmin.js --list
 *
 * É CLI de propósito: um endpoint de auto-registro, mesmo protegido, é a porta
 * mais atraente do sistema — quem chega nele ganha acesso a tudo.
 */

import { createAdmin, listAdmins } from '../adminAuthService.js';
import pool from '../db.js';
import { lerSenhaOculta } from './lerSenha.js';

const MIN_PASSWORD = 12;

async function main() {
  const [arg1, senhaPorArgumento, name] = process.argv.slice(2);
  let password = senhaPorArgumento;

  if (arg1 === '--list') {
    const admins = await listAdmins();
    if (admins.length === 0) {
      console.log('Nenhuma conta de admin cadastrada.');
    } else {
      console.table(admins.map(a => ({
        email: a.email,
        nome: a.name || '—',
        papel: a.role,
        criada: a.created_at?.toISOString?.().slice(0, 10),
        ultimo_login: a.last_login_at?.toISOString?.().slice(0, 16).replace('T', ' ') || 'nunca',
        ativa: a.disabled_at ? 'não' : 'sim',
      })));
    }
    return;
  }

  if (!arg1) {
    console.error('Uso: node server/scripts/createAdmin.js <email> ["Nome"]');
    console.error('     (a senha é pedida de forma oculta; passá-la como argumento');
    console.error('      a deixa no histórico do shell e visível no `ps`)');
    process.exitCode = 1;
    return;
  }

  if (!password) {
    password = await lerSenhaOculta(`Senha para ${arg1} (mínimo ${MIN_PASSWORD} caracteres): `);
    const confirmacao = process.stdin.isTTY
      ? await lerSenhaOculta('Repita a senha: ')
      : password;

    if (password !== confirmacao) {
      console.error('As senhas não conferem.');
      process.exitCode = 1;
      return;
    }
  }

  if (password.length < MIN_PASSWORD) {
    console.error(`Senha curta demais — mínimo de ${MIN_PASSWORD} caracteres.`);
    process.exitCode = 1;
    return;
  }

  const admin = await createAdmin({ email: arg1, password, name });
  console.log(`✅ Admin pronto: ${admin.email} (${admin.name || 'sem nome'}) — papel ${admin.role}`);
  console.log('   Acesse o painel em /admin');
}

main()
  .catch(err => {
    console.error('❌ Falhou:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
