import React, { useState } from 'react';
import { getSessionValue } from '../services/session';
import { Settings as SettingsIcon, User, Bell, Map, Cpu, ShieldCheck, Check } from 'lucide-react';

function Settings() {
  const [notifications, setNotifications] = useState(localStorage.getItem('notifications') !== 'false');
  const [mapPref, setMapPref] = useState(localStorage.getItem('mapPref') || 'standard');
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  const [saveMessage, setSaveMessage] = useState('');
  const userName = getSessionValue('userName') || 'Operator';
  const userId = getSessionValue('userId');

  const saveSettings = () => {
    localStorage.setItem('notifications', notifications);
    localStorage.setItem('mapPref', mapPref);
    localStorage.setItem('theme', theme);
    setSaveMessage('Preferences successfully saved on this workstation.');
    setTimeout(() => setSaveMessage(''), 3500);
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '40px' }}>
      {/* Header Banner */}
      <div style={{
        background: '#ffffff',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: '24px 32px',
        marginBottom: '24px',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--brand-primary-600)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
            <SettingsIcon size={16} />
            <span>Operational Preferences</span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--brand-primary-900)', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
            System Settings & Operator Profile
          </h1>
          <p style={{ margin: 0, fontSize: '0.92rem', color: 'var(--text-muted)' }}>
            Configure local workstation preferences, notification alerts, and GIS telemetry display rules.
          </p>
        </div>

        <button onClick={saveSettings} className="btn-primary">
          <Check size={16} /> Save Settings
        </button>
      </div>

      {saveMessage && (
        <div style={{ padding: '12px 18px', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 'var(--radius-md)', color: '#166534', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', fontWeight: 600 }}>
          <Check size={18} />
          <span>{saveMessage}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {/* Profile Card */}
        <div className="panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'var(--brand-mint-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-primary-600)' }}>
              <User size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--brand-primary-900)' }}>Operator Profile</h3>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Authenticated workstation identity</span>
            </div>
          </div>
          <div style={{ background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', padding: '14px', fontSize: '0.86rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong style={{ color: 'var(--text-secondary)' }}>Full Name:</strong>
              <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{userName}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong style={{ color: 'var(--text-secondary)' }}>Operator Role:</strong>
              <span className="badge" style={{ background: 'var(--brand-mint-light)', color: 'var(--brand-primary-700)' }}>Field Safety Technician</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong style={{ color: 'var(--text-secondary)' }}>User ID:</strong>
              <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{userId || 'Active Token Session'}</span>
            </div>
          </div>
        </div>

        {/* Notifications Card */}
        <div className="panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#B45309' }}>
              <Bell size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--brand-primary-900)' }}>Hazard Alerts</h3>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Local safety warnings & strike prevention</span>
            </div>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '14px', lineHeight: 1.5 }}>
            Configure active visual alerts when calculated excavation hazard scores exceed safe excavation thresholds (&gt;65/100).
          </p>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, color: 'var(--brand-primary-900)' }}>
            <input
              type="checkbox"
              checked={notifications}
              onChange={(e) => setNotifications(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: 'var(--brand-primary-600)' }}
            />
            Display prominent alerts for CRITICAL HIGH risk strikes
          </label>
        </div>

        {/* Map Preferences */}
        <div className="panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#E0F2FE', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0369A1' }}>
              <Map size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--brand-primary-900)' }}>Geospatial Tile Layer</h3>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Base map rendering preference</span>
            </div>
          </div>
          <div className="form-group">
            <label>Cartography Provider</label>
            <select className="form-control" value={mapPref} onChange={(e) => setMapPref(e.target.value)}>
              <option value="standard">OpenStreetMap Standard Cartography (Active)</option>
              <option value="satellite" disabled>High-Resolution Satellite Ortho (Requires enterprise key)</option>
            </select>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Default geographic center: Bengaluru Urban District (12.9716°N, 77.5946°E).
          </div>
        </div>

        {/* Telemetry & ML Mode */}
        <div className="panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'var(--brand-mint-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-primary-600)' }}>
              <Cpu size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--brand-primary-900)' }}>Sensor &amp; ML Architecture</h3>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Inference engine configuration</span>
            </div>
          </div>
          <div style={{ background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', padding: '14px', fontSize: '0.86rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong style={{ color: 'var(--text-secondary)' }}>Telemetry Mode:</strong>
              <span className="badge-simulated">⚡ Subsurface Simulation</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong style={{ color: 'var(--text-secondary)' }}>Field Hardware:</strong>
              <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Virtual Environmental Sensor Bus</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong style={{ color: 'var(--text-secondary)' }}>Consensus Models:</strong>
              <span style={{ color: 'var(--brand-primary-600)', fontWeight: 700 }}>Random Forest + XGBoost + LightGBM</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Settings;
