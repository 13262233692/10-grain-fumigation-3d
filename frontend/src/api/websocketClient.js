class WebSocketClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 3000;
    this.handlers = new Map();
    this.subscriptions = new Set();
    this.isConnected = false;
    this.clientId = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log('[WS] Connected');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this._emit('connected', {});

          for (const channel of this.subscriptions) {
            this.subscribe(channel);
          }

          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this._handleMessage(message);
          } catch (e) {
            console.error('[WS] Message parse error:', e);
          }
        };

        this.ws.onclose = () => {
          console.log('[WS] Disconnected');
          this.isConnected = false;
          this._emit('disconnected', {});
          this._attemptReconnect();
        };

        this.ws.onerror = (error) => {
          console.error('[WS] Error:', error);
          reject(error);
        };
      } catch (e) {
        reject(e);
      }
    });
  }

  _handleMessage(message) {
    if (message.type === 'connected') {
      this.clientId = message.clientId;
      return;
    }

    if (message.type === 'subscribed') {
      return;
    }

    if (message.type === 'pong') {
      this._emit('pong', message);
      return;
    }

    if (message.type && this.handlers.has(message.type)) {
      const handler = this.handlers.get(message.type);
      handler(message.data, message);
    }

    this._emit('message', message);
  }

  _attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WS] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);

    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect().catch(() => {});
    }, delay);
  }

  subscribe(channel) {
    this.subscriptions.add(channel);

    if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'subscribe',
        payload: { channel },
      }));
    }
  }

  unsubscribe(channel) {
    this.subscriptions.delete(channel);

    if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'unsubscribe',
        payload: { channel },
      }));
    }
  }

  send(type, payload = {}) {
    if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }

  on(event, handler) {
    this.handlers.set(event, handler);
  }

  off(event) {
    this.handlers.delete(event);
  }

  _emit(event, data) {
    if (this.handlers.has(event)) {
      this.handlers.get(event)(data);
    }
  }

  ping() {
    this.send('ping');
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

export default WebSocketClient;
