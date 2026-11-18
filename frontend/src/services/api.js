import axios from 'axios';
import { clearSession, getSessionToken } from './session';

const getBaseUrl = () => {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  // If running in production on Vercel or cloud, default directly to Render backend
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return 'https://digsafeai-project.onrender.com/api';
  }
  return 'http://localhost:5000/api';
};

const API = axios.create({
  baseURL: getBaseUrl(),
});

API.interceptors.request.use((config) => {
  const token = getSessionToken();
  if (token) {
    config.headers.Authorization = 'Bearer ' + token;
  }
  return config;
});

API.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';
    const isCredentialSubmission = /\/auth\/(login|signup)$/.test(url);
    if (error.response?.status === 401 && !isCredentialSubmission) {
      clearSession();
      window.dispatchEvent(new Event('digsafe:unauthorized'));
    }
    return Promise.reject(error);
  },
);

export default API;
