import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react'; // 1. Importar useRef
import { X, BarChart3, Clock, Hash, Percent, Layers, CheckSquare, Settings } from 'lucide-react';
import FrequencyTable from './components/FrequencyTable';
import NotificationCenter from './components/NotificationCenter.jsx';
import MasterDashboard from './pages/MasterDashboard.jsx';
import './components/NotificationsCenter.css';
import  './App.module.css';

// --- CSS Styles Globais e Layout ---
// (O componente GlobalStyles permanece idêntico ao original, não precisa de alterações)
const GlobalStyles = () => (
  <style>{`
    * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
    }

    body {
        font-family: 'Arial', sans-serif;
        background-color: #064e3b;
    }

    /* Estilos gerais do container (usado na página da Roleta) */
    .container {
        min-height: calc(100vh - 65px);
        background: linear-gradient(135deg, #064e3b 0%, #065f46 50%, #064e3b 100%);
        display: grid;
        grid-template-columns: 380px 1fr;
        gap: 1.5rem;
        align-items: flex-start;
        padding: 1.5rem;
        overflow-x: hidden;
        max-width: 2400px;
        margin: 0 auto;
    }

    /* Estilos do Dashboard Lateral (Coluna 1 na Roleta) */
    .stats-dashboard {
        grid-column: 1 / 2;
        background: linear-gradient(135deg, #111827 0%, #1f2937 100%);
        border-radius: 1rem;
        padding: 1.25rem;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        border: 2px solid #a16207;
        position: sticky;
        top: 1.5rem;
        max-height: calc(100vh - 3rem - 65px);
        overflow-y: auto;
        color: white;
    }

    /* Título comum para dashboards */
    .dashboard-title {
        font-size: 1.25rem;
        font-weight: bold;
        color: #fde047;
        margin-bottom: 1rem;
        text-align: center;
    }

    /* Divisor */
    .divider {
        border: 0;
        height: 1px;
        background: #4b5563;
        margin: 1.5rem 0;
    }

    /* Card de Estatística */
    .stat-card {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 0.75rem;
        padding: 1rem;
        border: 1px solid #374151;
        margin-bottom: 1.5rem;
        text-align: center;
    }

    .stat-title {
        font-size: 1.1rem;
        font-weight: 600;
        color: #fbbf24;
        margin-bottom: 0.5rem;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
    }

    .stat-value-lg {
        font-size: 2rem;
        font-weight: bold;
        margin-bottom: 0.5rem;
        color: #fde047;
    }

    .stat-value-sm {
        font-size: 0.9rem;
        color: #d1d5db;
    }

    /* Seletor de Roleta */
    .roulette-selector {
      width: 100%;
      padding: 0.75rem;
      background: #1f2937;
      color: #fde047;
      border: 2px solid #a16207;
      border-radius: 0.5rem;
      font-size: 1rem;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.2s;
    }

    .roulette-selector:hover {
      background: #374151;
      border-color: #ca8a04;
    }

    .roulette-selector:focus {
      outline: none;
      box-shadow: 0 0 0 3px rgba(202, 138, 4, 0.3);
    }

    /* Badge de Monitoramento */
    .monitoring-badge {
      margin-top: 0.5rem;
      padding: 0.5rem;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.3);
      border-radius: 0.5rem;
      font-size: 0.75rem;
      color: #10b981;
      text-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
    }

    /* Lista de Histórico */
    .history-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: 1rem;
      justify-content: center;
    }

    .history-number {
      padding: 0.3rem 0.6rem;
      border-radius: 4px;
      color: white;
      font-weight: bold;
      font-size: 0.75rem;
      box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.4);
      min-width: 25px;
      text-align: center;
      cursor: pointer;
      transition: transform 0.2s;
    }

    .history-number:hover {
      transform: scale(1.1);
    }

    .history-number.red { background: #dc2626; }
    .history-number.black { background: #1f2937; }
    .history-number.green { background: #15803d; }

    /* Título comum para dashboards */
    .dashboard-title {
        font-size: 1.25rem;
        font-weight: bold;
        color: #fde047;
        margin-bottom: 1rem;
        text-align: center;
    }

    /* Divisor */
    .divider {
        border: 0;
        height: 1px;
        background: #4b5563;
        margin: 1.5rem 0;
    }

    /* Card de Estatística */
    .stat-card {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 0.75rem;
        padding: 1rem;
        border: 1px solid #374151;
        margin-bottom: 1.5rem;
        text-align: center;
    }

    .stat-title {
        font-size: 1.1rem;
        font-weight: 600;
        color: #fbbf24;
        margin-bottom: 0.5rem;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
    }

    .stat-value-lg {
        font-size: 2rem;
        font-weight: bold;
        margin-bottom: 0.5rem;
        color: #fde047;
    }

    .stat-value-sm {
        font-size: 0.9rem;
        color: #d1d5db;
    }

    /* Seletor de Roleta */
    .roulette-selector {
      width: 100%;
      padding: 0.75rem;
      background: #1f2937;
      color: #fde047;
      border: 2px solid #a16207;
      border-radius: 0.5rem;
      font-size: 1rem;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.2s;
    }

    .roulette-selector:hover {
      background: #374151;
      border-color: #ca8a04;
    }

    .roulette-selector:focus {
      outline: none;
      box-shadow: 0 0 0 3px rgba(202, 138, 4, 0.3);
    }

    /* Badge de Monitoramento */
    .monitoring-badge {
      margin-top: 0.5rem;
      padding: 0.5rem;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.3);
      border-radius: 0.5rem;
      font-size: 0.75rem;
      color: #10b981;
      text-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
    }

    /* Lista de Histórico */
    .history-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: 1rem;
      justify-content: center;
    }

    .history-number {
      padding: 0.3rem 0.6rem;
      border-radius: 4px;
      color: white;
      font-weight: bold;
      font-size: 0.75rem;
      box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.4);
      min-width: 25px;
      text-align: center;
      cursor: pointer;
      transition: transform 0.2s;
    }

    .history-number:hover {
      transform: scale(1.1);
    }

    .history-number.red { background: #dc2626; }
    .history-number.black { background: #1f2937; }
    .history-number.green { background: #15803d; }

    /* Wrapper da Roleta (Coluna 2 na Roleta) */
    .roulette-wrapper {
      grid-column: 2 / 3;
      display: flex;
      flex-direction: row;
      align-items: flex-start;
      gap: 2rem;
      padding: 0 1rem;
      justify-content: center;
    }

    .roulette-and-results {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1.5rem;
      width: 100%;
    }

    .latest-results-compact {
      background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
      border-radius: 1rem;
      padding: 1.5rem;
      border: 2px solid #a16207;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
      width: 300px;
      flex-shrink: 0;
      position: sticky;
      top: 1.5rem;
      -ms-overflow-style: none;  /* IE and Edge */
    scrollbar-width: none;  /* Firefox */
      max-height: calc(100vh - 3rem - 65px);
      overflow-y: auto;
    }

    .latest-results-title {
      font-size: 1.1rem;
      font-weight: bold;
      color: #fde047;
      margin-bottom: 1rem;
      text-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
    }

    .results-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    .result-number-box {
      aspect-ratio: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 0.5rem;
      font-weight: bold;
      font-size: 1rem;
      color: white;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
      cursor: pointer;
      transition: all 0.2s;
    }

    .result-number-box:hover {
      transform: scale(1.1);
      z-index: 5;
    }

    .result-number-box.red { background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); }
    .result-number-box.black { background: linear-gradient(135deg, #1f2937 0%, #000000 100%); }
    .result-number-box.green { background: linear-gradient(135deg, #22c55e 0%, #15803d 100%); }

    /* Centro da Roleta (Visual) */
    .roulette-center {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .wood-border, .gold-border, .green-base, .number-slot, .ball {
       position: relative;
    }
     .wood-border {
      width: 420px; height: 420px; border-radius: 50%;
      background: linear-gradient(135deg, #78350f 0%, #451a03 50%, #78350f 100%);
      box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5); padding: 1rem;
      background-image: linear-gradient(90deg, rgba(101, 67, 33, 0.3) 1px, transparent 1px), linear-gradient(rgba(101, 67, 33, 0.3) 1px, transparent 1px);
      background-size: 20px 20px;
    }
    .gold-border {
      width: 100%; height: 100%; border-radius: 50%; padding: 0.75rem;
      background: linear-gradient(145deg, #FFD700, #FFA500, #FFD700, #DAA520);
      background-size: 200% 200%; box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.5);
      overflow: hidden;
    }
    .green-base {
       width: 100%; height: 100%; border-radius: 50%;
      background: linear-gradient(135deg, #15803d 0%, #166534 50%, #14532d 100%);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8); overflow: hidden;
    }
     .number-slot {
      position: absolute; width: 44px; height: 44px; border-radius: 4px;
      font-weight: bold; color: white; font-size: 0.875rem;
      box-shadow: inset 0 2px 8px rgba(0,0,0,0.8), 0 2px 4px rgba(0,0,0,0.5);
      cursor: pointer; border: none; transition: all 0.2s;
      display: flex; align-items: center; justify-content: center;
    }
    .number-slot:hover { transform: scale(1.1); z-index: 10; }
    .number-slot.green { background: linear-gradient(135deg, #22c55e 0%, #15803d 100%); }
    .number-slot.red { background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); }
    .number-slot.black { background: linear-gradient(135deg, #1f2937 0%, #000000 100%); }
     .ball {
      position: absolute; width: 24px; height: 24px; border-radius: 50%;
      background: radial-gradient(circle at 30% 30%, #ffffff, #e0e0e0 40%, #a0a0a0 70%, #707070);
      box-shadow: 0 4px 8px rgba(0,0,0,0.6), inset -2px -2px 4px rgba(0,0,0,0.3), inset 2px 2px 4px rgba(255,255,255,0.8);
      pointer-events: none; z-index: 10;
      transition: transform 0.8s cubic-bezier(0.4, 0, 0.2, 1);
    }

    /* Seção de Título */
    .title-section {
        text-align: center;
        margin-top: 1.5rem;
        margin-bottom: 0;
        width: 100%;
    }

    .main-title {
        font-size: 2rem;
        font-weight: bold;
        background: linear-gradient(90deg, #fde047 0%, #eab308 50%, #fde047 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        margin-bottom: 0.25rem;
    }

    .subtitle {
        color: #fde047;
        margin-top: 0.25rem;
        font-size: 0.95rem;
        font-weight: 600;
    }

    /* Painel de Análise Profunda (Coluna 3 na Roleta) */
    .analysis-panel {
        grid-column: 3 / 4;
        background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
        border-radius: 1rem;
        padding: 1.25rem;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        border: 2px solid #a16207;
        position: sticky;
        top: 1.5rem;
        max-height: calc(100vh - 3rem - 65px);
        overflow-y: auto;
    }

    /* Estilos do Popup */
    .popup-overlay {
       position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(8px); display: flex; justify-content: center; align-items: center; z-index: 1000;
    }
    .popup-content {
      background: linear-gradient(145deg, #1f2937 0%, #111827 100%); border-radius: 1rem; padding: 2rem;
      width: 90%; max-width: 700px; box-shadow: 0 25px 50px rgba(0, 0, 0, 0.7); color: #d1d5db;
      position: relative; max-height: 90vh; overflow-y: auto; border: 3px solid #ca8a04;
    }
    .popup-close-btn {
      position: absolute; top: 1rem; right: 1rem; background: transparent; color: #9ca3af;
      border: none; cursor: pointer; padding: 0.5rem; border-radius: 50%; transition: color 0.2s, background 0.2s;
    }
    .popup-close-btn:hover { color: #fff; background: rgba(255, 255, 255, 0.1); }
    .popup-header {
      display: flex; align-items: center; gap: 1.5rem; margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 1px solid #374151;
    }
    .popup-number-icon {
      width: 60px; height: 60px; border-radius: 50%; display: flex; justify-content: center; align-items: center;
      font-size: 2rem; font-weight: bold; color: #111827; box-shadow: 0 0 15px rgba(0, 0, 0, 0.5);
    }
    .popup-number-icon.red { background-color: #ef4444; }
    .popup-number-icon.black { background-color: #374151; color: #fff; }
    .popup-number-icon.green { background-color: #10b981; }
    .popup-title { font-size: 1.8rem; color: #fde047; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 2.5rem; }
    .info-card { background: rgba(255, 255, 255, 0.05); border-radius: 0.5rem; padding: 1rem; border-left: 3px solid #ca8a04; }
    .info-label { font-weight: 600; color: #9ca3af; margin-bottom: 0.25rem; display: flex; align-items: center; gap: 0.4rem; font-size: 0.9rem; }
    .info-value { font-size: 1.4rem; font-weight: bold; }
    .info-value.red { color: #ef4444; } .info-value.black { color: #d1d5db; } .info-value.green { color: #10b981; }
    .next-spins-title { font-size: 1.4rem; color: #eab308; margin-bottom: 1.5rem; border-bottom: 1px solid #374151; padding-bottom: 0.5rem; }
    .next-spins-container { display: flex; flex-direction: column; gap: 1.5rem; }
    .next-spins-card { background: rgba(0, 0, 0, 0.2); padding: 1rem; border-radius: 0.5rem; border: 1px solid #374151; }
    .next-spins-label { font-size: 1rem; color: #e5e7eb; margin-bottom: 0.75rem; font-weight: bold; }
    .next-numbers-list { display: flex; gap: 0.5rem; }
    .next-number {
      width: 30px; height: 30px; border-radius: 50%; display: flex; justify-content: center; align-items: center;
      font-size: 0.9rem; font-weight: bold; color: #111827; box-shadow: 0 2px 5px rgba(0, 0, 0, 0.5);
    }
    .next-number.red { background-color: #fca5a5; } .next-number.black { background-color: #9ca3af; color: #111827; } .next-number.green { background-color: #6ee7b7; }
    .next-spins-incomplete { font-size: 0.85rem; color: #ef4444; margin-top: 0.5rem; }
    .next-spins-none { color: #9ca3af; text-align: center; font-style: italic; }
    .popup-footer-btn {
      margin-top: 2rem; width: 100%; background: linear-gradient(90deg, #ca8a04 0%, #eab308 100%); color: #111827;
      font-weight: bold; padding: 1rem 1.5rem; border-radius: 0.5rem; border: none; cursor: pointer; font-size: 1.125rem;
      box-shadow: 0 5px 15px rgba(234, 179, 8, 0.4); transition: transform 0.2s;
    }
    .popup-footer-btn:hover { transform: translateY(-2px); }

    /* Responsividade */
    /* (Toda a seção @media permanece idêntica) */
    @media (max-width: 1600px) {
      .container {
        grid-template-columns: 340px 1fr;
        gap: 1rem;
      }
      .wood-border {
        width: 380px;
        height: 380px;
      }
      .roulette-wrapper {
        flex-direction: column;
        align-items: center;
      }
      .latest-results-compact {
        max-width: 100%;
        width: 100%;
        position: static;
        max-height: none;
      }
    }

    @media (max-width: 1400px) {
      .container {
        grid-template-columns: 1fr;
        padding: 1.5rem;
      }
      .stats-dashboard {
          position: static;
          max-height: none;
          grid-column: auto;
      }
      .roulette-wrapper {
        grid-column: auto;
        flex-direction: column;
        align-items: center;
      }
      .latest-results-compact {
        max-width: 100%;
        width: 100%;
        position: static;
        max-height: none;
      }
      .roulette-and-results {
        width: 100%;
        max-width: 800px;
      }
    }

    @media (max-width: 1024px) {
      .container {
        grid-template-columns: 1fr;
        padding: 1rem;
      }
      .wood-border {
        width: 350px;
        height: 350px;
      }
      .main-title { font-size: 1.75rem; }
      .subtitle { font-size: 0.9rem; }
    }

     @media (max-width: 600px) {
        .wood-border {
            width: 300px;
            height: 300px;
        }
         .number-slot {
             width: 28px;
             height: 28px;
             font-size: 0.7rem;
         }
         .ball {
             width: 16px;
             height: 16px;
         }
         .main-title { font-size: 1.5rem; }
         .subtitle { font-size: 0.85rem; }
         .popup-content { padding: 1rem; }
         .popup-title { font-size: 1.5rem; }
         .results-grid {
           grid-template-columns: repeat(4, 1fr);
         }
         .latest-results-compact {
           padding: 1rem;
         }
    }
         /* Responsividade */
    @media (max-width: 1600px) {
      .container {
        grid-template-columns: 340px 1fr;
        gap: 1rem;
      }
      .wood-border {
        width: 380px;
        height: 380px;
      }
      .roulette-wrapper {
        flex-direction: column;
        align-items: center;
      }
      .latest-results-compact {
        max-width: 100%;
        width: 100%;
        position: static;
        max-height: none;
      }
    }

    @media (max-width: 1400px) {
      .container {
        grid-template-columns: 1fr;
        padding: 1.5rem;
      }
      .stats-dashboard {
          position: static;
          max-height: none;
          grid-column: auto;
      }
      .roulette-wrapper {
        grid-column: auto;
        flex-direction: column;
        align-items: center;
      }
      .latest-results-compact {
        max-width: 100%;
        width: 100%;
        position: static;
        max-height: none;
      }
      .roulette-and-results {
        width: 100%;
        max-width: 800px;
      }
    }

    @media (max-width: 1024px) {
      .container {
        grid-template-columns: 1fr;
        padding: 1rem;
      }
      .wood-border {
        width: 350px;
        height: 350px;
      }
      .main-title { font-size: 1.75rem; }
      .subtitle { font-size: 0.9rem; }
    }

    @media (max-width: 768px) {
      .container {
        padding: 0.75rem;
        gap: 1rem;
      }
      .wood-border {
        width: 320px;
        height: 320px;
      }
      .number-slot {
        width: 32px;
        height: 32px;
        font-size: 0.75rem;
      }
      .ball {
        width: 18px;
        height: 18px;
      }
      .main-title { font-size: 1.6rem; }
      .subtitle { font-size: 0.875rem; }
      .stats-dashboard {
        padding: 1rem;
      }
      .latest-results-compact {
        padding: 1rem;
      }
      .results-grid {
        grid-template-columns: repeat(5, 1fr);
      }
    }

    @media (max-width: 600px) {
      .container {
        padding: 0.5rem;
        min-height: calc(100vh - 65px);
      }
      .wood-border {
        width: 280px;
        height: 280px;
        padding: 0.75rem;
      }
      .gold-border {
        padding: 0.5rem;
      }
      .number-slot {
        width: 26px;
        height: 26px;
        font-size: 0.65rem;
      }
      .ball {
        width: 14px;
        height: 14px;
      }
      .main-title { font-size: 1.4rem; }
      .subtitle { font-size: 0.8rem; }
      .popup-content { 
        padding: 1rem;
        width: 95%;
      }
      .popup-title { font-size: 1.3rem; }
      .results-grid {
        grid-template-columns: repeat(4, 1fr);
        gap: 0.4rem;
      }
      .result-number-box {
        font-size: 0.875rem;
      }
      .latest-results-compact {
        padding: 0.75rem;
      }
      .stats-dashboard {
        padding: 0.75rem;
      }
      .stat-card {
        padding: 0.75rem;
        margin-bottom: 1rem;
      }
      .dashboard-title {
        font-size: 1.1rem;
      }
      .stat-value-lg {
        font-size: clamp(1.5rem, 5vw, 2rem);
      }
      .stat-value-sm {
        font-size: clamp(0.75rem, 2.5vw, 0.9rem);
      }
    }

    @media (max-width: 430px) {
      .wood-border {
        width: 260px;
        height: 260px;
        padding: 0.65rem;
      }
      .gold-border {
        padding: 0.45rem;
      }
      .number-slot {
        width: 24px;
        height: 24px;
        font-size: 0.6rem;
      }
      .ball {
        width: 12px;
        height: 12px;
      }
      .main-title { font-size: 1.25rem; }
      .subtitle { font-size: 0.75rem; }
    }

    @media (max-width: 393px) {
      .wood-border {
        width: 240px;
        height: 240px;
        padding: 0.6rem;
      }
      .gold-border {
        padding: 0.4rem;
      }
      .number-slot {
        width: 22px;
        height: 22px;
        font-size: 0.55rem;
      }
      .ball {
        width: 11px;
        height: 11px;
      }
      .main-title { font-size: 1.15rem; }
      .subtitle { font-size: 0.7rem; }
      .title-section {
        margin-top: 1rem;
      }
      .result-number-box {
        font-size: 0.8rem;
      }
      .latest-results-title {
        font-size: 0.95rem;
      }
    }

  `}</style>
);
// --- FIM DOS ESTILOS GLOBAIS ---


