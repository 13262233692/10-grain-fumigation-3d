const express = require('express');
const cors = require('cors');
const dataService = require('../services/dataService');
const SensorParser = require('../parsers/sensorParser');

const router = express.Router();
const parser = new SensorParser();

router.get('/warehouses', async (req, res) => {
  try {
    const warehouses = await dataService.getWarehouses();
    res.json({ success: true, data: warehouses });
  } catch (err) {
    console.error('Error getting warehouses:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/warehouses/:code', async (req, res) => {
  try {
    const warehouse = await dataService.getWarehouseByCode(req.params.code);
    if (!warehouse) {
      return res.status(404).json({ success: false, error: 'Warehouse not found' });
    }
    res.json({ success: true, data: warehouse });
  } catch (err) {
    console.error('Error getting warehouse:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/warehouses/:id/sensors', async (req, res) => {
  try {
    const sensors = await dataService.getSensors(req.params.id);
    res.json({ success: true, data: sensors });
  } catch (err) {
    console.error('Error getting sensors:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/warehouses/:id/latest-readings', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 100;
    const readings = await dataService.getLatestReadings(req.params.id, limit);
    res.json({ success: true, data: readings });
  } catch (err) {
    console.error('Error getting latest readings:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/warehouses/:id/sensor-readings', async (req, res) => {
  try {
    const readings = await dataService.getLatestSensorReadings(req.params.id);
    res.json({ success: true, data: readings });
  } catch (err) {
    console.error('Error getting sensor readings:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/warehouses/:id/vents', async (req, res) => {
  try {
    const vents = await dataService.getVents(req.params.id);
    res.json({ success: true, data: vents });
  } catch (err) {
    console.error('Error getting vents:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/vents/:id', async (req, res) => {
  try {
    const { is_open, fan_speed } = req.body;
    const vent = await dataService.updateVentState(
      req.params.id,
      is_open,
      fan_speed || 0
    );
    if (!vent) {
      return res.status(404).json({ success: false, error: 'Vent not found' });
    }
    res.json({ success: true, data: vent });
  } catch (err) {
    console.error('Error updating vent:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/warehouses/:id/risk-zones', async (req, res) => {
  try {
    const zones = await dataService.getRiskZones(req.params.id);
    res.json({ success: true, data: zones });
  } catch (err) {
    console.error('Error getting risk zones:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/warehouses/:id/voxel-grid', async (req, res) => {
  try {
    const gridSize = parseInt(req.query.gridSize, 10) || null;
    const result = await dataService.calculateVoxelGrid(req.params.id, gridSize);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('Error calculating voxel grid:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/warehouses/:id/historical-readings', async (req, res) => {
  try {
    const { start_time, end_time, sensor_code } = req.query;
    const readings = await dataService.getHistoricalReadings(
      req.params.id,
      start_time ? new Date(start_time) : null,
      end_time ? new Date(end_time) : null,
      sensor_code || null
    );
    res.json({ success: true, data: readings });
  } catch (err) {
    console.error('Error getting historical readings:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/warehouses/:id/historical-sensor-readings', async (req, res) => {
  try {
    const { snapshot_time, window_ms } = req.query;
    if (!snapshot_time) {
      return res.status(400).json({ success: false, error: 'snapshot_time is required' });
    }
    const readings = await dataService.getHistoricalSensorReadings(
      req.params.id,
      new Date(snapshot_time),
      window_ms ? parseInt(window_ms, 10) : undefined
    );
    res.json({ success: true, data: readings });
  } catch (err) {
    console.error('Error getting historical sensor readings:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/warehouses/:id/historical-voxel', async (req, res) => {
  try {
    const { snapshot_time, grid_size, window_ms, full } = req.query;
    if (!snapshot_time) {
      return res.status(400).json({ success: false, error: 'snapshot_time is required' });
    }

    const snapshotTime = new Date(snapshot_time);
    const gridSize = grid_size ? parseInt(grid_size, 10) : null;
    const windowMs = window_ms ? parseInt(window_ms, 10) : undefined;

    if (full === 'true' || full === '1') {
      const result = await dataService.calculateHistoricalVoxelGrid(
        req.params.id,
        snapshotTime,
        gridSize,
        windowMs
      );
      res.json({ success: true, data: result });
    } else {
      const grid = await dataService.getHistoricalVoxelGrid(
        req.params.id,
        snapshotTime,
        gridSize,
        windowMs
      );
      res.json({ success: true, data: grid });
    }
  } catch (err) {
    console.error('Error getting historical voxel grid:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/warehouses/:id/sensor-status', async (req, res) => {
  try {
    const statuses = await dataService.checkSensorStatuses(req.params.id);
    res.json({ success: true, data: statuses });
  } catch (err) {
    console.error('Error checking sensor statuses:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/warehouses/:id/entry-permission', async (req, res) => {
  try {
    const { x, y, z } = req.query;
    const position = x !== undefined && y !== undefined && z !== undefined
      ? { x: parseFloat(x), y: parseFloat(y), z: parseFloat(z) }
      : null;

    const result = await dataService.getEntryPermission(req.params.id, position);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('Error getting entry permission:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/sensor-data', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, error: 'message is required' });
    }

    const result = await dataService.processSensorMessage(message);

    if (result.success) {
      const wsService = req.app.get('wsService');
      if (wsService) {
        wsService.broadcast('sensor_update', {
          warehouseId: result.warehouse.id,
          warehouseCode: result.warehouse.code,
          sensor: result.sensor,
          reading: result.reading,
        });
      }
    }

    res.json(result);
  } catch (err) {
    console.error('Error processing sensor data:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/sensor-data/batch', async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ success: false, error: 'messages array is required' });
    }

    const results = [];
    for (const msg of messages) {
      try {
        const result = await dataService.processSensorMessage(msg);
        results.push(result);
      } catch (e) {
        results.push({ success: false, error: e.message, message: msg });
      }
    }

    const wsService = req.app.get('wsService');
    if (wsService) {
      const successResults = results.filter((r) => r.success);
      if (successResults.length > 0) {
        wsService.broadcast('sensor_batch_update', {
          count: successResults.length,
          updates: successResults.slice(0, 10),
        });
      }
    }

    res.json({
      success: true,
      total: messages.length,
      processed: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    });
  } catch (err) {
    console.error('Error processing batch sensor data:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/parse-test', async (req, res) => {
  try {
    const { message } = req.body;
    const parsed = parser.parse(message);
    res.json({ success: true, data: parsed });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

module.exports = router;
