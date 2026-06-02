import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import apiService from '../services/api'; // Supondo que você tenha este serviço
import { useAuth } from './AuthContext'; // Supondo que você tenha este contexto

const BettingContext = createContext();

// Action types
const BETTING_ACTIONS = {
  SET_LOADING: 'SET_LOADING',
  SET_PROFILE: 'SET_PROFILE',
  UPDATE_PROFILE: 'UPDATE_PROFILE',
  SET_SESSIONS: 'SET_SESSIONS',
  ADD_SESSION: 'ADD_SESSION',
  UPDATE_SESSION: 'UPDATE_SESSION',
  SET_STATS: 'SET_STATS',
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR',
  RESET_DATA: 'RESET_DATA',
  SET_INITIALIZED: 'SET_INITIALIZED',
};

// Initial state - Updated to include percentage-based stop loss
const initialState = {
  bettingProfile: {
    id: null,
    profileType: null,
    title: '',
    description: '',
    riskLevel: 5,
    initialBalance: 0,
    stopLoss: 0, // Keep for backward compatibility
    stopLossPercentage: 0, // New percentage field
    profitTarget: 0,
    dailyTarget: 0,
    features: [],
    color: '#c9a052',
    iconName: 'dice',
    isInitialized: false,
    createdAt: null,
    updatedAt: null,
  },
  bettingSessions: [],
  bettingStats: {
    totalSessions: 0,
    winningSessions: 0,
    losingSessions: 0,
    winRate: 0,
    totalProfit: 0,
    avgSessionResult: 0,
    bestSession: 0,
    worstSession: 0,
  },
  isLoading: false,
  error: null,
  lastUpdated: null,
};

// Reducer - Updated to handle percentage fields
const bettingReducer = (state, action) => {
  switch (action.type) {
    case BETTING_ACTIONS.SET_LOADING:
      return {
        ...state,
        isLoading: action.payload,
      };

    case BETTING_ACTIONS.SET_PROFILE:
      return {
        ...state,
        bettingProfile: {
          ...state.bettingProfile,
          ...action.payload,
          isInitialized: true,
        },
        lastUpdated: new Date().getTime(),
      };

    case BETTING_ACTIONS.UPDATE_PROFILE:
      return {
        ...state,
        bettingProfile: {
          ...state.bettingProfile,
          ...action.payload,
          updatedAt: new Date().toISOString(),
        },
        lastUpdated: new Date().getTime(),
      };

    case BETTING_ACTIONS.SET_SESSIONS:
      return {
        ...state,
        bettingSessions: action.payload,
      };

    case BETTING_ACTIONS.ADD_SESSION:
      return {
        ...state,
        bettingSessions: [action.payload, ...state.bettingSessions],
      };

    case BETTING_ACTIONS.UPDATE_SESSION:
      return {
        ...state,
        bettingSessions: state.bettingSessions.map(session =>
          session.id === action.payload.id ? action.payload : session
        ),
      };

    case BETTING_ACTIONS.SET_STATS:
      return {
        ...state,
        bettingStats: action.payload,
      };

    case BETTING_ACTIONS.SET_ERROR:
      return {
        ...state,
        error: action.payload,
        isLoading: false,
      };

    case BETTING_ACTIONS.CLEAR_ERROR:
      return {
        ...state,
        error: null,
      };

    case BETTING_ACTIONS.SET_INITIALIZED:
      return {
        ...state,
        bettingProfile: {
          ...state.bettingProfile,
          isInitialized: action.payload,
        },
      };

    case BETTING_ACTIONS.RESET_DATA:
      return initialState;

    default:
      return state;
  }
};

// Cache keys
const CACHE_KEYS = {
  BETTING_PROFILE: 'betting_profile',
  BETTING_SESSIONS: 'betting_sessions',
  BETTING_STATS: 'betting_stats',
};

