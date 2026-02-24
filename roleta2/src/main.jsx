import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { NotificationProvider } from './contexts/NotificationContext';
import VideoExplicativo from './VideoExplicativo';
import VideoExplicativo2 from './VideoExplicativo2';

const params = new URLSearchParams(window.location.search);
const videoParam = params.get('video'); // Captura o valor uma vez

const root = ReactDOM.createRoot(document.getElementById('root'));

if (videoParam === 'explicativo') {
  // Rota leve 1
  root.render(
    <React.StrictMode>
      <VideoExplicativo />
    </React.StrictMode>
  );
} else if (videoParam === 'explicativo2') {
  // Rota leve 2
  root.render(
    <React.StrictMode>
      <VideoExplicativo2 />
    </React.StrictMode>
  );
} else {
  // App Principal (Padrão)
  root.render(
    <React.StrictMode>
      <NotificationProvider> 
        <App />
      </NotificationProvider>
    </React.StrictMode>
  );
}