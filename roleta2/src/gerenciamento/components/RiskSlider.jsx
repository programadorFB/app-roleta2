import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { motion, useMotionValue, useTransform, useAnimation } from 'framer-motion';
import { FaShieldAlt, FaBalanceScale, FaFire } from 'react-icons/fa';
import styles from './RiskSlider.module.css';

// Configuração centralizada dos perfis
const PROFILES = [
  {
    maxValue: 3,
    title: 'Perfil Conservador',
    description: 'Prioriza a segurança e a preservação do capital.',
    icon: 'shield-alt',
    color: '#39db34ff',
    gradient: ['#80ff74ff', '#42db34ff'],
  },
  {
    maxValue: 7,
    title: 'Perfil Moderado',
    description: 'Busca um equilíbrio entre segurança e rentabilidade.',
    icon: 'balance-scale',
    color: '#f1c40f',
    gradient: ['#f5de7a', '#f1c40f'],
  },
  {
    maxValue: 10,
    title: 'Perfil Agressivo',
    description: 'Foco em maximizar ganhos, aceitando maior volatilidade.',
    icon: 'fire',
    color: '#e74c3c',
    gradient: ['#ff8a80', '#e74c3c'],
  },
];

const getProfileForValue = (value) => {
  if (value <= 3) return PROFILES[0];
  if (value <= 6) return PROFILES[1];
  return PROFILES[2];
};

const useResizeObserver = (ref) => {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => {
      if (entries[0]) setWidth(entries[0].contentRect.width);
    });
    observer.observe(element);
    return () => observer.unobserve(element);
  }, [ref]);
  return width;
};

const RiskSlider = ({ 
  value, 
  onValueChange, 
  min = 0, 
  max = 10, 
  compact = false, 
  containerStyle = {} 
}) => {
  const trackRef = useRef(null);
  const knobRef = useRef(null);
  const sliderWidth = useResizeObserver(trackRef);
  const [isDragging, setIsDragging] = useState(false); // ✅ NOVO: Controla se está arrastando

  const controls = useAnimation();
  const x = useMotionValue(0);
  const knobRadius = 20; // Metade do knob

  // Função para calcular valor baseada na posição visual
  const calculateValueFromX = useCallback((currentX) => {
    if (sliderWidth === 0) return min;
    const effectiveWidth = sliderWidth - (knobRadius * 2);
    // Remove o offset do raio para cálculo
    const adjustedX = currentX - knobRadius;
    const boundedX = Math.max(0, Math.min(adjustedX, effectiveWidth));
    const percent = boundedX / effectiveWidth;
    const newValue = Math.round(percent * (max - min) + min);
    return newValue;
  }, [sliderWidth, min, max]);
  
  // Função para calcular posição visual baseada no valor
  const calculateXFromValue = useCallback((val) => {
    if (sliderWidth > 0) {
      const effectiveWidth = sliderWidth - (knobRadius * 2);
      const percent = (val - min) / (max - min);
      return (percent * effectiveWidth) + knobRadius;
    }
    return 0;
  }, [sliderWidth, min, max]);

  // ✅ CORREÇÃO CRÍTICA: Só atualiza a posição via código se NÃO estiver arrastando
  useEffect(() => {
    if (!isDragging && sliderWidth > 0) {
      const newX = calculateXFromValue(value);
      x.set(newX);
    }
  }, [value, sliderWidth, isDragging, calculateXFromValue, x]);

  const fillWidth = useTransform(x, [0, sliderWidth], ['0%', '100%']);
  const currentProfile = useMemo(() => getProfileForValue(value), [value]);
  const { color, gradient, icon, title, description } = currentProfile;

  const handleDragStart = () => {
    setIsDragging(true); // Bloqueia atualizações externas
    controls.start({ scale: 1.1, cursor: 'grabbing' });
  };

  const handleDrag = () => {
    const newValue = calculateValueFromX(x.get());
    if (newValue !== value) {
      onValueChange(newValue);
    }
  };

  const handleDragEnd = () => {
    setIsDragging(false); // Libera atualizações externas
    const finalValue = calculateValueFromX(x.get());
    
    // Snap para a posição exata do inteiro mais próximo
    const snapX = calculateXFromValue(finalValue);
    
    // Anima o knob para a posição de snap
    controls.start({ 
      x: snapX, 
      scale: 1, 
      cursor: 'grab',
      transition: { type: 'spring', stiffness: 300, damping: 30 } 
    });
    
    // Garante que o valor final seja enviado
    onValueChange(finalValue);
  };

  const handleTrackClick = (event) => {
    if (isDragging) return; // Evita cliques acidentais ao arrastar
    if (trackRef.current) {
        const rect = trackRef.current.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        
        // Limita o clique dentro da área útil
        const effectiveX = Math.max(knobRadius, Math.min(clickX, sliderWidth - knobRadius));
        
        const newValue = calculateValueFromX(effectiveX);
        onValueChange(newValue);
        
        // Animação visual imediata para o clique
        const newX = calculateXFromValue(newValue);
        controls.start({ x: newX });
    }
  };

  // Previne que o clique no knob propague para o track
  const handleKnobClick = (e) => e.stopPropagation();

  return (
    <div className={`${styles.sliderContainer} ${compact ? styles.compactContainer : ''}`} style={containerStyle}>
      <SliderHeader compact={compact} profile={currentProfile} />
      {!compact && <SliderLabels value={value} />}

      <div className={`${styles.sliderWrapper} ${compact ? styles.compactSliderWrapper : ''}`}>
        {/* Âncora flutuante do ícone */}
        <motion.div className={styles.floatingIconAnchor} style={{ x }}>
          <div className={styles.floatingIconWrapper}>
            <div className={styles.iconBubble} style={{ borderColor: color, boxShadow: `0 4px 15px ${color}55` }}>
              <IconComponent iconName={icon} size={compact ? 14 : 18} />
              <span className={styles.iconValue} style={{ color }}>{value}</span>
            </div>
            <div className={styles.iconArrow} style={{ borderTopColor: color }} />
          </div>
        </motion.div>

        {/* Trilha */}
        <div ref={trackRef} className={styles.sliderTrack} onClick={handleTrackClick}>
          <motion.div 
            className={styles.sliderTrackFill} 
            style={{ 
              width: fillWidth, 
              background: `linear-gradient(to right, ${gradient[0]}, ${gradient[1]})` 
            }} 
          />
          
          {/* Knob */}
          <motion.div
            ref={knobRef}
            className={styles.sliderKnob}
            style={{ x }}
            drag="x"
            dragConstraints={trackRef}
            dragElastic={0} // Remove elasticidade para evitar que saia do trilho
            dragMomentum={false} // Remove inércia para parar onde soltar
            onDragStart={handleDragStart}
            onDrag={handleDrag}
            onDragEnd={handleDragEnd}
            onClick={handleKnobClick} 
            animate={controls}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
          >
            <div className={styles.knobCenter} style={{ background: color }} />
          </motion.div>
        </div>
      </div>

      <ScaleNumbers value={value} onValueChange={onValueChange} min={min} max={max} compact={compact} />
      {compact && <p className={styles.compactDescriptionText}>{description}</p>}
    </div>
  );
};

