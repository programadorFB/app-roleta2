import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { NotificationProvider } from './contexts/NotificationContext';
import VideoExplicativo from './VideoExplicativo';
import VideoExplicativo2 from './VideoExplicativo2';

// 1. Captura os parâmetros da URL
const params = new URLSearchParams(window.location.search);
const mostrarVideo = params.get('video') === 'explicativo';
const mostrarVideo2 = params.get('video') === 'explicativo2';

// 2. Cria a raiz do React
const root = ReactDOM.createRoot(document.getElementById('root'));

// 3. Decide o que renderizar
if (mostrarVideo) {
  // SEPARADO: Renderiza APENAS o vídeo (sem App, sem Auth, sem Contextos pesados)
  root.render(
    <React.StrictMode>
      <VideoExplicativo />
    </React.StrictMode>
  );
  
}
if (mostrarVideo2) {
  // SEPARADO: Renderiza APENAS o vídeo (sem App, sem Auth, sem Contextos pesados)
  root.render(
    <React.StrictMode>
      <VideoExplicativo2 />
    </React.StrictMode>
  );
  
}
 else {
  // PRINCIPAL: Renderiza o App normal com tudo
  root.render(
    <React.StrictMode>
      <NotificationProvider> 
        <App />
      </NotificationProvider>
    </React.StrictMode>
  );
}