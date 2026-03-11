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
    </div>
  );
}