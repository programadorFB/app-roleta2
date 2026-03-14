// src/hooks/useAuth.js
import { useState, useEffect, useCallback } from 'react';
import { registerLogoutCallback, clearLogoutCallback } from '../errorHandler';

/**
 * Gerencia autenticação: login, logout, JWT e localStorage.
 * 
 * Retorna estado e handlers prontos para o App orquestrar.
 */
export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [jwtToken, setJwtToken] = useState(null);

  // Restaura sessão do localStorage no mount
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    const email = localStorage.getItem('userEmail');
    const brand = localStorage.getItem('userBrand');

    if (token) {
      setIsAuthenticated(true);
      setJwtToken(token);
      setUserInfo({ email, brand });
    }
    setCheckingAuth(false);
  }, []);

  const handleLoginSuccess = useCallback((data) => {
    setIsAuthenticated(true);
    setJwtToken(data.jwt);
    setUserInfo({
      email: localStorage.getItem('userEmail'),
      brand: localStorage.getItem('userBrand'),
      ...data,
    });
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userBrand');
    setIsAuthenticated(false);
    setUserInfo(null);
    setJwtToken(null);
  }, []);

  // Registra callback de logout global (errorHandler pode forçar logout)
  useEffect(() => {
    registerLogoutCallback(handleLogout);
    return () => clearLogoutCallback();
  }, [handleLogout]);

  return {
    isAuthenticated,
    userInfo,
    checkingAuth,
    jwtToken,
    handleLoginSuccess,
    handleLogout,
  };
}