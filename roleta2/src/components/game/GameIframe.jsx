// src/components/game/GameIframe.jsx
// ════════════════════════════════════════════════
// 🔧 CORREÇÕES:
//   1. Detecta erro de carregamento com timeout (antes dependia só do onError nativo)
//   2. Mostra botão de "Tentar Novamente" dentro do wrapper (sem overlay fullscreen)
//   3. Monitora se o iframe carregou dentro de 30s, senão assume erro
//   4. Botão de retry chama onRetry() (que vem do useGameLauncher) em vez de reload da página
// ════════════════════════════════════════════════

import React, { useRef, useState, useCallback, useEffect } from 'react';

const LOAD_TIMEOUT_MS = 30000; // 30s para carregar

const GameIframe = React.memo(({ url, onError, onRetry }) => {
  const wrapperRef = useRef(null);
  const timeoutRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Reset quando URL muda
  useEffect(() => {
    setIsLoaded(false);
    setHasError(false);

    // 🔧 FIX: Timeout de carregamento — se não carregar em 30s, mostra erro
    if (url) {
      timeoutRef.current = setTimeout(() => {
        if (!isLoaded) {
          console.warn('[GameIframe] Timeout de carregamento (30s)');
          setHasError(true);
          onError?.();
        }
      }, LOAD_TIMEOUT_MS);
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLoad = useCallback(() => {
    setIsLoaded(true);
    setHasError(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    if (wrapperRef.current) {
      requestAnimationFrame(() => {
        wrapperRef.current.style.opacity = '0.99';
        requestAnimationFrame(() => {
          wrapperRef.current.style.opacity = '1';
        });
      });
    }
  }, []);

  const handleError = useCallback(() => {
    setHasError(true);
    setIsLoaded(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    onError?.();
  }, [onError]);

  const handleRetryClick = useCallback(() => {
    setHasError(false);
    setIsLoaded(false);
    if (onRetry) {
      onRetry(); // 🔧 FIX: Chama retry do hook em vez de window.location.reload()
    }
  }, [onRetry]);

  return (
    <div ref={wrapperRef} className={`game-iframe-wrapper ${isLoaded ? 'loaded' : ''}`}>
      {/* 🔧 FIX: Error overlay DENTRO do wrapper (não fullscreen) */}
      {hasError && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.85)',
          borderRadius: '0.75rem',
          zIndex: 10,
          gap: '1rem',
        }}>
          <p style={{ color: '#ef4444', fontSize: '1rem', margin: 0 }}>
            ⚠️ Erro ao carregar o jogo
          </p>
          <button
            onClick={handleRetryClick}
            style={{
              background: '#eab308',
              color: '#111827',
              padding: '0.6rem 1.5rem',
              borderRadius: '0.5rem',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '0.875rem',
            }}
          >
            🔄 Tentar Novamente
          </button>
        </div>
      )}

      {/* Loading indicator */}
      {!isLoaded && !hasError && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#000',
          zIndex: 5,
        }}>
          <div className="spinner" style={{ width: 32, height: 32 }} />
        </div>
      )}

      <iframe
        src={url}
        title="Jogo de Roleta"
        className="game-iframe"
        allowFullScreen
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        loading="lazy"
        onLoad={handleLoad}
        onError={handleError}
      />
    </div>
  );
});

GameIframe.displayName = 'GameIframe';

export default GameIframe;