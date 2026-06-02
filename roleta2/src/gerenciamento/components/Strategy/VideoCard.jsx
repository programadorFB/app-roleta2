import React from 'react';
import './VideoCard.css';

function VideoCard({ 
  video, 
  progress, 
  onCardClick,
  onAddToList,
  onRemoveFromList,
  minhaLista 
}) {
  
  const thumbnailUrl = `https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`;
  const isAdded = minhaLista.some(v => v.id === video.id);

  const handleActionClick = (e) => {
    e.stopPropagation();
    if (isAdded) {
      onRemoveFromList(video);
    } else {
      onAddToList(video);
    }
  };

  const handleCardClick = () => {
    onCardClick(video.videoId);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCardClick();
    }
  };

  return (
    <div 
      className="video-card" 
      onClick={handleCardClick}
      onKeyPress={handleKeyPress}
      role="button"
      tabIndex={0}
      aria-label={`Assistir ${video.title}`}
    >
      <img 
        src={thumbnailUrl} 
        alt={`Thumbnail de ${video.title}`}
        loading="lazy"
      />
      
      {progress !== undefined && progress > 0 && (
        <div className="video-progress" aria-label={`Progresso: ${progress}%`}>
          <div 
            className="video-progress-bar" 
            style={{ width: `${progress}%` }}
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      )}
      
      <div className="video-info">
        <h3>{video.title}</h3>
        
        <button 
          className={`video-action-btn ${isAdded ? 'added' : ''}`}
          onClick={handleActionClick}
          aria-label={isAdded ? 'Remover da minha lista' : 'Adicionar à minha lista'}
          title={isAdded ? 'Remover da lista' : 'Adicionar à lista'}
        >
          {isAdded ? '✓' : '+'}
        </button>
      </div>
    </div>
  );
}

export default VideoCard;