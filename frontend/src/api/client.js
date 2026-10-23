import axios from 'axios';

const rawUrl = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api').trim().replace(/\/+$/, '');
const API_URL = rawUrl.endsWith('/api') ? rawUrl : `${rawUrl}/api`;

const client = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    const isAuthError =
      error.response?.status === 401 ||
      (error.response?.status === 403 &&
        String(error.response?.data?.detail).toLowerCase().includes('credential'));
    if (isAuthError && window.location.pathname !== '/login') {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export async function downloadInvoicePdf(invoiceId, filename) {
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_URL}/invoices/${invoiceId}/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Could not download invoice');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `invoice-${invoiceId}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}

export default client;
