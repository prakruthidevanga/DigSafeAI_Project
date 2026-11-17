import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import API from './services/api';
import { getSessionToken } from './services/session';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import MapAnalysis from './pages/MapAnalysis';
import RiskResult from './pages/RiskResult';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import About from './pages/About';
import DataSources from './pages/DataSources';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import AppLoadingScreen from './components/AppLoadingScreen';
import './App.css';

function RequireAuth({ status }) {
  if (status === 'checking') {
    return <AppLoadingScreen message="Verifying secure operator session..." />;
  }
  return status === 'authenticated' ? <Outlet /> : <Navigate to="/login" replace />;
}

function AuthenticatedLayout({ setAuthStatus }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  return (
    <div className="app-container">
      {isSidebarOpen && <div className="sidebar-overlay" onClick={toggleSidebar}></div>}
      <Sidebar
        setIsAuthenticated={setAuthStatus}
        isOpen={isSidebarOpen}
        closeSidebar={() => setIsSidebarOpen(false)}
      />
      <div className="main-content">
        <Navbar toggleSidebar={toggleSidebar} />
        <div className="page-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

function App() {
  const [authStatus, setAuthStatus] = useState('checking');
  const [isAppLoaded, setIsAppLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    const handleUnauthorized = () => setAuthStatus('unauthenticated');
    window.addEventListener('digsafe:unauthorized', handleUnauthorized);

    const token = getSessionToken();
    if (token) {
      API.get('/auth/session')
        .then(() => {
          if (active) setAuthStatus('authenticated');
        })
        .catch(() => {
          if (active) setAuthStatus('unauthenticated');
        });
    } else {
      if (active) setAuthStatus('unauthenticated');
    }

    return () => {
      active = false;
      window.removeEventListener('digsafe:unauthorized', handleUnauthorized);
    };
  }, []);

  // Show full startup loader on initial launch until 100% completes
  if (!isAppLoaded) {
    return <AppLoadingScreen onFinished={() => setIsAppLoaded(true)} />;
  }

  const authPage = (page) => (
    authStatus === 'authenticated'
      ? <Navigate to="/dashboard" replace />
      : page
  );

  return (
    <Router>
      <Routes>
        <Route path="/login" element={authPage(<Login setAuth={setAuthStatus} />)} />
        <Route path="/signup" element={authPage(<Signup setAuth={setAuthStatus} />)} />
        <Route element={<RequireAuth status={authStatus} />}>
          <Route element={<AuthenticatedLayout setAuthStatus={setAuthStatus} />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/map-analysis" element={<MapAnalysis />} />
            <Route path="/risk-assessment" element={<MapAnalysis initialStep={1} />} />
            <Route path="/risk-result/:id" element={<RiskResult />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/data-sources" element={<DataSources />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/about" element={<About />} />
          </Route>
        </Route>
        <Route
          path="*"
          element={<Navigate to={authStatus === 'authenticated' ? '/dashboard' : '/login'} replace />}
        />
      </Routes>
    </Router>
  );
}

export default App;
