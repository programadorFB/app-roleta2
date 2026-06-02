import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import VideoCarousel from '../../components/Strategy/VideoCarousel';
import VideoModal from '../../components/Strategy/VideoModal';
import './StrategyScreen.css';

// --- DADOS MOCK (Fora do componente para performance) ---
const assistidosRecentemente = [
  { id: 1, videoId: 'OLjw9H85LIE', title: 'Vídeo Épico 1', progress: 50 },
  { id: 2, videoId: '3JZ_D3ELwOQ', title: 'Destaque da Semana', progress: 30 },
  { id: 3, videoId: 'JGwWNGJdvx8', title: 'Lançamento', progress: 90 },
];

const minhaListaVideos = [
  { id: 1, videoId: 'dQw4w9WgXcQ', title: 'Vídeo Épico 1' },
  { id: 2, videoId: '3JZ_D3ELwOQ', title: 'Destaque da Semana' },
];

const emAltaVideos = [
  { id: 10, videoId: 'C0DPdy98e4c', title: 'Trailers 2025' },
  { id: 11, videoId: 'ScMzIvxBSi4', title: 'Música do Momento' },
  { id: 12, videoId: 'QkkoHAzjnUs', title: 'Documentário Natureza' },
  { id: 13, videoId: 'RzVvThldYes', title: 'Shorts Engraçados' },
  { id: 5, videoId: 'dQw4w9WgXcQ', title: 'Viral da Semana' },
];

const exclusivosVideos = [
  { id: 20, videoId: 'JGwWNGJdvx8', title: 'Conteúdo Exclusivo 1' },
  { id: 21, videoId: 'fNFzfwLM72c', title: 'Série Premium 2' },
  { id: 22, videoId: 'u31qwQUeGuM', title: 'Documentário Original' },
  { id: 23, videoId: 'C0DPdy98e4c', title: 'Feature Film' },
];

const recomendadosVideos = [
  { id: 30, videoId: 'ScMzIvxBSi4', title: 'Recomendado para Você 1' },
  { id: 31, videoId: 'QkkoHAzjnUs', title: 'Baseado no seu Histórico' },
  { id: 32, videoId: 'RzVvThldYes', title: 'Você Pode Gostar' },
  { id: 33, videoId: 'dQw4w9WgXcQ', title: 'Sugestão Premium' },
  { id: 34, videoId: '3JZ_D3ELwOQ', title: 'Trending Now' },
];

// Um "banco de dados" de todos os vídeos, mapeados por videoId
const allVideosMap = new Map();
[
  ...assistidosRecentemente, 
  ...minhaListaVideos, 
  ...emAltaVideos, 
  ...exclusivosVideos, 
  ...recomendadosVideos
].forEach(video => {
  if (!allVideosMap.has(video.videoId)) {
    allVideosMap.set(video.videoId, video);
  }
});


