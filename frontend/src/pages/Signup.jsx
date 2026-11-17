import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import API from '../services/api';
import { saveSession } from '../services/session';
import { ShieldCheck, Eye, EyeOff, Lock, Mail, User, ArrowRight, ShieldAlert } from 'lucide-react';

function Signup({ setAuth }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSignup = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const response = await API.post('/auth/signup', { name: name.trim(), email: email.trim(), password });
      saveSession(response.data);
      setAuth('authenticated');
      navigate('/dashboard');
    } catch (err) {
      if (err.response) {
        setError(err.response.data?.message || 'Registration failed. Please try again.');
      } else if (err.request) {
        setError('Unable to reach registration server. Please check that the backend is running on port 5000.');
      } else {
        setError(err.message || 'Registration error. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-split-wrapper" style={{ display: 'flex', minHeight: '100vh', width: '100vw', backgroundColor: '#f8fafc' }}>
      {/* Left Brand Column */}
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
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', background: 'rgba(255, 255, 255, 0.08)', padding: '8px 16px', borderRadius: '30px', border: '1px solid rgba(255, 255, 255, 0.12)' }}>
            <ShieldCheck size={24} color="#34d399" />
            <span style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#ffffff' }}>DigSafeAI</span>
            <span style={{ fontSize: '0.75rem', background: '#10b981', color: '#072a1e', fontWeight: 700, padding: '2px 8px', borderRadius: '12px', textTransform: 'uppercase' }}>PRO</span>
          </div>
        </div>

        <div style={{ position: 'relative', zIndex: 1, maxWidth: '520px' }}>
          <h1 style={{ fontSize: '2.8rem', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.03em', marginBottom: '20px' }}>
            Join the Excavation Safety Network
          </h1>
          <p style={{ fontSize: '1.1rem', color: 'rgba(255, 255, 255, 0.8)', lineHeight: 1.6 }}>
            Equip your team with automated utility depth analysis, geospatial cross-matching, and certified multi-factor hazard scoring.
          </p>
        </div>

        <div style={{ position: 'relative', zIndex: 1, fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.5)' }}>
          © 2026 DigSafeAI Infrastructure Safety System. Built for Namma Bengaluru.
        </div>
      </div>

      {/* Right Form Column */}
      <div className="auth-form-column" style={{
        flex: '1',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px',
        backgroundColor: '#ffffff'
      }}>
        <div style={{ width: '100%', maxWidth: '420px' }}>
          <div style={{ marginBottom: '28px' }}>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', marginBottom: '8px' }}>
              Create Operator Account
            </h2>
            <p style={{ color: '#64748b', fontSize: '0.95rem', margin: 0 }}>
              Join the certified underground asset safety platform
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

          <form onSubmit={handleSignup}>
            <div className="form-group">
              <label>Full Name</label>
              <div style={{ position: 'relative' }}>
                <User size={18} color="#94a3b8" style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '14px' }} />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="form-control"
                  placeholder="Supervisor Name"
                  style={{ paddingLeft: '42px' }}
                />
              </div>
            </div>

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
              <label>Password (min 8 characters)</label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} color="#94a3b8" style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '14px' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="form-control"
                  placeholder="Create a strong password"
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

            <div className="form-group">
              <label>Confirm Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} color="#94a3b8" style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '14px' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="form-control"
                  placeholder="Repeat your password"
                  style={{ paddingLeft: '42px' }}
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn-primary"
              style={{ width: '100%', padding: '12px', fontSize: '0.95rem', marginTop: '10px' }}
              disabled={loading}
            >
              {loading ? 'Creating Account...' : 'Complete Registration'}
              {!loading && <ArrowRight size={18} />}
            </button>
          </form>

          <div style={{ marginTop: '24px', paddingTop: '18px', borderTop: '1px solid #f1f5f9', textAlign: 'center' }}>
            <p style={{ fontSize: '0.9rem', color: '#64748b', margin: 0 }}>
              Already registered?{' '}
              <Link to="/login" style={{ color: '#12523c', fontWeight: 700, textDecoration: 'none' }}>
                Sign In
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Signup;
