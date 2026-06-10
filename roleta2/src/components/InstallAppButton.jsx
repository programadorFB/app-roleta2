import { useState, useEffect, useCallback } from 'react';
import { Smartphone, Share, Plus, MoreVertical, X } from 'lucide-react';
import './InstallAppButton.css';

// Já está rodando como app instalado (aberto pela tela inicial / Dock)?
function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true // iOS Safari
  );
}

// Descobre qual instrução manual mostrar quando NÃO há prompt nativo.
// 'ios'      -> iPhone/iPad (Safari): Adicionar à Tela de Início
// 'macSafari'-> MacBook no Safari: Adicionar ao Dock (macOS Sonoma+)
// 'generic'  -> demais navegadores sem prompt (Firefox, etc.): menu do navegador
function getPlatformKind() {
  const ua = window.navigator.userAgent || '';
  const iOSDevice = /iphone|ipad|ipod/i.test(ua);
  // iPadOS recente se reporta como Mac, então checamos touch
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  if (iOSDevice || iPadOS) return 'ios';

  const isMac = /Macintosh|Mac OS X/i.test(ua);
  // navigator.vendor é "Apple Computer, Inc." só no Safari (Chrome=Google, Firefox=vazio)
  const isSafari = navigator.vendor === 'Apple Computer, Inc.';
  if (isMac && isSafari) return 'macSafari';

  return 'generic';
}

/**
 * Botão "Criar Atalho" — transforma o site em app (PWA).
 *
 * - Chrome/Edge/Android/Desktop: usa o prompt nativo (beforeinstallprompt) quando
 *   disponível -> instalação automática (1 clique + confirmação do sistema).
 * - Safari (iOS e macOS) e demais sem prompt: o navegador não expõe API de
 *   instalação, então abrimos um modal com o passo a passo certo pra cada caso.
 *   Assim o botão SEMPRE faz algo útil, em qualquer navegador.
 * - Já instalado (standalone): não renderiza nada.
 */
export default function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] = useState(window.__pwaInstallPrompt || null);
  const [installed, setInstalled] = useState(isStandalone());
  const [showHelp, setShowHelp] = useState(false);
  const kind = getPlatformKind();

  useEffect(() => {
    const onInstallable = () => setDeferredPrompt(window.__pwaInstallPrompt);
    const onInstalled = () => { setInstalled(true); setDeferredPrompt(null); };
    window.addEventListener('pwa:installable', onInstallable);
    window.addEventListener('pwa:installed', onInstalled);
    return () => {
      window.removeEventListener('pwa:installable', onInstallable);
      window.removeEventListener('pwa:installed', onInstalled);
    };
  }, []);

  const handleClick = useCallback(async () => {
    const prompt = deferredPrompt || window.__pwaInstallPrompt;
    // Tem prompt nativo (Chromium desktop/Android) -> instala automático.
    // Senão (Safari iOS/macOS, Firefox, etc.) -> instruções manuais.
    if (!prompt) {
      setShowHelp(true);
      return;
    }
    prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice && choice.outcome === 'accepted') setInstalled(true);
    window.__pwaInstallPrompt = null;
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  if (installed) return null;

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="install-app-btn"
        title="Criar atalho / instalar como app"
      >
        <Smartphone size={14} />
        <span className="install-app-btn-text">CRIAR ATALHO</span>
      </button>

      {showHelp && (
        <div className="install-help-overlay" onClick={() => setShowHelp(false)}>
          <div className="install-help-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="install-help-close"
              onClick={() => setShowHelp(false)}
              aria-label="Fechar"
            >
              <X size={18} />
            </button>

            <div className="install-help-icon"><Smartphone size={30} /></div>
            <h3 className="install-help-title">
              {kind === 'macSafari' ? 'Adicionar ao Dock' : 'Criar atalho do app'}
            </h3>
            <p className="install-help-sub">
              Instale o <strong>Smart Análise</strong> como aplicativo para abrir
              direto{kind === 'macSafari' ? ' do Dock' : ''}, sem precisar do navegador.
            </p>

            {kind === 'ios' && (
              <ol className="install-help-steps">
                <li>
                  Toque em <strong>Compartilhar</strong>
                  <Share size={15} className="install-help-inline-icon" />
                  na barra do Safari.
                </li>
                <li>
                  Role e escolha <strong>"Adicionar à Tela de Início"</strong>
                  <Plus size={15} className="install-help-inline-icon" />.
                </li>
                <li>Toque em <strong>Adicionar</strong> no canto superior.</li>
              </ol>
            )}

            {kind === 'macSafari' && (
              <>
                <ol className="install-help-steps">
                  <li>
                    Clique em <strong>Compartilhar</strong>
                    <Share size={15} className="install-help-inline-icon" />
                    na barra do Safari.
                  </li>
                  <li>
                    Escolha <strong>"Adicionar ao Dock"</strong>
                    <Plus size={15} className="install-help-inline-icon" />.
                  </li>
                  <li>Confirme em <strong>Adicionar</strong>.</li>
                </ol>
                <p className="install-help-note">
                  Requer macOS Sonoma (14) ou superior. Dica: no <strong>Chrome</strong> ou
                  <strong> Edge</strong> a instalação é automática, com 1 clique.
                </p>
              </>
            )}

            {kind === 'generic' && (
              <>
                <ol className="install-help-steps">
                  <li>
                    Abra o menu do navegador
                    <MoreVertical size={15} className="install-help-inline-icon" />
                    (ou o ícone de instalar na barra de endereço).
                  </li>
                  <li>
                    Escolha <strong>"Instalar app"</strong> ou
                    <strong> "Adicionar à tela inicial"</strong>.
                  </li>
                  <li>Confirme em <strong>Instalar / Adicionar</strong>.</li>
                </ol>
                <p className="install-help-note">
                  No <strong>Firefox</strong> a instalação como app pode não estar disponível —
                  nesse caso use <strong>Chrome</strong> ou <strong>Edge</strong> para o atalho automático.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
