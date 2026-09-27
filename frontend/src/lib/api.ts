import axios from 'axios';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000';

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Concurrent uploads must rotate the stored refresh token only once.
let refreshPromise: Promise<string> | null = null;
function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) throw new Error('No refresh token');
      const { data } = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      return data.accessToken as string;
    })().finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    const isAuthRequest = /\/auth\/(login|register|refresh)$/.test(originalRequest?.url || '');
    if (typeof window !== 'undefined' && originalRequest && error.response?.status === 401 && !originalRequest._retry && !isAuthRequest) {
      originalRequest._retry = true;
      try {
        const currentToken = localStorage.getItem('accessToken');
        const token = currentToken && originalRequest.headers.Authorization !== `Bearer ${currentToken}`
          ? currentToken
          : await refreshAccessToken();
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return api(originalRequest);
      } catch {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/auth/login';
      }
    }

    return Promise.reject(error);
  },
);

export default api;
