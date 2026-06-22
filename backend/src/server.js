const express = require('express');
const http = require('http');
const cors = require('cors');
const config = require('./config');
const apiRoutes = require('./routes/api');
const WebSocketService = require('./websocket/wsService');
const dataService = require('./services/dataService');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api', apiRoutes);

const wsService = new WebSocketService(server);
app.set('wsService', wsService);

setInterval(async () => {
  try {
    const warehouses = await dataService.getWarehouses();
    for (const wh of warehouses) {
      const statuses = await dataService.checkSensorStatuses(wh.id);
      const offlineCount = statuses.filter((s) => s.isOffline).length;

      if (offlineCount > 0) {
        wsService.broadcast('sensor_status', {
          warehouseId: wh.id,
          warehouseCode: wh.code,
          offlineCount,
          totalCount: statuses.length,
          timestamp: new Date().toISOString(),
        });
      }
    }
  } catch (err) {
    console.error('Error in sensor status check:', err.message);
  }
}, 30000);

const PORT = config.server.port;

server.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`  粮库熏蒸监测系统后端服务`);
  console.log(`========================================`);
  console.log(`  HTTP Server: http://localhost:${PORT}`);
  console.log(`  WebSocket:  ws://localhost:${PORT}`);
  console.log(`  API Base:   http://localhost:${PORT}/api`);
  console.log(`  Health:     http://localhost:${PORT}/api/health`);
  console.log(`========================================`);
});

process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  wsService.close();
  const db = require('./db');
  await db.closePool();
  process.exit(0);
});

module.exports = { app, server, wsService };
