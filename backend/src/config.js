require('dotenv').config();

module.exports = {
  server: {
    port: parseInt(process.env.SERVER_PORT || '3000', 10),
    wsPort: parseInt(process.env.WS_PORT || '3001', 10),
  },
  database: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'grain_fumigation',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
  },
  sensor: {
    offlineThresholdMs: parseInt(process.env.SENSOR_OFFLINE_THRESHOLD_MS || '60000', 10),
  },
  risk: {
    lowThreshold: parseFloat(process.env.RISK_LOW_THRESHOLD || '100'),
    mediumThreshold: parseFloat(process.env.RISK_MEDIUM_THRESHOLD || '300'),
    highThreshold: parseFloat(process.env.RISK_HIGH_THRESHOLD || '500'),
  },
  voxel: {
    gridSize: parseInt(process.env.VOXEL_GRID_SIZE || '20', 10),
    idwPower: parseFloat(process.env.IDW_POWER || '2'),
  },
};
