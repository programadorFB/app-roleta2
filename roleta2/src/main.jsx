import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
const AdminApp = React.lazy(() => import('./admin/AdminApp.jsx'));
import { NotificationProvider } from './contexts/NotificationContext';

// ── Domain Lock — impede uso em domínios não autorizados ──
const _ALLOWED_HOSTS = ['.smartanalise.com.br', 'localhost', '127.0.0.1', '.onrender.com'];
const _h = window.location.hostname;
if (!_ALLOWED_HOSTS.some(d => _h === d.replace(/^\./, '') || _h.endsWith(d))) {
  document.documentElement.innerHTML = '';
  throw new Error('');
}

// /admin e um app a parte: tem login proprio e nao passa por assinatura,
// paywall nem token do provedor externo. O try_files do nginx entrega o mesmo
// index.html nesse caminho, entao a escolha acontece aqui.
//
// Carregado sob demanda: o painel e ferramenta interna, nao pode custar bytes
// no bundle de quem so quer usar o app.
const ehAdmin = window.location.pathname.replace(/[/]+$/, '') === '/admin';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {ehAdmin ? (
      <React.Suspense fallback={null}>
        <AdminApp />
      </React.Suspense>
    ) : (
      <NotificationProvider>
        <App />
      </NotificationProvider>
    )}
  </React.StrictMode>,
);
