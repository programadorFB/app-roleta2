// components/NumberChip.jsx

import React from 'react';
import { getNumberColor } from '../utils/roulette';
import styles from '../pages/MasterDashboard.module.css';

const NumberChip = ({ number, size = 'medium' }) => {
  const color = getNumberColor(number);
  
  const sizeStyles = {
    small: { fontSize: '0.75rem', padding: '0.25rem 0.5rem' },
    medium: { fontSize: '0.9rem', padding: '0.4rem 0.7rem' },
    large: { fontSize: '1.1rem', padding: '0.5rem 0.9rem' }
  };

  return (
    <span
      className={`${styles['history-number']} ${styles[color]}`}
      style={{ 
        cursor: 'default', 
        margin: '0.1rem',
        ...sizeStyles[size]
      }}
    >
      {number}
    </span>
  );
};

export default NumberChip;