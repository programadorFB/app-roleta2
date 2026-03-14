/**
 * components/GameIframe.jsx — Componente de Iframe do Jogo
 *
 * 🔧 FIX: Reescrito para política completa de falha
 * - Timeout de carregamento (30s) — se não carregar, assume erro
 * - Overlay de erro DENTRO do wrapper do iframe (NÃO fullscreen)
 * - Botão "Tentar Novamente" chama onRetry (prop do hook)
 * - Loading indicator enquanto carrega
 * - Reset de estado quando URL muda
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';

// 🔧 FIX: Timeout de carregamento do iframe (30 segundos)
const IFRAME_LOAD_TIMEOUT = 30000;

const GameIframe = React.memo(({ url, onError, onRetry }) => {
  const wrapperRef = useRef(null);
  const timeoutRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasTimedOut, setHasTimedOut] = useState(false);

  // 🔧 FIX: Reset de estado quando URL muda
  useEffect(() => {
    setIsLoaded(false);
    setHasTimedOut(false);

    // 🔧 FIX: Inicia timeout de 30s para detectar iframe que não carrega
    if (url) {
      timeoutRef.current = setTimeout(() => {
        if (!isLoaded) {
          console.warn('⏱️ [GameIframe] Timeout de 30s — iframe não carregou');
          setHasTimedOut(true);
          if (onError) onError();
        }
      }, IFRAME_LOAD_TIMEOUT);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  // 🔧 FIX: Quando carrega com sucesso, cancela timeout
  const handleLoad = useCallback(() => {
    setIsLoaded(true);
    setHasTimedOut(false);

    // Cancela timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Force repaint fix
    if (wrapperRef.current) {
      requestAnimationFrame(() => {
        if (wrapperRef.current) {
          wrapperRef.current.style.opacity = '0.99';
          requestAnimationFrame(() => {
            if (wrapperRef.current) {
              wrapperRef.current.style.opacity = '1';
            }
          });
        }
      });
    }
  }, []);

  // 🔧 FIX: Erro nativo do iframe
  const handleError = useCallback(() => {
    setIsLoaded(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (onError) onError();
  }, [onError]);

  // 🔧 FIX: Handler de retry DENTRO do iframe container
  const handleRetryClick = useCallback(() => {
    setHasTimedOut(false);
    setIsLoaded(false);
    if (onRetry) onRetry();
  }, [onRetry]);

  return (
    <div
      ref={wrapperRef}
      className={`game-iframe-wrapper ${isLoaded ? 'loaded' : ''}`}
      style={{ position: 'relative' }}
    >
      {/* 🔧 FIX: Loading indicator enquanto carrega */}
      {!isLoaded && !hasTimedOut && url && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.85)',
          borderRadius: '0.75rem',
          zIndex: 5,
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '3px solid rgba(255,255,255,0.2)',
            borderTopColor: '#eab308',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
          <p style={{ color: '#9ca3af', marginTop: '12px', fontSize: '0.875rem' }}>
            Carregando jogo...
          </p>
        </div>
      )}

      {/* 🔧 FIX: Overlay de erro DENTRO do wrapper (NÃO fullscreen) */}
      {hasTimedOut && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.9)',
          borderRadius: '0.75rem',
          zIndex: 10,
        }}>
          <p style={{ color: '#f87171', fontSize: '1rem', marginBottom: '12px', textAlign: 'center', padding: '0 1rem' }}>
            ⚠️ O jogo não carregou a tempo.
          </p>
          {onRetry && (
            <button
              onClick={handleRetryClick}
              style={{
                background: '#eab308',
                color: '#111827',
                padding: '0.625rem 1.25rem',
                borderRadius: '0.5rem',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '0.875rem',
              }}
            >
              🔄 Tentar Novamente
            </button>
          )}
        </div>
      )}

      {/* Iframe */}
      {url && (
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
      )}
    </div>
  );
});

GameIframe.displayName = 'GameIframe';

export default GameIframe;