import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Bot, RotateCcw, Send, Sparkles, User, Mic, MicOff, ExternalLink, Package, ShoppingBag, TrendingUp, Users, Truck } from 'lucide-react';
import client from '../api/client';
import { PageHeader } from '../components/ui';
import { apiError } from '../utils/format';
import { useToast } from '../context/ToastContext';

const THREADS = [
  { id: 'general', title: 'General Operations', icon: '⚡' },
  { id: 'inventory', title: 'Inventory & Reorders', icon: '📦' },
  { id: 'financials', title: 'Finance & Profit Margins', icon: '💰' },
  { id: 'fulfillment', title: 'Fulfillment & Courier Pulse', icon: '🚚' },
];

const defaultPromptsByThread = {
  general: [
    'What was the latest order?',
    'Give me a summary of this month\'s performance.',
    'Who are our best customers by lifetime spend?',
    'What is our delivery status with Delhivery?',
  ],
  inventory: [
    'What products should I buy / restock?',
    'Which products are low in stock right now?',
    'Which garments have the highest velocity?',
    'Draft priority replenishment quantities.',
  ],
  financials: [
    'Break down our net profit and expenses.',
    'How were sales this month compared to last month?',
    'What is our gross profit margin after COGS?',
    'Are recurring commitments inflating current spend?',
  ],
  fulfillment: [
    'What is our delivery status with Delhivery?',
    'How many orders are pending dispatch?',
    'Show in-transit packages across Delhi NCR.',
    'What was the latest order?',
  ],
};

function renderInlineBold(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ color: 'var(--ink)' }}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

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

