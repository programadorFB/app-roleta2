// pages/TriggersPage.jsx — v2 WITH GAME IFRAME
import React from 'react';
import { Crosshair } from 'lucide-react';
import TriggerStrategiesPanel from '../components/TriggerStrategiesPanel';
import styles from './TriggersPage.module.css';

const TriggersPage = ({
  filteredSpinHistory,
  gameIframeComponent,
}) => {
  const windowSize = Math.min(2000, filteredSpinHistory.length);

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.headerBar}>
        <div className={styles.headerLeft}>
          <Crosshair size={22} className={styles.headerIcon} />
          <div>
            <h2 className={styles.headerTitle}>Gatilhos & Estratégias</h2>
            <p className={styles.headerSubtitle}>
              Análise individual dos 37 números · {windowSize.toLocaleString()} rodadas
            </p>
          </div>
        </div>
      </div>

      {/* Layout: Iframe + Triggers side by side on desktop, stacked on mobile */}
      <div className={styles.triggersLayout}>
        {/* Game iframe */}
        {gameIframeComponent && (
          <div className={styles.gameColumn}>
            <div className={styles.gameWrapper}>
              {gameIframeComponent}
            </div>
          </div>
        )}

        {/* Triggers panel */}
        <div className={styles.triggersColumn}>
          <div className={styles.content}>
            <TriggerStrategiesPanel spinHistory={filteredSpinHistory} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default TriggersPage;