// Profile definitions - Updated to include percentage recommendations
const PROFILES = {
  cautious: {
    id: 'cautious',
    title: 'Jogador Cauteloso',
    description: 'Prefere apostas seguras com menor risco, focando em preservar a banca e fazer ganhos consistentes.',
    // verde esmeralda — consistente com semântica de "seguro" (success token)
    color: '#34d399',
    icon: { name: 'shield-alt', color: '#34d399' },
    features: [
      'Menor volatilidade',
      'Gestão rigorosa de banca',
      'Sessões mais longas',
    ],
    recommendedStopLoss: 10,
    recommendedProfitTarget: 20,
  },
  balanced: {
    id: 'balanced',
    title: 'Jogador Equilibrado',
    description: 'Combina apostas seguras com algumas jogadas mais arriscadas, buscando equilíbrio entre risco e recompensa.',
    // ouro — alinhado à identidade Mogno & Ouro
    color: '#c9a052',
    icon: { name: 'balance-scale', color: '#c9a052' },
    features: [
      'Risco calculado',
      'Estratégias diversificadas',
      'Flexibilidade nas apostas',
    ],
    recommendedStopLoss: 20,
    recommendedProfitTarget: 40,
  },
  highrisk: {
    id: 'highrisk',
    title: 'Jogador de Alto Risco',
    description: 'Busca grandes ganhos através de apostas de alto risco, aceitando maior volatilidade para maximizar retornos.',
    // âmbar quente — risco sem ser alarme; vermelho fica para erros
    color: '#f59e0b',
    icon: { name: 'fire', color: '#f59e0b' },
    features: [
      'Apostas em números específicos',
      'Alta volatilidade',
      'Potencial de grandes ganhos',
      'Sessões intensas',
    ],
    recommendedStopLoss: 30,
    recommendedProfitTarget: 60,
  }
};

export const BettingProvider = ({ children }) => {
  const [state, dispatch] = useReducer(bettingReducer, initialState);
  const { isAuthenticated, user } = useAuth();

  // Initialize betting data when user logs in
  useEffect(() => {
    if (isAuthenticated && user) {
      loadInitialData();
    } else {
      // Clear data when user logs out
      dispatch({ type: BETTING_ACTIONS.RESET_DATA });
      clearCache();
    }
  }, [isAuthenticated, user]);

  // Cache management
  const loadFromCache = () => {
    try {
      const cachedProfile = localStorage.getItem(CACHE_KEYS.BETTING_PROFILE);
      const cachedSessions = localStorage.getItem(CACHE_KEYS.BETTING_SESSIONS);
      const cachedStats = localStorage.getItem(CACHE_KEYS.BETTING_STATS);

      if (cachedProfile) {
        dispatch({
          type: BETTING_ACTIONS.SET_PROFILE,
          payload: JSON.parse(cachedProfile),
        });
      }

      if (cachedSessions) {
        dispatch({
          type: BETTING_ACTIONS.SET_SESSIONS,
          payload: JSON.parse(cachedSessions),
        });
      }

      if (cachedStats) {
        dispatch({
          type: BETTING_ACTIONS.SET_STATS,
          payload: JSON.parse(cachedStats),
        });
      }
    } catch (error) {
      console.error('Error loading betting data from cache:', error);
    }
  };

  const saveToCache = (key, data) => {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      console.error('Error saving betting data to cache:', error);
    }
  };

  const clearCache = () => {
    try {
      Object.values(CACHE_KEYS).forEach(key => localStorage.removeItem(key));
    } catch (error) {
      console.error('Error clearing betting cache:', error);
    }
  };

  // Data loading functions
  const loadInitialData = async () => {
    dispatch({ type: BETTING_ACTIONS.SET_LOADING, payload: true });
    
    try {
      // Load from cache first
      loadFromCache();
      
      // Then load fresh data from API
      await loadBettingProfile();
      await loadBettingStats();
    } catch (error) {
      console.error('Error loading initial betting data:', error);
      dispatch({
        type: BETTING_ACTIONS.SET_ERROR,
        payload: 'Failed to load betting data',
      });
    } finally {
      dispatch({ type: BETTING_ACTIONS.SET_LOADING, payload: false });
    }
  };

  const loadBettingProfile = async () => {
    try {
      const response = await apiService.getBettingProfile();
      
      if (response.success && response.data) {
        const profileData = {
          id: response.data.id,
          profileType: response.data.profile_type,
          title: response.data.title,
          description: response.data.description,
          riskLevel: response.data.risk_level,
          initialBalance: parseFloat(response.data.initial_balance),
          stopLoss: parseFloat(response.data.stop_loss),
          stopLossPercentage: parseFloat(response.data.stop_loss_percentage || 0), // New field
          profitTarget: parseFloat(response.data.profit_target),
          dailyTarget: parseFloat(response.data.daily_target || 0),
          features: response.data.features || [],
          color: response.data.color,
          iconName: response.data.icon_name,
          createdAt: response.data.created_at,
          updatedAt: response.data.updated_at,
        };

        dispatch({
          type: BETTING_ACTIONS.SET_PROFILE,
          payload: profileData,
        });

        saveToCache(CACHE_KEYS.BETTING_PROFILE, profileData);
      } else {
        // No profile found, set as not initialized
        dispatch({
          type: BETTING_ACTIONS.SET_INITIALIZED,
          payload: false,
        });
      }
    } catch (error) {
      console.error('Error loading betting profile:', error);
      dispatch({
        type: BETTING_ACTIONS.SET_INITIALIZED,
        payload: false,
      });
    }
  };

  const loadBettingStats = async () => {
    try {
      const response = await apiService.getPerformanceStats();
      
      if (response.success && response.data) {
        const statsData = {
          totalSessions: response.data.total_sessions || 0,
          winningSessions: response.data.winning_sessions || 0,
          losingSessions: response.data.total_sessions - response.data.winning_sessions || 0,
          winRate: parseFloat(response.data.win_rate || 0),
          totalProfit: parseFloat(response.data.total_profit || 0),
          avgSessionResult: parseFloat(response.data.avg_session_result || 0),
          bestSession: parseFloat(response.data.best_session || 0),
          worstSession: parseFloat(response.data.worst_session || 0),
        };

        dispatch({
          type: BETTING_ACTIONS.SET_STATS,
          payload: statsData,
        });

        saveToCache(CACHE_KEYS.BETTING_STATS, statsData);
      }
    } catch (error) {
      console.error('Error loading betting stats:', error);
    }
  };

  // Profile operations - Updated to handle percentage-based stop loss
