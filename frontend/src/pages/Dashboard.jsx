import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../services/api';
import { getSessionValue } from '../services/session';
import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  PlusCircle,
  AlertTriangle,
  ShieldCheck,
  FileText,
  Database,
  ArrowRight,
  TrendingUp,
  MapPin,
  Activity,
  Layers,
  ChevronRight
} from 'lucide-react';

function Dashboard() {
  const navigate = useNavigate();
  const [reportStats, setReportStats] = useState({
    totalReports: 0,
    highRiskReports: 0,
    mediumRiskReports: 0,
    lowRiskReports: 0,
    recentReports: [],
  });
  const [utilityCounts, setUtilityCounts] = useState({ total: 0, water: 0, sewerage: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const userName = getSessionValue('userName') || 'Excavation Supervisor';

  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      try {
        const [statsRes, utilityRes] = await Promise.all([
          API.get('/reports/stats').catch(() => ({ data: null })),
          API.get('/utilities/summary').catch(() => ({ data: { groups: [] } }))
        ]);
        if (!active) return;
        if (statsRes && statsRes.data) {
          setReportStats({
            totalReports: statsRes.data.totalReports || 0,
            highRiskReports: statsRes.data.highRiskReports || 0,
            mediumRiskReports: statsRes.data.mediumRiskReports || 0,
            lowRiskReports: statsRes.data.lowRiskReports || 0,
            recentReports: Array.isArray(statsRes.data.recentReports) ? statsRes.data.recentReports : [],
          });
        }
        const groups = Array.isArray(utilityRes.data?.groups) ? utilityRes.data.groups : [];
        setUtilityCounts(groups.reduce((counts, group) => {
          counts.total += Number(group.count) || 0;
          if (group.utilityType === 'water') counts.water += Number(group.count) || 0;
          if (group.utilityType === 'sewerage') counts.sewerage += Number(group.count) || 0;
          return counts;
        }, { total: 0, water: 0, sewerage: 0 }));
        setError('');
      } catch (requestError) {
        if (active) setError(requestError.response?.data?.message || 'Unable to retrieve dashboard metrics.');
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchData();
    return () => { active = false; };
  }, [retryCount]);

  if (loading) {
    return (
      <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div className="skeleton" style={{ height: '120px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          <div className="skeleton" style={{ height: '100px' }} />
          <div className="skeleton" style={{ height: '100px' }} />
          <div className="skeleton" style={{ height: '100px' }} />
          <div className="skeleton" style={{ height: '100px' }} />
        </div>
        <div className="skeleton" style={{ height: '360px' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="workflow-message error-message" role="alert" style={{ maxWidth: '600px', margin: '40px auto' }}>
        <h4 style={{ margin: '0 0 6px 0', fontSize: '1rem' }}>Dashboard Loading Error</h4>
        <p style={{ margin: '0 0 14px 0', fontSize: '0.85rem' }}>{error}</p>
        <button className="btn-secondary" onClick={() => { setLoading(true); setError(''); setRetryCount(c => c + 1); }}>
          Retry Connection
        </button>
      </div>
    );
  }

  const highRiskAlerts = reportStats.recentReports.filter(r => r.riskLevel === 'HIGH');

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
      {/* Platform Banner */}
      <div style={{
        background: '#ffffff',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: '28px 32px',
        marginBottom: '24px',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '20px'
      }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--brand-primary-700)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
            <Activity size={14} color="var(--brand-emerald-500)" />
            <span>Namma Bengaluru Underground Infrastructure Platform</span>
          </div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--brand-primary-900)', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
            Operational Overview
          </h1>
          <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-muted)' }}>
            Signed in as <strong>{userName}</strong>. Continuous geospatial utility proximity screening and AI hazard scoring.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => navigate('/map-analysis')}
            className="btn-primary"
            style={{ padding: '11px 20px', fontSize: '0.9rem' }}
          >
            <PlusCircle size={18} /> Start New Assessment
          </button>
        </div>
      </div>

      {/* Primary 4-Metric Grid with Pixel-Perfect Alignment */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '20px',
        marginBottom: '24px'
      }}>
        {/* Total Assessments */}
        <div className="stat-card" style={{ height: '100%', minHeight: '150px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxSizing: 'border-box' }}>
          <div>
            <div className="stat-title">TOTAL ASSESSMENTS</div>
            <div className="stat-value">{reportStats.totalReports}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '10px', gap: '8px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: '1.2', flex: 1 }}>Persistent records</span>
            <span className="badge" style={{ background: '#f1f5f9', color: '#475569', fontSize: '0.68rem', padding: '3px 8px', flexShrink: 0 }}>DATABASE LOGS</span>
          </div>
        </div>

        {/* Critical High Risk */}
        <div className="stat-card" style={{ height: '100%', minHeight: '150px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxSizing: 'border-box', borderLeft: '4px solid var(--status-high-accent)' }}>
          <div>
            <div className="stat-title" style={{ color: 'var(--status-high-text)' }}>CRITICAL HIGH RISK</div>
            <div className="stat-value" style={{ color: 'var(--status-high-accent)' }}>{reportStats.highRiskReports}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '10px', gap: '8px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: '1.2', flex: 1 }}>Utility hazard</span>
            <span className="badge badge-HIGH" style={{ fontSize: '0.68rem', padding: '3px 8px', flexShrink: 0 }}>POTHOLING</span>
          </div>
        </div>

        {/* Controlled Medium Risk */}
        <div className="stat-card" style={{ height: '100%', minHeight: '150px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxSizing: 'border-box', borderLeft: '4px solid var(--status-medium-accent)' }}>
          <div>
            <div className="stat-title" style={{ color: 'var(--status-medium-text)' }}>CONTROLLED MEDIUM RISK</div>
            <div className="stat-value" style={{ color: 'var(--status-medium-accent)' }}>{reportStats.mediumRiskReports}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '10px', gap: '8px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: '1.2', flex: 1 }}>Caution zone</span>
            <span className="badge badge-MEDIUM" style={{ fontSize: '0.68rem', padding: '3px 8px', flexShrink: 0 }}>VIGILANCE</span>
          </div>
        </div>

        {/* Standard Low Risk */}
        <div className="stat-card" style={{ height: '100%', minHeight: '150px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxSizing: 'border-box', borderLeft: '4px solid var(--status-low-accent)' }}>
          <div>
            <div className="stat-title" style={{ color: 'var(--status-low-text)' }}>STANDARD LOW RISK</div>
            <div className="stat-value" style={{ color: 'var(--status-low-accent)' }}>{reportStats.lowRiskReports}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '10px', gap: '8px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: '1.2', flex: 1 }}>Safe clearance</span>
            <span className="badge badge-LOW" style={{ fontSize: '0.68rem', padding: '3px 8px', flexShrink: 0 }}>VERIFIED SAFE</span>
          </div>
        </div>
      </div>

      {/* Safety Alerts Banner (Only renders when high risk records exist) */}
      {highRiskAlerts.length > 0 && (
        <div style={{
          background: 'var(--status-high-bg)',
          border: '1px solid var(--status-high-border)',
          borderRadius: 'var(--radius-lg)',
          padding: '18px 24px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '16px'
        }}>
          <AlertTriangle size={24} color="var(--status-high-accent)" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ flex: 1 }}>
            <strong style={{ fontSize: '1rem', color: 'var(--status-high-text)' }}>
              Active Critical Hazard Alerts ({highRiskAlerts.length})
            </strong>
            <p style={{ margin: '4px 0 10px 0', fontSize: '0.85rem', color: '#7f1d1d' }}>
              The following excavation zones intersect or directly border critical high-pressure pipeline corridors. Hand exposure is mandatory before deployment of excavators:
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {highRiskAlerts.slice(0, 4).map((alert) => (
                <button
                  key={alert._id}
                  onClick={() => navigate(`/risk-result/${alert._id}`)}
                  style={{
                    background: '#ffffff',
                    border: '1px solid var(--status-high-border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '5px 12px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'var(--status-high-text)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <MapPin size={12} /> {alert.location} (Hazard: {alert.hazardScore})
                  <ArrowRight size={12} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Two-Column Operations Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(320px, 1.2fr)', gap: '24px' }}>
        {/* Left Column: Spatial Infrastructure Coverage */}
        <div className="panel" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 className="panel-title" style={{ fontSize: '1.05rem', margin: 0 }}>
                Bengaluru Subsurface Infrastructure Map
              </h2>
              <span className="panel-subtitle">OpenCity &amp; BWSSB validated pipeline vectors</span>
            </div>
            <span className="badge" style={{ background: 'var(--brand-emerald-50)', color: 'var(--brand-primary-800)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
              {utilityCounts.total.toLocaleString()} ASSETS MAPPED
            </span>
          </div>

          <div style={{ height: '380px', width: '100%', position: 'relative' }}>
            <MapContainer center={[12.9716, 77.5946]} zoom={12} style={{ height: '100%', width: '100%' }} zoomControl={true}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
            </MapContainer>
          </div>

          <div style={{ padding: '14px 24px', background: 'var(--bg-subtle)', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
            <span><strong>Water Mains:</strong> {utilityCounts.water.toLocaleString()} segments</span>
            <span><strong>Sewer Trunks:</strong> {utilityCounts.sewerage.toLocaleString()} segments</span>
            <span style={{ color: 'var(--text-muted)' }}>EPSG:4326 Projection</span>
          </div>
        </div>

        {/* Right Column: Recent Assessments & Fast Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Recent Assessments Card */}
          <div className="panel" style={{ margin: 0, flex: 1 }}>
            <div className="panel-header" style={{ marginBottom: '14px' }}>
              <div>
                <h3 className="panel-title" style={{ fontSize: '1.05rem', margin: 0 }}>
                  Recent Excavation Assessments
                </h3>
                <span className="panel-subtitle">Latest evaluated site records</span>
              </div>
              <button
                onClick={() => navigate('/reports')}
                className="btn-secondary"
                style={{ padding: '5px 12px', fontSize: '0.8rem', marginTop: 0 }}
              >
                View Archive
              </button>
            </div>

            {reportStats.recentReports.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {reportStats.recentReports.slice(0, 4).map((report) => (
                  <div
                    key={report._id}
                    onClick={() => navigate(`/risk-result/${report._id}`)}
                    style={{
                      padding: '12px 14px',
                      background: 'var(--bg-subtle)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '0.9rem', color: 'var(--brand-primary-900)' }}>
                        {report.location}
                      </strong>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Depth: {report.depth}m · Hazard: {report.hazardScore}/100 · {new Date(report.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <span className={`badge badge-${report.riskLevel}`}>{report.riskLevel}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '14px 0' }}>
                No excavation assessments recorded yet. Click Start New Assessment to evaluate a site.
              </p>
            )}
          </div>

          {/* Infrastructure Quick Tools */}
          <div className="panel" style={{ margin: 0 }}>
            <h3 className="panel-title" style={{ fontSize: '1.05rem', marginBottom: '12px' }}>
              Safety Navigation
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                className="btn-primary"
                onClick={() => navigate('/map-analysis')}
                style={{ width: '100%', justifyContent: 'flex-start' }}
              >
                <PlusCircle size={16} /> New Excavation Spatial Screening
              </button>
              <button
                className="btn-secondary"
                onClick={() => navigate('/reports')}
                style={{ width: '100%', justifyContent: 'flex-start' }}
              >
                <FileText size={16} /> Historical Safety Reports
              </button>
              <button
                className="btn-secondary"
                onClick={() => navigate('/data-sources')}
                style={{ width: '100%', justifyContent: 'flex-start' }}
              >
                <Database size={16} /> Inspect Mapped Utility Corridors
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
