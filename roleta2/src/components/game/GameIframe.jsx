// src/components/game/GameIframe.jsx
import React, { useRef, useState, useCallback } from 'react';

const GameIframe = React.memo(({ url, onError }) => {
  const wrapperRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const handleLoad = useCallback(() => {
    setIsLoaded(true);
    if (wrapperRef.current) {
      requestAnimationFrame(() => {
        wrapperRef.current.style.opacity = '0.99';
        requestAnimationFrame(() => {
          wrapperRef.current.style.opacity = '1';
        });
      });
    }
  }, []);

  return (
    <div ref={wrapperRef} className={`game-iframe-wrapper ${isLoaded ? 'loaded' : ''}`}>
      <iframe
        src={url}
        title="Jogo de Roleta"
        className="game-iframe"
        allowFullScreen
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        loading="lazy"
        onLoad={handleLoad}
        onError={onError}
      />
    </div>
  );
});

GameIframe.displayName = 'GameIframe';

export default GameIframe;