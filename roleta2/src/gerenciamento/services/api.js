/**
 * Cliente HTTP do gerenciamento, adaptado para rodar dentro do roleta3.
 *
 * - baseURL: '/api/gerenciamento' (proxy roleta3 -> gerenciamento_backend)
 * - Token: lê 'authToken' do localStorage (mesma chave do useAuth do roleta3)
 * - Sem endpoints de auth (login/register/logout) — esses são do roleta3
 */

import axios from 'axios';

// Base ABSOLUTA via VITE_API_URL (domínio do backend, ex.: tool-api.smartanalise.com.br):
// o nginx do frontend NÃO proxia /api, então caminho relativo cai no SPA fallback
// (GET → index.html, POST/PUT → 405). Em dev, deixe VITE_API_URL vazio para usar o
// proxy do Vite (relativo).
const API_BASE_URL = (import.meta.env.VITE_API_URL || '') + '/api/gerenciamento';

// Data local (YYYY-MM-DD). NÃO usar toISOString(): ele converte pra UTC e,
// à noite no Brasil (UTC-3), "hoje" vira amanhã → o valor ia 1 dia pra frente.
const todayLocalYMD = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

const TRANSACTION_TYPES = {
  DEPOSIT: 'deposit',
  WITHDRAW: 'withdraw',
  GAINS: 'gains',
  LOSSES: 'losses',
};

const VALID_TRANSACTION_TYPES = Object.values(TRANSACTION_TYPES);

const tokenManager = {
  getToken() {
    try { return localStorage.getItem('authToken'); }
    catch { return null; }
  },
  getEmail() {
    try { return localStorage.getItem('userEmail'); }
    catch { return null; }
  },
};

api.interceptors.request.use(
  (config) => {
    const token = tokenManager.getToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    // O JWT do api.appbackend.tech é opaco — não tem claim email/sub.
    // O gateway usa este header pra lookup em subscriptions.
    const email = tokenManager.getEmail();
    if (email) config.headers['X-User-Email'] = email;
    return config;
  },
  (error) => Promise.reject(error),
);

api.interceptors.response.use(
  (response) => response.data || response,
  (error) => {
    const message =
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      'Network error';
    return Promise.reject(new Error(message));
  },
);

