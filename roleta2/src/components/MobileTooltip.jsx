// components/MobileTooltip.jsx

import React from 'react';

const MobileTooltip = ({ tooltip, onClose }) => {
  if (!tooltip.visible) return null;

  return (
    <>
      <div className="tooltip-backdrop" onClick={onClose} />
      <div 
        className="mobile-tooltip" 
        style={{ 
          position: 'fixed', 
          top: tooltip.y, 
          left: tooltip.x, 
          transform: tooltip.isBelow 
            ? 'translate(-50%, 0)' 
            : 'translate(-50%, -100%)', 
          zIndex: 2000 
        }}
      >
        {tooltip.content.split('\n').map((line, index) => (
          <span key={index} className="tooltip-line">{line}</span>
        ))}
      </div>
    </>
  );
};

export default MobileTooltip;