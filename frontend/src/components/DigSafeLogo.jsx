import React from 'react';

/**
 * DigSafeAI Official Shield Emblem Component
 * Renders the high-resolution cropped shield emblem from the official logo
 */
export function DigSafeLogo({ size = 34, className = '', style = {} }) {
  const s = typeof size === 'number' ? size : 34;

  return (
    <img
      src="/digsafe-shield-logo.png"
      alt="DigSafeAI Official Shield"
      width={s}
      height={s}
      className={className}
      style={{
        objectFit: 'contain',
        verticalAlign: 'middle',
        flexShrink: 0,
        filter: 'drop-shadow(0 2px 8px rgba(16, 185, 129, 0.35))',
        borderRadius: '6px',
        ...style
      }}
    />
  );
}

export default DigSafeLogo;
