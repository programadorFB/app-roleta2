import { useEffect, useRef } from "react";

export default function VideoExplicativo() {
  const videoRef = useRef(null);

  useEffect(() => {
    // Tenta iniciar o vídeo automaticamente ao carregar
    if (videoRef.current) {
      videoRef.current.play().catch((error) => {
        console.log("Autoplay bloqueado pelo navegador, aguardando clique:", error);
      });
    }
  }, []);

  return (
    <div style={{ 
      width: '100vw', 
      height: '100vh', 
      backgroundColor: 'black', 
      display: 'flex', 
      flexDirection: 'column',
      justifyContent: 'center', 
      alignItems: 'center',
      margin: 0,
      padding: 0,
      overflow: 'hidden'
    }}>
      <video
        ref={videoRef}
        controls // Importante: permite ao usuário pausar/voltar
        playsInline
        style={{
          maxWidth: '100%',
          maxHeight: '100vh', // Garante que cabe na tela
          boxShadow: '0 0 20px rgba(0,0,0,0.5)'
        }}
      >
        {/* Como o arquivo está na pasta 'public', a barra '/' na frente é suficiente */}
        <source src="/explicativo.mp4" type="video/mp4" />
        Seu navegador não suporta a tag de vídeo.
      </video>
    </div>
  );
}