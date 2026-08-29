const WS_BASE_URL = import.meta.env.VITE_WS_URL || (location.origin.replace(/^http/, 'ws'));

/**
 * A small class instead of a raw WebSocket so match components can attach
 * listeners without worrying about reconnects: if the connection drops
 * (very possible on Render's free tier after a cold start), we
 * transparently reconnect and re-send the last `join` so the match view
 * resumes exactly where it left off (spec section 17).
 */
export class MatchSocket {
  constructor(token) {
    this.token = token;
    this.ws = null;
    this.listeners = new Set();
    this.lastMatchId = null;
    this.reconnectDelay = 1000;
    this.closedByUser = false;
  }

  connect() {
    this.closedByUser = false;
    this.ws = new WebSocket(`${WS_BASE_URL}/ws?token=${encodeURIComponent(this.token)}`);
    this.ws.onmessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      for (const listener of this.listeners) listener(message);
    };
    this.ws.onclose = () => {
      if (this.closedByUser) return;
      setTimeout(() => this.connect(), this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.6, 10000);
    };
    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
      if (this.lastMatchId) this.join(this.lastMatchId);
    };
  }

  onMessage(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _send(payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  join(matchId) {
    this.lastMatchId = matchId;
    this._send({ type: 'join', matchId });
  }

  sendAction(action) {
    this._send({ type: 'action', action });
  }

  close() {
    this.closedByUser = true;
    this.ws?.close();
  }
}
