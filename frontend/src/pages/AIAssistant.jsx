import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Bot, RotateCcw, Send, Sparkles, User, HelpCircle } from 'lucide-react';
import client from '../api/client';
import { PageHeader } from '../components/ui';
import { apiError } from '../utils/format';

const defaultPrompts = [
  'What products should I buy / restock?',
  'Which products are selling the fastest?',
  'How were sales this month compared to last month?',
  'Break down our net profit and expenses.',
  'What is our delivery status with Delhivery?',
  'Give me a summary of this month\'s performance.',
];

/** Simple markdown-like formatter for bolding, bullet points, and headers */
function FormattedMessage({ text }) {
  if (!text) return null;
  const lines = text.split('\n');
  return (
    <div className="formatted-ai-response">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={idx} style={{ height: 8 }} />;
        }
        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={idx} style={{ margin: '8px 0 4px', fontSize: 14, fontWeight: 700, color: 'var(--teal)' }}>
              {trimmed.replace('### ', '')}
            </h4>
          );
        }
        if (trimmed.startsWith('* ') || trimmed.startsWith('• ') || trimmed.startsWith('- ')) {
          const content = trimmed.slice(2);
          return (
            <li key={idx} style={{ marginLeft: 16, marginBottom: 4, lineHeight: 1.5 }}>
              {renderInlineBold(content)}
            </li>
          );
        }
        if (/^\d+\.\s/.test(trimmed)) {
          return (
            <div key={idx} style={{ marginLeft: 12, marginBottom: 4, lineHeight: 1.5 }}>
              {renderInlineBold(trimmed)}
            </div>
          );
        }
        return (
          <p key={idx} style={{ margin: '0 0 6px', lineHeight: 1.5 }}>
            {renderInlineBold(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

function renderInlineBold(text) {
  // Simple bold parser for **text**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ color: 'var(--ink)' }}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

export default function AIAssistant() {
  const [summary, setSummary] = useState('');
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem('bizai_chat_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const chatBottomRef = useRef(null);

  useEffect(() => {
    client.get('/ai/summary')
      .then((res) => setSummary(res.data.summary))
      .catch((err) => setError(apiError(err)));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('bizai_chat_history', JSON.stringify(messages));
    } catch {}
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const clearChat = () => {
    setMessages([]);
    localStorage.removeItem('bizai_chat_history');
  };

  const ask = async (text) => {
    const q = (text || query).trim();
    if (!q || busy) return;
    setBusy(true);
    setError('');
    setQuery('');

    const newMessages = [...messages, { role: 'user', text: q }];
    setMessages(newMessages);

    try {
      const res = await client.post('/ai/chat', {
        query: q,
        conversation_history: newMessages.slice(-6).map((m) => ({
          role: m.role,
          content: m.text,
        })),
      });
      setMessages((prev) => [...prev, { role: 'assistant', text: res.data.response_text }]);
    } catch (err) {
      setError(apiError(err, 'AI assistant is currently unavailable'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="AI Intelligence"
        title="Conversational Business Advisor"
        subtitle="Grounded in live database orders, REIHH catalog stock, and Delhivery courier tracking."
      >
        {messages.length > 0 && (
          <button className="outline-btn heading-btn" onClick={clearChat} title="Clear conversation history">
            <RotateCcw size={14} /> Clear Chat
          </button>
        )}
      </PageHeader>

      {error && <div className="notice error">{error}</div>}

      <section className="panel assistant-card large" style={{ marginBottom: 14 }}>
        <div className="assistant-icon"><Sparkles size={20} /></div>
        <p className="eyebrow">Real-Time Daily Brief</p>
        <h2>Grounded Business Snapshot</h2>
        <p style={{ fontSize: 14, lineHeight: 1.55 }}>{summary || 'Loading live records summary…'}</p>
      </section>

      <section className="insight-explainer" style={{ marginBottom: 16 }}>
        <div className="explainer-icon"><Sparkles size={18} /></div>
        <div>
          <strong>Database-Grounded Intelligence</strong>
          <p>BizAI reads your saved sales, live orders, inventory thresholds, and Delhivery shipments to answer questions conversationally. It never invents numbers.</p>
        </div>
        <span className="grounded-badge">Live DB Connected</span>
      </section>

      <section className="panel chat-panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 460 }}>
        {/* Suggested Prompts Strip */}
        <div className="prompt-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          {defaultPrompts.map((item) => (
            <button
              key={item}
              className="outline-btn"
              style={{ fontSize: 12, padding: '6px 11px', borderRadius: 20 }}
              type="button"
              disabled={busy}
              onClick={() => ask(item)}
            >
              <Sparkles size={12} style={{ color: 'var(--teal)', marginRight: 4 }} />
              {item}
            </button>
          ))}
        </div>

        {/* Chat Messages */}
        <div className="chat-log" style={{ flex: 1, minHeight: 280, overflowY: 'auto', paddingRight: 4 }}>
          {messages.length === 0 ? (
            <div className="chat-empty-hint" style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--muted)' }}>
              <Bot size={36} style={{ margin: '0 auto 10px', color: 'var(--teal)', opacity: 0.8 }} />
              <strong style={{ display: 'block', fontSize: 15, color: 'var(--ink)' }}>Ask me anything about REIHH business operations</strong>
              <p style={{ fontSize: 13, marginTop: 4 }}>
                Ask about what products to restock, how sales compare to last month, or where your Delhivery deliveries stand.
              </p>
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={index}
                className={`chat-bubble ${message.role}`}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  marginBottom: 14,
                  maxWidth: '85%',
                  alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: message.role === 'user' ? 'var(--teal)' : 'var(--panel-bg, #f4f3ec)',
                    color: message.role === 'user' ? '#fff' : 'var(--teal)',
                    border: '1px solid var(--border)',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                >
                  {message.role === 'user' ? <User size={15} /> : <Bot size={15} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3, color: 'var(--muted)' }}>
                    {message.role === 'user' ? 'You' : 'BizAI Assistant'}
                  </span>
                  <div className="chat-bubble-content">
                    {message.role === 'assistant' ? (
                      <FormattedMessage text={message.text} />
                    ) : (
                      <span style={{ whiteSpace: 'pre-wrap' }}>{message.text}</span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
          {busy && (
            <div className="chat-bubble assistant" style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'var(--muted)' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#f4f3ec', display: 'grid', placeItems: 'center', border: '1px solid var(--border)' }}>
                <Bot size={15} style={{ color: 'var(--teal)' }} />
              </div>
              <span className="spinner-icon" style={{ fontSize: 13 }}>Thinking & analyzing business records…</span>
            </div>
          )}
          <div ref={chatBottomRef} />
        </div>

        {/* Chat Input Form */}
        <form
          className="chat-form"
          style={{ marginTop: 16, display: 'flex', gap: 8 }}
          onSubmit={(e) => { e.preventDefault(); ask(); }}
        >
          <input
            style={{ flex: 1, padding: '11px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask a question (e.g. 'What products should I buy / restock?', 'what do you mean?')"
            disabled={busy}
          />
          <button
            className="primary-btn"
            disabled={busy || !query.trim()}
            type="submit"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 20px' }}
          >
            {busy ? 'Thinking…' : <><span>Ask</span> <Send size={14} /></>}
          </button>
        </form>
      </section>
    </>
  );
}
