import axios from 'axios';

const rawUrl = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api').trim().replace(/\/+$/, '');
const API_URL = rawUrl.endsWith('/api') ? rawUrl : `${rawUrl}/api`;

const client = axios.create({
  baseURL: API_URL,
  timeout: 60000, // 60s timeout to allow for Render free-tier cold starts
  headers: { 'Content-Type': 'application/json' },
});

/** Fire-and-forget background warmup ping to wake up free-tier cloud instances early */
export function warmupApi() {
  try {
    fetch(`${API_URL}/health`, { method: 'GET', keepalive: true }).catch(() => {});
  } catch {}
}

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

export async function downloadPackingSlipPdf(orderId, filename) {
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_URL}/orders/${orderId}/packing-slip`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Could not download packing slip');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `packing-slip-${orderId}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function downloadPnlPdf(filename) {
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_URL}/reports/pnl/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Could not download P&L statement');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'profit-and-loss-statement.pdf';
  link.click();
  URL.revokeObjectURL(url);
}

export async function downloadGstr1Csv(filename) {
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_URL}/reports/gstr1-export`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Could not download GSTR-1 report');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'gstr1-tax-report.csv';
  link.click();
  URL.revokeObjectURL(url);
}


export default client;
