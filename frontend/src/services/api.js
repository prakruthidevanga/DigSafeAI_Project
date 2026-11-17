import axios from 'axios';
import { clearSession, getSessionToken } from './session';

const getBaseUrl = () => {
  // If explicitly configured with a non-localhost absolute URL, use it
  if (import.meta.env.VITE_API_BASE_URL && !import.meta.env.VITE_API_BASE_URL.includes('localhost') && !import.meta.env.VITE_API_BASE_URL.includes('127.0.0.1')) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  // When running in a browser that isn't localhost (e.g. public tunnel or domain), use relative path /api
  // which is handled by Vite proxy in dev or reverse proxy in production
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return '/api';
  }
  return import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
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
