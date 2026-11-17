import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { clearSession, getSessionValue } from '../services/session';
import DigSafeLogo from './DigSafeLogo';
import {
  LayoutDashboard,
  Map,
  ShieldCheck,
  FileText,
  Database,
  Settings,
  Info,
  LogOut,
  X,
  ExternalLink
} from 'lucide-react';

function Sidebar({ setIsAuthenticated, isOpen, closeSidebar }) {
  const navigate = useNavigate();
  const userName = getSessionValue('userName') || 'Operator';

  const handleLogout = () => {
    clearSession();
    setIsAuthenticated('unauthenticated');
    navigate('/login');
  };

  const handleLinkClick = () => {
    if (window.innerWidth <= 768) {
      closeSidebar();
    }
  };

  return (
    <div className={`sidebar ${isOpen ? 'open' : ''}`}>
      {/* Brand Header */}
      <div className="sidebar-header">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="sidebar-brand-badge" style={{ gap: '12px' }}>
            <DigSafeLogo size={32} />
            <span>DigSafe<span style={{ color: '#34d399' }}>AI</span></span>
          </div>
          <span className="sidebar-subtext">Infrastructure Safety</span>
        </div>
        <button className="mobile-close-btn" onClick={closeSidebar} aria-label="Close navigation sidebar">
          <X size={22} color="white" />
        </button>
      </div>

      {/* Main Navigation Links */}
      <div className="sidebar-links">
        <div style={{ padding: '4px 14px', fontSize: '0.7rem', fontWeight: 700, color: 'rgba(255, 255, 255, 0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Workspace
        </div>

        <NavLink to="/dashboard" onClick={handleLinkClick} className={({ isActive }) => isActive ? "sidebar-link active" : "sidebar-link"}>
          <LayoutDashboard size={18} />
          <span>Dashboard</span>
        </NavLink>

        <NavLink to="/map-analysis" onClick={handleLinkClick} className={({ isActive }) => isActive ? "sidebar-link active" : "sidebar-link"}>
          <Map size={18} />
          <span>Map & Analysis</span>
        </NavLink>

        <NavLink to="/reports" onClick={handleLinkClick} className={({ isActive }) => isActive ? "sidebar-link active" : "sidebar-link"}>
          <FileText size={18} />
          <span>Reports Archive</span>
        </NavLink>

        <div style={{ padding: '16px 14px 4px', fontSize: '0.7rem', fontWeight: 700, color: 'rgba(255, 255, 255, 0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Infrastructure Data
        </div>

        <NavLink to="/data-sources" onClick={handleLinkClick} className={({ isActive }) => isActive ? "sidebar-link active" : "sidebar-link"}>
          <Database size={18} />
          <span>GIS Data Sources</span>
        </NavLink>

        <NavLink to="/settings" onClick={handleLinkClick} className={({ isActive }) => isActive ? "sidebar-link active" : "sidebar-link"}>
          <Settings size={18} />
          <span>System Settings</span>
        </NavLink>

        <NavLink to="/about" onClick={handleLinkClick} className={({ isActive }) => isActive ? "sidebar-link active" : "sidebar-link"}>
          <Info size={18} />
          <span>About & Documentation</span>
        </NavLink>
      </div>

      {/* Sidebar Footer with Active Operator */}
      <div className="sidebar-footer">
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(0, 0, 0, 0.2)',
          padding: '10px 12px',
          borderRadius: '8px',
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: '#10b981',
              color: '#072a1e',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '0.85rem'
            }}>
              {userName.charAt(0).toUpperCase()}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ffffff', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                {userName}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#34d399', fontWeight: 500 }}>
                Active Operator
              </div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.6)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              transition: 'color 0.15s ease'
            }}
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default Sidebar;
