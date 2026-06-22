const VentilationSimulator = require('../src/simulation/ventilationSimulator');

describe('VentilationSimulator Tests - 通风策略模拟', () => {
  let simulator;

  beforeEach(() => {
    simulator = new VentilationSimulator();
  });

  const makeWarehouseVents = () => [
    { id: 'v1', code: 'VENT-IN-01', name: '进风口1', pos_x: 0, pos_y: 2, pos_z: 15, direction: 'in', is_open: true, fan_speed: 50 },
    { id: 'v2', code: 'VENT-OUT-01', name: '排风口1', pos_x: 60, pos_y: 7, pos_z: 15, direction: 'out', is_open: true, fan_speed: 80 },
  ];

  const makeSensorReadings = (opts = {}) => [
    { sensor_id: 's1', code: 'PH3-001', type: 'PH3', pos_x: 10, pos_y: 2, pos_z: 10, concentration_ppm: opts.c1 || 300, status: 'online' },
    { sensor_id: 's2', code: 'PH3-002', type: 'PH3', pos_x: 30, pos_y: 4, pos_z: 15, concentration_ppm: opts.c2 || 400, status: 'online' },
    { sensor_id: 's3', code: 'PH3-003', type: 'PH3', pos_x: 50, pos_y: 3, pos_z: 20, concentration_ppm: opts.c3 || 500, status: opts.s3Status || 'online' },
  ];

  const defaultBounds = { length: 60, width: 30, height: 8 };

  describe('输入验证', () => {
    test('通风口缺失应报错', () => {
      expect(() => {
        simulator.validateVentConfig([], makeWarehouseVents());
      }).toThrow(/通风口配置不能为空/);
    });

    test('通风口配置指向不存在的通风口应报错', () => {
      const ventConfig = [
        { code: 'NOT-EXIST', is_open: true, fan_speed: 50, direction: 'in' },
      ];
      expect(() => {
        simulator.validateVentConfig(ventConfig, makeWarehouseVents());
      }).toThrow(/通风口不存在/);
    });

    test('未开启任何通风口应报错', () => {
      const ventConfig = [
        { code: 'VENT-IN-01', is_open: false, fan_speed: 0, direction: 'in' },
        { code: 'VENT-OUT-01', is_open: false, fan_speed: 0, direction: 'out' },
      ];
      expect(() => {
        simulator.validateVentConfig(ventConfig, makeWarehouseVents());
      }).toThrow(/至少需要开启一个通风口/);
    });

    test('只开启进风口不开启排风口应报错', () => {
      const ventConfig = [
        { code: 'VENT-IN-01', is_open: true, fan_speed: 50, direction: 'in' },
        { code: 'VENT-OUT-01', is_open: false, fan_speed: 0, direction: 'out' },
      ];
      expect(() => {
        simulator.validateVentConfig(ventConfig, makeWarehouseVents());
      }).toThrow(/需要同时有进风口和排风口开启/);
    });

    test('只开启排风口不开启进风口应报错', () => {
      const ventConfig = [
        { code: 'VENT-IN-01', is_open: false, fan_speed: 0, direction: 'in' },
        { code: 'VENT-OUT-01', is_open: true, fan_speed: 80, direction: 'out' },
      ];
      expect(() => {
        simulator.validateVentConfig(ventConfig, makeWarehouseVents());
      }).toThrow(/需要同时有进风口和排风口开启/);
    });

    test('传感器读数为空应报错', () => {
      expect(() => {
        simulator.validateSensors([]);
      }).toThrow(/无有效传感器读数/);
    });

    test('所有传感器离线应报错', () => {
      const readings = makeSensorReadings({ s3Status: 'offline' }).map(r => ({ ...r, status: 'offline' }));
      expect(() => {
        simulator.validateSensors(readings);
      }).toThrow(/所有传感器均离线/);
    });

    test('体素数量过大应报错', () => {
      const hugeBounds = { length: 200, width: 200, height: 100 };
      const gridDims = simulator._computeGridDimensions(hugeBounds, 2);
      expect(() => {
        simulator.validateGridSize(gridDims);
      }).toThrow(/体素数量过大/);
    });

    test('合理体素数量不应报错', () => {
      const gridDims = simulator._computeGridDimensions(defaultBounds, 10);
      expect(() => {
        simulator.validateGridSize(gridDims);
      }).not.toThrow();
    });
  });

  describe('模拟取消', () => {
    test('shouldCancel 为 true 时模拟应提前终止', async () => {
      const ventConfig = [
        { code: 'VENT-IN-01', is_open: true, fan_speed: 50, direction: 'in' },
        { code: 'VENT-OUT-01', is_open: true, fan_speed: 80, direction: 'out' },
      ];

      let callCount = 0;
      const result = await simulator.runSimulation(
        {
          bounds: defaultBounds,
          gridSize: 15,
          sensorReadings: makeSensorReadings(),
          ventConfig,
          warehouseVents: makeWarehouseVents(),
          totalSeconds: 600,
          timeStepSeconds: 60,
        },
        null,
        () => {
          callCount++;
          return callCount > 2;
        }
      );

      expect(result.canceled).toBe(true);
      expect(result.partialResults).toBeDefined();
      expect(result.partialResults.length).toBeLessThanOrEqual(4);
    });

    test('未取消时模拟返回完整结果', async () => {
      const ventConfig = [
        { code: 'VENT-IN-01', is_open: true, fan_speed: 50, direction: 'in' },
        { code: 'VENT-OUT-01', is_open: true, fan_speed: 80, direction: 'out' },
      ];

      const result = await simulator.runSimulation(
        {
          bounds: defaultBounds,
          gridSize: 15,
          sensorReadings: makeSensorReadings(),
          ventConfig,
          warehouseVents: makeWarehouseVents(),
          totalSeconds: 180,
          timeStepSeconds: 60,
        },
        null,
        () => false
      );

      expect(result.canceled).toBe(false);
      expect(result.frames).toBeDefined();
      expect(result.frames.length).toBeGreaterThanOrEqual(2);
      expect(result.summary).toBeDefined();
    });
  });

  describe('浓度衰减效果', () => {
    test('通风开启后浓度应逐步降低', async () => {
      const ventConfig = [
        { code: 'VENT-IN-01', is_open: true, fan_speed: 80, direction: 'in' },
        { code: 'VENT-OUT-01', is_open: true, fan_speed: 100, direction: 'out' },
      ];

      const result = await simulator.runSimulation(
        {
          bounds: defaultBounds,
          gridSize: 10,
          sensorReadings: makeSensorReadings({ c1: 500, c2: 500, c3: 500 }),
          ventConfig,
          warehouseVents: makeWarehouseVents(),
          totalSeconds: 3600,
          timeStepSeconds: 600,
        },
        null,
        () => false
      );

      expect(result.canceled).toBe(false);
      const firstAvg = result.frames[0].stats.avg;
      const lastAvg = result.frames[result.frames.length - 1].stats.avg;

      expect(lastAvg).toBeLessThan(firstAvg);
      expect(result.summary.avgReductionPct).toBeGreaterThan(0);
    });

    test('大风量比小风量浓度下降更快', async () => {
      const warehouseVents = makeWarehouseVents();

      const slowVent = [
        { code: 'VENT-IN-01', is_open: true, fan_speed: 10, direction: 'in' },
        { code: 'VENT-OUT-01', is_open: true, fan_speed: 10, direction: 'out' },
      ];

      const fastVent = [
        { code: 'VENT-IN-01', is_open: true, fan_speed: 100, direction: 'in' },
        { code: 'VENT-OUT-01', is_open: true, fan_speed: 100, direction: 'out' },
      ];

      const [slowResult, fastResult] = await Promise.all([
        simulator.runSimulation({
          bounds: defaultBounds,
          gridSize: 10,
          sensorReadings: makeSensorReadings({ c1: 500, c2: 500, c3: 500 }),
          ventConfig: slowVent,
          warehouseVents,
          totalSeconds: 1800,
          timeStepSeconds: 600,
        }, null, () => false),
        simulator.runSimulation({
          bounds: defaultBounds,
          gridSize: 10,
          sensorReadings: makeSensorReadings({ c1: 500, c2: 500, c3: 500 }),
          ventConfig: fastVent,
          warehouseVents,
          totalSeconds: 1800,
          timeStepSeconds: 600,
        }, null, () => false),
      ]);

      expect(fastResult.summary.avgReductionPct).toBeGreaterThan(slowResult.summary.avgReductionPct);
    });

    test('部分传感器离线时模拟仍可使用在线传感器数据', async () => {
      const ventConfig = [
        { code: 'VENT-IN-01', is_open: true, fan_speed: 60, direction: 'in' },
        { code: 'VENT-OUT-01', is_open: true, fan_speed: 80, direction: 'out' },
      ];

      const readings = [
        ...makeSensorReadings({ c1: 400, c2: 400, c3: 400 }),
      ];
      readings[2].status = 'offline';

      const result = await simulator.runSimulation(
        {
          bounds: defaultBounds,
          gridSize: 10,
          sensorReadings: readings,
          ventConfig,
          warehouseVents: makeWarehouseVents(),
          totalSeconds: 600,
          timeStepSeconds: 300,
        },
        null,
        () => false
      );

      expect(result.canceled).toBe(false);
      expect(result.frames.length).toBeGreaterThan(1);
      expect(result.frames[0].stats.max).toBeGreaterThan(0);
    });
  });

  describe('模拟摘要指标', () => {
    test('摘要包含初始/最终浓度和降幅', async () => {
      const ventConfig = [
        { code: 'VENT-IN-01', is_open: true, fan_speed: 80, direction: 'in' },
        { code: 'VENT-OUT-01', is_open: true, fan_speed: 100, direction: 'out' },
      ];

      const result = await simulator.runSimulation(
        {
          bounds: defaultBounds,
          gridSize: 8,
          sensorReadings: makeSensorReadings({ c1: 200, c2: 300, c3: 400 }),
          ventConfig,
          warehouseVents: makeWarehouseVents(),
          totalSeconds: 600,
          timeStepSeconds: 200,
        },
        null,
        () => false
      );

      expect(result.summary.initialAvg).toBeGreaterThan(0);
      expect(result.summary.finalAvg).toBeGreaterThanOrEqual(0);
      expect(typeof result.summary.avgReductionPct).toBe('number');
      expect(typeof result.summary.maxReductionPct).toBe('number');
      expect(typeof result.summary.totalFrames).toBe('number');
      expect(result.summary.totalFrames).toBe(result.frames.length);
    });

    test('onProgress 回调返回递增的进度百分比', async () => {
      const ventConfig = [
        { code: 'VENT-IN-01', is_open: true, fan_speed: 50, direction: 'in' },
        { code: 'VENT-OUT-01', is_open: true, fan_speed: 80, direction: 'out' },
      ];

      const progressValues = [];
      await simulator.runSimulation(
        {
          bounds: defaultBounds,
          gridSize: 8,
          sensorReadings: makeSensorReadings(),
          ventConfig,
          warehouseVents: makeWarehouseVents(),
          totalSeconds: 240,
          timeStepSeconds: 60,
        },
        async (progress) => {
          progressValues.push(progress);
        },
        () => false
      );

      expect(progressValues.length).toBeGreaterThan(0);
      for (let i = 1; i < progressValues.length; i++) {
        expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1]);
      }
      expect(progressValues[progressValues.length - 1]).toBe(100);
    });
  });

  describe('网格与边界', () => {
    test('不同 gridSize 产生不同分辨率', () => {
      const coarseDims = simulator._computeGridDimensions(defaultBounds, 20);
      const fineDims = simulator._computeGridDimensions(defaultBounds, 5);

      expect(coarseDims.nx * coarseDims.ny * coarseDims.nz)
        .toBeLessThan(fineDims.nx * fineDims.ny * fineDims.nz);
    });

    test('初始化网格浓度值合理', () => {
      const gridDims = simulator._computeGridDimensions(defaultBounds, 10);
      const readings = makeSensorReadings({ c1: 100, c2: 200, c3: 300 });
      const grid = simulator._initializeConcentrationGrid(gridDims, readings, defaultBounds);

      let min = Infinity, max = -Infinity, sum = 0;
      for (let i = 0; i < grid.length; i++) {
        min = Math.min(min, grid[i]);
        max = Math.max(max, grid[i]);
        sum += grid[i];
      }

      expect(min).toBeGreaterThanOrEqual(0);
      expect(max).toBeLessThanOrEqual(300);
      expect(sum / grid.length).toBeGreaterThan(0);
    });
  });
});