// Constantes
const rouletteNumbers = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];

const getNumberColor = (num) => {
  if (num === 0) return 'green';
  const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  return redNumbers.includes(num) ? 'red' : 'black';
};

// --- NOVAS FONTES ADICIONADAS ---
const ROULETTE_SOURCES = {
  immersive: '🌟 Roleta Immersive',
  brasileira: '🇧🇷 Roleta Brasileira',
  // default: '🌐 Roleta Default (Genérica)',
  speed: '💨 Speed Roulette',
  xxxtreme: '⚡ Xxxtreme Lightning',
  vipauto: '🚘 Vip Auto Roulette'
};

// Componente Principal da Aplicação
const App = () => {
  // Configuração inicial para a primeira roleta na lista
  const [selectedRoulette, setSelectedRoulette] = useState(Object.keys(ROULETTE_SOURCES)[0]);
  const [spinHistory, setSpinHistory] = useState([]);
  const [selectedResult, setSelectedResult] = useState(null);
  const [popupNumber, setPopupNumber] = useState(null);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [activePage, setActivePage] = useState('roulette');

  // --- INÍCIO DAS CORREÇÕES ---
  
  // 2. Criar a ref e o estado para o raio
  const greenBaseRef = useRef(null);
  // Começa com 160 (valor original) e será atualizado
  const [dynamicRadius, setDynamicRadius] = useState(160);

  // 3. useEffect para medir o contêiner e atualizar o raio
  useEffect(() => {
    const calculateRadius = () => {
      if (greenBaseRef.current) {
        const greenBaseWidth = greenBaseRef.current.clientWidth;
        // O raio original (160) era ~87.9% do raio da base verde (que era ~182px)
        // (420px .wood-border - 2*(1rem + 0.75rem) padding) / 2 = 182px
        // Mantemos essa proporção para que os números fiquem dentro da borda
        const newRadius = (greenBaseWidth / 2) * 0.879;
        setDynamicRadius(newRadius);
      }
    };

    calculateRadius(); // Calcular ao montar
    window.addEventListener('resize', calculateRadius); // Recalcular ao redimensionar

    // Limpar o listener ao desmontar
    return () => window.removeEventListener('resize', calculateRadius);
  }, []); // Array vazio garante que rode apenas ao montar/desmontar

  // --- FIM DAS CORREÇÕES ---


  // Busca o histórico da API
  const fetchHistory = useCallback(async () => {
    try {
      const response = await fetch(`/api/full-history?source=${selectedRoulette}`);
      if (!response.ok) throw new Error(`Erro na API: ${response.statusText}`);
      const data = await response.json();

      const convertedData = data.map(item => {
        const num = parseInt(item.signal, 10);
        return {
          number: num,
          color: getNumberColor(num),
          signal: item.signal,
          gameId: item.gameId,
          signalId: item.signalId,
          date: item.timestamp
        };
      });

      setSpinHistory(convertedData);
      setSelectedResult(convertedData[0] || null);
    } catch (error) {
      console.error("Erro ao buscar histórico:", error);
      setSpinHistory([]);
      setSelectedResult(null);
    }
  }, [selectedRoulette]);

  // Efeito para buscar dados ao montar e a cada 5 segundos
  useEffect(() => {
    fetchHistory();
    const intervalId = setInterval(fetchHistory, 5000);
    return () => clearInterval(intervalId);
  }, [fetchHistory]);

  // Abre o popup de análise de número
  const handleNumberClick = useCallback((number) => {
    setPopupNumber(number);
    setIsPopupOpen(true);
  }, []);

  // Fecha o popup
  const closePopup = useCallback(() => {
    setIsPopupOpen(false);
    setPopupNumber(null);
  }, []);

  // Calcula estatísticas básicas para o dashboard lateral
  const stats = useMemo(() => {
    const totalSpins = spinHistory.length;
    if (totalSpins === 0) return { totalSpins: 0, colorFrequencies: { red: '0.0', black: '0.0', green: '0.0' }, latestNumbers: [] };

    const colorCounts = spinHistory.reduce((acc, curr) => {
      acc[curr.color] = (acc[curr.color] || 0) + 1;
      return acc;
    }, {});

    return {
      totalSpins,
      colorFrequencies: {
        red: ((colorCounts.red || 0) / totalSpins * 100).toFixed(1),
        black: ((colorCounts.black || 0) / totalSpins * 100).toFixed(1),
        green: ((colorCounts.green || 0) / totalSpins * 100).toFixed(1)
      },
      latestNumbers: spinHistory.slice(0, 100),
    };
  }, [spinHistory]);

  // Calcula estatísticas detalhadas para o popup
  const popupStats = useMemo(() => {
    if (popupNumber === null || !isPopupOpen) return null;

    const occurrences = [];
    spinHistory.forEach((spin, index) => {
      if (spin.number === popupNumber) {
        occurrences.push({ index });
      }
    });

    const count = occurrences.length;
    const totalSpins = spinHistory.length;
    const frequency = totalSpins > 0 ? ((count / totalSpins) * 100).toFixed(2) : '0.00';

    const nextOccurrences = occurrences.slice(0, 5).map(occ => {
      const prevSpins = spinHistory.slice(occ.index + 1, occ.index + 1 + 5).map(s => s.number);
      return {
        spinsAgo: occ.index + 1,
        prevSpins: prevSpins,
      };
    });

    return {
      count,
      frequency,
      nextOccurrences,
      totalSpins,
      lastHitAgo: occurrences.length > 0 ? occurrences[0].index + 1 : null
    };
  }, [popupNumber, isPopupOpen, spinHistory]);

  // Calcula a posição de um número na roda visual
  const getNumberPosition = useCallback((number, radius) => {
    const index = rouletteNumbers.indexOf(number);
    if (index === -1) return { x: 0, y: 0, angle: 0 };
    const angle = (index * 360) / rouletteNumbers.length;
    const x = radius * Math.cos((angle - 90) * (Math.PI / 180));
    const y = radius * Math.sin((angle - 90) * (Math.PI / 180));
    return { x, y, angle };
  }, []);

  // Calcula a posição da bola (baseado no último resultado)
  const ballPosition = useMemo(() => {
    if (selectedResult === null) return null;
    
    // 4. Usar o dynamicRadius em vez de 160
    return getNumberPosition(selectedResult.number, dynamicRadius);
    
    // 5. Adicionar dynamicRadius às dependências
  }, [selectedResult, getNumberPosition, dynamicRadius]);
  
  // 6. Calcular tamanho dinâmico para o display central
  // (160 * 0.625 = 100px, o tamanho original)
  const centerDisplaySize = dynamicRadius * 0.625; 
  // (100 * 0.56 = 56px, que é 3.5rem * 16px/rem, o font-size original)
  const centerFontSize = centerDisplaySize * 0.56; 

  return (
    <>
      <NotificationCenter />
      <GlobalStyles />

      {/* BARRA DE NAVEGAÇÃO ENTRE PÁGINAS */}
      <div style={{
        background: '#111827',
        padding: '0.75rem 2rem',
        display: 'flex',
        justifyContent: 'center',
        gap: '1rem',
        borderBottom: '3px solid #a16207'
      }}>
        <button
          onClick={() => setActivePage('roulette')}
          style={activePage === 'roulette' ? activeTabStyle : inactiveTabStyle}
        >
          <Settings size={18} /> Roleta Detalhada
        </button>
        <button
          onClick={() => setActivePage('master')}
          style={activePage === 'master' ? activeTabStyle : inactiveTabStyle}
        >
          <CheckSquare size={18} /> Painel Master
        </button>
      </div>

      {/* Renderização Condicional da Página Ativa */}
      {activePage === 'roulette' && (
        <div className="container">

          {/* Coluna 1: Dashboard Lateral */}
          <div className="stats-dashboard">
            <h3 className="dashboard-title">Estatísticas em Tempo Real</h3>

            <div className="stat-card">
              <h4 className="stat-title"><Layers size={20} /> Fonte de Dados</h4>
              <select
                className="roulette-selector"
                value={selectedRoulette}
                onChange={(e) => setSelectedRoulette(e.target.value)}
              >
                {Object.keys(ROULETTE_SOURCES).map(key => (
                  <option key={key} value={key}>
                    {ROULETTE_SOURCES[key]}
                  </option>
                ))}
              </select>
              <div className="monitoring-badge">
                <span style={{ fontSize: '1.2rem' }}>⚡</span>
                Monitorando: {ROULETTE_SOURCES[selectedRoulette]}
              </div>
            </div>

            <hr className="divider" />

            <div className="stat-card">
              <h4 className="stat-title"><BarChart3 size={20} /> Total de Sinais</h4>
              <p className="stat-value-lg">{stats.totalSpins}</p>
            </div>

            <hr className="divider" />

            <div className="stat-card">
              <h4 className="stat-title">Frequência de Cores</h4>
              <p className="stat-value-sm">Vermelho: <span style={{color: '#ef4444', fontWeight: 'bold'}}>{stats.colorFrequencies.red}%</span></p>
              <p className="stat-value-sm">Preto: <span style={{color: '#d1d5db', fontWeight: 'bold'}}>{stats.colorFrequencies.black}%</span></p>
              <p className="stat-value-sm">Zero: <span style={{color: '#10b981', fontWeight: 'bold'}}>{stats.colorFrequencies.green}%</span></p>
            </div>
          </div>

          {/* Coluna 2: Roleta Visual e Painel de Análise */}
          <div className="roulette-wrapper">
            <div className="roulette-and-results">
              {/* Roleta Visual */}
              <div className="roulette-center">
                <div className="wood-border">
                  <div className="gold-border">
                  
                    {/* 7. Adicionar a ref ao elemento .green-base */}
                    <div className="green-base" ref={greenBaseRef}>
                    
                      {rouletteNumbers.map((number) => {
                        
                        // 8. Usar o dynamicRadius em vez de 160
                        const { x, y, angle } = getNumberPosition(number, dynamicRadius);
                        const color = getNumberColor(number);
                        return (
                          <div
                            key={number}
                            className={`number-slot ${color}`}
                            style={{
                              left: '50%', top: '50%',
                              transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${angle}deg)`
                            }}
                            onClick={() => handleNumberClick(number)}
                            title={`Analisar número ${number}`}
                          >
                            <span style={{ display: 'inline-block', transform: `rotate(-${angle}deg)` }}>
                              {number}
                            </span>
                          </div>
                        );
                      })}
                      {/* Bola */}
                      {ballPosition && (
                        <div
                          className="ball"
                          style={{
                            left: '50%', top: '50%',
                            transform: `translate(calc(-50% + ${ballPosition.x}px), calc(-50% + ${ballPosition.y}px))`
                          }}
                        />
                      )}
                      
                      {/* --- INÍCIO: NÚMERO ATUAL NO CENTRO (CORRIGIDO) --- */}
                      {selectedResult !== null && (
                        <div
                          style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            // 9. Usar tamanhos dinâmicos
                            width: `${centerDisplaySize}px`,
                            height: `${centerDisplaySize}px`,
                            borderRadius: '50%',
                            background: selectedResult.color === 'red' ? '#dc2626' : 
                                        selectedResult.color === 'black' ? '#1f2937' : '#15803d',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: `${centerFontSize}px`, // 9. Usar font-size dinâmico
                            fontWeight: 'bold',
                            color: 'white',
                            border: '5px solid #fde047',
                            boxShadow: 'inset 0 0 15px rgba(0,0,0,0.7), 0 5px 20px rgba(0,0,0,0.5)',
                            zIndex: 5,
                            textShadow: '2px 2px 4px rgba(0,0,0,0.5)'
                          }}
                          title={`Último Número: ${selectedResult.number}`}
                        >
                          {selectedResult.number}
                        </div>
                      )}
                      {/* --- FIM: NÚMERO ATUAL NO CENTRO --- */}

                    </div>
                  </div>
                </div>
              </div>

              {/* Título e Tabela de Frequência abaixo da roleta */}
              <div className="title-section">
                <h1 className="main-title">Dashboard Analítico de Roleta</h1>
                <p className="subtitle">{ROULETTE_SOURCES[selectedRoulette]}</p>
              </div>

              {/* Painel Master abaixo da roleta */}
              <div style={{marginTop: '2rem', width: '100%', maxWidth: '800px'}}>
                {stats.totalSpins > 0 && <MasterDashboard spinHistory={spinHistory} />}
              </div>
              <div style={{marginTop: '1rem', width: '100%', maxWidth: '600px'}}>
                {stats.totalSpins > 0 && <FrequencyTable spinHistory={spinHistory} />}
              </div>

            </div>

            {/* Últimos Resultados (100) - Ao lado da roleta */}
            <div className="latest-results-compact">
              <h4 className="latest-results-title">
                <Clock size={20} />
                Últimos Resultados (100)
              </h4>
              <div className="results-grid">
                {stats.latestNumbers.map((result, index) => (
                  <div
                    key={index}
                    className={`result-number-box ${result.color}`}
                    onClick={() => handleNumberClick(result.number)}
                    title={`Spin #${stats.totalSpins - index}`}
                  >
                    {result.number}
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* Renderização Condicional da Página Master */}
      {activePage === 'master' && (
        <div style={{
            padding: '2rem',
            background: 'linear-gradient(135deg, #064e3b 0%, #065f46 50%, #064e3b 100%)',
            minHeight: 'calc(100vh - 65px)'
        }}>
            <MasterDashboard spinHistory={spinHistory} />
        </div>
      )}

      {/* Popup de Análise de Número */}
      <NumberStatsPopup isOpen={isPopupOpen} onClose={closePopup} number={popupNumber} stats={popupStats} />
    </>
  );
};

// Estilos para os Botões de Navegação
const activeTabStyle = {
  padding: '0.75rem 1.5rem',
  background: 'linear-gradient(135deg, #ca8a04, #eab308)',
  color: '#111827',
  border: 'none',
  borderRadius: '0.5rem',
  cursor: 'pointer',
  fontWeight: 'bold',
  fontSize: '1rem',
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  boxShadow: '0 4px 10px rgba(202, 138, 4, 0.4)',
  transition: 'all 0.2s'
};

const inactiveTabStyle = {
  padding: '0.75rem 1.5rem',
  background: 'rgba(255, 255, 255, 0.05)',
  color: '#d1d5db',
  border: '1px solid #4b5563',
  borderRadius: '0.5rem',
  cursor: 'pointer',
  fontWeight: 'bold',
  fontSize: '1rem',
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  transition: 'all 0.2s'
};

// Popup de Análise de Número
// (Componente NumberStatsPopup permanece idêntico)
const NumberStatsPopup = ({ isOpen, onClose, number, stats }) => {
  if (!isOpen || !stats) return null;
  const color = getNumberColor(number);

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-content" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="popup-close-btn">
          <X size={24} />
        </button>
        <div className="popup-header">
          <div className={`popup-number-icon ${color}`}>{number}</div>
          <h2 className="popup-title">Análise do Número {number}</h2>
        </div>
        <div className="stats-grid">
          <div className="info-card">
            <p className="info-label"><Hash size={18} /> Ocorrências:</p>
            <p className="info-value">{stats.count} / {stats.totalSpins}</p>
          </div>
          <div className="info-card">
            <p className="info-label"><Percent size={18} /> Frequência:</p>
            <p className="info-value">{stats.frequency}%</p>
          </div>
          <div className="info-card">
            <p className="info-label"><Clock size={18} /> Última Vez:</p>
            <p className="info-value">{stats.lastHitAgo !== null ? `${stats.lastHitAgo} spins atrás` : 'Nunca'}</p>

          </div>
          <div className="info-card">
            <p className="info-label">Cor:</p>
            <p className={`info-value ${color}`}>{color.toUpperCase()}</p>
          </div>
        </div>
        <h3 className="next-spins-title">Últimas 5 Ocorrências (e 5 spins ANTERIORES)</h3>
        <div className="next-spins-container">
          {stats.nextOccurrences.length > 0 ? (
            stats.nextOccurrences.map((occ, index) => (
              <div key={index} className="next-spins-card">
                <p className="next-spins-label">Ocorrência #{stats.count - index} ({occ.spinsAgo} spins atrás)</p>
                <div className="next-numbers-list">
                  {occ.prevSpins.length > 0 ? occ.prevSpins.map((num, i) => (
                    <span key={i} className={`next-number ${getNumberColor(num)}`} title={`Spin #${stats.totalSpins - (occ.spinsAgo + i)} (${5-i}º Spin ANTES)`}>
                      {num}
                    </span>
                  )) : <span style={{color: '#9ca3af', fontStyle: 'italic'}}>Início do histórico</span>}
                </div>
              </div>
            ))
          ) : (
            <p className="next-spins-none">O número {number} ainda não foi sorteado neste histórico.</p>
          )}
        </div>
        <button onClick={onClose} className="popup-footer-btn">Fechar</button>
      </div>
    </div>
  );
};

export default App;