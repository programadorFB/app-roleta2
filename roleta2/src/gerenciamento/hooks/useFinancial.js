import { useContext } from 'react';
import { FinancialContext } from '../contexts/FinancialContext';

export const useFinancial = () => useContext(FinancialContext);