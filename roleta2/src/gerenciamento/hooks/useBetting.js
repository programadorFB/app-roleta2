import { useContext } from 'react';
import { BettingContext } from '../contexts/BettingContext';

export const useBetting = () => useContext(BettingContext);
