import React, { createContext, useContext, useState, useCallback } from 'react';

const SideMenuContext = createContext(null);

export const SideMenuProvider = ({ children }) => {
  const [menuVisible, setMenuVisible] = useState(false);
  // --- ADICIONADO: Estado para controlar se o menu está recolhido ---
  const [isCollapsed, setIsCollapsed] = useState(false);

  const openMenu = useCallback(() => setMenuVisible(true), []);
  const closeMenu = useCallback(() => setMenuVisible(false), []);

  // --- ADICIONADO: Função para alternar o estado recolhido ---
  const toggleCollapse = useCallback(() => {
    setIsCollapsed(prev => !prev);
  }, []);

  const value = {
    menuVisible,
    openMenu,
    closeMenu,
    // --- ADICIONADO: Exportando o novo estado e a função ---
    isCollapsed,
    toggleCollapse,
  };

  return (
    <SideMenuContext.Provider value={value}>
      {children}
    </SideMenuContext.Provider>
  );
};

export const useSideMenu = () => {
  const context = useContext(SideMenuContext);
  if (!context) {
    throw new Error('useSideMenu must be used within a SideMenuProvider');
  }
  return context;
};