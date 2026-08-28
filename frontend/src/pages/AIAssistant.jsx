import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import client from '../api/client';
import { PageHeader } from '../components/ui';
import { apiError } from '../utils/format';

const prompts = [
  'Which products are selling the fastest?',
  'Which products are low in stock?',
  'How were sales this month compared to last month?',
  'Give me a summary of this month\'s performance.',
  'Which products should we consider restocking?',
];

export default function AIAssistant() {
  const [summary, setSummary] = useState('');
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    client.get('/ai/summary')
      .then((res) => setSummary(res.data.summary))
      .catch((err) => setError(apiError(err)));
  }, []);

  const ask = async (text) => {
    const q = (text || query).trim();
    if (!q) return;
    setBusy(true);
    setError('');
    setQuery('');
    setMessages((prev) => [...prev, { role: 'user', text: q }]);
    try {
      const res = await client.post('/ai/chat', { query: q });
      setMessages((prev) => [...prev, { role: 'assistant', text: res.data.response_text }]);
    } catch (err) {
      setError(apiError(err, 'AI assistant is unavailable'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="AI" title="Business assistant" subtitle="Answers are built from live database figures, not invented statistics." />
      {error && <div className="notice error">{error}</div>}
      <section className="panel assistant-card large">
        <div className="assistant-icon"><Sparkles size={20} /></div>
        <p className="eyebrow">Daily brief</p>
        <h2>Grounded summary</h2>
        <p>{summary || 'Loading…'}</p>
      </section>
      <section className="insight-explainer"><div className="explainer-icon"><Sparkles size={18} /></div><div><strong>What are AI insights?</strong><p>BizAI reads your saved sales, orders, inventory, expenses, and customer records to spot trends and answer operational questions. It never fills missing numbers with guesses.</p></div><span className="grounded-badge">Database grounded</span></section>
      <section className="panel chat-panel">
        <div className="prompt-row">
          {prompts.map((item) => (
            <button key={item} className="outline-btn" type="button" onClick={() => ask(item)}>{item}</button>
          ))}
        </div>
        <div className="chat-log">
          {messages.map((message, index) => (
            <div key={index} className={`chat-bubble ${message.role}`}>{message.text}</div>
          ))}
        </div>
        <form className="chat-form" onSubmit={(e) => { e.preventDefault(); ask(); }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ask about sales, stock, or this month's performance" />
          <button className="primary-btn" disabled={busy} type="submit">{busy ? 'Thinking…' : 'Ask'}</button>
        </form>
      </section>
    </>
  );
}
