const SensorParser = require('../src/parsers/sensorParser');
const IDWInterpolator = require('../src/interpolation/idwInterpolator');

describe('Integration tests', () => {
  let parser;
  let interpolator;

  beforeEach(() => {
    parser = new SensorParser();
    interpolator = new IDWInterpolator({ power: 2 });
  });

  describe('Out-of-order message handling', () => {
    test('should handle messages arriving out of order', () => {
      const messages = [
        {
          warehouseCode: 'WH-001',
          sensorCode: 'PH3-001',
          posX: 10,
          posY: 10,
          posZ: 2,
          concentration: 100,
          readingTime: '2024-01-15T10:00:00.000Z',
        },
        {
          warehouseCode: 'WH-001',
          sensorCode: 'PH3-001',
          posX: 10,
          posY: 10,
          posZ: 2,
          concentration: 200,
          readingTime: '2024-01-15T10:05:00.000Z',
        },
        {
          warehouseCode: 'WH-001',
          sensorCode: 'PH3-001',
          posX: 10,
          posY: 10,
          posZ: 2,
          concentration: 150,
          readingTime: '2024-01-15T10:02:30.000Z',
        },
      ];

      const parsed = messages.map(m => parser.parse(JSON.stringify(m)));

      expect(parsed.every(p => p.valid)).toBe(true);

      const sorted = parsed
        .map(p => ({ time: p.readingTime.getTime(), value: p.concentration }))
        .sort((a, b) => a.time - b.time);

      expect(sorted[0].value).toBe(100);
      expect(sorted[1].value).toBe(150);
      expect(sorted[2].value).toBe(200);
    });

    test('should correctly use latest reading for interpolation', () => {
      const sensorData = [
        { code: 'PH3-001', x: 10, y: 10, z: 2, value: 100, time: '10:00' },
        { code: 'PH3-002', x: 50, y: 20, z: 4, value: 300, time: '10:05' },
        { code: 'PH3-001', x: 10, y: 10, z: 2, value: 150, time: '10:10' },
      ];

      const latestBySensor = new Map();
      for (const data of sensorData) {
        latestBySensor.set(data.code, data);
      }

      const samples = Array.from(latestBySensor.values()).map(d => ({
        x: d.x,
        y: d.y,
        z: d.z,
        value: d.value,
      }));

      expect(samples.length).toBe(2);

      const sensor1 = samples.find(s => s.x === 10);
      expect(sensor1.value).toBe(150);
    });
  });

  describe('Coordinate boundary handling', () => {
    const bounds = { length: 60, width: 30, height: 8 };

    test('should reject coordinates at negative positions', () => {
      const data = { posX: -1, posY: 15, posZ: 4 };
      const errors = parser.validateCoordinates(data, bounds);
      expect(errors.length).toBeGreaterThan(0);
    });

    test('should accept coordinates at boundaries', () => {
      const data = { posX: 0, posY: 0, posZ: 0 };
      const errors = parser.validateCoordinates(data, bounds);
      expect(errors.length).toBe(0);
    });

    test('should reject coordinates above max', () => {
      const data = { posX: 60.1, posY: 30, posZ: 8 };
      const errors = parser.validateCoordinates(data, bounds);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('posX');
    });

    test('should accept coordinates at exactly max boundary', () => {
      const data = { posX: 60, posY: 30, posZ: 8 };
      const errors = parser.validateCoordinates(data, bounds);
      expect(errors.length).toBe(0);
    });
  });

  describe('IDW interpolation edge cases', () => {
    test('should handle zero distance (exact sample point)', () => {
      const samples = [
        { x: 5, y: 5, z: 5, value: 100 },
      ];

      const result = interpolator.interpolatePoint({ x: 5, y: 5, z: 5 }, samples);
      expect(result).toBe(100);
    });

    test('should handle very close points without division by zero', () => {
      const samples = [
        { x: 5, y: 5, z: 5, value: 100 },
      ];

      const result = interpolator.interpolatePoint(
        { x: 5.0000000001, y: 5.0000000001, z: 5.0000000001 },
        samples
      );

      expect(isNaN(result)).toBe(false);
      expect(isFinite(result)).toBe(true);
    });

    test('should produce smooth gradient between two points', () => {
      const samples = [
        { x: 0, y: 0, z: 0, value: 0 },
        { x: 10, y: 0, z: 0, value: 100 },
      ];

      const values = [];
      for (let x = 1; x < 10; x++) {
        values.push(interpolator.interpolatePoint({ x, y: 0, z: 0 }, samples));
      }

      for (let i = 1; i < values.length; i++) {
        expect(values[i]).toBeGreaterThan(values[i - 1]);
      }
    });
  });

  describe('Multiple sensor types', () => {
    test('should parse different sensor types correctly', () => {
      const types = ['PH3', 'TEMP', 'HUM', 'CO2', 'O2'];

      for (const type of types) {
        const message = JSON.stringify({
          warehouseCode: 'WH-001',
          sensorCode: `${type}-001`,
          sensorType: type,
          posX: 10,
          posY: 10,
          posZ: 3,
          concentration: type === 'TEMP' ? 25 : type === 'HUM' ? 60 : 100,
        });

        const result = parser.parse(message);
        expect(result.valid).toBe(true);
        expect(result.sensorType).toBe(type);
      }
    });
  });

  describe('Batch message processing simulation', () => {
    test('should process 100 messages efficiently', () => {
      const messages = [];
      for (let i = 0; i < 100; i++) {
        messages.push(JSON.stringify({
          warehouseCode: 'WH-001',
          sensorCode: `PH3-${String(i % 10).padStart(3, '0')}`,
          posX: Math.random() * 60,
          posY: Math.random() * 30,
          posZ: Math.random() * 8,
          concentration: Math.random() * 500,
          readingTime: new Date(Date.now() - i * 60000).toISOString(),
        }));
      }

      const startTime = Date.now();
      const results = messages.map(m => parser.parse(m));
      const duration = Date.now() - startTime;

      const validCount = results.filter(r => r.valid).length;
      expect(validCount).toBe(100);
      expect(duration).toBeLessThan(100);
    });
  });

  describe('Voxel grid with real-world dimensions', () => {
    test('should generate grid for typical warehouse size', () => {
      const bounds = { length: 60, width: 30, height: 8 };
      const samples = [
        { x: 10, y: 10, z: 2, value: 150 },
        { x: 30, y: 15, z: 4, value: 200 },
        { x: 50, y: 20, z: 3, value: 180 },
        { x: 20, y: 25, z: 6, value: 220 },
        { x: 45, y: 5, z: 5, value: 170 },
      ];

      const grid = interpolator.generateVoxelGridOptimized(samples, bounds, 20);

      expect(grid.size).toBe(20);
      expect(grid.bounds.length).toBe(60);
      expect(grid.bounds.width).toBe(30);
      expect(grid.bounds.height).toBe(8);
      expect(grid.maxValue).toBeGreaterThan(100);
      expect(grid.minValue).toBeLessThan(300);
    });

    test('risk zones should cover expected ranges', () => {
      const bounds = { length: 60, width: 30, height: 8 };
      const samples = [
        { x: 30, y: 15, z: 4, value: 600 },
      ];

      const grid = interpolator.generateVoxelGridOptimized(samples, bounds, 15);
      const result = interpolator.calculateRiskZones(grid, {
        low: 100,
        medium: 300,
        high: 500,
      });

      expect(result.zones.length).toBeGreaterThan(0);
      expect(result.totalVoxels).toBe(3375);
    });
  });
});
