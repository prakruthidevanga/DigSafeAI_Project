import React, { useEffect, useRef, useState } from 'react';
import { getSessionValue } from '../services/session';
import DigSafeLogo from './DigSafeLogo';
import { Bell, Menu, ShieldCheck, Activity } from 'lucide-react';

function Navbar({ toggleSidebar }) {
  const userName = getSessionValue('userName') || 'Operator';
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notificationRef = useRef(null);

  useEffect(() => {
    if (!isNotificationsOpen) return undefined;

    const handleOutsideClick = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setIsNotificationsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isNotificationsOpen]);

  return (
    <header className="navbar">
      <div className="navbar-leading">
        <button className="mobile-menu-btn" onClick={toggleSidebar} aria-label="Open navigation menu">
          <Menu size={22} />
        </button>
        <div className="navbar-system-title" style={{ gap: '10px' }}>
          <DigSafeLogo size={24} />
          <span>Namma Bengaluru Underground Infrastructure Monitoring</span>
          <span className="navbar-system-pill">GIS Connected</span>
        </div>
      </div>

      <div className="navbar-actions">
        {/* Status Pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#64748b' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
          <span>Multi-Model AI Active</span>
        </div>

        {/* Notifications Dropdown */}
        <div style={{ position: 'relative' }} ref={notificationRef}>
          <button
            type="button"
            aria-label="Open application notifications"
            aria-expanded={isNotificationsOpen}
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#475569',
              cursor: 'pointer'
            }}
          >
            <Bell size={18} />
          </button>

          {isNotificationsOpen && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '8px',
              width: '280px',
              background: '#ffffff',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              boxShadow: 'var(--shadow-md)',
              padding: '16px',
              zIndex: 1100
            }}>
              <strong style={{ fontSize: '0.85rem', color: '#0f172a', display: 'block', marginBottom: '8px' }}>
                Operational Status
              </strong>
              <div style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div>• All 3 risk prediction models operational.</div>
                <div>• Environmental sensor simulator connected.</div>
                <div>• BWSSB GIS line corridors loaded.</div>
              </div>
            </div>
          )}
        </div>

        {/* User Chip */}
        <div className="navbar-user-chip">
          <div className="navbar-user-avatar">
            {userName.charAt(0).toUpperCase()}
          </div>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
            {userName}
          </span>
        </div>
      </div>
    </header>
  );
}

export default Navbar;
