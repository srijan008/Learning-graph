/**
 * Centralized API configuration for the application.
 * In production/Docker, we use relative paths to leverage the Nginx proxy.
 * In local development (npm run dev), we fallback to the local backend port.
 */

const isDevelopment = import.meta.env.MODE === 'development';
const BACKEND_PORT = "8002";

// When running in Docker (via Nginx), window.location.origin will be the frontend URL (e.g. port 80)
// The Nginx proxy handles /api/v1 and forwards it to the backend container.
export const API_BASE_URL = isDevelopment 
  ? `http://127.0.0.1:${BACKEND_PORT}/api/v1`
  : `/api/v1`;

export default API_BASE_URL;
