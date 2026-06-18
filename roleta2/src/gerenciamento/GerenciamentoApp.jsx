/**
 * Entrypoint da aba Gerenciamento dentro do roleta3.
 *
 * - Usa MemoryRouter para que a navegação interna (SideMenu, BottomMenu)
 *   não afete a URL do roleta3.
 * - Recebe userInfo, jwtToken e onLogout do roleta3 via props e os
 *   propaga para o AuthProvider local.
 * - Não inclui rota de /login — a auth vem de fora.
 */

import React, { useEffect } from 'react';
import { MemoryRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';

import { AuthProvider } from './contexts/AuthContext.jsx';
import { SideMenuProvider } from './contexts/SideMenuContext.jsx';
import { FinancialProvider } from './contexts/FinancialContext.jsx';
import { BettingProvider } from './contexts/BettingContext.jsx';

import SideMenu from './components/SideMenu.jsx';
import BottomMenu from './components/BottomMenu.jsx';
import DashboardScreen from './pages/Dashboard/DashboardScreen.jsx';
import ChartsScreen from './pages/ChartScreen/ChartsScreen.jsx';
import TransactionScreen from './pages/TransactionHistory/TransactionScreen.jsx';
import TransactionHistoryScreen from './pages/TransactionHistory/TransactionHistoryScreen.jsx';
import ReportScreen from './pages/ReportScreen/ReportScreen.jsx';
import ObjectivesScreen from './pages/Objectives/ObjectiveScreen.jsx';
import InvestmentProfile from './pages/InvestmentProfile/InvestmentProfile.jsx';
import ProfileScreen from './pages/Profile/profileScreen.jsx';
import StrategyScreen from './pages/VideoStrategy/StrategyScreen.jsx';
import CalendarScreen from './components/CalendarScreen.jsx';
import TutorialScreen from './pages/Tutorial/TutorialScreen.jsx';

import './styles/identity.css';


const ROUTE_KEY = 'gerenciamento.route';

const getSavedRoute = () => {
  try { return localStorage.getItem(ROUTE_KEY) || '/dashboard'; }
  catch { return '/dashboard'; }
};

/**
 * Histórico inicial do MemoryRouter. Se a rota salva for uma página interna,
 * semeamos ['/dashboard', rotaSalva] para que `navigate(-1)` (botão Voltar)
 * sempre tenha pra onde voltar — senão o back quebra ao reabrir numa subpágina.
 */
const getInitialEntries = () => {
  const saved = getSavedRoute();
  return saved === '/dashboard' ? ['/dashboard'] : ['/dashboard', saved];
};

/**
 * Observa a rota interna (MemoryRouter) e persiste em localStorage, para que
 * um F5 reabra o gerenciamento na MESMA página em vez de cair no /dashboard.
 */
const RoutePersistor = () => {
  const location = useLocation();
  useEffect(() => {
    try { localStorage.setItem(ROUTE_KEY, location.pathname); } catch { /* ignore */ }
  }, [location.pathname]);
  return null;
};

const Layout = () => (
  <div style={{ display: 'flex', minHeight: '100%', position: 'relative' }}>
    <SideMenu />
    <main
      style={{
        flex: 1,
        background: 'transparent',
        overflowY: 'auto',
        paddingBottom: '80px',
        minHeight: '100%',
      }}
    >
      <Outlet />
    </main>
    <BottomMenu />
  </div>
);


export default function GerenciamentoApp({ userInfo, jwtToken, onLogout }) {
  return (
    <div className="gerenciamento-root">
    <AuthProvider userInfo={userInfo} jwtToken={jwtToken} onLogout={onLogout}>
      <FinancialProvider>
        <SideMenuProvider>
          <BettingProvider>
            <MemoryRouter initialEntries={getInitialEntries()} initialIndex={getInitialEntries().length - 1}>
              <RoutePersistor />
              <Routes>
                <Route element={<Layout />}>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<DashboardScreen />} />
                  <Route path="/charts" element={<ChartsScreen />} />
                  <Route path="/transaction" element={<TransactionScreen />} />
                  <Route path="/report" element={<ReportScreen />} />
                  <Route path="/objectives" element={<ObjectivesScreen />} />
                  <Route path="/investment-profile" element={<InvestmentProfile />} />
                  <Route path="/profile" element={<ProfileScreen />} />
                  <Route path="/history" element={<TransactionHistoryScreen />} />
                  <Route path="/strategy" element={<StrategyScreen />} />
                  <Route path="/calendar" element={<CalendarScreen />} />
                  <Route path="/tutorial" element={<TutorialScreen />} />
                </Route>
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </MemoryRouter>
          </BettingProvider>
        </SideMenuProvider>
      </FinancialProvider>
    </AuthProvider>
    </div>
  );
}
