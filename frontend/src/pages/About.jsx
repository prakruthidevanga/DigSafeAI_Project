import React from 'react';
import { ShieldCheck, Info, MapPin, Activity, Cpu, AlertTriangle, Layers, BookOpen, CheckCircle2 } from 'lucide-react';

function About() {
  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto', paddingBottom: '40px' }}>
      {/* Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #123B2A 0%, #154532 50%, #16845B 100%)',
        color: '#FFFFFF',
        borderRadius: 'var(--radius-lg)',
        padding: '36px 40px',
        marginBottom: '28px',
        boxShadow: 'var(--shadow-md)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(255, 255, 255, 0.12)', padding: '6px 14px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '12px' }}>
          <ShieldCheck size={16} color="#42C290" />
          <span>Final Year BCA AI &amp; ML Capstone Defense</span>
        </div>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 800, margin: '0 0 10px 0', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
          DigSafeAI: Intelligent Subsurface Utility Risk Assessment
        </h1>
        <p style={{ margin: 0, fontSize: '1.05rem', color: 'rgba(255, 255, 255, 0.85)', maxWidth: '750px', lineHeight: 1.6 }}>
          A decision-support safety platform combining verified Bengaluru municipal infrastructure GIS data, 
          6-channel environmental simulation, and multi-model machine learning consensus to prevent catastrophic utility strikes during urban excavation.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Core Pillars */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          <div className="panel">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: 'var(--brand-mint-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-primary-600)' }}>
                <Layers size={20} />
              </div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--brand-primary-900)' }}>Municipal Spatial Vectors</h3>
            </div>
            <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Ingests 230,000+ spatial assets from official OpenCity / BWSSB datasets. Performs Haversine point-to-segment distance calculations to identify water mains and sewer trunk lines adjacent to proposed pits.
            </p>
          </div>

          <div className="panel">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: 'var(--brand-mint-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-primary-600)' }}>
                <Activity size={20} />
              </div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--brand-primary-900)' }}>Synchronized Telemetry</h3>
            </div>
            <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Simulates 6 physical channels (vibration, acoustics, soil moisture, temperature, volatile gas, ground displacement) to evaluate trench wall stability without hazardous live excavations.
            </p>
          </div>

          <div className="panel">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: 'var(--brand-mint-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-primary-600)' }}>
                <Cpu size={20} />
              </div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--brand-primary-900)' }}>Safety-First ML Consensus</h3>
            </div>
            <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Calibrated primary mathematical hazard model supported by Random Forest, XGBoost, and LightGBM classifiers. High ML predictions escalate risk; ML never downgrades a formula High.
            </p>
          </div>
        </div>

        {/* Five-Stage Workflow Explanation */}
        <div className="panel">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">End-to-End Safety Assessment Workflow</h3>
              <span className="panel-subtitle">Five operational gates designed for field excavation crews</span>
            </div>
            <span className="badge" style={{ background: 'var(--brand-mint-light)', color: 'var(--brand-primary-700)' }}>
              Standard Operating Procedure
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginTop: '16px' }}>
            <div style={{ background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', padding: '14px', borderLeft: '3px solid var(--brand-primary-600)' }}>
              <strong style={{ fontSize: '0.85rem', color: 'var(--brand-primary-900)' }}>1. Spatial Footprint</strong>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Select location on Bengaluru map; input planned excavation depth (m) and buffer radius (m).
              </p>
            </div>

            <div style={{ background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', padding: '14px', borderLeft: '3px solid var(--brand-primary-600)' }}>
              <strong style={{ fontSize: '0.85rem', color: 'var(--brand-primary-900)' }}>2. GIS Correlation</strong>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Query proximity engine for buried BWSSB water mains and sewer corridors within buffer.
              </p>
            </div>

            <div style={{ background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', padding: '14px', borderLeft: '3px solid var(--brand-primary-600)' }}>
              <strong style={{ fontSize: '0.85rem', color: 'var(--brand-primary-900)' }}>3. Visual Surface Aid</strong>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Inspect surface photos via Faster R-CNN for exposed valves, markers, or pavement scars.
              </p>
            </div>

            <div style={{ background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', padding: '14px', borderLeft: '3px solid var(--brand-primary-600)' }}>
              <strong style={{ fontSize: '0.85rem', color: 'var(--brand-primary-900)' }}>4. Telemetry Synthesis</strong>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Generate synchronized 6-channel environmental readings modeled on geological conditions.
              </p>
            </div>

            <div style={{ background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', padding: '14px', borderLeft: '3px solid var(--brand-primary-600)' }}>
              <strong style={{ fontSize: '0.85rem', color: 'var(--brand-primary-900)' }}>5. Risk Audit &amp; PDF</strong>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Compute calibrated score /100, generate safety checklist, and export official engineering PDF.
              </p>
            </div>
          </div>
        </div>

        {/* Clear Limitations Disclosure */}
        <div style={{ background: '#FFFFFF', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '22px 26px', display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          <AlertTriangle size={24} color="#D97706" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong style={{ fontSize: '1rem', color: 'var(--brand-primary-900)' }}>Technical Scope &amp; Academic Prototype Disclosures</strong>
            <p style={{ margin: '6px 0 10px 0', fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              DigSafeAI is developed as an academic artificial intelligence and geospatial engineering prototype. 
              The platform provides computerized decision-support and does not replace statutory engineering mark-outs or certified utility locators.
            </p>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <li><strong>Sensor Telemetry:</strong> Environmental readings are computer-modeled; physical IoT sensors are not deployed on live excavator machinery.</li>
              <li><strong>Optical Camera Limitations:</strong> RGB vision inspection aids only in surface-level feature detection; cameras cannot see underground pipelines through compacted earth.</li>
              <li><strong>Dataset Boundaries:</strong> Spatial data reflects published BWSSB and BESCOM open-data geometry; unmapped private lines remain potential hazards.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default About;
