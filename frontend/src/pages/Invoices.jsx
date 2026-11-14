import { useEffect, useState } from 'react';
import { CircleDollarSign, Plus, Download, MessageCircle, Mail, CheckCircle2, CreditCard, FileText } from 'lucide-react';
import client, { downloadInvoicePdf } from '../api/client';
import { EmptyState, Modal, PageHeader } from '../components/ui';
import { apiError, formatDate, money } from '../utils/format';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const PAYMENT_METHODS = [
  { id: 'bank_transfer', label: 'NEFT / RTGS / Bank Transfer' },
  { id: 'upi', label: 'UPI (GooglePay / PhonePe / Paytm)' },
  { id: 'razorpay', label: 'Razorpay Online Gateway' },
  { id: 'credit_card', label: 'Credit / Debit Card' },
  { id: 'cash', label: 'Cash on Delivery (COD)' },
  { id: 'cheque', label: 'Corporate Cheque' },
];

export default function Invoices() {
  const { can } = useAuth();
  const toast = useToast();
  const canPay = can(['admin', 'manager', 'accountant']);
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [createModal, setCreateModal] = useState(false);
  const [paymentModal, setPaymentModal] = useState(null);

  // Standalone invoice form state
  const [invoiceForm, setInvoiceForm] = useState({
    customer_id: '',
    total_amount: '',
    due_date: new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
    payment_method: 'bank_transfer',
    notes: 'Luxury Garment Supply & Tailoring',
  });

  // Partial payment form state
  const [payForm, setPayForm] = useState({
    amount: '',
    method: 'bank_transfer',
    notes: '',
  });

  const load = () => {
    client.get('/invoices')
      .then((res) => setInvoices(res.data || []))
      .catch((err) => setError(apiError(err)));
  };

  useEffect(() => {
    load();
    client.get('/customers').then((res) => setCustomers(res.data || [])).catch(() => {});
  }, []);

  const handleCreateInvoice = async (e) => {
    e.preventDefault();
    try {
      const total = Number(invoiceForm.total_amount);
      const taxable = Math.round((total / 1.18) * 100) / 100;
      const cgst = Math.round(((total - taxable) / 2) * 100) / 100;
      const sgst = cgst;

      await client.post('/invoices', {
        customer_id: invoiceForm.customer_id ? Number(invoiceForm.customer_id) : null,
        total_amount: total,
        due_date: invoiceForm.due_date,
        payment_method: invoiceForm.payment_method,
        taxable_amount: taxable,
        cgst: cgst,
        sgst: sgst,
        notes: invoiceForm.notes,
      });

      setCreateModal(false);
      setNotice('Direct Tax Invoice created successfully.');
      toast?.success('Direct Tax Invoice created successfully');
      load();
    } catch (err) {
      setError(apiError(err, 'Could not create invoice'));
      toast?.error(apiError(err, 'Could not create invoice'));
    }
  };

  const openPaymentModal = (invoice) => {
    setPaymentModal(invoice);
    setPayForm({
      amount: invoice.balance_due || invoice.total_amount,
      method: invoice.payment_method || 'bank_transfer',
      notes: '',
    });
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    try {
      await client.post(`/invoices/${paymentModal.id}/payments`, {
        payment_amount: Number(payForm.amount),
        method: payForm.method,
        notes: payForm.notes,
      });
      setPaymentModal(null);
      setNotice(`Recorded payment of ${money(payForm.amount)} for #${paymentModal.invoice_number}`);
      toast?.success(`Recorded payment of ${money(payForm.amount)}`);
      load();
    } catch (err) {
      setError(apiError(err, 'Could not record payment'));
      toast?.error('Could not record payment');
    }
  };

  const shareWhatsApp = (invoice) => {
    const custName = invoice.order?.customer?.name || invoice.customer?.name || 'Valued Customer';
    const text = encodeURIComponent(
      `Hello ${custName}, here is your tax invoice #${invoice.invoice_number} from REIHH Studio for INR ${invoice.total_amount}. Balance due: INR ${invoice.balance_due}. Link: ${window.location.origin}/invoices`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const shareEmail = (invoice) => {
    const custEmail = invoice.order?.customer?.email || invoice.customer?.email || '';
    const subject = encodeURIComponent(`REIHH Studio Tax Invoice #${invoice.invoice_number}`);
    const body = encodeURIComponent(
      `Dear Customer,\n\nPlease find details for your tax invoice #${invoice.invoice_number} totaling INR ${invoice.total_amount}.\nBalance Due: INR ${invoice.balance_due}.\nDue Date: ${invoice.due_date || 'Immediate'}.\n\nThank you for choosing REIHH Studio.`
    );
    window.location.href = `mailto:${custEmail}?subject=${subject}&body=${body}`;
  };

  return (
    <>
      <PageHeader eyebrow="Billing" title="Invoices" subtitle="Tax invoices with automated GST breakdown, partial payment receipts, and sharing.">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {canPay && (
            <button className="primary-btn heading-btn" onClick={() => setCreateModal(true)}>
              <Plus size={14} /> Create Invoice
            </button>
          )}
        </div>
      </PageHeader>

      {notice && <div className="notice success" style={{ background: '#eaf4f1', borderColor: 'var(--teal)', color: 'var(--teal-dark)' }}>{notice}</div>}
      {error && <div className="notice error">{error}</div>}

      {invoices.length ? (
        <section className="panel table-panel invoice-table-panel">
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Billed To</th>
                <th>Taxable</th>
                <th>GST (18%)</th>
                <th>Total</th>
                <th>Paid / Balance</th>
                <th>Due</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => {
                const customer = invoice.order?.customer || invoice.customer;
                const taxable = invoice.taxable_amount || Math.round((invoice.total_amount / 1.18) * 100) / 100;
                const gst = Math.round((invoice.total_amount - taxable) * 100) / 100;
                return (
                  <tr key={invoice.id}>
                    <td>
                      <strong>#{invoice.invoice_number}</strong>
                      <small style={{ display: 'block', color: 'var(--muted)', fontSize: 11 }}>
                        {invoice.order ? `Order #${invoice.order.order_number}` : 'Direct Sale'}
                      </small>
                    </td>
                    <td>
                      <strong>{customer?.name || 'Counter Sale'}</strong>
                      {customer?.company && <small style={{ display: 'block', color: 'var(--muted)', fontSize: 11 }}>{customer.company}</small>}
                    </td>
                    <td>{money(taxable)}</td>
                    <td>
                      <div>{money(gst)}</div>
                      <small style={{ color: 'var(--muted)', fontSize: 10 }}>CGST 9% + SGST 9%</small>
                    </td>
                    <td><strong style={{ fontSize: 13.5 }}>{money(invoice.total_amount)}</strong></td>
                    <td>
                      <div style={{ color: invoice.balance_due <= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                        {invoice.balance_due <= 0 ? 'Fully Paid' : `Bal: ${money(invoice.balance_due)}`}
                      </div>
                      {invoice.paid_amount > 0 && invoice.balance_due > 0 && (
                        <small style={{ color: 'var(--muted)', fontSize: 11 }}>Paid: {money(invoice.paid_amount)}</small>
                      )}
                    </td>
                    <td>{formatDate(invoice.due_date)}</td>
                    <td><span className={`status-pill ${invoice.status}`}>{invoice.status}</span></td>
                    <td className="row-actions" style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                        <button
                          className="text-btn"
                          onClick={() => downloadInvoicePdf(invoice.id, `${invoice.invoice_number}.pdf`)}
                          title="Download GST Tax Invoice PDF"
                        >
                          PDF
                        </button>
                        {canPay && invoice.balance_due > 0 && (
                          <button
                            className="text-btn"
                            onClick={() => openPaymentModal(invoice)}
                            title="Record partial or full payment"
                            style={{ color: 'var(--teal)', fontWeight: 600 }}
                          >
                            Pay
                          </button>
                        )}
                        <button
                          className="text-btn"
                          onClick={() => shareWhatsApp(invoice)}
                          title="Share via WhatsApp"
                          style={{ color: '#25D366' }}
                        >
                          <MessageCircle size={14} />
                        </button>
                        <button
                          className="text-btn"
                          onClick={() => shareEmail(invoice)}
                          title="Send via Email"
                        >
                          <Mail size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : <EmptyState icon={CircleDollarSign} text="No invoices generated yet." />}

      {/* Standalone Create Invoice Modal */}
      {createModal && (
        <Modal title="Create Direct Tax Invoice" onClose={() => setCreateModal(false)}>
          <form className="stack-form" onSubmit={handleCreateInvoice}>
            <label>Customer
              <select
                value={invoiceForm.customer_id}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, customer_id: e.target.value })}
              >
                <option value="">Counter / Walk-in Customer (No account)</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} {c.company ? `(${c.company})` : ''}</option>
                ))}
              </select>
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 10 }}>
              <label>Total Invoice Value (₹)*
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={invoiceForm.total_amount}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, total_amount: e.target.value })}
                  placeholder="e.g. 15000"
                  required
                />
              </label>

              <label>Due Date*
                <input
                  type="date"
                  value={invoiceForm.due_date}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, due_date: e.target.value })}
                  required
                />
              </label>
            </div>

            <label>Expected Payment Method
              <select
                value={invoiceForm.payment_method}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, payment_method: e.target.value })}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </label>

            <label>Description / Line Items
              <textarea
                rows={2}
                value={invoiceForm.notes}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, notes: e.target.value })}
                placeholder="Details of services, bespoke garment tailoring, or retail pieces supplied"
              />
            </label>

            <div style={{ background: '#f8fafc', padding: 10, borderRadius: 6, fontSize: 12, color: 'var(--muted)' }}>
              GST Note: Automatically computes 18% GST (9% CGST + 9% SGST) breakdown and issues an official tax invoice.
            </div>

            <button className="primary-btn" type="submit" disabled={!invoiceForm.total_amount}>
              Generate &amp; Issue Tax Invoice
            </button>
          </form>
        </Modal>
      )}

      {/* Record Payment / Deposit Modal */}
      {paymentModal && (
        <Modal title={`Record Payment · #${paymentModal.invoice_number}`} onClose={() => setPaymentModal(null)}>
          <form className="stack-form" onSubmit={handleRecordPayment}>
            <div style={{ background: '#f8fafc', padding: 10, borderRadius: 6, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <span>Invoice Total:</span>
                <strong>{money(paymentModal.total_amount)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <span>Already Paid:</span>
                <span>{money(paymentModal.paid_amount)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, color: '#ef4444', borderTop: '1px solid var(--border)', paddingTop: 4 }}>
                <span>Balance Due:</span>
                <span>{money(paymentModal.balance_due)}</span>
              </div>
            </div>

            <label>Payment Amount (₹)*
              <input
                type="number"
                min="0.01"
                max={paymentModal.balance_due}
                step="0.01"
                value={payForm.amount}
                onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                required
              />
            </label>

            <label>Payment Mode*
              <select
                value={payForm.method}
                onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}
                required
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </label>

            <label>Reference / UTR / Transaction ID
              <input
                value={payForm.notes}
                onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })}
                placeholder="e.g. UTR #9821873192 from HDFC bank"
              />
            </label>

            <button className="primary-btn" type="submit" disabled={!payForm.amount}>
              Confirm &amp; Record Payment
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