// --- Sub-componentes permanecem iguais ---
const SliderHeader = ({ compact, profile }) => (
  <div className={compact ? styles.compactHeader : styles.sliderHeader}>
    <h3 className={compact ? styles.compactTitle : styles.sliderTitle}>
      {compact ? "Perfil de Risco" : "Nível de Tolerância ao Risco"}
    </h3>
    <div className={compact ? styles.compactProfileDisplay : styles.currentProfileIndicator}>
      <IconComponent iconName={profile.icon} size={compact ? 16 : 20} color={profile.color} />
      <span style={{ color: profile.color }}>{profile.title}</span>
    </div>
  </div>
);

const SliderLabels = ({ value }) => (
  <div className={styles.sliderLabels}>
    {PROFILES.map((profile) => {
      const isActive = getProfileForValue(value).title === profile.title;
      return (
        <div key={profile.title} className={styles.labelContainer}>
          <IconComponent iconName={profile.icon} size={18} color={isActive ? profile.color : '#666'} />
          <span className={`${styles.sliderLabel} ${isActive ? styles.activeLabel : ''}`}>
            {profile.title.split(' ')[2]}
          </span>
        </div>
      );
    })}
  </div>
);

const ScaleNumbers = ({ value, onValueChange, min, max, compact }) => (
  <div className={`${styles.scaleNumbers} ${compact ? styles.compactScaleNumbers : ''}`}>
    {Array.from({ length: max - min + 1 }, (_, i) => min + i).map(i => (
      <button
        key={i}
        className={`${styles.scaleNumber} ${Math.round(value) === i ? styles.activeScaleNumber : ''} ${compact ? styles.compactScaleNumber : ''}`}
        onClick={() => onValueChange(i)}
      >
        {i}
      </button>
    ))}
  </div>
);

const IconComponent = ({ iconName, ...props }) => {
  if (iconName === 'shield-alt') return <FaShieldAlt {...props} />;
  if (iconName === 'balance-scale') return <FaBalanceScale {...props} />;
  if (iconName === 'fire') return <FaFire {...props} />;
  return null;
};

export default RiskSlider;