import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { NotificationProvider } from './contexts/NotificationContext';

// ── Domain Lock — impede uso em domínios não autorizados ──
const _ALLOWED_HOSTS = ['.smartanalise.com.br', 'localhost', '127.0.0.1', '.onrender.com'];
const _h = window.location.hostname;
if (!_ALLOWED_HOSTS.some(d => _h === d.replace(/^\./, '') || _h.endsWith(d))) {
  document.documentElement.innerHTML = '';
  throw new Error('');
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <NotificationProvider>
      <App />
    </NotificationProvider>
  </React.StrictMode>,
);
