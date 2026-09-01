/**
 * AdminApp.jsx — Entrypoint do painel administrativo.
 *
 * Molde do GerenciamentoApp: MemoryRouter interno, para a navegação do painel
 * não mexer na URL (que precisa continuar sendo /admin, senão um refresh cairia
 * numa rota que o nginx não conhece).
 *
 * A autenticação aqui é própria e não tem relação com o login do usuário final:
 * o painel não passa por assinatura, paywall nem verificação de token do
 * provedor externo.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { MemoryRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import {
  LayoutDashboard, Users as UsersIcon, Repeat, Activity, ShieldAlert, ScrollText,
  PanelLeftClose, PanelLeftOpen, LogOut,
} from 'lucide-react';

import { adminApi, setAdminToken, getAdminToken, AdminApiError } from './api.js';
import css from './Admin.module.css';

import Overview from './pages/Overview.jsx';
import Users from './pages/Users.jsx';
import Retention from './pages/Retention.jsx';
import Engagement from './pages/Engagement.jsx';
import Moderation from './pages/Moderation.jsx';
import AuditLog from './pages/AuditLog.jsx';

// ── Login ─────────────────────────────────────────────

function LoginScreen({ onEntrar }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  const submeter = async (e) => {
    e.preventDefault();
    setErro('');
    setCarregando(true);
    try {
      const { token, admin } = await adminApi.login(email, senha);
      setAdminToken(token);
      onEntrar(admin);
    } catch (err) {
      setErro(err.message || 'Não foi possível entrar');
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className={css.loginWrap}>
      <form className={css.loginCard} onSubmit={submeter}>
        <h1 className={css.loginTitle}>Smart Análise · Painel</h1>
        <p className={css.loginSub}>Acesso restrito à equipe.</p>

        {erro && <div className={css.erro}>{erro}</div>}

        <div className={css.field}>
          <label className={css.label} htmlFor="admin-email">E-mail</label>
          <input
            id="admin-email"
            className={css.input}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </div>

        <div className={css.field}>
          <label className={css.label} htmlFor="admin-senha">Senha</label>
          <input
            id="admin-senha"
            className={css.input}
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        <button className={css.button} type="submit" disabled={carregando}>
          {carregando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}

// ── Layout ────────────────────────────────────────────

// Cada aba leva um ícone porque é ele que sobra quando a barra encolhe: sem
// ícone, a barra recolhida viraria uma coluna de iniciais indecifráveis.
const ABAS = [
  { to: '/',            rotulo: 'Visão geral', Icone: LayoutDashboard, fim: true },
  { to: '/usuarios',    rotulo: 'Usuários',    Icone: UsersIcon },
  { to: '/retencao',    rotulo: 'Retenção',    Icone: Repeat },
  { to: '/engajamento', rotulo: 'Engajamento', Icone: Activity },
  { to: '/moderacao',   rotulo: 'Moderação',   Icone: ShieldAlert },
  { to: '/auditoria',   rotulo: 'Auditoria',   Icone: ScrollText },
];

const CHAVE_RECOLHIDA = 'adminSidebarRecolhida';

function Layout({ admin, onSair }) {
  // A escolha persiste: quem trabalha em tabela larga recolhe uma vez, não a
  // cada abertura do painel. sessionStorage e não localStorage para seguir o
  // mesmo escopo da sessão do admin — o painel não deixa rastro entre sessões.
  const [recolhida, setRecolhida] = useState(() => {
    try { return sessionStorage.getItem(CHAVE_RECOLHIDA) === '1'; } catch { return false; }
  });

  const alternar = () => {
    setRecolhida((v) => {
      const novo = !v;
      try { sessionStorage.setItem(CHAVE_RECOLHIDA, novo ? '1' : '0'); } catch { /* segue sem persistir */ }
      return novo;
    });
  };

  return (
    <div className={css.shell}>
      <aside className={recolhida ? css.sidebarRecolhida : css.sidebar}>
        <div className={css.topoSidebar}>
          {!recolhida && <div className={css.brand}>Smart Análise</div>}
          <button
            className={css.recolher}
            onClick={alternar}
            type="button"
            title={recolhida ? 'Expandir menu' : 'Recolher menu'}
            aria-label={recolhida ? 'Expandir menu' : 'Recolher menu'}
            aria-expanded={!recolhida}
          >
            {recolhida ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
        </div>

        {/* Recolhida, o `title` de cada item e a unica forma de saber o que
            e cada icone. */}
        <nav className={css.nav}>
          {ABAS.map((aba) => {
            const { to, rotulo, fim } = aba;
            // Em maiuscula porque vira componente no JSX (e o ESLint deste
            // projeto so ignora nao-uso de VARIAVEL em maiuscula, nao de
            // parametro desestruturado — sem plugin de React, ele nao ve uso em JSX).
            const Icone = aba.Icone;
            return (
              <NavLink
                key={to}
                to={to}
                end={fim}
                className={({ isActive }) => (isActive ? css.navItemAtivo : css.navItem)}
                title={recolhida ? rotulo : undefined}
              >
                <Icone size={17} className={css.navIcone} />
                {!recolhida && <span>{rotulo}</span>}
              </NavLink>
            );
          })}
        </nav>

        <div className={css.rodapeSidebar}>
          {recolhida ? (
            <button
              className={css.sair}
              onClick={onSair}
              type="button"
              title={`Sair (${admin?.name || admin?.email})`}
              aria-label="Sair"
            >
              <LogOut size={16} />
            </button>
          ) : (
            <>
              <div>{admin?.name || admin?.email}</div>
              <button className={css.sair} onClick={onSair} type="button">Sair</button>
            </>
          )}
        </div>
      </aside>

      <main className={css.main}>
        <Routes>
          <Route path="/"            element={<Overview />} />
          <Route path="/usuarios"    element={<Users />} />
          <Route path="/retencao"    element={<Retention />} />
          <Route path="/engajamento" element={<Engagement />} />
          <Route path="/moderacao"   element={<Moderation />} />
          <Route path="/auditoria"   element={<AuditLog />} />
          <Route path="*"            element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

// ── Raiz ──────────────────────────────────────────────

export default function AdminApp() {
  const [admin, setAdmin] = useState(null);
  const [verificando, setVerificando] = useState(true);

  // Revalida a sessão guardada no sessionStorage: ela pode ter expirado (TTL de
  // 8h) ou sido revogada em outro lugar, e mostrar o painel para depois estourar
  // 403 em toda chamada seria pior que pedir login de novo.
  useEffect(() => {
    const token = getAdminToken();
    if (!token) { setVerificando(false); return; }

    let cancelado = false;
    (async () => {
      try {
        const { admin: sessao } = await adminApi.me(token);
        if (!cancelado) setAdmin(sessao);
      } catch {
        setAdminToken(null);
      } finally {
        if (!cancelado) setVerificando(false);
      }
    })();

    return () => { cancelado = true; };
  }, []);

  const sair = useCallback(async () => {
    try { await adminApi.logout(); } catch { /* sessão já pode estar morta */ }
    setAdminToken(null);
    setAdmin(null);
  }, []);

  if (verificando) {
    return <div className={css.shell}><div className={css.vazio}>Carregando…</div></div>;
  }

  if (!admin) return <LoginScreen onEntrar={setAdmin} />;

  return (
    <MemoryRouter>
      <Layout admin={admin} onSair={sair} />
    </MemoryRouter>
  );
}
