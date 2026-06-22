class VentilationSimulator {
  constructor(options = {}) {
    this.diffusionRate = options.diffusionRate || 0.05;
    this.airExchangeEfficiency = options.airExchangeEfficiency || 0.8;
    this.maxGridSize = options.maxGridSize || 30;
    this.defaultFanFlowRate = options.defaultFanFlowRate || 5.0;
  }

  validateGridSize(gridDims) {
    const total = gridDims.nx * gridDims.ny * gridDims.nz;
    if (total > this.maxGridSize ** 3) {
      throw new Error(
        `体素数量过大: ${total} > ${this.maxGridSize ** 3}，请调小 gridSize`
      );
    }
    return true;
  }

  validateVentConfig(ventConfig, warehouseVents) {
    if (!ventConfig || !Array.isArray(ventConfig) || ventConfig.length === 0) {
      throw new Error('通风口配置不能为空');
    }

    const ventCodes = new Set(warehouseVents.map((v) => v.code));
    const missingVents = ventConfig
      .map((v) => v.code)
      .filter((c) => !ventCodes.has(c));

    if (missingVents.length > 0) {
      throw new Error(`通风口不存在: ${missingVents.join(', ')}`);
    }

    const activeVents = ventConfig.filter((v) => v.is_open && v.fan_speed > 0);
    if (activeVents.length === 0) {
      throw new Error('至少需要开启一个通风口');
    }

    const hasInlet = activeVents.some((v) => v.direction === 'in');
    const hasOutlet = activeVents.some((v) => v.direction === 'out');
    if (!hasInlet || !hasOutlet) {
      throw new Error('需要同时有进风口和排风口开启');
    }

    return true;
  }

  validateSensors(sensorReadings) {
    if (!sensorReadings || sensorReadings.length === 0) {
      throw new Error('无有效传感器读数');
    }

    const onlineReadings = sensorReadings.filter((r) => r.status !== 'offline');
    if (onlineReadings.length === 0) {
      throw new Error('所有传感器均离线，无法进行模拟');
    }

    return true;
  }

  _computeGridDimensions(bounds, gridSize) {
    const nx = Math.max(2, Math.ceil(bounds.length / gridSize));
    const ny = Math.max(2, Math.ceil(bounds.height / gridSize));
    const nz = Math.max(2, Math.ceil(bounds.width / gridSize));
    return { nx, ny, nz, dx: bounds.length / nx, dy: bounds.height / ny, dz: bounds.width / nz };
  }

  _initializeConcentrationGrid(gridDims, sensorReadings, bounds) {
    const { nx, ny, nz, dx, dy, dz } = gridDims;
    const grid = new Float32Array(nx * ny * nz);
    const samples = sensorReadings
      .filter((r) => r.status !== 'offline' && r.concentration_ppm != null)
      .map((r) => ({
        x: parseFloat(r.pos_x),
        y: parseFloat(r.pos_y),
        z: parseFloat(r.pos_z),
        value: parseFloat(r.concentration_ppm),
      }));

    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        for (let k = 0; k < nz; k++) {
          const px = (i + 0.5) * dx;
          const py = (j + 0.5) * dy;
          const pz = (k + 0.5) * dz;

          let weightedSum = 0;
          let weightSum = 0;

          for (const s of samples) {
            const d2 =
              (px - s.x) ** 2 + (py - s.y) ** 2 + (pz - s.z) ** 2 + 0.01;
            const w = 1 / d2;
            weightedSum += s.value * w;
            weightSum += w;
          }

          const idx = this._gridIndex(i, j, k, nx, ny, nz);
          grid[idx] = weightSum > 0 ? weightedSum / weightSum : 0;
        }
      }
    }

    return grid;
  }

  _gridIndex(i, j, k, nx, ny, nz) {
    return i * ny * nz + j * nz + k;
  }

  _buildVentFields(gridDims, ventConfig, warehouseVents, bounds) {
    const { nx, ny, nz, dx, dy, dz } = gridDims;
    const activeVents = ventConfig.filter((v) => v.is_open && v.fan_speed > 0);
    const ventMap = new Map(warehouseVents.map((v) => [v.code, v]));

    const velocityField = {
      vx: new Float32Array(nx * ny * nz),
      vy: new Float32Array(nx * ny * nz),
      vz: new Float32Array(nx * ny * nz),
    };

    const extractionRates = new Float32Array(nx * ny * nz);
    const injectionRates = new Float32Array(nx * ny * nz);

    for (const ventCfg of activeVents) {
      const vent = ventMap.get(ventCfg.code);
      if (!vent) continue;

      const vx = parseFloat(vent.pos_x);
      const vy = parseFloat(vent.pos_y);
      const vz = parseFloat(vent.pos_z);
      const speedFactor = (ventCfg.fan_speed || 50) / 100;
      const flowRate = this.defaultFanFlowRate * speedFactor;
      const isOutlet = ventCfg.direction === 'out';

      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < ny; j++) {
          for (let k = 0; k < nz; k++) {
            const px = (i + 0.5) * dx;
            const py = (j + 0.5) * dy;
            const pz = (k + 0.5) * dz;

            const dist = Math.sqrt(
              (px - vx) ** 2 + (py - vy) ** 2 + (pz - vz) ** 2 + 0.5
            );
            const influence = Math.exp(-dist * 0.15) * speedFactor;
            const idx = this._gridIndex(i, j, k, nx, ny, nz);

            if (dist < 3.0) {
              if (isOutlet) {
                extractionRates[idx] += flowRate * influence;
              } else {
                injectionRates[idx] += flowRate * influence * 0.1;
              }
            }

            if (isOutlet) {
              velocityField.vx[idx] += ((px - vx) / dist) * influence * 0.3;
              velocityField.vy[idx] += ((py - vy) / dist) * influence * 0.3;
              velocityField.vz[idx] += ((pz - vz) / dist) * influence * 0.3;
            } else {
              velocityField.vx[idx] += ((vx - px) / dist) * influence * 0.2;
              velocityField.vy[idx] += ((vy - py) / dist) * influence * 0.2;
              velocityField.vz[idx] += ((vz - pz) / dist) * influence * 0.2;
            }
          }
        }
      }
    }

    return { velocityField, extractionRates, injectionRates };
  }

  _stepDiffusion(grid, gridDims, dt) {
    const { nx, ny, nz } = gridDims;
    const newGrid = new Float32Array(grid);
    const rate = this.diffusionRate * dt;

    for (let i = 1; i < nx - 1; i++) {
      for (let j = 1; j < ny - 1; j++) {
        for (let k = 1; k < nz - 1; k++) {
          const idx = this._gridIndex(i, j, k, nx, ny, nz);
          const neighborSum =
            grid[this._gridIndex(i - 1, j, k, nx, ny, nz)] +
            grid[this._gridIndex(i + 1, j, k, nx, ny, nz)] +
            grid[this._gridIndex(i, j - 1, k, nx, ny, nz)] +
            grid[this._gridIndex(i, j + 1, k, nx, ny, nz)] +
            grid[this._gridIndex(i, j, k - 1, nx, ny, nz)] +
            grid[this._gridIndex(i, j, k + 1, nx, ny, nz)];

          newGrid[idx] = grid[idx] + rate * (neighborSum / 6 - grid[idx]);
        }
      }
    }

    return newGrid;
  }

  _stepAdvection(grid, gridDims, velocityField, dt) {
    const { nx, ny, nz, dx, dy, dz } = gridDims;
    const newGrid = new Float32Array(grid);

    for (let i = 1; i < nx - 1; i++) {
      for (let j = 1; j < ny - 1; j++) {
        for (let k = 1; k < nz - 1; k++) {
          const idx = this._gridIndex(i, j, k, nx, ny, nz);

          const vx = velocityField.vx[idx];
          const vy = velocityField.vy[idx];
          const vz = velocityField.vz[idx];

          const backI = i - (vx * dt) / dx;
          const backJ = j - (vy * dt) / dy;
          const backK = k - (vz * dt) / dz;

          const i0 = Math.max(0, Math.min(nx - 1, Math.floor(backI)));
          const j0 = Math.max(0, Math.min(ny - 1, Math.floor(backJ)));
          const k0 = Math.max(0, Math.min(nz - 1, Math.floor(backK)));

          newGrid[idx] = grid[this._gridIndex(i0, j0, k0, nx, ny, nz)];
        }
      }
    }

    return newGrid;
  }

  _stepVentilation(grid, gridDims, extractionRates, dt, bounds, totalFlowRate) {
    const { nx, ny, nz } = gridDims;
    const totalCells = nx * ny * nz;
    const newGrid = new Float32Array(grid);

    const warehouseVolume = bounds.length * bounds.width * bounds.height;

    const ach = (totalFlowRate * 3600) / Math.max(warehouseVolume, 1);
    const globalExchangePerStep = Math.min(0.9, ach * (dt / 3600) * this.airExchangeEfficiency);
    const globalDecay = Math.max(0, 1 - globalExchangePerStep);

    for (let i = 0; i < totalCells; i++) {
      const localExtraction = extractionRates[i];
      const localFactor = Math.max(0, 1 - Math.min(localExtraction * 0.05, 0.8));
      const combinedFactor = globalDecay * localFactor;

      newGrid[i] = Math.max(0, grid[i] * combinedFactor);
    }

    return newGrid;
  }

  _gridToSerializable(grid, gridDims, bounds) {
    const { nx, ny, nz, dx, dy, dz } = gridDims;
    const voxels = [];
    let minVal = Infinity;
    let maxVal = -Infinity;
    let sum = 0;

    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        for (let k = 0; k < nz; k++) {
          const idx = this._gridIndex(i, j, k, nx, ny, nz);
          const val = grid[idx];
          minVal = Math.min(minVal, val);
          maxVal = Math.max(maxVal, val);
          sum += val;

          if (val > 1) {
            voxels.push({
              x: (i + 0.5) * dx,
              y: (j + 0.5) * dy,
              z: (k + 0.5) * dz,
              value: parseFloat(val.toFixed(2)),
            });
          }
        }
      }
    }

    const totalCells = nx * ny * nz;

    return {
      voxels,
      dimensions: { nx, ny, nz },
      bounds,
      stats: {
        min: parseFloat(minVal.toFixed(2)),
        max: parseFloat(maxVal.toFixed(2)),
        avg: parseFloat((sum / totalCells).toFixed(2)),
      },
    };
  }

  _simulateFrame(
    grid,
    gridDims,
    velocityField,
    extractionRates,
    dt,
    bounds,
    totalFlowRate
  ) {
    let g = this._stepDiffusion(grid, gridDims, dt);
    g = this._stepAdvection(g, gridDims, velocityField, dt);
    g = this._stepVentilation(g, gridDims, extractionRates, dt, bounds, totalFlowRate);
    return g;
  }

  async runSimulation(
    params,
    onProgress = null,
    shouldCancel = null
  ) {
    const {
      bounds,
      gridSize,
      sensorReadings,
      ventConfig,
      warehouseVents,
      totalSeconds = 3600,
      timeStepSeconds = 60,
    } = params;

    this.validateVentConfig(ventConfig, warehouseVents);
    this.validateSensors(sensorReadings);

    const gridDims = this._computeGridDimensions(bounds, gridSize);
    this.validateGridSize(gridDims);

    const velocityFields = this._buildVentFields(
      gridDims,
      ventConfig,
      warehouseVents,
      bounds
    );

    const ventMap = new Map(warehouseVents.map((v) => [v.code, v]));
    let totalFlowRate = 0;
    for (const ventCfg of ventConfig) {
      const vent = ventMap.get(ventCfg.code);
      if (vent && ventCfg.is_open && ventCfg.fan_speed > 0) {
        totalFlowRate += this.defaultFanFlowRate * (ventCfg.fan_speed / 100);
      }
    }

    let concentrationGrid = this._initializeConcentrationGrid(
      gridDims,
      sensorReadings,
      bounds
    );

    const numSteps = Math.ceil(totalSeconds / timeStepSeconds);
    const results = [];

    const initialFrame = this._gridToSerializable(
      concentrationGrid,
      gridDims,
      bounds
    );
    results.push({
      time: 0,
      ...initialFrame,
    });

    for (let step = 1; step <= numSteps; step++) {
      if (shouldCancel && shouldCancel()) {
        return { canceled: true, partialResults: results };
      }

      concentrationGrid = this._simulateFrame(
        concentrationGrid,
        gridDims,
        velocityFields.velocityField,
        velocityFields.extractionRates,
        timeStepSeconds,
        bounds,
        totalFlowRate
      );

      const frame = this._gridToSerializable(
        concentrationGrid,
        gridDims,
        bounds
      );
      results.push({
        time: step * timeStepSeconds,
        ...frame,
      });

      if (onProgress) {
        const progress = Math.round((step / numSteps) * 100);
        try {
          await onProgress(progress, step, numSteps);
        } catch (e) {}
      }
    }

    const summary = this._computeSummary(results);

    return {
      canceled: false,
      frames: results,
      summary,
      meta: {
        gridSize,
        totalSeconds,
        timeStepSeconds,
        gridDims,
      },
    };
  }

  _computeSummary(frames) {
    const initial = frames[0].stats;
    const final = frames[frames.length - 1].stats;

    const halfReductionTime = this._findHalfReductionTime(frames);

    return {
      initialAvg: initial.avg,
      finalAvg: final.avg,
      initialMax: initial.max,
      finalMax: final.max,
      avgReductionPct: initial.avg > 0
        ? parseFloat(((1 - final.avg / initial.avg) * 100).toFixed(1))
        : 0,
      maxReductionPct: initial.max > 0
        ? parseFloat(((1 - final.max / initial.max) * 100).toFixed(1))
        : 0,
      halfReductionTimeSeconds: halfReductionTime,
      totalFrames: frames.length,
    };
  }

  _findHalfReductionTime(frames) {
    const initialAvg = frames[0].stats.avg;
    if (initialAvg <= 0) return null;

    const target = initialAvg * 0.5;
    for (const frame of frames) {
      if (frame.stats.avg <= target) {
        return frame.time;
      }
    }
    return null;
  }
}

module.exports = VentilationSimulator;
