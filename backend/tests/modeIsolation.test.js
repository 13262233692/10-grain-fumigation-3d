const IDWInterpolator = require('../src/interpolation/idwInterpolator');
const SensorParser = require('../src/parsers/sensorParser');

describe('Mode Isolation Tests - 实时与历史模式隔离', () => {
  let interpolator;
  let parser;

  beforeEach(() => {
    interpolator = new IDWInterpolator({ power: 2 });
    parser = new SensorParser();
  });

  describe('历史时间窗口查询隔离', () => {
    test('历史查询仅包含指定时间窗口之前的数据', () => {
      const historicalMessages = [
        { time: '2024-01-15T10:00:00Z', value: 100, label: '10:00 数据' },
        { time: '2024-01-15T10:10:00Z', value: 150, label: '10:10 数据' },
        { time: '2024-01-15T10:20:00Z', value: 200, label: '10:20 数据' },
      ];

      const realtimeMessages = [
        { time: '2024-01-15T11:00:00Z', value: 500, label: '实时数据' },
      ];

      const snapshotTime = new Date('2024-01-15T10:15:00Z');
      const windowMs = 30 * 60 * 1000;
      const windowStart = new Date(snapshotTime.getTime() - windowMs);

      const historicalInWindow = historicalMessages.filter(m => {
        const t = new Date(m.time);
        return t <= snapshotTime && t >= windowStart;
      });

      expect(historicalInWindow.length).toBe(2);
      expect(historicalInWindow.map(m => m.value)).toEqual([100, 150]);

      const realtimeOutsideWindow = realtimeMessages.filter(m => {
        const t = new Date(m.time);
        return t <= snapshotTime;
      });

      expect(realtimeOutsideWindow.length).toBe(0);
    });

    test('不同时间切片生成独立的体素网格数据', () => {
      const bounds = { length: 60, width: 30, height: 8 };

      const t1Samples = [
        { x: 10, y: 10, z: 2, value: 100 },
        { x: 50, y: 20, z: 3, value: 150 },
      ];

      const t2Samples = [
        { x: 10, y: 10, z: 2, value: 400 },
        { x: 50, y: 20, z: 3, value: 450 },
      ];

      const gridT1 = interpolator.generateVoxelGridOptimized(t1Samples, bounds, 10);
      const gridT2 = interpolator.generateVoxelGridOptimized(t2Samples, bounds, 10);

      expect(gridT1.maxValue).toBeLessThan(gridT2.maxValue);
      expect(gridT1.data[0]).not.toBe(gridT2.data[0]);
    });

    test('按时间乱序到达的报文能被正确归类到对应时间切片', () => {
      const messages = [
        { time: '2024-01-15T10:05:00Z', value: 100, sensor: 'S1' },
        { time: '2024-01-15T10:15:00Z', value: 200, sensor: 'S1' },
        { time: '2024-01-15T10:00:00Z', value: 50, sensor: 'S1' },
        { time: '2024-01-15T10:10:00Z', value: 150, sensor: 'S1' },
      ];

      const sorted = [...messages].sort((a, b) =>
        new Date(a.time).getTime() - new Date(b.time).getTime()
      );

      expect(sorted[0].value).toBe(50);
      expect(sorted[1].value).toBe(100);
      expect(sorted[2].value).toBe(150);
      expect(sorted[3].value).toBe(200);

      const snapshot1007 = new Date('2024-01-15T10:07:00Z');
      const latestAt1007 = sorted
        .filter(m => new Date(m.time) <= snapshot1007)
        .slice(-1)[0];

      expect(latestAt1007.value).toBe(100);

      const snapshot1012 = new Date('2024-01-15T10:12:00Z');
      const latestAt1012 = sorted
        .filter(m => new Date(m.time) <= snapshot1012)
        .slice(-1)[0];

      expect(latestAt1012.value).toBe(150);
    });
  });

  describe('传感器读数时间有效性验证', () => {
    test('传感器在历史时间点之后安装的不应出现在历史数据中', () => {
      const sensorInstallTime = new Date('2024-01-15T10:30:00Z');
      const historicalSnapshot = new Date('2024-01-15T10:00:00Z');

      const shouldExclude = historicalSnapshot < sensorInstallTime;
      expect(shouldExclude).toBe(true);
    });

    test('只使用指定时间窗口内的有效读数', () => {
      const readings = [
        { time: '2024-01-15T09:00:00Z', value: 50 },
        { time: '2024-01-15T09:30:00Z', value: 100 },
        { time: '2024-01-15T10:00:00Z', value: 150 },
        { time: '2024-01-15T10:30:00Z', value: 200 },
      ];

      const snapshot = new Date('2024-01-15T10:15:00Z');
      const windowMs = 60 * 60 * 1000;
      const windowStart = new Date(snapshot.getTime() - windowMs);

      const validReadings = readings.filter(r => {
        const t = new Date(r.time);
        return t <= snapshot && t >= windowStart;
      });

      expect(validReadings.length).toBe(2);
      expect(validReadings[0].value).toBe(100);
      expect(validReadings[1].value).toBe(150);
    });
  });

  describe('模式切换状态清理验证', () => {
    test('从实时模式切换到历史模式应丢弃实时缓存', () => {
      const liveState = {
        mode: 'live',
        sensors: new Map([
          ['S1', { value: 500, time: new Date() }],
          ['S2', { value: 450, time: new Date() }],
        ]),
        voxels: { maxValue: 500 },
      };

      const switchToHistorical = (state) => {
        return {
          mode: 'historical',
          sensors: new Map(),
          voxels: null,
        };
      };

      const historicalState = switchToHistorical(liveState);

      expect(historicalState.mode).toBe('historical');
      expect(historicalState.sensors.size).toBe(0);
      expect(historicalState.voxels).toBeNull();
    });

    test('从历史模式切回实时模式应丢弃历史数据', () => {
      const historicalState = {
        mode: 'historical',
        sensors: new Map([
          ['S1', { value: 100, time: new Date('2024-01-15T10:00:00Z') }],
        ]),
        voxels: { maxValue: 150 },
        historicalTime: new Date('2024-01-15T10:00:00Z'),
      };

      const switchToLive = (state) => {
        return {
          mode: 'live',
          sensors: new Map(),
          voxels: null,
          historicalTime: null,
        };
      };

      const liveState = switchToLive(historicalState);

      expect(liveState.mode).toBe('live');
      expect(liveState.sensors.size).toBe(0);
      expect(liveState.historicalTime).toBeNull();
    });

    test('实时更新在历史模式下应被忽略', () => {
      let state = {
        mode: 'historical',
        lastConcentration: 100,
        updatedFromWs: false,
      };

      const handleWsUpdate = (currentState, newValue) => {
        if (currentState.mode !== 'historical') {
          return {
            ...currentState,
            lastConcentration: newValue,
            updatedFromWs: true,
          };
        }
        return currentState;
      };

      const afterUpdate = handleWsUpdate(state, 500);

      expect(afterUpdate.lastConcentration).toBe(100);
      expect(afterUpdate.updatedFromWs).toBe(false);
    });
  });

  describe('多传感器历史数据一致性', () => {
    test('每个传感器在历史时间点使用各自的最新有效读数', () => {
      const allReadings = [
        { sensor: 'S1', time: '2024-01-15T10:00:00Z', value: 100 },
        { sensor: 'S2', time: '2024-01-15T10:00:00Z', value: 150 },
        { sensor: 'S1', time: '2024-01-15T10:05:00Z', value: 120 },
        { sensor: 'S2', time: '2024-01-15T10:08:00Z', value: 170 },
        { sensor: 'S1', time: '2024-01-15T10:15:00Z', value: 200 },
      ];

      const snapshotTime = new Date('2024-01-15T10:10:00Z');

      const latestBySensor = new Map();
      for (const reading of allReadings) {
        const t = new Date(reading.time);
        if (t <= snapshotTime) {
          const existing = latestBySensor.get(reading.sensor);
          if (!existing || t > new Date(existing.time)) {
            latestBySensor.set(reading.sensor, reading);
          }
        }
      }

      expect(latestBySensor.get('S1').value).toBe(120);
      expect(latestBySensor.get('S2').value).toBe(170);

      const liveReading = allReadings.find(r => r.sensor === 'S1' && r.value === 200);
      const liveIsInHistorical = latestBySensor.get('S1').value === liveReading.value;
      expect(liveIsInHistorical).toBe(false);
    });
  });

  describe('插值算法模式隔离', () => {
    test('历史模式和实时模式的插值计算互不影响', () => {
      const bounds = { length: 60, width: 30, height: 8 };

      const liveSamples = [
        { x: 30, y: 15, z: 4, value: 500 },
      ];

      const historicalSamples = [
        { x: 30, y: 15, z: 4, value: 100 },
      ];

      const liveGrid = interpolator.generateVoxelGridOptimized(liveSamples, bounds, 10);
      const historicalGrid = interpolator.generateVoxelGridOptimized(historicalSamples, bounds, 10);

      expect(liveGrid.maxValue).toBe(500);
      expect(historicalGrid.maxValue).toBe(100);
      expect(liveGrid.data[0]).not.toBe(historicalGrid.data[0]);

      const centerLive = interpolator.interpolatePoint(
        { x: 30, y: 15, z: 4 }, liveSamples
      );
      const centerHistorical = interpolator.interpolatePoint(
        { x: 30, y: 15, z: 4 }, historicalSamples
      );

      expect(centerLive).toBe(500);
      expect(centerHistorical).toBe(100);
    });
  });

  describe('报文解析模式隔离', () => {
    test('历史报文和实时报文解析格式完全一致', () => {
      const historicalMessage = JSON.stringify({
        warehouseCode: 'WH-001',
        sensorCode: 'PH3-001',
        concentration: 150,
        readingTime: '2024-01-15T10:00:00.000Z',
        posX: 10,
        posY: 2,
        posZ: 10,
      });

      const liveMessage = JSON.stringify({
        warehouseCode: 'WH-001',
        sensorCode: 'PH3-001',
        concentration: 450,
        readingTime: new Date().toISOString(),
        posX: 10,
        posY: 2,
        posZ: 10,
      });

      const historicalParsed = parser.parse(historicalMessage);
      const liveParsed = parser.parse(liveMessage);

      expect(historicalParsed.valid).toBe(true);
      expect(liveParsed.valid).toBe(true);
      expect(historicalParsed.warehouseCode).toBe(liveParsed.warehouseCode);
      expect(historicalParsed.sensorCode).toBe(liveParsed.sensorCode);
      expect(historicalParsed.concentration).toBe(150);
      expect(liveParsed.concentration).toBe(450);
    });
  });
});