const apiService = {
  TRANSACTION_TYPES,

  // Token: leitura apenas (set/clear são do roleta3 useAuth)
  getAuthToken: tokenManager.getToken,

  // Profile
  async getUserProfile() {
    try { return await api.get('/user/profile'); }
    catch (error) { return { success: false, error: error.message }; }
  },
  async updateUserProfile(profileData) {
    try {
      const config = profileData instanceof FormData
        ? { headers: { 'Content-Type': 'multipart/form-data' } }
        : {};
      return await api.put('/user/profile', profileData, config);
    } catch (error) { return { success: false, error: error.message }; }
  },

  // Dashboard
  async getDashboardOverview() {
    try { return await api.get('/dashboard/overview'); }
    catch (error) { return { success: false, error: error.message }; }
  },

  // Betting profile
  getBettingProfile: () => api.get('/betting-profiles'),
  createBettingProfile: (data) => api.post('/betting-profiles', data),
  updateBettingProfile: (profileId, data) => api.put(`/betting-profiles/${profileId}`, data),

  // Balance & transactions (keyset pagination: pass {cursor, limit})
  getBalance: () => api.get('/balance'),
  getTransactions: (params = {}) => api.get('/transactions', { params }),

  async getInitialBankTransactions() {
    try {
      const all = await api.get('/transactions', { params: { limit: 200 } });
      const data = (all?.data || []).filter(tx => tx.is_initial_bank);
      return { ...all, data };
    } catch (error) { return { success: false, error: error.message }; }
  },

  async getInitialBankTransaction() {
    try {
      const r = await this.getInitialBankTransactions();
      if (r?.success && r.data?.length) return r.data[0];
      return null;
    } catch { return null; }
  },

  async updateInitialBank(amount) {
    try {
      const numeric = typeof amount === 'string'
        ? parseFloat(amount.replace(',', '.'))
        : amount;
      if (isNaN(numeric) || numeric <= 0) {
        return { success: false, error: 'Valor inválido.' };
      }
      const existing = await this.getInitialBankTransaction();
      if (existing) {
        const response = await api.put(`/transactions/${existing.id}`, {
          amount: numeric,
          description: existing.description || 'Banca Inicial',
          date: existing.date,
          type: TRANSACTION_TYPES.DEPOSIT,
          is_initial_bank: true,
        });
        return { success: true, data: response.data };
      }
      return await this.createTransaction({
        amount: numeric,
        type: TRANSACTION_TYPES.DEPOSIT,
        description: 'Banca Inicial',
        date: todayLocalYMD(),
        isInitialBank: true,
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async createTransaction(data) {
    try {
      if (!data.type || !VALID_TRANSACTION_TYPES.includes(data.type)) {
        return {
          success: false,
          error: `Tipo inválido (válidos: ${VALID_TRANSACTION_TYPES.join(', ')})`,
        };
      }
      if (!data.amount || data.amount <= 0) {
        return { success: false, error: 'Valor deve ser > 0' };
      }
      if (!data.date) {
        return { success: false, error: 'Data é obrigatória' };
      }
      return await api.post('/transactions', {
        type: data.type,
        amount: data.amount,
        date: data.date,
        description: data.description || this.getDefaultDescription(data.type),
        category: data.category || this.getDefaultCategory(data.type),
        // O backend lê `isInitialBank` (camelCase). Enviamos também a versão
        // snake_case por robustez.
        isInitialBank: data.isInitialBank || false,
        is_initial_bank: data.isInitialBank || false,
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  getDefaultDescription(type) {
    return {
      deposit: 'Depósito na banca',
      withdraw: 'Saque da banca',
      gains: 'Ganhos em operações',
      losses: 'Perdas em operações',
    }[type] || 'Transação';
  },

  getDefaultCategory(type) {
    return {
      deposit: 'Depósito',
      withdraw: 'Saque',
      gains: 'Ganhos',
      losses: 'Perdas',
    }[type] || 'Geral';
  },

  updateTransaction: (id, data) => api.put(`/transactions/${id}`, data),
  deleteTransaction: (id) => api.delete(`/transactions/${id}`),

  // Objectives
  getObjectives: () => api.get('/objectives'),
  createObjective: (data) => api.post('/objectives', data),
  updateObjective: (id, data) => api.put(`/objectives/${id}`, data),
  deleteObjective: (id) => api.delete(`/objectives/${id}`),

  // Analytics
  getAnalyticsOverview: () => api.get('/analytics/overview'),
  getMonthlyAnalytics: (months = 6) => api.get('/analytics/monthly', { params: { months } }),
  getPerformanceStats: (period = 'monthly') => api.get('/stats/performance', { params: { period } }),
  getRiskAnalysis: () => api.get('/stats/risk-analysis'),

  // Sessions
  startBettingSession: (data) => api.post('/betting-sessions', data),
  endBettingSession: (id) => api.post(`/betting-sessions/${id}/end`),

  // Misc
  getCategories: () => api.get('/categories'),
  getGameTypes: () => api.get('/game-types'),

  async getBankResetStatus() {
    try { return await api.get('/user/bank-reset-status'); }
    catch (error) { return { success: false, error: error.message }; }
  },
  async forceResetBank() {
    try { return await api.post('/users/reset-bank'); }
    catch (error) { return { success: false, error: error.message }; }
  },
  async resetAll() {
    try { return await api.post('/users/reset-all'); }
    catch (error) { return { success: false, error: error.message }; }
  },
  async hasResetPending() {
    try {
      const status = await this.getBankResetStatus();
      return status.success && status.reset_due === true;
    } catch { return false; }
  },

  healthCheck: () => api.get('/health'),

  // Utilities
  formatCurrency(amount) {
    const n = typeof amount === 'string' ? parseFloat(amount.replace(',', '.')) : amount;
    if (isNaN(n)) return '';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
  },

  parseCurrencyInput(input) {
    if (!input) return 0;
    const cleaned = input.toString().replace(/[^\d.,]/g, '').replace(',', '.');
    return parseFloat(cleaned) || 0;
  },

  isOperationalTransaction: (t) => t === TRANSACTION_TYPES.GAINS || t === TRANSACTION_TYPES.LOSSES,
  isCashFlowTransaction: (t) => t === TRANSACTION_TYPES.DEPOSIT || t === TRANSACTION_TYPES.WITHDRAW,

  calculateRealProfit(transactions) {
    const sum = (type) => transactions
      .filter(tx => tx.type === type)
      .reduce((acc, tx) => acc + parseFloat(tx.amount || 0), 0);
    return sum(TRANSACTION_TYPES.GAINS) - sum(TRANSACTION_TYPES.LOSSES);
  },
};

export default apiService;
