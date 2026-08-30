import { useEffect, useState } from 'react';
import { CircleDollarSign } from 'lucide-react';
import client, { downloadInvoicePdf } from '../api/client';
import { EmptyState, PageHeader } from '../components/ui';
import { apiError, formatDate, money } from '../utils/format';
import { useAuth } from '../context/AuthContext';

export default function Invoices() {
  const { can } = useAuth();
  const canPay = can(['admin', 'manager', 'accountant']);
  const [invoices, setInvoices] = useState([]);
  const [error, setError] = useState('');

  const load = () => {
    client.get('/invoices')
      .then((res) => setInvoices(res.data || []))
      .catch((err) => setError(apiError(err)));
  };

  useEffect(() => { load(); }, []);

  const markPaid = async (invoice) => {
    try {
      await client.patch(`/invoices/${invoice.id}/status`, { paid_amount: invoice.total_amount, status: 'paid' });
      load();
    } catch (err) {
      setError(apiError(err, 'Could not update invoice'));
    }
  };

  return (
    <>
      <PageHeader eyebrow="Billing" title="Invoices" subtitle="Generated from orders. Download a printable PDF at any time." />
      {error && <div className="notice error">{error}</div>}
      {invoices.length ? (
        <section className="panel table-panel invoice-table-panel">
          <table className="data-table">
            <thead><tr><th>Invoice</th><th>Customer</th><th>Status</th><th>Amount</th><th>Due</th><th /></tr></thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td><strong>#{invoice.invoice_number}</strong></td>
                  <td>{invoice.order?.customer?.name || '—'}</td>
                  <td><span className={`status-pill ${invoice.status}`}>{invoice.status}</span></td>
                  <td>{money(invoice.total_amount)}</td>
                  <td>{formatDate(invoice.due_date)}</td>
                  <td className="row-actions">
                    <button className="text-btn" onClick={() => downloadInvoicePdf(invoice.id, `${invoice.invoice_number}.pdf`)}>PDF</button>
                    {canPay && invoice.status !== 'paid' && (
                      <button className="text-btn" onClick={() => markPaid(invoice)}>Mark paid</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : <EmptyState icon={CircleDollarSign} text="No invoices generated yet." />}
    </>
  );
}
