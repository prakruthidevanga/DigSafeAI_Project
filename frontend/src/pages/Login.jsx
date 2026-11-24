import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import API from '../services/api';
import { saveSession } from '../services/session';
import DigSafeLogo from '../components/DigSafeLogo';
import { ShieldCheck, Eye, EyeOff, Lock, Mail, ArrowRight, ShieldAlert, CheckCircle2, MapPin } from 'lucide-react';

function Login({ setAuth }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isWakingServer, setIsWakingServer] = useState(false);
  const navigate = useNavigate();

  // Pre-warm backend when Login screen mounts so container is ready when user clicks Sign In
  useEffect(() => {
    fetch('https://digsafeai-project.onrender.com/health', { mode: 'no-cors' }).catch(() => {});
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setIsWakingServer(false);
    setError('');

    const wakeTimer = setTimeout(() => {
      setIsWakingServer(true);
    }, 2200);

    try {
      const response = await API.post('/auth/login', { email: email.trim(), password });
      clearTimeout(wakeTimer);
      saveSession(response.data, rememberMe);
      setAuth('authenticated');
      navigate('/dashboard');
    } catch (err) {
      clearTimeout(wakeTimer);
      if (err.response) {
        // Backend responded with an HTTP status code (400, 401, 500, etc.)
        setError(err.response.data?.message || 'Invalid credentials. Please verify your email and password.');
      } else if (err.request) {
        // Request was made but no response was received (Network error, CORS block, or server cold-starting)
        setError('Connecting to cloud security server... Cloud instances take ~15-20 seconds to spin up from idle. Please retry in a few seconds.');
      } else {
        setError(err.message || 'Authentication error. Please try again.');
      }
    } finally {
      clearTimeout(wakeTimer);
      setLoading(false);
      setIsWakingServer(false);
    }
  };

  return (
    <div className="auth-split-wrapper" style={{ display: 'flex', minHeight: '100vh', width: '100vw', backgroundColor: '#f8fafc' }}>
      {/* Left Brand Showcase Column */}
      <div className="auth-brand-column" style={{
        flex: '1.2',
        background: 'linear-gradient(135deg, #072a1e 0%, #0d3b2b 60%, #12523c 100%)',
        color: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '60px 80px',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Subtle geometric background overlay */}
        <div style={{
          position: 'absolute',
          top: '-10%',
          right: '-10%',
          width: '500px',
          height: '500px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, transparent 70%)',
          pointerEvents: 'none'
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '16px',
            background: 'rgba(255, 255, 255, 0.08)',
            padding: '10px 22px',
            borderRadius: '30px',
            border: '1px solid rgba(255, 255, 255, 0.18)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)'
          }}>
            <DigSafeLogo size={42} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.4rem', fontWeight: 900, letterSpacing: '-0.02em', color: '#ffffff' }}>DigSafe<span style={{ color: '#34d399' }}>AI</span></span>
                <span style={{ fontSize: '0.68rem', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#ffffff', fontWeight: 800, padding: '2px 8px', borderRadius: '12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>PRO</span>
              </div>
              <span style={{ fontSize: '0.68rem', color: '#a7f3d0', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Assess • Prevent • Build Safely</span>
            </div>
          </div>
        </div>

        <div style={{ position: 'relative', zIndex: 1, maxWidth: '520px' }}>
          <h1 style={{ fontSize: '2.8rem', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.03em', marginBottom: '20px' }}>
            Underground Infrastructure Safety & AI Risk Screening
          </h1>
          <p style={{ fontSize: '1.1rem', color: 'rgba(255, 255, 255, 0.8)', lineHeight: 1.6, marginBottom: '32px' }}>
            Empowering excavation engineers and civil teams with spatial utility correlation, environmental sensor simulation, and certified multi-factor hazard scoring.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.95rem', color: 'rgba(255, 255, 255, 0.9)' }}>
              <CheckCircle2 size={18} color="#34d399" />
              <span>Real-time spatial proximity to BWSSB water & sewer corridors</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.95rem', color: 'rgba(255, 255, 255, 0.9)' }}>
              <CheckCircle2 size={18} color="#34d399" />
              <span>6-channel simulated environmental telemetry integration</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.95rem', color: 'rgba(255, 255, 255, 0.9)' }}>
              <CheckCircle2 size={18} color="#34d399" />
              <span>Safety-first multi-model machine learning consensus</span>
            </div>
          </div>
        </div>

        <div style={{ position: 'relative', zIndex: 1, fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.5)' }}>
          © 2026 DigSafeAI Infrastructure Safety System. Built for Namma Bengaluru.
        </div>
      </div>

      {/* Right Login Form Column */}
      <div className="auth-form-column" style={{
        flex: '1',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px',
        backgroundColor: '#ffffff'
      }}>
        <div style={{ width: '100%', maxWidth: '420px' }}>
          {/* Official Banner Image Placed Directly Above Sign In */}
          <div style={{
            marginBottom: '24px',
            borderRadius: '12px',
            overflow: 'hidden',
            border: '1px solid #e2e8f0',
            boxShadow: '0 4px 16px rgba(10, 17, 40, 0.08)'
          }}>
            <img
              src="/digsafe-banner-official.png"
              alt="DigSafeAI Official Platform Banner"
              style={{
                width: '100%',
                height: 'auto',
                display: 'block',
                objectFit: 'contain'
              }}
            />
          </div>

          <div style={{ marginBottom: '28px' }}>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', marginBottom: '8px' }}>
              Sign in to platform
            </h2>
            <p style={{ color: '#64748b', fontSize: '0.95rem', margin: 0 }}>
              Access site risk assessments and utility telemetry
            </p>
          </div>

          {error && (
            <div style={{
              padding: '12px 16px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              color: '#b91c1c',
              fontSize: '0.85rem',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <ShieldAlert size={18} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label>Work Email</label>
              <div style={{ position: 'relative' }}>
                <Mail size={18} color="#94a3b8" style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '14px' }} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="form-control"
                  placeholder="engineer@bengaluru.org"
                  style={{ paddingLeft: '42px' }}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} color="#94a3b8" style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '14px' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="form-control"
                  placeholder="Enter your password"
                  style={{ paddingLeft: '42px', paddingRight: '42px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    right: '12px',
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: '4px'
                  }}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#475569', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                Remember this device
              </label>
            </div>

            <button
              type="submit"
              className="btn-primary"
              style={{ width: '100%', padding: '12px', fontSize: '0.95rem' }}
              disabled={loading}
            >
              {loading ? 'Authenticating...' : 'Sign In to Workspace'}
              {!loading && <ArrowRight size={18} />}
            </button>

            {isWakingServer && (
              <div style={{
                marginTop: '14px',
                padding: '10px 14px',
                backgroundColor: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '8px',
                color: '#15803d',
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                lineHeight: 1.4
              }}>
                <span style={{ fontSize: '1rem' }}>⚡</span>
                <span>Connecting to cloud security server (waking container)... Ready in a moment!</span>
              </div>
            )}
          </form>

          <div style={{ marginTop: '28px', paddingTop: '20px', borderTop: '1px solid #f1f5f9', textAlign: 'center' }}>
            <p style={{ fontSize: '0.9rem', color: '#64748b', margin: 0 }}>
              Need new operator credentials?{' '}
              <Link to="/signup" style={{ color: '#12523c', fontWeight: 700, textDecoration: 'none' }}>
                Register Account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
