const CHANNEL_NAME = 'bizai-workspace-sync';

export function emitWorkspaceSync(topic = 'all') {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(CHANNEL_NAME);
      ch.postMessage({ topic, at: Date.now() });
      ch.close();
    }
    localStorage.setItem('bizai-last-sync', JSON.stringify({ topic, at: Date.now() }));
  } catch {}
}

export function subscribeWorkspaceSync(handler) {
  const onFocus = () => handler('focus');
  const onStorage = (e) => {
    if (e.key === 'bizai-last-sync') handler('storage');
  };
  let ch = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      ch = new BroadcastChannel(CHANNEL_NAME);
      ch.onmessage = (e) => handler(e.data?.topic || 'broadcast');
    }
  } catch {}
  window.addEventListener('focus', onFocus);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('storage', onStorage);
    if (ch) ch.close();
  };
}
