/**
 * Facade do AuthContext para a aba Gerenciamento integrada ao roleta3.
 *
 * Não há login/register/logout aqui: a autenticação é gerenciada pelo
 * `useAuth` do roleta3 (../../../hooks/useAuth.js). Este provider apenas
 * espelha o usuário recebido via props para os Contexts internos do
 * gerenciamento (FinancialContext, BettingContext, etc) sem precisar
 * reescrevê-los.
 */

import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import apiService from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children, userInfo, jwtToken, onLogout }) => {
  // user esperado pelos contexts internos: { id, name, email, profile_photo, initial_bank, current_balance }
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);

  // Hidrata o perfil do gerenciamento a partir do backend
  // (cria UserPreferences se não existir).
  useEffect(() => {
    let cancelled = false;
    if (!jwtToken) {
      setUser(null);
      return;
    }
    (async () => {
      try {
        const resp = await apiService.getUserProfile();
        if (cancelled) return;
        if (resp?.success && resp.user) {
          setUser({
            ...resp.user,
            email: userInfo?.email || resp.user.email,
            name: userInfo?.name || userInfo?.email || resp.user.name,
          });
        } else {
          // Fallback: usa só userInfo do roleta3
          setUser({
            id: userInfo?.email,
            email: userInfo?.email,
            name: userInfo?.email,
          });
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Erro ao carregar perfil');
      }
    })();
    return () => { cancelled = true; };
  }, [jwtToken, userInfo?.email, userInfo?.name]);

  const logout = useCallback(() => {
    if (typeof onLogout === 'function') onLogout();
  }, [onLogout]);

  const updateProfile = useCallback(async (profileData) => {
    try {
      const resp = await apiService.updateUserProfile(profileData);
      if (resp?.success && resp.user) {
        setUser(prev => ({ ...prev, ...resp.user }));
        return { success: true };
      }
      return { success: false, error: resp?.error || 'Falha ao atualizar perfil' };
    } catch (err) {
      const msg = err.message || 'Erro ao atualizar perfil';
      setError(msg);
      return { success: false, error: msg };
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  // Stubs para preservar API de contexts internos do gerenciamento
  const noop = useCallback(async () => ({ success: false, error: 'auth não disponível' }), []);

  const value = {
    user,
    token: jwtToken,
    isAuthenticated: !!jwtToken,
    isLoading: false,
    isInitializing: false,
    error,
    login: noop,
    register: noop,
    resetPassword: noop,
    logout,
    updateProfile,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider (gerenciamento)');
  return ctx;
};
