import React from 'react';
import { useSideMenu } from '../contexts/SideMenuContext';
import { FaBars } from 'react-icons/fa';

const Header = ({ userName }) => {
  const { openMenu } = useSideMenu();

  return (
    <header>
      <button onClick={openMenu} aria-label="Abrir menu">
        <FaBars size={24} />
      </button>
      <div className="greeting">Olá, {userName}!</div>
      <div className="logo">💰</div>
    </header>
  );
};

export default Header;