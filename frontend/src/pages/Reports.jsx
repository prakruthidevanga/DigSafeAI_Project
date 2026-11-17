import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../services/api';
import { Search, Filter, Download, PlusCircle, Trash2, ExternalLink, Printer, Calendar } from 'lucide-react';

const PAGE_SIZE = 25;

function Reports() {
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [stats, setStats] = useState({ totalReports: 0, highRiskReports: 0, mediumRiskReports: 0, lowRiskReports: 0 });
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [reloadCount, setReloadCount] = useState(0);

  // Client-side Search and Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('ALL');

  useEffect(() => {
    let active = true;
    const fetchReportsAndStats = async () => {
      try {
        const [reportsRes, statsRes] = await Promise.all([
          API.get('/reports', { params: { page: pagination.page, limit: PAGE_SIZE } }),
          API.get('/reports/stats').catch(() => ({ data: null }))
        ]);
        if (!active) return;
        setReports(Array.isArray(reportsRes.data?.data) ? reportsRes.data.data : []);
        setPagination(reportsRes.data?.pagination || {
          page: pagination.page, limit: PAGE_SIZE, total: 0, totalPages: 1,
        });
        if (statsRes && statsRes.data) {
          setStats({
            totalReports: statsRes.data.totalReports || 0,
            highRiskReports: statsRes.data.highRiskReports || 0,
            mediumRiskReports: statsRes.data.mediumRiskReports || 0,
            lowRiskReports: statsRes.data.lowRiskReports || 0,
          });
        }
        setError('');
      } catch (requestError) {
        if (active) {
          setError(requestError.response?.data?.message || 'Unable to load reports. Please try again.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchReportsAndStats();
    return () => { active = false; };
  }, [pagination.page, reloadCount]);

  // Client-side filtering across the loaded dataset page
  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      // 1. Search Query filter (matches location name or ID)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const loc = (report.location || '').toLowerCase();
        const id = (report._id || '').toLowerCase();
        if (!loc.includes(q) && !id.includes(q)) return false;
      }

      // 2. Risk Level filter
      if (riskFilter !== 'ALL') {
        if ((report.riskLevel || '').toUpperCase() !== riskFilter) return false;
      }

      // 3. Date filter
      if (dateFilter !== 'ALL') {
        const reportDate = new Date(report.createdAt);
        const now = new Date();
        if (dateFilter === 'TODAY') {
          if (reportDate.toDateString() !== now.toDateString()) return false;
        } else if (dateFilter === 'WEEK') {
          const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          if (reportDate < sevenDaysAgo) return false;
        } else if (dateFilter === 'MONTH') {
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          if (reportDate < thirtyDaysAgo) return false;
        }
      }

      return true;
    });
  }, [reports, searchQuery, riskFilter, dateFilter]);

  const handleExportCsv = () => {
    const recordsToExport = filteredReports.length > 0 ? filteredReports : reports;
    if (recordsToExport.length === 0) return;
    let csv = 'Report_ID,Date,Location,Latitude,Longitude,Depth_m,Radius_m,Hazard_Score,Risk_Level\n';
    recordsToExport.forEach(r => {
      csv += `"${r._id}","${new Date(r.createdAt).toISOString()}","${(r.location || '').replace(/"/g, '""')}",${r.latitude},${r.longitude},${r.depth},${r.radius},${r.hazardScore},"${r.riskLevel}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `DigSafeAI_Reports_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to permanently delete this excavation assessment report?')) return;

    setDeletingId(id);
    setActionError('');
    try {
      await API.delete(`/reports/${id}`);
      const nextPage = reports.length === 1 && pagination.page > 1
        ? pagination.page - 1
        : pagination.page;
      if (nextPage !== pagination.page) {
        setLoading(true);
        setPagination((current) => ({ ...current, page: nextPage }));
      } else {
        setLoading(true);
        setReloadCount((current) => current + 1);
      }
    } catch (requestError) {
      setActionError(requestError.response?.data?.message || 'Unable to delete this report. Please try again.');
    } finally {
      setDeletingId('');
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '40px' }}>
      {/* Page Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
        marginBottom: '24px',
        background: '#ffffff',
        padding: '24px',
        borderRadius: '10px',
        border: '1px solid var(--border)',
        boxShadow: 'var(--card-shadow)'
      }}>
        <div>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-light)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Historical Safety Records
          </span>
          <h2 style={{ fontSize: '1.6rem', color: 'var(--primary-dark)', margin: '4px 0 6px 0', fontWeight: 700 }}>
            Excavation Safety Reports
          </h2>
          <p className="text-muted" style={{ margin: 0, fontSize: '0.9rem' }}>
            Archived multi-factor risk assessments and excavation logs stored in the project database.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className="btn-secondary"
            onClick={handleExportCsv}
            disabled={reports.length === 0}
            style={{ marginTop: 0, padding: '0.75rem 1.2rem', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <Download size={16} /> Export CSV
          </button>
          <button
            className="btn-primary"
            onClick={() => navigate('/map-analysis')}
            style={{ marginTop: 0, width: 'auto', padding: '0.75rem 1.4rem', fontSize: '0.95rem' }}
          >
            <PlusCircle size={18} /> Start New Assessment
          </button>
        </div>
      </div>

      {/* Statistical Summary Grid */}
      <div style={{ marginBottom: '24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
        <div className="stat-card" style={{ height: '100%', minHeight: '145px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxSizing: 'border-box' }}>
          <div>
            <div className="stat-title">TOTAL ASSESSMENTS</div>
            <div className="stat-value">{stats.totalReports}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '10px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Persistent records</span>
            <span className="badge" style={{ background: '#f1f5f9', color: '#475569', fontSize: '0.68rem', padding: '3px 8px' }}>DATABASE LOGS</span>
          </div>
        </div>

        <div className="stat-card" style={{ height: '100%', minHeight: '145px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxSizing: 'border-box', borderLeft: '4px solid var(--status-high-accent)' }}>
          <div>
            <div className="stat-title" style={{ color: 'var(--status-high-text)' }}>CRITICAL HIGH RISK</div>
            <div className="stat-value" style={{ color: 'var(--status-high-accent)' }}>{stats.highRiskReports}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '10px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Utility hazard</span>
            <span className="badge badge-HIGH" style={{ fontSize: '0.68rem', padding: '3px 8px' }}>POTHOLING</span>
          </div>
        </div>

        <div className="stat-card" style={{ height: '100%', minHeight: '145px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxSizing: 'border-box', borderLeft: '4px solid var(--status-medium-accent)' }}>
          <div>
            <div className="stat-title" style={{ color: 'var(--status-medium-text)' }}>CONTROLLED MEDIUM RISK</div>
            <div className="stat-value" style={{ color: 'var(--status-medium-accent)' }}>{stats.mediumRiskReports}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '10px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Caution zone</span>
            <span className="badge badge-MEDIUM" style={{ fontSize: '0.68rem', padding: '3px 8px' }}>VIGILANCE</span>
          </div>
        </div>

        <div className="stat-card" style={{ height: '100%', minHeight: '145px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxSizing: 'border-box', borderLeft: '4px solid var(--status-low-accent)' }}>
          <div>
            <div className="stat-title" style={{ color: 'var(--status-low-text)' }}>STANDARD LOW RISK</div>
            <div className="stat-value" style={{ color: 'var(--status-low-accent)' }}>{stats.lowRiskReports}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '10px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Safe clearance</span>
            <span className="badge badge-LOW" style={{ fontSize: '0.68rem', padding: '3px 8px' }}>VERIFIED SAFE</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="panel" style={{ background: '#ffffff', borderRadius: '10px', border: '1px solid var(--border)', padding: '20px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search Box */}
          <div style={{ flex: 2, minWidth: '240px', position: 'relative' }}>
            <Search size={16} color="#94a3b8" style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '12px' }} />
            <input
              type="text"
              className="form-control"
              placeholder="Search reports by site location or record ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '36px' }}
            />
          </div>

          {/* Risk Level Filter */}
          <div style={{ flex: 1, minWidth: '150px' }}>
            <select
              className="form-control"
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
              style={{ cursor: 'pointer' }}
            >
              <option value="ALL">All Risk Levels</option>
              <option value="HIGH">High Risk Only</option>
              <option value="MEDIUM">Medium Risk Only</option>
              <option value="LOW">Low Risk Only</option>
            </select>
          </div>

          {/* Date Filter */}
          <div style={{ flex: 1, minWidth: '150px' }}>
            <select
              className="form-control"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              style={{ cursor: 'pointer' }}
            >
              <option value="ALL">All Dates</option>
              <option value="TODAY">Created Today</option>
              <option value="WEEK">Last 7 Days</option>
              <option value="MONTH">Last 30 Days</option>
            </select>
          </div>

          {(searchQuery || riskFilter !== 'ALL' || dateFilter !== 'ALL') && (
            <button
              className="btn-secondary"
              onClick={() => {
                setSearchQuery('');
                setRiskFilter('ALL');
                setDateFilter('ALL');
              }}
              style={{ marginTop: 0, padding: '0.65rem 1rem', fontSize: '0.85rem' }}
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Main Reports Table Panel */}
      <div className="panel" style={{ background: '#ffffff', borderRadius: '10px', border: '1px solid var(--border)', padding: '24px' }}>
        {actionError && <div className="workflow-message error-message" role="alert" style={{ marginBottom: '16px' }}>{actionError}</div>}

        {loading ? (
          <p className="page-state" role="status">Retrieving saved reports from database...</p>
        ) : error ? (
          <div className="page-state error-message" role="alert">
            <p>{error}</p>
            <button
              className="btn-secondary"
              onClick={() => {
                setLoading(true);
                setError('');
                setReloadCount((current) => current + 1);
              }}
            >
              RETRY
            </button>
          </div>
        ) : filteredReports.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
            <p style={{ fontSize: '1rem', margin: '0 0 10px 0' }}>No reports match the current filters.</p>
            <p className="text-muted" style={{ fontSize: '0.85rem', margin: 0 }}>
              Try adjusting your search query or reset the risk category and date filters.
            </p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span className="text-muted" style={{ fontSize: '0.85rem' }}>
                Displaying {filteredReports.length} report{filteredReports.length > 1 ? 's' : ''} (Page {pagination.page} of {pagination.totalPages})
              </span>
            </div>

            <div className="table-responsive">
              <table className="data-table reports-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '12px 14px' }}>Date</th>
                    <th style={{ padding: '12px 14px' }}>Excavation Site</th>
                    <th style={{ padding: '12px 14px' }}>Depth / Radius</th>
                    <th style={{ padding: '12px 14px' }}>Hazard Score</th>
                    <th style={{ padding: '12px 14px' }}>Final Risk</th>
                    <th className="reports-actions-column" style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReports.map((report) => (
                    <tr key={report._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 14px', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                        {new Date(report.createdAt).toLocaleDateString()}<br />
                        <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                          {new Date(report.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>
                      <td className="reports-location" style={{ padding: '12px 14px' }}>
                        <strong style={{ fontSize: '0.9rem', color: 'var(--primary-dark)' }}>{report.location}</strong>
                        <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '2px' }}>
                          Coords: {Number(report.latitude).toFixed(4)}, {Number(report.longitude).toFixed(4)}
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: '0.85rem' }}>
                        {report.depth}m depth<br />
                        <span className="text-muted" style={{ fontSize: '0.75rem' }}>{report.radius}m radius</span>
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: '0.9rem', fontWeight: 700, color: '#1e293b' }}>
                        {report.hazardScore} <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 400 }}>/ 100</span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span className={`badge badge-${report.riskLevel}`} style={{ fontWeight: 700 }}>
                          {report.riskLevel}
                        </span>
                      </td>
                      <td className="reports-actions-column" style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <div className="report-actions" style={{ justifyContent: 'flex-end', gap: '8px' }}>
                          <button
                            onClick={() => navigate(`/risk-result/${report._id}`)}
                            className="btn-primary"
                            style={{ marginTop: 0, padding: '5px 12px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <ExternalLink size={12} /> Open
                          </button>
                          <button
                            onClick={() => handleDelete(report._id)}
                            disabled={deletingId === report._id}
                            className="btn-secondary"
                            style={{ marginTop: 0, padding: '5px 10px', fontSize: '0.8rem', color: '#dc2626', borderColor: '#fca5a5' }}
                          >
                            <Trash2 size={12} /> {deletingId === report._id ? 'Deleting...' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="flex-between" style={{ marginTop: '20px', paddingTop: '14px', borderTop: '1px solid #f1f5f9' }}>
              <button
                className="btn-secondary"
                onClick={() => {
                  setLoading(true);
                  setPagination((current) => ({ ...current, page: current.page - 1 }));
                }}
                disabled={pagination.page <= 1 || loading}
                style={{ padding: '6px 14px', fontSize: '0.85rem' }}
              >
                ← Previous Page
              </button>
              <span className="text-muted" aria-live="polite" style={{ fontSize: '0.85rem' }}>
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                className="btn-secondary"
                onClick={() => {
                  setLoading(true);
                  setPagination((current) => ({ ...current, page: current.page + 1 }));
                }}
                disabled={pagination.page >= pagination.totalPages || loading}
                style={{ padding: '6px 14px', fontSize: '0.85rem' }}
              >
                Next Page →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Reports;
