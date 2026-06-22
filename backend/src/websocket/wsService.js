const WebSocket = require('ws');
const config = require('./config');

class WebSocketService {
  constructor(server) {
    this.wss = new WebSocket.Server({ server });
    this.clients = new Map();
    this.subscriptions = new Map();
    this.messageHandlers = new Map();
    this.nextClientId = 1;

    this._setupConnectionHandler();
    this._registerDefaultHandlers();
  }

  _setupConnectionHandler() {
    this.wss.on('connection', (ws, req) => {
      const clientId = `client_${this.nextClientId++}`;
      const clientInfo = {
        id: clientId,
        ws,
        subscriptions: new Set(),
        connectedAt: new Date(),
        ip: req.socket.remoteAddress,
      };

      this.clients.set(clientId, clientInfo);
      console.log(`[WS] Client connected: ${clientId}, total: ${this.clients.size}`);

      this._send(ws, {
        type: 'connected',
        clientId,
        serverTime: new Date().toISOString(),
      });

      ws.on('message', (data) => {
        this._handleMessage(clientId, data);
      });

      ws.on('close', () => {
        this._handleDisconnect(clientId);
      });

      ws.on('error', (err) => {
        console.error(`[WS] Client error ${clientId}:`, err.message);
      });
    });
  }

  _registerDefaultHandlers() {
    this.registerHandler('subscribe', (clientId, payload) => {
      const client = this.clients.get(clientId);
      if (!client) return;

      const channel = payload.channel;
      if (channel) {
        client.subscriptions.add(channel);
        if (!this.subscriptions.has(channel)) {
          this.subscriptions.set(channel, new Set());
        }
        this.subscriptions.get(channel).add(clientId);

        this._send(client.ws, {
          type: 'subscribed',
          channel,
          success: true,
        });
      }
    });

    this.registerHandler('unsubscribe', (clientId, payload) => {
      const client = this.clients.get(clientId);
      if (!client) return;

      const channel = payload.channel;
      if (channel) {
        client.subscriptions.delete(channel);
        const channelClients = this.subscriptions.get(channel);
        if (channelClients) {
          channelClients.delete(clientId);
        }
      }
    });

    this.registerHandler('ping', (clientId) => {
      const client = this.clients.get(clientId);
      if (client) {
        this._send(client.ws, {
          type: 'pong',
          serverTime: new Date().toISOString(),
        });
      }
    });
  }

  _handleMessage(clientId, data) {
    try {
      const message = JSON.parse(data.toString());
      const handler = this.messageHandlers.get(message.type);

      if (handler) {
        handler(clientId, message.payload || {}, message);
      } else {
        console.warn(`[WS] Unknown message type: ${message.type}`);
      }
    } catch (e) {
      console.error(`[WS] Message parse error:`, e.message);
    }
  }

  _handleDisconnect(clientId) {
    const client = this.clients.get(clientId);
    if (client) {
      for (const channel of client.subscriptions) {
        const channelClients = this.subscriptions.get(channel);
        if (channelClients) {
          channelClients.delete(clientId);
        }
      }
      this.clients.delete(clientId);
    }
    console.log(`[WS] Client disconnected: ${clientId}, total: ${this.clients.size}`);
  }

  _send(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  registerHandler(type, handler) {
    this.messageHandlers.set(type, handler);
  }

  broadcast(channel, data) {
    const channelClients = this.subscriptions.get(channel);
    if (!channelClients || channelClients.size === 0) return;

    const message = JSON.stringify({
      type: channel,
      data,
      timestamp: new Date().toISOString(),
    });

    for (const clientId of channelClients) {
      const client = this.clients.get(clientId);
      if (client && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
      }
    }
  }

  broadcastAll(data) {
    const message = JSON.stringify({
      data,
      timestamp: new Date().toISOString(),
    });

    for (const [clientId, client] of this.clients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
      }
    }
  }

  sendToClient(clientId, type, data) {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      this._send(client.ws, {
        type,
        data,
        timestamp: new Date().toISOString(),
      });
    }
  }

  getConnectedClients() {
    return this.clients.size;
  }

  getSubscriptions(channel) {
    const channelClients = this.subscriptions.get(channel);
    return channelClients ? channelClients.size : 0;
  }

  close() {
    this.wss.close();
  }
}

module.exports = WebSocketService;