export default function AIAssistant() {
  const navigate = useNavigate();
  const toast = useToast();
  const [activeThread, setActiveThread] = useState('general');
  const [summary, setSummary] = useState('');
  const [query, setQuery] = useState('');
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const chatBottomRef = useRef(null);
  const recognitionRef = useRef(null);

  // Threaded messages saved in localStorage
  const [threadsData, setThreadsData] = useState(() => {
    try {
      const saved = localStorage.getItem('bizai_chat_threads');
      return saved ? JSON.parse(saved) : { general: [], inventory: [], financials: [], fulfillment: [] };
    } catch {
      return { general: [], inventory: [], financials: [], fulfillment: [] };
    }
  });

  const messages = threadsData[activeThread] || [];

  useEffect(() => {
    client.get('/ai/summary')
      .then((res) => setSummary(res.data.summary))
      .catch((err) => setError(apiError(err)));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('bizai_chat_threads', JSON.stringify(threadsData));
    } catch {}
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadsData]);

  // Web Speech API Voice Dictation
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognizer = new SpeechRecognition();
      recognizer.continuous = false;
      recognizer.interimResults = false;
      recognizer.lang = 'en-IN';

      recognizer.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setQuery((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
        setListening(false);
      };

      recognizer.onerror = () => {
        setListening(false);
      };

      recognizer.onend = () => {
        setListening(false);
      };

      recognitionRef.current = recognizer;
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert('Speech recognition is not supported in this browser. Please use Chrome or Edge.');
      return;
    }
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      setListening(true);
      recognitionRef.current.start();
    }
  };

  const clearChat = () => {
    setThreadsData((prev) => ({
      ...prev,
      [activeThread]: [],
    }));
  };

  const ask = async (text) => {
    const q = (text || query).trim();
    if (!q || busy) return;
    setBusy(true);
    setError('');
    setQuery('');

    const currentList = threadsData[activeThread] || [];
    const newMessages = [...currentList, { role: 'user', text: q }];

    setThreadsData((prev) => ({
      ...prev,
      [activeThread]: newMessages,
    }));

    try {
      const res = await client.post('/ai/chat', {
        query: q,
        conversation_history: newMessages.slice(-6).map((m) => ({
          role: m.role,
          content: m.text,
        })),
      });

      setThreadsData((prev) => ({
        ...prev,
        [activeThread]: [...newMessages, { role: 'assistant', text: res.data.response_text }],
      }));
    } catch (err) {
      setError(apiError(err, 'AI assistant is currently unavailable'));
      toast?.error('BizAI is temporarily unavailable. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const prompts = defaultPromptsByThread[activeThread] || defaultPromptsByThread.general;

  // Detect which deep-links are relevant to message text
  const getRelevantActions = (text) => {
    const t = (text || '').toLowerCase();
    const actions = [];
    if (t.includes('order') || t.includes('ord-') || t.includes('sales')) {
      actions.push({ label: 'View Orders', path: '/orders', icon: ShoppingBag });
    }
    if (t.includes('restock') || t.includes('stock') || t.includes('inventory') || t.includes('warehouse')) {
      actions.push({ label: 'Restock Inventory', path: '/inventory', icon: Package });
    }
    if (t.includes('profit') || t.includes('expense') || t.includes('cogs') || t.includes('revenue') || t.includes('margin')) {
      actions.push({ label: 'P&L Reports', path: '/reports', icon: TrendingUp });
    }
    if (t.includes('delhivery') || t.includes('shipping') || t.includes('tracking') || t.includes('courier')) {
      actions.push({ label: 'Courier Tracker', path: '/orders', icon: Truck });
    }
    if (t.includes('customer') || t.includes('client') || t.includes('buyer')) {
      actions.push({ label: 'Customer CRM', path: '/customers', icon: Users });
    }
    return actions.slice(0, 3);
  };

  return (
    <>
      <PageHeader
        eyebrow="AI Intelligence"
        title="Conversational Business Advisor"
        subtitle="Grounded in live database orders, catalog stock, customer ledger, and Delhivery courier tracking."
      >
        {messages.length > 0 && (
          <button className="outline-btn heading-btn" onClick={clearChat} title="Clear conversation history">
            <RotateCcw size={14} /> Clear Thread
          </button>
        )}
      </PageHeader>

      {error && <div className="notice error">{error}</div>}

      {/* Real-time Business Snapshot */}
      <section className="panel assistant-card large" style={{ marginBottom: 14 }}>
        <div className="assistant-icon"><Sparkles size={20} /></div>
        <p className="eyebrow">Real-Time Daily Brief</p>
        <h2>Grounded Business Snapshot</h2>
        <p style={{ fontSize: 14, lineHeight: 1.55 }}>{summary || 'Loading live records summary…'}</p>
      </section>

      {/* Thread Switcher Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, overflowX: 'auto', paddingBottom: 4 }}>
        {THREADS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveThread(t.id)}
            style={{
              padding: '7px 14px',
              borderRadius: 20,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              border: activeThread === t.id ? '1px solid var(--teal)' : '1px solid var(--border)',
              background: activeThread === t.id ? 'var(--teal)' : 'var(--panel)',
              color: activeThread === t.id ? '#fff' : 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              whiteSpace: 'nowrap',
            }}
          >
            <span>{t.icon}</span>
            <span>{t.title}</span>
            {(threadsData[t.id] || []).length > 0 && (
              <span style={{ fontSize: 10, background: activeThread === t.id ? 'rgba(255,255,255,0.25)' : '#e5e7eb', padding: '1px 5px', borderRadius: 8 }}>
                {threadsData[t.id].length}
              </span>
            )}
          </button>
        ))}
      </div>

      <section className="panel chat-panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 480 }}>
        {/* Suggested Prompts Strip */}
        <div className="prompt-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          {prompts.map((item) => (
            <button
              key={item}
              className="outline-btn"
              style={{ fontSize: 12, padding: '5px 11px', borderRadius: 20 }}
              type="button"
              disabled={busy}
              onClick={() => ask(item)}
            >
              <Sparkles size={11} style={{ color: 'var(--teal)', marginRight: 4 }} />
              {item}
            </button>
          ))}
        </div>

        {/* Chat Messages */}
        <div className="chat-log" style={{ flex: 1, minHeight: 280, overflowY: 'auto', paddingRight: 4 }}>
          {messages.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--muted)' }}>
              <Bot size={36} style={{ color: 'var(--teal)', margin: '0 auto 10px', opacity: 0.8 }} />
              <strong style={{ display: 'block', fontSize: 15, color: 'var(--ink)' }}>Ask BizAI anything about your operations</strong>
              <p style={{ maxWidth: 420, margin: '6px auto 0', fontSize: 13, lineHeight: 1.5 }}>
                Try one of the prompts above or ask about reordering stock, tracking shipments, analyzing customer lifetime value, or checking net profit.
              </p>
            </div>
          ) : (
            messages.map((message, index) => {
              const isAssistant = message.role === 'assistant';
              const actions = isAssistant ? getRelevantActions(message.text) : [];
              return (
                <article key={index} className={`chat-message ${message.role}`}>
                  <div className="avatar">
                    {isAssistant ? <Bot size={16} /> : <User size={16} />}
                  </div>
                  <div className="message-content">
                    <header>
                      <strong>{isAssistant ? 'BizAI Assistant' : 'You'}</strong>
                    </header>
                    {isAssistant ? (
                      <>
                        <FormattedMessage text={message.text} />
                        {/* Actionable Deep Links */}
                        {actions.length > 0 && (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                            {actions.map((act, i) => {
                              const Icon = act.icon;
                              return (
                                <button
                                  key={i}
                                  type="button"
                                  className="outline-btn"
                                  onClick={() => navigate(act.path)}
                                  style={{ fontSize: 11, padding: '3px 8px', borderRadius: 12, borderColor: 'var(--teal)', color: 'var(--teal-dark)' }}
                                >
                                  <Icon size={11} /> {act.label} <ArrowRight size={10} />
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </>
                    ) : (
                      <p>{message.text}</p>
                    )}
                  </div>
                </article>
              );
            })
          )}
          {busy && (
            <article className="chat-message assistant">
              <div className="avatar"><Bot size={16} /></div>
              <div className="message-content">
                <header><strong>BizAI Assistant</strong></header>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--muted)', fontSize: 13, padding: '4px 0' }}>
                  <Sparkles size={14} className="spinner-icon" style={{ color: 'var(--teal)' }} />
                  Grounded analysis in progress…
                </div>
              </div>
            </article>
          )}
          <div ref={chatBottomRef} />
        </div>

        {/* Input Form with Voice Dictation */}
        <form
          className="chat-form"
          onSubmit={(e) => { e.preventDefault(); ask(); }}
          style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}
        >
          <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={listening ? 'Listening to speech… speak now' : `Ask BizAI about ${THREADS.find((t) => t.id === activeThread)?.title}…`}
              disabled={busy}
              style={{
                width: '100%',
                paddingRight: 40,
                borderColor: listening ? '#ef4444' : undefined,
                boxShadow: listening ? '0 0 0 2px rgba(239,68,68,0.2)' : undefined,
              }}
            />
            {/* Microphone Button */}
            <button
              type="button"
              onClick={toggleListening}
              style={{
                position: 'absolute',
                right: 8,
                background: 'transparent',
                border: 'none',
                color: listening ? '#ef4444' : 'var(--muted)',
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
                padding: 4,
              }}
              title={listening ? 'Stop listening' : 'Dictate question via microphone'}
            >
              {listening ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
          </div>
          <button className="primary-btn" type="submit" disabled={busy || !query.trim()}>
            <Send size={15} />
          </button>
        </form>
      </section>
    </>
  );
}
