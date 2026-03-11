<<<<<<< HEAD
import { useEffect, useRef } from "react";

export default function VideoExplicativo3() {
  const videoRef = useRef(null);

  useEffect(() => {
    // Tenta iniciar o vídeo automaticamente ao carregar
    if (videoRef.current) {
      videoRef.current.play().catch((error) => {
        console.log("Autoplay bloqueado pelo navegador, aguardando clique:", error);
      });
    }
  }, []);

=======
import { useEffect, useRef, useState } from "react";

export default function VideoExplicativo() {
  const videoRef = useRef(null);
  const [mostrarBotaoSom, setMostrarBotaoSom] = useState(false);

  useEffect(() => {
    if (videoRef.current) {
      // Garante que o vídeo tente começar com o som ativado
      videoRef.current.muted = false;
      
      const playPromise = videoRef.current.play();

      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          console.log("Autoplay com som bloqueado pelo navegador. Iniciando mudo:", error);
          
          // Fallback: se bloqueou o som, silencia e tenta dar play de novo
          videoRef.current.muted = true;
          setMostrarBotaoSom(true); // Exibe o botão para o usuário habilitar o áudio
          
          videoRef.current.play().catch(err => {
            console.log("Autoplay totalmente bloqueado:", err);
          });
        });
      }
    }
  }, []);

  const ativarSom = () => {
    if (videoRef.current) {
      videoRef.current.muted = false;
      videoRef.current.currentTime = 0; // Opcional: reinicia o vídeo do começo com som
      setMostrarBotaoSom(false);
    }
  };

>>>>>>> homolog
  return (
    <div style={{ 
      width: '100vw', 
      height: '100vh', 
      backgroundColor: 'black', 
      display: 'flex', 
<<<<<<< HEAD
      flexDirection: 'column',
      justifyContent: 'center', 
      alignItems: 'center',
      margin: 0,
      padding: 0,
      overflow: 'hidden'
    }}>
      <video
  ref={videoRef}
  controls
  playsInline
  muted // Adicione isso temporariamente para testar
  style={{
    maxWidth: '100%',
    maxHeight: '100vh',
  }}
>
  <source src="/explicativo3.mp4" type="video/mp4" />
</video>
=======
      justifyContent: 'center', 
      alignItems: 'center',
      margin: 0,
      overflow: 'hidden',
      position: 'relative' // Necessário para o botão flutuar sobre o vídeo
    }}>
      <video
        ref={videoRef}
        controls
        playsInline
        // As propriedades autoPlay e muted foram removidas do HTML
        // pois agora o controle é feito via JavaScript no useEffect
        style={{
          maxWidth: '100%',
          maxHeight: '100vh',
          boxShadow: '0 0 20px rgba(0,0,0,0.5)'
        }}
      >
        <source src="/explicativo3.mp4" type="video/mp4" />
        Seu navegador não suporta a tag de vídeo.
      </video>

      {/* Botão flutuante que aparece apenas se o navegador bloquear o som */}
      {mostrarBotaoSom && (
        <button 
          onClick={ativarSom}
          style={{
            position: 'absolute',
            padding: '15px 30px',
            fontSize: '18px',
            backgroundColor: 'rgba(255, 0, 0, 0.85)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            zIndex: 10,
            boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
            fontWeight: 'bold'
          }}
        >
          🔊 Clique aqui para ouvir
        </button>
      )}
>>>>>>> homolog
    </div>
  );
}