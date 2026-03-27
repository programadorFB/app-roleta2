-- Adiciona coluna spin_results para rastrear os resultados reais da roleta após cada sinal
-- Usado no histórico de sinais para mostrar os números que saíram e em qual gale o win ocorreu
ALTER TABLE motor_pending_signals ADD COLUMN IF NOT EXISTS spin_results INT[] DEFAULT '{}';
