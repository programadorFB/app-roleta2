/**
 * useCarregar — hook de carregamento para as telas do painel.
 *
 * Existe para as seis páginas não repetirem o mesmo tríduo
 * carregando/erro/dados, e para o 401 ter um tratamento só: sessão expirada
 * recarrega a página, o que devolve o admin para a tela de login em vez de
 * deixá-lo olhando uma tela de erro genérica.
 */

import { useState, useEffect, useCallback } from 'react';
import { AdminApiError } from './api.js';

export function useCarregar(fn, deps = []) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [gatilho, setGatilho] = useState(0);

  const recarregar = useCallback(() => setGatilho(g => g + 1), []);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setErro('');

    fn()
      .then(res => { if (!cancelado) setDados(res); })
      .catch(err => {
        if (cancelado) return;
        if (err instanceof AdminApiError && err.status === 403) {
          window.location.reload();
          return;
        }
        setErro(err.message || 'Falha ao carregar');
      })
      .finally(() => { if (!cancelado) setCarregando(false); });

    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, gatilho]);

  return { dados, erro, carregando, recarregar };
}