const saveCompleteProfile = async (profileData) => {
  dispatch({ type: BETTING_ACTIONS.SET_LOADING, payload: true });
  
  try {
    // CORREÇÃO: Garantir que stopLossPercentage seja salvo corretamente
    const finalStopLossPercentage = profileData.stopLossPercentage || 
                                  state.bettingProfile.stopLossPercentage || 
                                  getProfileDetailsByRisk(profileData.riskLevel).recommendedStopLoss;

    // CORREÇÃO: Calcular o stop loss amount CORRETAMENTE
    const stopLossAmount = profileData.initialBalance * (finalStopLossPercentage / 100);

    const requestData = {
      profile: {
        id: profileData.profile.id,
        title: profileData.profile.title,
        description: profileData.profile.description,
        features: profileData.profile.features,
        color: profileData.profile.color,
        icon: { name: profileData.profile.icon?.name || 'dice' },
      },
      riskValue: profileData.riskLevel, // backend lê 'riskValue' (mapeia p/ risk_level)
      initialBalance: profileData.initialBalance,
      bankroll: profileData.bankroll || profileData.initialBalance,
      stopLoss: stopLossAmount, // ✅ Valor absoluto calculado corretamente
      stopLossPercentage: finalStopLossPercentage, // ✅ Porcentagem
      profitTarget: profileData.profitTarget,
    };

    console.log('📊 Dados enviados para API:', requestData);

    const response = await apiService.createBettingProfile(requestData);
    
    if (response.success) {
      const savedProfile = {
        id: response.data.id,
        profileType: response.data.profile_type,
        title: response.data.title,
        description: response.data.description,
        riskLevel: response.data.risk_level,
        initialBalance: parseFloat(response.data.initial_balance),
        stopLoss: parseFloat(response.data.stop_loss),
        stopLossPercentage: parseFloat(response.data.stop_loss_percentage || finalStopLossPercentage),
        profitTarget: parseFloat(response.data.profit_target),
        features: response.data.features || [],
        color: response.data.color,
        iconName: response.data.icon_name,
        isInitialized: true, // ✅ IMPORTANTE: Marcar como inicializado
        createdAt: response.data.created_at,
        updatedAt: response.data.updated_at,
      };

      dispatch({
        type: BETTING_ACTIONS.SET_PROFILE,
        payload: savedProfile,
      });

      saveToCache(CACHE_KEYS.BETTING_PROFILE, savedProfile);
        
        return { success: true, data: savedProfile };
      } else {
        dispatch({
          type: BETTING_ACTIONS.SET_ERROR,
          payload: response.error || 'Failed to save profile',
        });
        return { success: false, error: response.error };
      }
    } catch (error) {
      console.error('Error saving betting profile:', error);
      const errorMessage = error.message || 'Network error';
      dispatch({
        type: BETTING_ACTIONS.SET_ERROR,
        payload: errorMessage,
      });
      return { success: false, error: errorMessage };
    } finally {
      dispatch({ type: BETTING_ACTIONS.SET_LOADING, payload: false });
    }
  };

  const updateBettingProfile = async (updateData) => {
    if (!state.bettingProfile.id) {
      return { success: false, error: 'No profile to update' };
    }

    dispatch({ type: BETTING_ACTIONS.SET_LOADING, payload: true });
    
    try {
      const response = await apiService.updateBettingProfile(state.bettingProfile.id, updateData);
      
      if (response.success) {
        const updatedProfile = {
          ...state.bettingProfile,
          stopLoss: parseFloat(updateData.stopLoss || state.bettingProfile.stopLoss),
          stopLossPercentage: parseFloat(updateData.stopLossPercentage || state.bettingProfile.stopLossPercentage), // New field
          profitTarget: parseFloat(updateData.profitTarget || state.bettingProfile.profitTarget),
          dailyTarget: parseFloat(updateData.dailyTarget || state.bettingProfile.dailyTarget),
          riskLevel: updateData.riskLevel || state.bettingProfile.riskLevel,
          updatedAt: new Date().toISOString(),
        };

        dispatch({
          type: BETTING_ACTIONS.UPDATE_PROFILE,
          payload: updatedProfile,
        });

        saveToCache(CACHE_KEYS.BETTING_PROFILE, updatedProfile);
        
        return { success: true, data: updatedProfile };
      } else {
        dispatch({
          type: BETTING_ACTIONS.SET_ERROR,
          payload: response.error || 'Failed to update profile',
        });
        return { success: false, error: response.error };
      }
    } catch (error) {
      console.error('Error updating betting profile:', error);
      const errorMessage = error.message || 'Network error';
      dispatch({
        type: BETTING_ACTIONS.SET_ERROR,
        payload: errorMessage,
      });
      return { success: false, error: errorMessage };
    } finally {
      dispatch({ type: BETTING_ACTIONS.SET_LOADING, payload: false });
    }
  };

  // Session operations
  const startBettingSession = async (sessionData) => {
    try {
      const response = await apiService.startBettingSession(sessionData);
      
      if (response.success) {
        const newSession = {
          id: response.session_id,
          sessionId: response.session_id,
          startBalance: parseFloat(response.start_balance),
          gameType: sessionData.game_type,
          riskLevel: sessionData.risk_level,
          startedAt: new Date().toISOString(),
          status: 'active',
        };

        dispatch({
          type: BETTING_ACTIONS.ADD_SESSION,
          payload: newSession,
        });
        
        return { success: true, data: newSession };
      } else {
        return { success: false, error: response.error };
      }
    } catch (error) {
      console.error('Error starting betting session:', error);
      return { success: false, error: error.message };
    }
  };

  const endBettingSession = async (sessionId) => {
    try {
      const response = await apiService.endBettingSession(sessionId);
      
      if (response.success) {
        const endedSession = {
          sessionId: response.data.session_id,
          startBalance: parseFloat(response.data.start_balance),
          endBalance: parseFloat(response.data.end_balance),
          netResult: parseFloat(response.data.net_result),
          durationSeconds: response.data.duration_seconds,
          endedAt: new Date().toISOString(),
          status: 'completed',
        };

        dispatch({
          type: BETTING_ACTIONS.UPDATE_SESSION,
          payload: endedSession,
        });

        // Refresh stats after session ends
        await loadBettingStats();
        
        return { success: true, data: endedSession };
      } else {
        return { success: false, error: response.error };
      }
    } catch (error) {
      console.error('Error ending betting session:', error);
      return { success: false, error: error.message };
    }
  };

  // Sync with financial context
  const syncWithFinancialContext = useCallback((financialData) => {
    if (!state.bettingProfile.isInitialized && financialData.initialBankBalance > 0) {
      // Auto-initialize with financial data if no betting profile exists
      const autoProfile = {
        ...state.bettingProfile,
        initialBalance: financialData.initialBankBalance,
        isInitialized: true,
        title: 'Perfil Automático',
        description: 'Criado automaticamente baseado na banca inicial',
        profileType: 'balanced',
      };
      
      dispatch({
        type: BETTING_ACTIONS.SET_PROFILE,
        payload: autoProfile,
      });
    }
  }, [state.bettingProfile]);

  // Risk analysis helpers - Updated for percentage-based calculations
  const getRiskStatus = (currentBalance = 0) => {
    const { stopLossPercentage } = state.bettingProfile;
    
    if (stopLossPercentage <= 0 || currentBalance <= 0) return 'undefined';
    
    const stopLossAmount = currentBalance * (stopLossPercentage / 100);
    const currentLoss = Math.max(0, state.bettingProfile.initialBalance - currentBalance);
    const lossPercentage = (currentLoss / state.bettingProfile.initialBalance) * 100;
    
    if (lossPercentage >= stopLossPercentage) return 'critical';
    if (lossPercentage >= stopLossPercentage * 0.8) return 'high';
    if (lossPercentage >= stopLossPercentage * 0.5) return 'medium';
    return 'low';
  };

  const getProfileRecommendations = () => {
    const { riskLevel } = state.bettingProfile;
    
    if (riskLevel <= 3) {
      return {
        type: 'conservative',
        stopLossPercentage: 10,
        profitTargetPercentage: 25,
        maxBetPercentage: 2,
      };
    } else if (riskLevel <= 6) {
      return {
        type: 'moderate',
        stopLossPercentage: 20,
        profitTargetPercentage: 50,
        maxBetPercentage: 5,
      };
    } else {
      return {
        type: 'aggressive',
        stopLossPercentage: 30,
        profitTargetPercentage: 100,
        maxBetPercentage: 10,
      };
    }
  };
  
  // Helper function to get profile details by risk level
  const getProfileDetailsByRisk = (riskLevel) => {
    if (riskLevel <= 3) return PROFILES.cautious;
    if (riskLevel <= 6) return PROFILES.balanced;
    return PROFILES.highrisk;
  };

  // New helper functions for percentage calculations
