import React, { useState, useEffect } from 'react';
import DigSafeLogo from './DigSafeLogo';

/**
 * High-End Simulated 0% to 100% Application Startup Loader
 * Features:
 * - Real numerical progress counter (0% -> 100%)
 * - Smooth step increments imitating modern enterprise system initialization
 * - Dynamic stage captions (Validating credentials, connecting GIS, initializing ML consensus)
 * - Centered high-resolution shield logo with emerald halo glow
 */
export function AppLoadingScreen({ onFinished, customMessage }) {
  const [percent, setPercent] = useState(0);
  const [stage, setStage] = useState('Initializing DigSafeAI Safety Engine...');

  useEffect(() => {
    const interval = setInterval(() => {
      setPercent((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          if (onFinished) {
            setTimeout(onFinished, 200);
          }
          return 100;
        }

        // Realistic variable increments (slower, smoother loading)
        let increment = 2;
        if (prev < 30) increment = 3;
        else if (prev < 70) increment = 2;
        else if (prev < 90) increment = 1;
        else increment = 2;

        const nextVal = Math.min(100, prev + increment);

        // Update technical status captions
        if (nextVal < 25) {
          setStage('Loading Namma Bengaluru GIS Assets...');
        } else if (nextVal < 55) {
          setStage('Connecting BWSSB Water & Sewerage Infrastructure...');
        } else if (nextVal < 80) {
          setStage('Calibrating Subsurface Sensor Simulation...');
        } else if (nextVal < 98) {
          setStage('Synchronizing Multi-Model AI Safety Consensus...');
        } else {
          setStage('Platform Ready. Accessing Secure Session...');
        }

        return nextVal;
      });
    }, 38); // ~2.2 seconds total smooth experience

    return () => clearInterval(interval);
  }, [onFinished]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        width: '100vw',
        background: 'linear-gradient(135deg, #0A1128 0%, #0D1B2A 60%, #132438 100%)',
        color: '#ffffff',
        fontFamily: "'Inter', -apple-system, sans-serif",
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 99999
      }}
    >
      {/* Centered High-Resolution Official Shield Emblem with Glow */}
      <div
        style={{
          position: 'relative',
          padding: '24px',
          borderRadius: '24px',
          background: 'rgba(255, 255, 255, 0.08)',
          border: '1px solid rgba(255, 255, 255, 0.18)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5), 0 0 40px rgba(16, 185, 129, 0.3)',
          backdropFilter: 'blur(16px)',
          marginBottom: '28px'
        }}
      >
        <DigSafeLogo size={76} />
      </div>

      {/* Brand Title */}
      <h2
        style={{
          fontSize: '1.9rem',
          fontWeight: 900,
          letterSpacing: '-0.02em',
          margin: '0 0 6px 0',
          color: '#ffffff'
        }}
      >
        DigSafe<span style={{ color: '#34d399' }}>AI</span>
      </h2>

      <p
        style={{
          fontSize: '0.8rem',
          color: '#a7f3d0',
          margin: '0 0 28px 0',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          fontWeight: 700
        }}
      >
        Assess • Prevent • Build Safely
      </p>

      {/* Outer Progress Track */}
      <div
        style={{
          width: '280px',
          height: '6px',
          background: 'rgba(255, 255, 255, 0.12)',
          borderRadius: '6px',
          overflow: 'hidden',
          position: 'relative',
          marginBottom: '14px',
          boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.4)'
        }}
      >
        {/* Active Animated Fill Bar */}
        <div
          style={{
            height: '100%',
            width: `${percent}%`,
            background: 'linear-gradient(90deg, #10B981 0%, #34D399 70%, #6EE7B7 100%)',
            borderRadius: '6px',
            boxShadow: '0 0 12px #34D399',
            transition: 'width 0.05s ease-out'
          }}
        />
      </div>

      {/* Numerical Percentage Counter */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          width: '280px',
          fontSize: '0.82rem',
          color: 'rgba(255, 255, 255, 0.8)',
          fontWeight: 600,
          marginBottom: '10px'
        }}
      >
        <span style={{ color: '#34d399' }}>{percent}% Complete</span>
        <span style={{ color: '#94a3b8' }}>v2.4 Production</span>
      </div>

      {/* Informative Step Stage */}
      <span
        style={{
          fontSize: '0.82rem',
          color: 'rgba(255, 255, 255, 0.65)',
          minHeight: '20px',
          textAlign: 'center',
          maxWidth: '340px'
        }}
      >
        {customMessage || stage}
      </span>
    </div>
  );
}

export default AppLoadingScreen;
