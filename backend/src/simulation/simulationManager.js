const crypto = require('crypto');
const db = require('../db');
const VentilationSimulator = require('./ventilationSimulator');
const DataService = require('../services/dataService');

class SimulationManager {
  constructor() {
    this.activeSimulations = new Map();
    this.simulator = new VentilationSimulator();
    this.dataService = new DataService();
    this._startCleanupWorker();
  }

  async createSimulation(params) {
    const {
      warehouseId,
      name,
      ventConfig,
      gridSize = 10,
      totalSeconds = 3600,
      timeStepSeconds = 60,
      initialSnapshotTime = null,
    } = params;

    const id = crypto.randomUUID();
    const snapshotTime = initialSnapshotTime ? new Date(initialSnapshotTime) : new Date();

    const result = await db.query(
      `INSERT INTO ventilation_simulation
       (id, warehouse_id, name, vent_config, grid_size, total_seconds,
        time_step_seconds, initial_snapshot_time, status, progress)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', 0)
       RETURNING *`,
      [
        id,
        warehouseId,
        name || `通风模拟-${new Date().toLocaleString()}`,
        JSON.stringify(ventConfig),
        gridSize,
        totalSeconds,
        timeStepSeconds,
        snapshotTime,
      ]
    );

    this._queueSimulation(id);

    return this._rowToObject(result.rows[0]);
  }

  async getSimulation(id) {
    const result = await db.query(
      'SELECT * FROM ventilation_simulation WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) return null;
    return this._rowToObject(result.rows[0]);
  }

  async listSimulations(warehouseId, options = {}) {
    const { limit = 20, offset = 0, status } = options;
    let queryText = 'SELECT * FROM ventilation_simulation WHERE warehouse_id = $1';
    const params = [warehouseId];

    if (status) {
      params.push(status);
      queryText += ` AND status = $${params.length}`;
    }

    queryText += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);

    const result = await db.query(queryText, params);
    return result.rows.map((r) => this._rowToObject(r));
  }

  async cancelSimulation(id) {
    const sim = await this.getSimulation(id);
    if (!sim) return null;

    if (['completed', 'failed', 'canceled'].includes(sim.status)) {
      return sim;
    }

    if (this.activeSimulations.has(id)) {
      const ctrl = this.activeSimulations.get(id);
      ctrl.canceled = true;
    }

    const result = await db.query(
      `UPDATE ventilation_simulation
       SET status = 'canceled', canceled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status NOT IN ('completed', 'failed', 'canceled')
       RETURNING *`,
      [id]
    );

    return result.rows.length > 0 ? this._rowToObject(result.rows[0]) : sim;
  }

  async deleteSimulation(id) {
    const sim = await this.getSimulation(id);
    if (!sim) return null;

    if (sim.status === 'running') {
      await this.cancelSimulation(id);
    }

    await db.query('DELETE FROM ventilation_simulation WHERE id = $1', [id]);
    this.activeSimulations.delete(id);
    return sim;
  }

  async _queueSimulation(id) {
    const run = async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      this._runSimulation(id);
    };
    setImmediate(run);
  }

  async _runSimulation(id) {
    const ctrl = { canceled: false };
    this.activeSimulations.set(id, ctrl);

    try {
      await db.query(
        `UPDATE ventilation_simulation
         SET status = 'running', started_at = CURRENT_TIMESTAMP, progress = 0
         WHERE id = $1`,
        [id]
      );

      const sim = await this.getSimulation(id);
      if (!sim) throw new Error('模拟任务不存在');

      const warehouse = await this.dataService.getWarehouseById(sim.warehouseId);
      if (!warehouse) throw new Error('仓房不存在');

      const bounds = {
        length: parseFloat(warehouse.length_m),
        width: parseFloat(warehouse.width_m),
        height: parseFloat(warehouse.height_m),
      };

      let sensorReadings;
      if (sim.initialSnapshotTime) {
        sensorReadings = await this.dataService.getHistoricalSensorReadings(
          sim.warehouseId,
          new Date(sim.initialSnapshotTime)
        );
      } else {
        sensorReadings = await this.dataService.getLatestSensorReadings(sim.warehouseId);
      }

      const warehouseVents = await this.dataService.getVents(sim.warehouseId);

      const result = await this.simulator.runSimulation(
        {
          bounds,
          gridSize: sim.gridSize,
          sensorReadings: sensorReadings.map((r) => ({
            ...r,
            pos_x: r.pos_x,
            pos_y: r.pos_y,
            pos_z: r.pos_z,
            concentration_ppm: r.concentration_ppm,
            status: r.status || 'online',
          })),
          ventConfig: sim.ventConfig,
          warehouseVents,
          totalSeconds: sim.totalSeconds,
          timeStepSeconds: sim.timeStepSeconds,
        },
        async (progress, step, total) => {
          if (ctrl.canceled) return;
          await db.query(
            'UPDATE ventilation_simulation SET progress = $1 WHERE id = $2',
            [progress, id]
          );
        },
        () => ctrl.canceled
      );

      if (result.canceled) {
        await db.query(
          `UPDATE ventilation_simulation
           SET status = 'canceled',
               results = $1,
               canceled_at = CURRENT_TIMESTAMP,
               completed_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [
            JSON.stringify({ partialResults: result.partialResults }),
            id,
          ]
        );
      } else {
        await db.query(
          `UPDATE ventilation_simulation
           SET status = 'completed',
               progress = 100,
               results = $1,
               completed_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [JSON.stringify(result), id]
        );
      }
    } catch (err) {
      console.error('模拟执行失败:', err);
      try {
        await db.query(
          `UPDATE ventilation_simulation
           SET status = 'failed', error_message = $1, completed_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [err.message, id]
        );
      } catch (e) {
        console.error('更新模拟失败状态错误:', e);
      }
    } finally {
      this.activeSimulations.delete(id);
    }
  }

  _startCleanupWorker() {
    setInterval(async () => {
      for (const [id, ctrl] of this.activeSimulations) {
        const sim = await this.getSimulation(id);
        if (sim && ['canceled'].includes(sim.status)) {
          ctrl.canceled = true;
        }
      }
    }, 2000);
  }

  _rowToObject(row) {
    return {
      id: row.id,
      warehouseId: row.warehouse_id,
      name: row.name,
      status: row.status,
      ventConfig: typeof row.vent_config === 'string'
        ? JSON.parse(row.vent_config)
        : row.vent_config,
      gridSize: row.grid_size,
      totalSeconds: row.total_seconds,
      timeStepSeconds: row.time_step_seconds,
      initialSnapshotTime: row.initial_snapshot_time,
      progress: row.progress,
      results: row.results
        ? (typeof row.results === 'string' ? JSON.parse(row.results) : row.results)
        : null,
      errorMessage: row.error_message,
      canceledAt: row.canceled_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

const manager = new SimulationManager();
module.exports = manager;
