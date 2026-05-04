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

// Força viewport mobile real dentro do iframe — APENAS em telas mobile (<=1024px).
// Em desktop o iframe volta ao 100%×100% do wrapper (layout padrão).
// Em mobile o jogo internamente verá `window.innerWidth = 414` (iPhone Plus/Pro Max)
// e renderiza o layout mobile de verdade.
const MOBILE_VIEWPORT_W = 414;
const MOBILE_VIEWPORT_H = 736;
const MAX_SCALE = 0.95; // ~393×699 (mobile compacto, leve folga lateral)
const MOBILE_BREAKPOINT = 1024;

const GameIframe = React.memo(({ url, onError, onRetry }) => {
  const wrapperRef = useRef(null);
  const timeoutRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasTimedOut, setHasTimedOut] = useState(false);
  const [scale, setScale] = useState(1);
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= MOBILE_BREAKPOINT : false,
  );

  // Detecta mobile via viewport width
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Mede a largura do wrapper e calcula o scale (só relevante em mobile)
  useEffect(() => {
    if (!wrapperRef.current || !isMobile) return;
    const compute = (w) => {
      if (w > 0) setScale(Math.min(w / MOBILE_VIEWPORT_W, MAX_SCALE));
    };
    const ro = new ResizeObserver(entries => {
      compute(entries[0].contentRect.width);
    });
    ro.observe(wrapperRef.current);
    compute(wrapperRef.current.clientWidth);
    return () => ro.disconnect();
  }, [isMobile]);

  const scaledHeight = MOBILE_VIEWPORT_H * scale;
  const scaledWidth = MOBILE_VIEWPORT_W * scale;

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
      style={
        isMobile
          ? {
              position: 'relative',
              // Em mobile sobrescreve o padding-bottom (16:9) pelo aspecto mobile escalado
              paddingBottom: 0,
              height: scaledHeight > 0 ? `${scaledHeight}px` : undefined,
            }
          : { position: 'relative' }
      }
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

      {/* Iframe — em mobile força viewport 414×736 com scale CSS pro layout mobile real
          do jogo ativar. Em desktop volta ao 100%×100% padrão. */}
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
          style={
            isMobile
              ? {
                  position: 'absolute',
                  top: 0,
                  left: `calc(50% - ${scaledWidth / 2}px)`,
                  width: `${MOBILE_VIEWPORT_W}px`,
                  height: `${MOBILE_VIEWPORT_H}px`,
                  border: 'none',
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                }
              : {
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  border: 'none',
                }
          }
        />
      )}
    </div>
  );
});

GameIframe.displayName = 'GameIframe';

export default GameIframe;