import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { MdArrowBack, MdCheck } from 'react-icons/md';
import { FaCoins } from 'react-icons/fa';
import styles from './profileScreen.module.css';

// 1. Importar imagens locais
import avatar1 from '../../assets/avatares/1.png';
import avatar2 from '../../assets/avatares/2.png';
import avatar3 from '../../assets/avatares/3.png';
import avatar4 from '../../assets/avatares/4.png';
import avatar5 from '../../assets/avatares/5.png';
import avatar6 from '../../assets/avatares/6.png';

// 2. CRIAR UM MAPA DIRETO (ID -> IMAGEM)
// Isso garante que o código saiba exatamente qual imagem mostrar
const AVATAR_MAP = {
  'avatar1': avatar1,
  'avatar2': avatar2,
  'avatar3': avatar3,
  'avatar4': avatar4,
  'avatar5': avatar5,
  'avatar6': avatar6
};

// Lista para gerar os botões (mantendo a ordem)
const AVATAR_OPTIONS = [
  { id: 'avatar1', name: 'Avatar 1' },
  { id: 'avatar2', name: 'Avatar 2' },
  { id: 'avatar3', name: 'Avatar 3' },
  { id: 'avatar4', name: 'Avatar 4' },
  { id: 'avatar5', name: 'Avatar 5' },
  { id: 'avatar6', name: 'Avatar 6' }
];

