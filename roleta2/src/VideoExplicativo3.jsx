import { useEffect, useRef } from "react";
// Importe o arquivo de vídeo (ajuste o caminho de acordo com a sua estrutura real)
import videoSrc from './assets/explicativo3.mp4'; 

export default function VideoExplicativo() {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play().catch((error) => {
        console.log("Autoplay bloqueado:", error);
      });
    }
  }, []);

  return (
    <div style={{ 
      width: '100vw', 
      height: '100vh', 
      backgroundColor: 'black', 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center',
      margin: 0,
      overflow: 'hidden'
    }}>
      <video
        ref={videoRef}
        controls
        playsInline
        autoPlay 
        muted    
        style={{
          maxWidth: '100%',
          maxHeight: '100vh',
          boxShadow: '0 0 20px rgba(0,0,0,0.5)'
        }}
      >
        {/* Usando a variável importada no src */}
        <source src={videoSrc} type="video/mp4" />
        Seu navegador não suporta a tag de vídeo.
      </video>
    </div>
  );
}