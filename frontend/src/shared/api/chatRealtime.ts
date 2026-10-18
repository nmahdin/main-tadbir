import { chatApi } from './chat';

export type ChatRealtimeState = {
  onlineUsers: Array<{ id: string; name?: string }>;
  typingUsers: Array<{ id: string; name?: string }>;
  transport: 'websocket' | 'polling-fallback';
};

/**
 * WebSocket-compatible chat transport. Deployments may set VITE_CHAT_WEBSOCKET_URL;
 * when unavailable or disconnected, the same event shape is obtained from the
 * authorized HTTP presence endpoint.
 */
export function connectChatRealtime(conversationId: string, onState: (state: ChatRealtimeState) => void) {
  let closed = false;
  let socket: WebSocket | null = null;
  let websocketReady = false;
  let lastTyping = false;
  const normalize = (data: Partial<Pick<ChatRealtimeState, 'onlineUsers' | 'typingUsers'>>, transport: ChatRealtimeState['transport']): ChatRealtimeState => ({
    onlineUsers: Array.isArray(data.onlineUsers) ? data.onlineUsers : [],
    typingUsers: Array.isArray(data.typingUsers) ? data.typingUsers : [],
    transport,
  });
  const poll = async () => {
    if (closed || websocketReady) return;
    try { const response = await chatApi.realtime.status(conversationId); if (!closed) onState(normalize(response.data, 'polling-fallback')); }
    catch { /* module error reporting remains centralized in AppContext */ }
  };
  const heartbeat = async () => {
    if (closed) return;
    if (websocketReady && socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'presence.heartbeat', conversationId, typing: lastTyping }));
      return;
    }
    try { const response = await chatApi.realtime.heartbeat(conversationId, lastTyping); if (!closed) onState(normalize(response.data, 'polling-fallback')); }
    catch { /* retry on next heartbeat */ }
  };

  const wsBase = String(import.meta.env.VITE_CHAT_WEBSOCKET_URL || '').trim();
  if (wsBase && typeof WebSocket !== 'undefined') {
    try {
      const url = new URL(wsBase, window.location.href);
      url.searchParams.set('conversation', conversationId);
      socket = new WebSocket(url.toString());
      socket.onopen = () => { websocketReady = true; void heartbeat(); };
      socket.onmessage = event => {
        try {
          const payload = JSON.parse(String(event.data));
          if (String(payload.conversationId) === conversationId && (payload.type === 'presence.state' || payload.onlineUsers || payload.typingUsers)) {
            onState(normalize(payload.data || payload, 'websocket'));
          }
        } catch { /* ignore malformed gateway messages */ }
      };
      socket.onclose = () => { websocketReady = false; void poll(); };
      socket.onerror = () => { websocketReady = false; };
    } catch { socket = null; }
  }

  void heartbeat();
  void poll();
  const pollTimer = window.setInterval(() => void poll(), 4_000);
  const heartbeatTimer = window.setInterval(() => void heartbeat(), 25_000);
  return {
    typing(active: boolean) {
      lastTyping = active;
      if (websocketReady && socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'typing.changed', conversationId, typing: active }));
      } else {
        void chatApi.realtime.heartbeat(conversationId, active).then(response => {
          if (!closed) onState(normalize(response.data, 'polling-fallback'));
        }).catch(() => undefined);
      }
    },
    close() {
      closed = true;
      window.clearInterval(pollTimer);
      window.clearInterval(heartbeatTimer);
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'typing.changed', conversationId, typing: false }));
      socket?.close();
    },
  };
}
