import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFinancial } from '../../contexts/FinancialContext';

// --- Components ---
import ObjectiveModal from '../../components/ObjectiveModal';
import ObjectivesList from '../../components/ObjectivesList';

// --- Icons ---
import { IoArrowBack } from 'react-icons/io5';
import { FaBullseye, FaTrophy } from 'react-icons/fa';

// --- CSS Module ---
import styles from './ObjectiveScreen.module.css';

const ObjectivesScreen = () => {
  const navigate = useNavigate();
  const { addObjective } = useFinancial();
  const [objectiveModalVisible, setObjectiveModalVisible] = useState(false);
  
  // ✅ NOVO: Estado para controlar a aba ativa
  const [activeTab, setActiveTab] = useState('active'); // 'active' ou 'completed'

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button className={styles.backButton} onClick={() => navigate(-1)}>
          <IoArrowBack /> Voltar
        </button>
        <h1>Meus Objetivos</h1>
        <div className={styles.headerSpacer} />
      </header>

      {/* ✅ NOVO: Sistema de Abas */}
      <div className={styles.tabsContainer}>
        <button 
          className={`${styles.tab} ${activeTab === 'active' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('active')}
        >
          <FaBullseye size={18} />
          <span>Ativos</span>
        </button>
        <button 
          className={`${styles.tab} ${activeTab === 'completed' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('completed')}
        >
          <FaTrophy size={18} />
          <span>Concluídos</span>
        </button>
      </div>

      <main className={styles.content}>
        {/* Só mostrar botão de criar na aba de ativos */}
        {activeTab === 'active' && (
          <button className={styles.addObjectiveButton} onClick={() => setObjectiveModalVisible(true)}>
            + Criar Novo Objetivo
          </button>
        )}
        
        {/* ✅ MUDANÇA: Passar prop showCompleted baseado na aba ativa */}
        <ObjectivesList showCompleted={activeTab === 'completed'} />
      </main>

      <ObjectiveModal 
        visible={objectiveModalVisible} 
        onClose={() => setObjectiveModalVisible(false)} 
      />
    </div>
  );
};

export default ObjectivesScreen;