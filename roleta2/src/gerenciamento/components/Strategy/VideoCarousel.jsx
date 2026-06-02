import React from 'react';
import VideoCard from './VideoCard';
// Opcional: Se 'VideoCarousel.css' existir, mantenha a importação
// import './VideoCarousel.css'; 

function VideoCarousel({ 
  title, 
  videos, 
  showProgress = false, 
  onVideoClick, // Esta é a função handleOpenModal do StrategyScreen
  onAddToList,
  onRemoveFromList,
  minhaLista
}) {
  return (
    <div className="video-carousel">
      {title && <h2 className="carousel-title">{title}</h2>}

      <div className="video-thumbnails">
        {videos.map((video) => (
          <VideoCard
            key={video.id}
            video={video} // Passa o objeto 'video' inteiro
            progress={showProgress ? video.progress : undefined}
            
            // ===== A CORREÇÃO ESTÁ AQUI =====
            // Passamos a função 'onVideoClick' para a prop 'onCardClick'
            // que o novo VideoCard espera.
            onCardClick={onVideoClick} 
            // ================================
            
            // Passa as props de gerenciamento da lista
            onAddToList={onAddToList}
            onRemoveFromList={onRemoveFromList}
            minhaLista={minhaLista}
          />
        ))}
      </div>
    </div>
  );
}

export default VideoCarousel;