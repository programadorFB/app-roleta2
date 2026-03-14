// hooks/useAuth.js

import { useState, useEffect, useCallback } from 'react';
import { registerLogoutCallback, clearLogoutCallback } from '../errorHandler';

export const useAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [jwtToken, setJwtToken] = useState(null);

  // Check stored auth on mount
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

  // Login handler
  const handleLoginSuccess = useCallback((data) => {
    setIsAuthenticated(true);
    setJwtToken(data.jwt);
    setUserInfo({
      email: localStorage.getItem('userEmail'),
      brand: localStorage.getItem('userBrand'),
      ...data
    });
  }, []);

  // Logout handler
  const handleLogout = useCallback(() => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userBrand');
    setIsAuthenticated(false);
    setUserInfo(null);
    setJwtToken(null);
  }, []);

  // Register global logout callback
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
    handleLogout
  };
};