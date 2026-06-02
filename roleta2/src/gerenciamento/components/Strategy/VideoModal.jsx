import React from 'react';
import './VideoModal.css'; // Vamos criar este CSS a seguir

function VideoModal({ videoId, onClose }) {
  // Se não há videoId, não renderiza nada
  if (!videoId) return null;

  // URL de embed do YouTube com autoplay e sem vídeos relacionados
  const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;

  return (
    // O overlay escuro que fecha ao clicar
    <div className="video-modal-overlay" onClick={onClose}>
      {/* O container do vídeo, que impede o fechamento ao clicar nele */}
      <div className="video-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="video-modal-close" onClick={onClose}>&times;</button>
        <div className="video-player-container">
          <iframe
            src={embedUrl}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="Embedded Youtube Video"
          />
        </div>
      </div>
    </div>
  );
}

export default VideoModal;