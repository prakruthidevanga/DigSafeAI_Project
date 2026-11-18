import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import API from '../services/api';
import {
  Printer,
  ArrowLeft,
  AlertTriangle,
  ShieldCheck,
  MapPin,
  Info,
  Layers,
  ChevronDown,
  ChevronUp,
  Activity,
  FileText,
  PlusCircle,
  ExternalLink,
  CheckCircle2,
  Clock,
  Compass
} from 'lucide-react';

function RiskResult() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  useEffect(() => {
    const fetchResult = async () => {
      try {
        const res = await API.get(`/reports/${id}`);
        setResult(res.data);
      } catch (err) {
        console.error("Error fetching result", err);
        if (err.response?.status === 401) {
          setError('Your session has expired. Please log in again.');
        } else if (err.response?.status === 404) {
          setError('Risk result not found in database.');
        } else {
          setError('Unable to load the safety evaluation record.');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchResult();
  }, [id]);

  if (loading) return <div className="page-state" style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>Retrieving certified safety evaluation record...</div>;
  if (error) return <div className="page-state error-message" role="alert" style={{ maxWidth: '600px', margin: '40px auto' }}>{error}</div>;
  if (!result) return <div className="page-state" style={{ padding: '60px 20px', textAlign: 'center' }}>Evaluation record not found.</div>;

  const riskLevel = (result.riskLevel || 'UNKNOWN').toUpperCase();
  const riskColor = riskLevel === 'HIGH' ? '#DC2626' : riskLevel === 'MEDIUM' ? '#D97706' : '#16845B';
  const riskBg = riskLevel === 'HIGH' ? '#FEF2F2' : riskLevel === 'MEDIUM' ? '#FFFBEB' : '#F0FDF4';
  const riskBorder = riskLevel === 'HIGH' ? '#FCA5A5' : riskLevel === 'MEDIUM' ? '#FDE68A' : '#BBF7D0';
  const nearbyUtilities = Array.isArray(result.nearbyUtilities) ? result.nearbyUtilities : [];
  const models = result.models || {};
  const sensors = result.sensorInformation || {};

  const handlePrintPdf = () => {
    window.print();
  };

  return (
    <div style={{ maxWidth: '1120px', margin: '0 auto', paddingBottom: '48px' }}>
        {/* Top Action Breadcrumb Bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <button
            onClick={() => navigate('/reports')}
            className="btn-secondary"
            style={{ padding: '8px 16px', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <ArrowLeft size={16} /> Back to All Reports
          </button>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              className="btn-secondary"
              onClick={() => navigate('/reports')}
              style={{ padding: '8px 16px', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '8px', borderColor: 'var(--brand-primary-600)', color: 'var(--brand-primary-700)' }}
            >
              <FileText size={16} color="var(--brand-primary-600)" /> View In Reports Log
            </button>
            <button
              className="btn-secondary"
              onClick={handlePrintPdf}
              style={{ padding: '8px 18px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              <Printer size={16} /> Print / Save as PDF
            </button>
            <button
              className="btn-primary"
              onClick={() => navigate('/map-analysis')}
              style={{ padding: '8px 18px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              <PlusCircle size={16} /> Start New Assessment
            </button>
          </div>
        </div>

      {/* Main Assessment Document Paper */}
      <div className="panel" style={{
        background: '#FFFFFF',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-subtle)',
        padding: '32px',
        borderTop: `6px solid ${riskColor}`,
        boxShadow: 'var(--shadow-md)'
      }}>

        {/* Executive Score & Location Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: riskBg,
          border: `1px solid ${riskBorder}`,
          borderRadius: 'var(--radius-md)',
          padding: '24px 28px',
          marginBottom: '28px',
          flexWrap: 'wrap',
          gap: '24px'
        }}>
          <div>
            <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', fontWeight: 700 }}>
              Overall Excavation Hazard Level
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px', marginTop: '6px' }}>
              <span style={{ fontSize: '3.2rem', fontWeight: 800, color: riskColor, lineHeight: 1, letterSpacing: '-0.03em' }}>
                {result.hazardScore !== undefined ? result.hazardScore : 50}
              </span>
              <span style={{ fontSize: '1.25rem', color: 'var(--text-muted)', fontWeight: 600 }}>/ 100</span>
              <span className={`badge badge-${riskLevel}`} style={{ fontSize: '0.95rem', padding: '6px 16px', fontWeight: 800 }}>
                {riskLevel} RISK
              </span>
            </div>
          </div>

          <div style={{ textAlign: 'right', minWidth: '220px' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em' }}>
              Excavation Site Record
            </div>
            <div style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--brand-primary-900)', marginTop: '4px' }}>
              {result.location}
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
              <Compass size={14} color="var(--brand-primary-600)" />
              <span>Coords: {Number(result.latitude).toFixed(5)}, {Number(result.longitude).toFixed(5)}</span>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '3px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
              <Clock size={13} />
              <span>Assessed: {new Date(result.createdAt).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Critical High Risk Warning Callout */}
        {riskLevel === 'HIGH' && (
          <div style={{
            background: '#FEF2F2',
            borderLeft: '5px solid #DC2626',
            border: '1px solid #FCA5A5',
            padding: '16px 20px',
            borderRadius: 'var(--radius-md)',
            marginBottom: '28px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '14px',
            color: '#991B1B'
          }}>
            <AlertTriangle size={24} color="#DC2626" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong style={{ fontSize: '1rem', letterSpacing: '-0.01em' }}>CRITICAL UTILITY STRIKE HAZARD DETECTED:</strong>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.88rem', lineHeight: 1.5, color: '#7F1D1D' }}>
                Mechanical trenching without non-destructive physical exposure carries severe risk of penetrating active high-capacity utility infrastructure. Hand potholing and agency on-site verification are mandatory before operating excavators.
              </p>
            </div>
          </div>
        )}

        {/* Required Field Safety Precautions */}
        <div style={{ marginBottom: '28px', background: '#FFFFFF', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '22px 24px' }}>
          <h4 style={{ margin: '0 0 14px 0', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--brand-primary-900)', fontSize: '1.05rem', fontWeight: 700 }}>
            <ShieldCheck size={22} color="var(--brand-primary-600)" />
            Required Field Safety Precautions
          </h4>
          <ul style={{ margin: 0, paddingLeft: '22px', lineHeight: 1.65, fontSize: '0.9rem' }}>
            {Array.isArray(result.safetyRecommendations) && result.safetyRecommendations.length > 0 ? (
              result.safetyRecommendations.map((rec, idx) => (
                <li key={idx} style={{ marginBottom: '8px', fontWeight: idx === 0 ? 600 : 400, color: idx === 0 && riskLevel === 'HIGH' ? '#DC2626' : 'var(--text-main)' }}>
                  {rec}
                </li>
              ))
            ) : (
              <li style={{ color: 'var(--text-secondary)' }}>Exercise standard subsurface vigilance; maintain visual observation for unmapped conduits.</li>
            )}
          </ul>
        </div>

        {/* Key Excavation Parameters 4-Box Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '28px' }}>
          <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '16px 18px' }}>
            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>EXCAVATION DEPTH</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--brand-primary-900)', marginTop: '4px' }}>
              {result.depth} <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>meters</span>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Planned target pit depth</div>
          </div>

          <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '16px 18px' }}>
            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>SEARCH ZONE RADIUS</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--brand-primary-900)', marginTop: '4px' }}>
              {result.radius} <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>meters</span>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Spatial corridor buffer</div>
          </div>

          <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '16px 18px' }}>
            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>CLOSEST CONFIRMED ASSET</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0369A1', marginTop: '4px' }}>
              {nearbyUtilities.length > 0 ? `${nearbyUtilities[0].distance}m` : 'None in radius'}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              {nearbyUtilities.length > 0 ? `${nearbyUtilities[0].source || 'BWSSB'} ${nearbyUtilities[0].utilityType}` : 'No verified GIS records in radius'}
            </div>
          </div>

          <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '16px 18px' }}>
            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>TELEMETRY MODE</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--brand-primary-900)', marginTop: '4px' }}>
              Software Simulated
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              6 synchronized sensor channels
            </div>
          </div>
        </div>

        {/* Contributing Hazard Factors */}
        {Array.isArray(result.contributingFactors) && result.contributingFactors.length > 0 && (
          <div style={{ marginBottom: '28px', background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '20px 24px' }}>
            <h4 style={{ margin: '0 0 10px 0', color: 'var(--brand-primary-900)', fontSize: '0.98rem', fontWeight: 700 }}>Primary Risk Contributing Factors</h4>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {result.contributingFactors.map((f, i) => (
                <li key={i} style={{ marginBottom: '4px' }}>{f}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Mapped Utilities & Environmental Telemetry Details */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', marginBottom: '28px' }}>
          {/* Mapped Utilities List */}
          <div style={{ background: '#FFFFFF', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h4 style={{ margin: 0, color: 'var(--brand-primary-900)', fontSize: '0.98rem', fontWeight: 700 }}>
                Nearby Mapped Infrastructure ({nearbyUtilities.length})
              </h4>
              <span className="badge" style={{ background: '#E0F2FE', color: '#0369A1' }}>BWSSB GIS</span>
            </div>

            {nearbyUtilities.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
                {nearbyUtilities.slice(0, 10).map((u, i) => (
                  <div key={i} style={{ padding: '10px 12px', background: 'var(--bg-subtle)', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '0.86rem', color: 'var(--brand-primary-900)' }}>
                        {u.utilityType === 'water' ? '💧 Water Main Corridor' : u.utilityType === 'sewerage' ? '🪨 Sewer Trunk Line' : '⚡ Buried Infrastructure'}
                      </strong>
                      <span style={{ color: '#0369A1', fontWeight: 700, fontSize: '0.85rem' }}>{u.distance} m away</span>
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Source: {u.source || 'BWSSB'} Spatial Dataset {u.recordedDiameter ? `· Diameter: ${u.recordedDiameter}mm` : ''}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', margin: 0 }}>
                No mapped utilities recorded within search radius. Dataset coverage warnings apply.
              </p>
            )}
          </div>

          {/* 6 Simulated Sensor Readings */}
          <div style={{ background: '#FFFFFF', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h4 style={{ margin: 0, color: 'var(--brand-primary-900)', fontSize: '0.98rem', fontWeight: 700 }}>
                Subsurface Environmental Telemetry
              </h4>
              <span className="badge-simulated">SIMULATED</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
              <div style={{ padding: '10px 12px', background: 'var(--bg-subtle)', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block' }}>Surface Vibration</span>
                <strong style={{ fontSize: '1.05rem', color: 'var(--brand-primary-900)' }}>
                  {Number(sensors.vibration ?? 0.2).toFixed(2)} Index
                </strong>
              </div>

              <div style={{ padding: '10px 12px', background: 'var(--bg-subtle)', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block' }}>Acoustic Noise</span>
                <strong style={{ fontSize: '1.05rem', color: 'var(--brand-primary-900)' }}>
                  {Number(sensors.acousticLevel ?? 0.15).toFixed(2)} Index
                </strong>
              </div>

              <div style={{ padding: '10px 12px', background: 'var(--bg-subtle)', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block' }}>Soil Moisture</span>
                <strong style={{ fontSize: '1.05rem', color: 'var(--brand-primary-900)' }}>
                  {((Number(sensors.soilMoisture ?? sensors.soilCondition ?? 0.3)) * 100).toFixed(0)}%
                </strong>
              </div>

              <div style={{ padding: '10px 12px', background: 'var(--bg-subtle)', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block' }}>Soil Temperature</span>
                <strong style={{ fontSize: '1.05rem', color: 'var(--brand-primary-900)' }}>
                  {Number(sensors.soilTemperature ?? 24.5).toFixed(1)}°C
                </strong>
              </div>

              <div style={{ padding: '10px 12px', background: 'var(--bg-subtle)', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block' }}>Gas Detection</span>
                <strong style={{ fontSize: '1.05rem', color: 'var(--brand-primary-900)' }}>
                  {Number(sensors.gasReading ?? 0.05).toFixed(2)} Index
                </strong>
              </div>

              <div style={{ padding: '10px 12px', background: 'var(--bg-subtle)', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block' }}>Ground Movement</span>
                <strong style={{ fontSize: '1.05rem', color: 'var(--brand-primary-900)' }}>
                  {Number(sensors.groundMovement ?? 0.4).toFixed(1)} mm
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Action Footer: Convenient Access to Reports & Next Actions */}
        <div style={{
          marginTop: '32px',
          paddingTop: '24px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
            <CheckCircle2 size={16} color="var(--brand-emerald-500)" />
            <span>Assessment permanently logged and indexed under <strong>ID: {result._id}</strong></span>
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => navigate('/reports')}
              style={{ padding: '9px 20px', fontSize: '0.88rem', display: 'inline-flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}
            >
              <FileText size={16} /> Go to Reports Archive
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => navigate('/map-analysis')}
              style={{ padding: '9px 22px', fontSize: '0.88rem', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              <PlusCircle size={16} /> New Assessment
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RiskResult;