const calculateStopLossAmount = (initialBalance, stopLossPercentage) => {
  if (!initialBalance || !stopLossPercentage) return 0;
  // CORREÇÃO: O stop loss amount é o VALOR MÁXIMO que se pode perder
  return initialBalance * (stopLossPercentage / 100);
};

  const calculateCurrentLossPercentage = (initialBalance, currentBalance) => {
    if (initialBalance <= 0) return 0;
    const loss = Math.max(0, initialBalance - currentBalance);
    return (loss / initialBalance) * 100;
  };

const isStopLossTriggered = (initialBalance, currentBalance, stopLossPercentage) => {
  if (!initialBalance || !stopLossPercentage) return false;
  
  const currentLoss = initialBalance - currentBalance;
  const maxAllowedLoss = initialBalance * (stopLossPercentage / 100);
  
  return currentLoss >= maxAllowedLoss;
};
  const clearError = () => {
    dispatch({ type: BETTING_ACTIONS.CLEAR_ERROR });
  };

  const value = {
    // State
    bettingProfile: state.bettingProfile,
    bettingSessions: state.bettingSessions,
    bettingStats: state.bettingStats,
    isLoading: state.isLoading,
    error: state.error,
    lastUpdated: state.lastUpdated,
    
    // Actions
    saveCompleteProfile,
    updateBettingProfile,
    startBettingSession,
    endBettingSession,
    loadBettingProfile,
    loadBettingStats,
    syncWithFinancialContext,
    clearError,
    
    // Helper functions
    getRiskStatus,
    getProfileRecommendations,
    getProfileDetailsByRisk,
    
    // New percentage-based helper functions
    calculateStopLossAmount,
    calculateCurrentLossPercentage,
    isStopLossTriggered,
  };

  return (
    <BettingContext.Provider value={value}>
      {children}
    </BettingContext.Provider>
  );
};

export const useBetting = () => {
  const context = useContext(BettingContext);
  if (!context) {
    throw new Error('useBetting must be used within a BettingProvider');
  }
  return context;
};

export default BettingContext;