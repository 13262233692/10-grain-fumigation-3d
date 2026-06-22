const db = require('../db');
const SensorParser = require('../parsers/sensorParser');
const IDWInterpolator = require('../interpolation/idwInterpolator');
const config = require('../config');

const parser = new SensorParser();
const interpolator = new IDWInterpolator();

class DataService {
  async getWarehouses() {
    const result = await db.query(
      'SELECT * FROM warehouse ORDER BY code'
    );
    return result.rows;
  }

  async getWarehouseByCode(code) {
    const result = await db.query(
      'SELECT * FROM warehouse WHERE code = $1',
      [code]
    );
    return result.rows[0] || null;
  }

  async getWarehouseById(id) {
    const result = await db.query(
      'SELECT * FROM warehouse WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  async getSensors(warehouseId) {
    const result = await db.query(
      'SELECT * FROM sensor WHERE warehouse_id = $1 ORDER BY code',
      [warehouseId]
    );
    return result.rows;
  }

  async getSensorByCode(code) {
    const result = await db.query(
      'SELECT * FROM sensor WHERE code = $1',
      [code]
    );
    return result.rows[0] || null;
  }

  async getLatestReadings(warehouseId, limit = 100) {
    const result = await db.query(
      `SELECT gr.*, s.code as sensor_code, s.type as sensor_type, 
              s.pos_x, s.pos_y, s.pos_z
       FROM gas_reading gr
       JOIN sensor s ON gr.sensor_id = s.id
       WHERE gr.warehouse_id = $1
       ORDER BY gr.reading_time DESC
       LIMIT $2`,
      [warehouseId, limit]
    );
    return result.rows;
  }

  async getLatestSensorReadings(warehouseId) {
    const result = await db.query(
      `SELECT DISTINCT ON (s.id) 
              s.id as sensor_id, s.code, s.type, s.status,
              s.pos_x, s.pos_y, s.pos_z, s.last_seen,
              gr.concentration_ppm, gr.temperature, gr.humidity,
              gr.reading_time, gr.status_code
       FROM sensor s
       LEFT JOIN gas_reading gr ON gr.sensor_id = s.id
       WHERE s.warehouse_id = $1
       ORDER BY s.id, gr.reading_time DESC`,
      [warehouseId]
    );
    return result.rows;
  }

  async getHistoricalSensorReadings(warehouseId, snapshotTime, windowMs = 1800000) {
    const windowStart = new Date(snapshotTime.getTime() - windowMs);

    const result = await db.query(
      `SELECT DISTINCT ON (s.id)
              s.id as sensor_id, s.code, s.type, s.status,
              s.pos_x, s.pos_y, s.pos_z,
              gr.concentration_ppm, gr.temperature, gr.humidity,
              gr.reading_time, gr.status_code
       FROM sensor s
       LEFT JOIN gas_reading gr 
         ON gr.sensor_id = s.id
         AND gr.reading_time <= $2
         AND gr.reading_time >= $3
       WHERE s.warehouse_id = $1
       ORDER BY s.id, gr.reading_time DESC NULLS LAST`,
      [warehouseId, snapshotTime, windowStart]
    );

    return result.rows.filter((r) => r.reading_time !== null);
  }

  async getVents(warehouseId) {
    const result = await db.query(
      'SELECT * FROM vent_state WHERE warehouse_id = $1 ORDER BY code',
      [warehouseId]
    );
    return result.rows;
  }

  async updateVentState(ventId, isOpen, fanSpeed) {
    const result = await db.query(
      `UPDATE vent_state 
       SET is_open = $1, fan_speed = $2, last_updated = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [isOpen, fanSpeed, ventId]
    );
    return result.rows[0] || null;
  }

  async getRiskZones(warehouseId, limit = 10) {
    const result = await db.query(
      'SELECT * FROM risk_zone WHERE warehouse_id = $1 ORDER BY calculated_at DESC LIMIT $2',
      [warehouseId, limit]
    );
    return result.rows;
  }

  async processSensorMessage(rawMessage) {
    const parsed = parser.parse(rawMessage);

    if (!parsed.valid) {
      return {
        success: false,
        error: 'Validation failed',
        errors: parsed.validationErrors,
        parsed,
      };
    }

    const warehouse = await this.getWarehouseByCode(parsed.warehouseCode);
    if (!warehouse) {
      return {
        success: false,
        error: `Warehouse not found: ${parsed.warehouseCode}`,
        parsed,
      };
    }

    const bounds = {
      length: parseFloat(warehouse.length_m),
      width: parseFloat(warehouse.width_m),
      height: parseFloat(warehouse.height_m),
    };

    const coordErrors = parser.validateCoordinates(parsed, bounds);
    if (coordErrors.length > 0) {
      return {
        success: false,
        error: 'Coordinate validation failed',
        errors: coordErrors,
        parsed,
      };
    }

    let sensor = await this.getSensorByCode(parsed.sensorCode);

    if (!sensor) {
      const sensorResult = await db.query(
        `INSERT INTO sensor (warehouse_id, code, type, pos_x, pos_y, pos_z, status, last_seen)
         VALUES ($1, $2, $3, $4, $5, $6, 'online', $7)
         RETURNING *`,
        [
          warehouse.id,
          parsed.sensorCode,
          parsed.sensorType,
          parsed.posX,
          parsed.posY,
          parsed.posZ,
          parsed.readingTime,
        ]
      );
      sensor = sensorResult.rows[0];
    } else {
      await db.query(
        `UPDATE sensor 
         SET pos_x = $1, pos_y = $2, pos_z = $3, 
             status = 'online', last_seen = $4, type = $5
         WHERE id = $6`,
        [parsed.posX, parsed.posY, parsed.posZ, parsed.readingTime, parsed.sensorType, sensor.id]
      );
    }

    const readingResult = await db.query(
      `INSERT INTO gas_reading 
         (sensor_id, warehouse_id, concentration_ppm, temperature, humidity, 
          reading_time, status_code, raw_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        sensor.id,
        warehouse.id,
        parsed.concentration,
        parsed.temperature,
        parsed.humidity,
        parsed.readingTime,
        parsed.statusCode,
        parsed.rawMessage,
      ]
    );

    return {
      success: true,
      warehouse,
      sensor,
      reading: readingResult.rows[0],
      parsed,
    };
  }

  async calculateVoxelGrid(warehouseId, gridSize) {
    const warehouse = await this.getWarehouseById(warehouseId);
    if (!warehouse) {
      throw new Error('Warehouse not found');
    }

    const latestReadings = await this.getLatestSensorReadings(warehouseId);
    const ph3Readings = latestReadings.filter(
      (r) => r.type === 'PH3' && r.concentration_ppm !== null
    );

    if (ph3Readings.length === 0) {
      return null;
    }

    const samples = ph3Readings.map((r) => ({
      x: parseFloat(r.pos_x),
      y: parseFloat(r.pos_y),
      z: parseFloat(r.pos_z),
      value: parseFloat(r.concentration_ppm),
      sensorId: r.sensor_id,
      sensorCode: r.code,
    }));

    const bounds = {
      length: parseFloat(warehouse.length_m),
      width: parseFloat(warehouse.width_m),
      height: parseFloat(warehouse.height_m),
    };

    const grid = interpolator.generateVoxelGridOptimized(
      samples,
      bounds,
      gridSize || config.voxel.gridSize
    );

    const riskResult = interpolator.calculateRiskZones(grid, {
      low: config.risk.lowThreshold,
      medium: config.risk.mediumThreshold,
      high: config.risk.highThreshold,
    });

    return {
      grid: interpolator.serializeGrid(grid),
      riskZones: riskResult.zones,
      samples,
      warehouse,
    };
  }

  async getHistoricalReadings(warehouseId, startTime, endTime, sensorCode) {
    let query = `
      SELECT gr.*, s.code as sensor_code, s.type as sensor_type
      FROM gas_reading gr
      JOIN sensor s ON gr.sensor_id = s.id
      WHERE gr.warehouse_id = $1
    `;
    const params = [warehouseId];
    let paramIndex = 2;

    if (startTime) {
      query += ` AND gr.reading_time >= $${paramIndex}`;
      params.push(startTime);
      paramIndex++;
    }

    if (endTime) {
      query += ` AND gr.reading_time <= $${paramIndex}`;
      params.push(endTime);
      paramIndex++;
    }

    if (sensorCode) {
      query += ` AND s.code = $${paramIndex}`;
      params.push(sensorCode);
      paramIndex++;
    }

    query += ' ORDER BY gr.reading_time ASC LIMIT 10000';

    const result = await db.query(query, params);
    return result.rows;
  }

  async calculateHistoricalVoxelGrid(warehouseId, snapshotTime, gridSize, windowMs = 1800000) {
    const warehouse = await this.getWarehouseById(warehouseId);
    if (!warehouse) {
      throw new Error('Warehouse not found');
    }

    const historicalReadings = await this.getHistoricalSensorReadings(
      warehouseId,
      snapshotTime,
      windowMs
    );

    const ph3Readings = historicalReadings.filter(
      (r) => r.type === 'PH3' && r.concentration_ppm !== null
    );

    if (ph3Readings.length === 0) {
      return {
        grid: null,
        riskZones: [],
        samples: [],
        warehouse,
        snapshotTime,
        sensorCount: 0,
      };
    }

    const samples = ph3Readings.map((r) => ({
      x: parseFloat(r.pos_x),
      y: parseFloat(r.pos_y),
      z: parseFloat(r.pos_z),
      value: parseFloat(r.concentration_ppm),
      sensorId: r.sensor_id,
      sensorCode: r.code,
      readingTime: r.reading_time,
    }));

    const bounds = {
      length: parseFloat(warehouse.length_m),
      width: parseFloat(warehouse.width_m),
      height: parseFloat(warehouse.height_m),
    };

    const grid = interpolator.generateVoxelGridOptimized(
      samples,
      bounds,
      gridSize || config.voxel.gridSize
    );

    const riskResult = interpolator.calculateRiskZones(grid, {
      low: config.risk.lowThreshold,
      medium: config.risk.mediumThreshold,
      high: config.risk.highThreshold,
    });

    return {
      grid: interpolator.serializeGrid(grid),
      riskZones: riskResult.zones,
      samples,
      sensorReadings: historicalReadings,
      warehouse,
      snapshotTime,
      sensorCount: ph3Readings.length,
    };
  }

  async getHistoricalVoxelGrid(warehouseId, snapshotTime, gridSize, windowMs = 1800000) {
    const result = await this.calculateHistoricalVoxelGrid(
      warehouseId,
      snapshotTime,
      gridSize,
      windowMs
    );
    return result.grid;
  }

  async checkSensorStatuses(warehouseId) {
    const sensors = await this.getSensors(warehouseId);
    const offlineThreshold = config.sensor.offlineThresholdMs;
    const now = Date.now();

    const results = [];
    for (const sensor of sensors) {
      const isOffline = parser.isSensorOffline(sensor.last_seen, offlineThreshold);
      const lastSeenMs = sensor.last_seen ? new Date(sensor.last_seen).getTime() : 0;
      const offlineDuration = isOffline ? now - lastSeenMs : 0;

      results.push({
        ...sensor,
        isOffline,
        offlineDurationMs: offlineDuration,
        effectiveStatus: isOffline ? 'offline' : sensor.status,
      });

      if (isOffline && sensor.status === 'online') {
        await db.query(
          "UPDATE sensor SET status = 'offline' WHERE id = $1",
          [sensor.id]
        );
      }
    }

    return results;
  }

  async getEntryPermission(warehouseId, position = null) {
    let maxConcentration = 0;

    if (position) {
      const latestReadings = await this.getLatestSensorReadings(warehouseId);
      const ph3Readings = latestReadings.filter(
        (r) => r.type === 'PH3' && r.concentration_ppm !== null
      );

      const samples = ph3Readings.map((r) => ({
        x: parseFloat(r.pos_x),
        y: parseFloat(r.pos_y),
        z: parseFloat(r.pos_z),
        value: parseFloat(r.concentration_ppm),
      }));

      maxConcentration = interpolator.interpolatePoint(position, samples);
    } else {
      const latestReadings = await this.getLatestReadings(warehouseId, 20);
      const ph3Readings = latestReadings.filter((r) => r.sensor_type === 'PH3');
      maxConcentration = Math.max(...ph3Readings.map((r) => parseFloat(r.concentration_ppm)), 0);
    }

    return {
      maxConcentration,
      permission: interpolator.getEntryPermission(maxConcentration),
      thresholds: {
        low: config.risk.lowThreshold,
        medium: config.risk.mediumThreshold,
        high: config.risk.highThreshold,
      },
    };
  }
}

module.exports = new DataService();
