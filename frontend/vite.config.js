import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiBaseUrl = env.VITE_API_BASE_URL || (
    mode === 'production'
      ? ''
      : 'http://localhost:5000/api'
  );

  if (!apiBaseUrl) {
    throw new Error('VITE_API_BASE_URL must be configured for production builds.');
  }
  let parsedApiUrl;
  try {
    parsedApiUrl = new URL(apiBaseUrl);
  } catch {
    throw new Error('VITE_API_BASE_URL must be a valid absolute HTTP or HTTPS URL.');
  }
  if (
    !['http:', 'https:'].includes(parsedApiUrl.protocol)
    || parsedApiUrl.username
    || parsedApiUrl.password
    || parsedApiUrl.search
    || parsedApiUrl.hash
  ) {
    throw new Error('VITE_API_BASE_URL must use HTTP or HTTPS and must not contain credentials, a query, or a fragment.');
  }

  return {
    plugins: [react()],
    server: {
      allowedHosts: true,
      proxy: {
        '/api': {
          target: 'http://localhost:5000',
          changeOrigin: true,
        },
      },
      watch: {
        ignored: ['**/playwright-report/**', '**/test-results/**', '**/ui_verification/**']
      }
    }
  };
});