function StrategyScreen() { // Renomeado de 'Videos' para 'StrategyScreen'
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVideoId, setSelectedVideoId] = useState(null);

  // --- ESTADOS FUNCIONAIS ---
  // Tornando as listas 'assistidos' e 'minhaLista' gerenciáveis pelo React
  const [assistidos, setAssistidos] = useState(assistidosRecentemente);
  const [minhaLista, setMinhaLista] = useState(minhaListaVideos);

  const handleGoBack = () => {
    navigate(-1);
  };

  // --- LÓGICA DE FUNCIONALIDADES ---

  // 1. Assistido por Último
  const handleOpenModal = (videoId) => {
    setSelectedVideoId(videoId);
    
    // Procura o vídeo no nosso "banco de dados"
    const video = allVideosMap.get(videoId);
    if (video) {
      // Adiciona o vídeo à lista 'Assistidos por Último'
      setAssistidos(prevAssistidos => {
        // Remove o vídeo se ele já existir na lista
        const filteredList = prevAssistidos.filter(v => v.id !== video.id);
        // Adiciona o vídeo (sem progresso ou com progresso zerado) no início da lista
        return [{ ...video, progress: video.progress || 0 }, ...filteredList];
      });
    }
  };

  const handleCloseModal = () => {
    setSelectedVideoId(null);
  };

  // 2. Adicionar à Lista
  const handleAddToList = (videoToAdd) => {
    // Verifica se o vídeo já não está na lista antes de adicionar
    if (videoToAdd && !minhaLista.some(v => v.id === videoToAdd.id)) {
      setMinhaLista(prevList => [videoToAdd, ...prevList]);
    }
  };

  // 3. Remover da Lista
  const handleRemoveFromList = (videoToRemove) => {
    if (videoToRemove) {
      setMinhaLista(prevList => prevList.filter(v => v.id !== videoToRemove.id));
    }
  };

  // 4. Busca de Títulos
  // Usando useMemo para otimizar a filtragem (só re-calcula se as listas ou o searchTerm mudarem)
  const filteredLists = useMemo(() => {
    const filterVideos = (list) => {
      if (!searchTerm) return list;
      return list.filter(video =>
        video.title.toLowerCase().includes(searchTerm.toLowerCase())
      );
    };

    return {
      assistidos: filterVideos(assistidos),
      minhaLista: filterVideos(minhaLista),
      emAlta: filterVideos(emAltaVideos),
      exclusivos: filterVideos(exclusivosVideos),
      recomendados: filterVideos(recomendadosVideos),
    };
  }, [searchTerm, assistidos, minhaLista]);


  return (
    <div className="video-component-container">
      {/* Header Premium com Navegação */}
      <header className="streaming-header">
        <div className="header-left">
          <button className="back-button" onClick={handleGoBack}>
            <span className="back-button-icon">←</span>
            <span className="back-button-text" href="/dashboard">Voltar</span>
          </button>
          
          <div className="logo-premium">
            <span className="logo-text">ESTRATÉGIAS</span>
            <span className="logo-badge">HD</span>
          </div>
        </div>

        {/* Links do Menu */}
        <nav className="header-nav">
          <a href="#inicio" className="nav-link active">Início</a>
          <a href="#emocional" className="nav-link">Gerenciamento Emocional</a>
          <a href="#banca" className="nav-link">Gestão de banca</a>
          <a href="#react" className="nav-link">Reacts</a>
          <a href="#minha-lista" className="nav-link">Minha Lista</a>
        </nav>

        <div className="header-right">
          <div className="search-container">
            <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.35-4.35"></path>
            </svg>
            <input 
              type="text" 
              className="search-input" 
              placeholder="Buscar títulos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)} // Conectado ao estado
            />
          </div>
          
          <button className="notification-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
            <span className="notification-badge">3</span>
          </button>

   
        </div>
      </header>

      {/* Hero Banner Premium - Ligado ao #inicio */}
      <section className="hero-banner" id="inicio">
        <div className="hero-content">
          <div className="hero-badge">
            <span className="badge-new">NOVO</span>
            <span className="badge-quality">4K ULTRA HD</span>
          </div>
          <h1 className="hero-title">Conteúdo Exclusivo Premium</h1>
          <p className="hero-description">
            Descubra os melhores vídeos em qualidade premium. Entretenimento de alta qualidade 
            ao seu alcance, a qualquer momento.
          </p>
          <div className="hero-buttons">
            <button className="hero-btn primary" onClick={() => handleOpenModal('oYVsXboC_18')}>
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"></path>
              </svg>
              Assistir Agora
            </button>
            <button className="hero-btn secondary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
              Mais Informações
            </button>
          </div>
          <div className="hero-meta">
            <span className="meta-rating">⭐ 9.2</span>
            <span className="meta-year">2025</span>
            <span className="meta-duration">47:36min</span>
            <span className="meta-genre">Premium</span>
          </div>
        </div>
        <div className="hero-fade"></div>
      </section>

      {/* Seções de Conteúdo */}
      <div className="content-sections">
        
        {/* Assistidos Recentemente com Barra de Progresso */}
        <div className="section-with-icon">
          <div className="section-header">
            <svg className="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <h2 className="section-title">Assistidos por Último</h2>
          </div>
          <VideoCarousel 
            title="" 
            videos={filteredLists.assistidos} // Passando a lista filtrada
            showProgress={true} 
            onVideoClick={handleOpenModal} 
            // Props para Adicionar/Remover
            onAddToList={handleAddToList}
            onRemoveFromList={handleRemoveFromList}
            minhaLista={minhaLista}
          />
        </div>

        {/* Ligado ao #minha-lista */}
        <section id="minha-lista">
          <VideoCarousel 
            title="Minha Lista" 
            videos={filteredLists.minhaLista} // Passando a lista filtrada
            onVideoClick={handleOpenModal} 
            // Props para Adicionar/Remover
            onAddToList={handleAddToList}
            onRemoveFromList={handleRemoveFromList}
            minhaLista={minhaLista}
          />
        </section>
        
        {/* Ligado ao #react (mapeado para "Em Alta") */}
        <div className="section-with-icon" id="react">
          <div className="section-header">
            <svg className="section-icon trending" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path>
            </svg>
            <h2 className="section-title">Reacts</h2>
          </div>
          <VideoCarousel 
            title="" 
            videos={filteredLists.emAlta} // Passando a lista filtrada
            onVideoClick={handleOpenModal} 
            // Props para Adicionar/Remover
            onAddToList={handleAddToList}
            onRemoveFromList={handleRemoveFromList}
            minhaLista={minhaLista}
          />
        </div>

        {/* Ligado ao #banca (mapeado para "Exclusivos") */}
        <section id="banca">
          <VideoCarousel 
            title="Gerenciamento de Banca" 
            videos={filteredLists.exclusivos} // Passando a lista filtrada
            onVideoClick={handleOpenModal} 
            // Props para Adicionar/Remover
            onAddToList={handleAddToList}
            onRemoveFromList={handleRemoveFromList}
            minhaLista={minhaLista}
          />
        </section>

        {/* Ligado ao #emocional (mapeado para "Recomendados") */}
        <section id="emocional">
          <VideoCarousel 
            title="Gerenciamento Emocional" 
            videos={filteredLists.recomendados} // Passando a lista filtrada
            onVideoClick={handleOpenModal} 
            // Props para Adicionar/Remover
            onAddToList={handleAddToList}
            onRemoveFromList={handleRemoveFromList}
            minhaLista={minhaLista}
          />
        </section>
      </div>

      {/* Footer Premium */}
      <footer className="streaming-footer">
        <div className="footer-content">
          <div className="footer-links">
            <a href="#sobre">Sobre</a>
            <a href="#ajuda">Central de Ajuda</a>
            <a href="#termos">Termos de Uso</a>
            <a href="#privacidade">Privacidade</a>
            <a href="#contato">Contato</a>
          </div>
          <div className="footer-social">
            <a href="#" className="social-link">Facebook</a>
            <a href="" className="social-link">Instagram</a>
            <a href="#" className="social-link">Twitter</a>
            <a href="https://www.youtube.com/@fuzattoroleta" className="social-link">YouTube</a>
          </div>
          <p className="footer-copyright">© 2025 Premium Streaming. Todos os direitos reservados.</p>
        </div>
      </footer>

      {/* Modal de Vídeo */}
      <VideoModal videoId={selectedVideoId} onClose={handleCloseModal} />
    </div>
  );
}

export default StrategyScreen;