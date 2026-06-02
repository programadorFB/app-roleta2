import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useSideMenu } from '../contexts/SideMenuContext.jsx';

import { MdDashboard, MdLogout, MdClose, MdHelpOutline } from 'react-icons/md';
import { FaChartLine, FaBullseye, FaUserTie, FaFileExport, FaAngleDoubleLeft, FaAngleDoubleRight } from 'react-icons/fa';
import { FiDownload, FiSettings } from 'react-icons/fi';

import styles from './Sidemenu.module.css';


function MenuItem({ icon, text, onClick, active = false, danger = false }) {
  const cls = [
    styles.menuItem,
    active ? styles.menuItemActive : '',
    danger ? styles.menuItemDanger : '',
  ].filter(Boolean).join(' ');

  return (
    <button className={cls} onClick={onClick} title={text}>
      <span className={styles.menuItemIcon}>{icon}</span>
      <span className={styles.menuItemText}>{text}</span>
      {active && <span className={styles.menuItemMark} aria-hidden />}
    </button>
  );
}


function MenuSection({ label, children }) {
  return (
    <div className={styles.menuSection}>
      <div className={styles.menuSectionLabel}>{label}</div>
      {children}
    </div>
  );
}


function getInitials(name) {
  if (!name) return 'U';
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}


export default function SideMenu() {
  const { menuVisible, closeMenu, isCollapsed, toggleCollapse } = useSideMenu();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const go = (path) => {
    closeMenu();
    navigate(path);
  };

  const handleLogout = () => {
    if (window.confirm('Sair da conta?')) {
      const result = logout();
      Promise.resolve(result).finally(closeMenu);
    }
  };

  const isActive = (path) => pathname === path || pathname.startsWith(path + '/');

  const displayName = user?.name || user?.email?.split('@')[0] || 'Usuário';
  const displayEmail = user?.email || '—';

  return (
    <>
      {menuVisible && <div className={styles.overlay} onClick={closeMenu} />}

      <aside
        className={[
          styles.container,
          menuVisible ? styles.visible : '',
          isCollapsed ? styles.collapsed : '',
        ].filter(Boolean).join(' ')}
      >
        <button
          className={styles.closeButton}
          onClick={closeMenu}
          title="Fechar menu"
          aria-label="Fechar menu"
        >
          <MdClose size={18} />
        </button>

        {/* ── Perfil ── */}
        <header className={styles.profileSection}>
          <div className={styles.avatar} aria-hidden>
            {getInitials(displayName)}
          </div>
          <div className={styles.profileInfo}>
            <div className={styles.userName} title={displayName}>{displayName}</div>
            <div className={styles.userEmail} title={displayEmail}>{displayEmail}</div>
          </div>
        </header>

        {/* ── Navegação ── */}
        <nav className={styles.nav}>
          <MenuSection label="Visão geral">
            <MenuItem
              icon={<MdDashboard size={20} />}
              text="Dashboard"
              onClick={() => go('/dashboard')}
              active={isActive('/dashboard')}
            />
            <MenuItem
              icon={<FaChartLine size={17} />}
              text="Análise"
              onClick={() => go('/charts')}
              active={isActive('/charts')}
            />
          </MenuSection>

          <MenuSection label="Gestão">
            <MenuItem
              icon={<FiDownload size={18} />}
              text="Lançamentos"
              onClick={() => go('/transaction')}
              active={isActive('/transaction') || isActive('/history')}
            />
            <MenuItem
              icon={<FaBullseye size={17} />}
              text="Objetivos"
              onClick={() => go('/objectives')}
              active={isActive('/objectives')}
            />
            <MenuItem
              icon={<FaUserTie size={17} />}
              text="Perfil de investimento"
              onClick={() => go('/investment-profile')}
              active={isActive('/investment-profile')}
            />
            <MenuItem
              icon={<FaFileExport size={17} />}
              text="Gerar relatório"
              onClick={() => go('/report')}
              active={isActive('/report')}
            />
          </MenuSection>

          <MenuSection label="Ajuda">
            <MenuItem
              icon={<MdHelpOutline size={20} />}
              text="Tutorial"
              onClick={() => go('/tutorial')}
              active={isActive('/tutorial')}
            />
          </MenuSection>

          <MenuSection label="Conta">
            <MenuItem
              icon={<FiSettings size={18} />}
              text="Configurações"
              onClick={() => go('/profile')}
              active={isActive('/profile')}
            />
            <MenuItem
              icon={<MdLogout size={20} />}
              text="Sair"
              onClick={handleLogout}
              danger
            />
          </MenuSection>
        </nav>

        {/* ── Rodapé ── */}
        <footer className={styles.footer}>
          <button
            className={styles.collapseButton}
            onClick={toggleCollapse}
            title={isCollapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            <span className={styles.menuItemIcon}>
              {isCollapsed ? <FaAngleDoubleRight size={14} /> : <FaAngleDoubleLeft size={14} />}
            </span>
            <span className={styles.menuItemText}>Recolher</span>
          </button>
          <p className={styles.footerText}>Gerenciamento · v1.0</p>
        </footer>
      </aside>
    </>
  );
}
