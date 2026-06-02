import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

// Ícones
import { FaCoins, FaUserTie, FaChessKnight, FaDice, FaChartLine, FaBullseye } from 'react-icons/fa';
import { FiDownload, FiHome } from 'react-icons/fi';

// CSS Module
import styles from './BottomMenu.module.css';

const BottomMenu = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeItem, setActiveItem] = useState('');

  const menuItems = [
    {
      id: 'transactions',
      icon: <FiDownload size={20} />,
      label: 'Lançamentos',
      path: '/transaction',
      color: '#c9a052'
    },
    {
      id: 'dashboard',
      icon: <FiHome size={20} />,
      label: 'Tela Inicial',
      path: '/dashboard',
      color: '#c9a052'
    },
    {
      id: 'objectives',
      icon: <FaBullseye size={20} />,
      label: 'Objetivos',
      path: '/objectives',
      color: '#E91E63'
    },
    {
      id: 'investment',
      icon: <FaUserTie size={20} />,
      label: 'Perfil',
      path: '/investment-profile',
      color: '#34d399'
    },
    // {
    //   id: 'strategy',
    //   icon: <FaChessKnight size={20} />,
    //   label: 'Estratégia',
    //   path: '/strategy',
    //   color: '#c9a052'
    // }
  ];

  const handleNavigation = (path, id) => {
    setActiveItem(id);
    navigate(path);
    
    // Efeito de feedback visual
    setTimeout(() => setActiveItem(''), 300);
  };

  const isActive = (path) => location.pathname === path;

  return (
    <div className={styles.bottomMenuContainer}>
      {/* Efeito de luz neon atrás do menu */}
      <div className={styles.neonGlow}></div>
      
      <nav className={styles.bottomMenu}>
        {menuItems.map((item) => (
          <button
            key={item.id}
            className={`${styles.menuItem} ${isActive(item.path) ? styles.active : ''} ${activeItem === item.id ? styles.pulse : ''}`}
            onClick={() => handleNavigation(item.path, item.id)}
            style={{
              '--item-color': item.color,
              '--item-glow': `${item.color}40`
            }}
          >
            {/* Efeito de brilho ativo */}
            <div className={styles.activeGlow}></div>
            
            {/* Ícone com efeito especial */}
            <div className={styles.iconContainer}>
              {item.icon}
            </div>
            
            {/* Label do menu */}
            <span className={styles.menuLabel}>{item.label}</span>
            
            {/* Indicador de atividade */}
            <div className={styles.activeIndicator}></div>
          </button>
        ))}
      </nav>
    </div>
  );
};

export default BottomMenu;