const ProfileScreen = () => {
  const { user, updateProfile, logout } = useAuth();
  const navigate = useNavigate();
  
  // Estados
  const [name, setName] = useState('');
  const [initialBank, setInitialBank] = useState('');
  const [selectedAvatarId, setSelectedAvatarId] = useState(null); // Guarda apenas o ID (ex: 'avatar1')
  
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // ✅ Carregar dados do usuário APENAS UMA VEZ ao montar ou trocar de usuário
  useEffect(() => {
    if (user) {
      setName(user.name || '');
      
      // Tenta recuperar o avatar salvo no banco
      const savedAvatar = user.avatar_url || user.profile_photo;
      
      // Se o avatar salvo existir no nosso mapa, define ele. Se não, null.
      if (savedAvatar && AVATAR_MAP[savedAvatar]) {
        setSelectedAvatarId(savedAvatar);
      } else {
        setSelectedAvatarId(null);
      }

      // Formatar banca
      if (user.initial_bank) {
        const val = parseFloat(user.initial_bank);
        if (!isNaN(val)) setInitialBank(val.toFixed(2).replace('.', ','));
      }
    }
  }, [user]); 

  // ✅ Handler de clique no avatar (ATUALIZAÇÃO INSTANTÂNEA)
  const handleSelectAvatar = (id) => {
    console.log('🖼️ Clique no avatar:', id);
    setSelectedAvatarId(id); // Isso força a imagem grande a mudar na hora
  };

  // ✅ Handler para salvar
  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validações básicas de senha
      if (newPassword) {
        if (newPassword !== confirmPassword) throw new Error('Senhas não conferem.');
        if (!currentPassword) throw new Error('Senha atual é necessária.');
      }

      const payload = {
        name: name.trim(),
        // Envia o ID do avatar (ex: 'avatar1')
        profile_photo: selectedAvatarId 
      };

      // Se o usuário removeu o avatar (selectedAvatarId é null mas tinha antes)
      if (!selectedAvatarId && (user.avatar_url || user.profile_photo)) {
        payload.remove_profile_photo = true;
      }

      // Banca (Opcional)
      if (initialBank) {
        const bankVal = parseFloat(initialBank.replace(',', '.'));
        if (!isNaN(bankVal) && bankVal > 0) payload.initial_bank = bankVal;
      }

      // Senha (Opcional)
      if (newPassword) {
        payload.current_password = currentPassword;
        payload.new_password = newPassword;
      }

      console.log('📤 Enviando:', payload);
      const result = await updateProfile(payload);

      if (result.success) {
        alert('Perfil atualizado!');
        // Limpar campos de senha
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        throw new Error(result.error || 'Erro ao salvar');
      }

    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao atualizar perfil');
    } finally {
      setLoading(false);
    }
  };

  // Helpers
  const formatCurrency = (v) => {
    let val = v.replace(/[^\d,]/g, '');
    if (val.split(',').length > 2) val = val.replace(/,+$/, '');
    return val;
  };

  const getInitials = () => {
    return name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'U';
  };

  // ✅ Lógica da Imagem Grande: Usa o MAPA para garantir que a imagem existe
  const mainImageSrc = selectedAvatarId ? AVATAR_MAP[selectedAvatarId] : null;

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <button type="button" onClick={() => navigate(-1)} className={styles.backButton}>
          <MdArrowBack size={24} />
        </button>
        <h1 className={styles.title}>Meu Perfil</h1>
        <div className={styles.headerSpacer}></div>
      </header>

      <form onSubmit={handleUpdateProfile}>
        {/* SEÇÃO DE IMAGEM */}
        <section className={styles.imageSection}>
          <div className={styles.imageContainer}>
            {mainImageSrc ? (
              <img 
                src={mainImageSrc} 
                alt="Avatar Selecionado" 
                className={styles.profileImage} 
              />
            ) : (
              <div className={styles.profileImagePlaceholder}>
                <span>{getInitials()}</span>
              </div>
            )}
          </div>

          {selectedAvatarId && (
            <div className={styles.imageButtons}>
              <button 
                type="button"
                className={`${styles.imageButton} ${styles.removeButton}`}
                onClick={() => setSelectedAvatarId(null)}
              >
                Remover Foto
              </button>
            </div>
          )}

          <div className={styles.avatarSelector}>
            <h3 className={styles.avatarSelectorTitle}>Escolha seu Avatar</h3>
            <div className={styles.avatarGrid}>
              {AVATAR_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`${styles.avatarOption} ${
                    selectedAvatarId === option.id ? styles.avatarOptionSelected : ''
                  }`}
                  onClick={() => handleSelectAvatar(option.id)}
                >
                  <img 
                    src={AVATAR_MAP[option.id]} 
                    alt={option.name} 
                    className={styles.avatarOptionImage} 
                  />
                  {selectedAvatarId === option.id && (
                    <div className={styles.avatarCheckmark}>
                      <MdCheck size={20} />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* CAMPOS DE TEXTO */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Dados Pessoais</h2>
          
          <div className={styles.inputContainer}>
            <label className={styles.label}>Nome</label>
            <input 
              className={styles.input} 
              value={name} 
              onChange={e => setName(e.target.value)} 
            />
          </div>

          <div className={styles.inputContainer}>
            <label className={styles.label}>
              <FaCoins style={{marginRight: 5}}/> Banca Inicial (Opcional)
            </label>
            <div className={styles.currencyInputWrapper}>
              <span className={styles.currencySymbol}>R$</span>
              <input 
                className={styles.currencyInput} 
                value={initialBank}
                onChange={e => setInitialBank(formatCurrency(e.target.value))}
                placeholder="0,00"
              />
            </div>
          </div>

          <div className={styles.inputContainer}>
            <label className={styles.label}>Email</label>
            <input 
              className={`${styles.input} ${styles.disabledInput}`} 
              value={user?.email || ''} 
              disabled 
            />
          </div>
        </section>

        {/* SENHA */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Segurança</h2>
          <div className={styles.inputContainer}>
            <label className={styles.label}>Senha Atual</label>
            <input 
              type="password"
              className={styles.input}
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className={styles.inputContainer}>
            <label className={styles.label}>Nova Senha</label>
            <input 
              type="password"
              className={styles.input}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
            />
          </div>
          <div className={styles.inputContainer}>
            <label className={styles.label}>Confirmar Senha</label>
            <input 
              type="password"
              className={styles.input}
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
            />
          </div>
        </section>

        <section className={styles.buttonSection}>
          <button type="submit" className={`${styles.button} ${styles.saveButton}`} disabled={loading}>
            {loading ? 'Salvando...' : 'Salvar Alterações'}
          </button>
          <button type="button" onClick={() => logout()} className={`${styles.button} ${styles.logoutButton}`}>
            Sair
          </button>
        </section>
      </form>
    </main>
  );
};

export default ProfileScreen;