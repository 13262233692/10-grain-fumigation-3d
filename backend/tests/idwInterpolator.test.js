const IDWInterpolator = require('../src/interpolation/idwInterpolator');

describe('IDWInterpolator', () => {
  let interpolator;

  beforeEach(() => {
    interpolator = new IDWInterpolator({ power: 2, epsilon: 1e-10 });
  });

  describe('Single point interpolation', () => {
    test('should return exact value at sample point', () => {
      const samples = [
        { x: 0, y: 0, z: 0, value: 100 },
      ];

      const result = interpolator.interpolatePoint({ x: 0, y: 0, z: 0 }, samples);
      expect(result).toBe(100);
    });

    test('should interpolate between two points', () => {
      const samples = [
        { x: 0, y: 0, z: 0, value: 0 },
        { x: 10, y: 0, z: 0, value: 100 },
      ];

      const midValue = interpolator.interpolatePoint({ x: 5, y: 0, z: 0 }, samples);
      expect(midValue).toBeGreaterThan(0);
      expect(midValue).toBeLessThan(100);
    });

    test('closer point should have more influence', () => {
      const samples = [
        { x: 0, y: 0, z: 0, value: 0 },
        { x: 10, y: 0, z: 0, value: 100 },
      ];

      const nearLow = interpolator.interpolatePoint({ x: 1, y: 0, z: 0 }, samples);
      const nearHigh = interpolator.interpolatePoint({ x: 9, y: 0, z: 0 }, samples);

      expect(nearLow).toBeLessThan(50);
      expect(nearHigh).toBeGreaterThan(50);
    });

    test('should handle empty samples array', () => {
      const result = interpolator.interpolatePoint({ x: 5, y: 5, z: 5 }, []);
      expect(result).toBe(0);
    });

    test('should handle 3D interpolation', () => {
      const samples = [
        { x: 0, y: 0, z: 0, value: 0 },
        { x: 10, y: 10, z: 10, value: 100 },
      ];

      const result = interpolator.interpolatePoint({ x: 5, y: 5, z: 5 }, samples);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(100);
    });
  });

  describe('Voxel grid generation', () => {
    const bounds = { length: 10, width: 10, height: 10 };

    test('should generate voxel grid with correct dimensions', () => {
      const samples = [
        { x: 2, y: 2, z: 2, value: 50 },
        { x: 8, y: 8, z: 8, value: 150 },
      ];

      const grid = interpolator.generateVoxelGrid(samples, bounds, 10);

      expect(grid.size).toBe(10);
      expect(grid.dimensions).toEqual({ x: 10, y: 10, z: 10 });
      expect(grid.data.length).toBe(1000);
      expect(grid.maxValue).toBeGreaterThan(0);
      expect(grid.minValue).toBeLessThan(Infinity);
    });

    test('optimized version should produce similar results', () => {
      const samples = [
        { x: 2, y: 2, z: 2, value: 50 },
        { x: 8, y: 8, z: 8, value: 150 },
        { x: 5, y: 2, z: 5, value: 100 },
      ];

      const grid1 = interpolator.generateVoxelGrid(samples, bounds, 8);
      const grid2 = interpolator.generateVoxelGridOptimized(samples, bounds, 8);

      expect(grid1.maxValue).toBeCloseTo(grid2.maxValue, 3);
      expect(grid1.minValue).toBeCloseTo(grid2.minValue, 3);
      expect(grid1.data[0]).toBeCloseTo(grid2.data[0], 3);
    });

    test('should handle single sample point', () => {
      const samples = [
        { x: 5, y: 5, z: 5, value: 100 },
      ];

      const grid = interpolator.generateVoxelGrid(samples, bounds, 5);
      expect(grid.maxValue).toBe(100);
    });
  });

  describe('Risk zone calculation', () => {
    const thresholds = { low: 100, medium: 300, high: 500 };

    test('should classify all zones correctly', () => {
      const samples = [
        { x: 2, y: 2, z: 2, value: 50 },
        { x: 5, y: 5, z: 5, value: 250 },
        { x: 8, y: 8, z: 8, value: 600 },
      ];

      const bounds = { length: 10, width: 10, height: 10 };
      const grid = interpolator.generateVoxelGrid(samples, bounds, 10);
      const result = interpolator.calculateRiskZones(grid, thresholds);

      expect(result.zones.length).toBeGreaterThan(0);
      const zoneLevels = result.zones.map(z => z.level);
      expect(zoneLevels).toContain('low');
      expect(zoneLevels).toContain('medium');
    });

    test('should return empty zones when all below threshold', () => {
      const samples = [
        { x: 5, y: 5, z: 5, value: 50 },
      ];

      const bounds = { length: 10, width: 10, height: 10 };
      const grid = interpolator.generateVoxelGrid(samples, bounds, 5);
      const result = interpolator.calculateRiskZones(grid, { low: 100, medium: 200, high: 300 });

      expect(result.zones.length).toBe(0);
    });

    test('should count total voxels correctly', () => {
      const samples = [
        { x: 5, y: 5, z: 5, value: 400 },
      ];

      const bounds = { length: 10, width: 10, height: 10 };
      const grid = interpolator.generateVoxelGrid(samples, bounds, 8);
      const result = interpolator.calculateRiskZones(grid, thresholds);

      expect(result.totalVoxels).toBe(512);
    });
  });

  describe('Entry permission calculation', () => {
    test('should allow entry for safe concentrations', () => {
      const result = interpolator.getEntryPermission(0.1);
      expect(result.allowed).toBe(true);
      expect(result.label).toBe('安全');
      expect(result.ppeRequired).toBe(false);
    });

    test('should require PPE for caution level', () => {
      const result = interpolator.getEntryPermission(1);
      expect(result.ppeRequired).toBe(true);
      expect(result.maxDuration).toBe(30);
    });

    test('should restrict entry for danger level', () => {
      const result = interpolator.getEntryPermission(5);
      expect(result.label).toBe('危险');
      expect(result.maxDuration).toBe(15);
    });

    test('should forbid entry for severe level', () => {
      const result = interpolator.getEntryPermission(20);
      expect(result.allowed).toBe(false);
      expect(result.label).toBe('严重危险');
    });

    test('should respect duration limit', () => {
      const resultShort = interpolator.getEntryPermission(1, 10);
      expect(resultShort.allowed).toBe(true);

      const resultLong = interpolator.getEntryPermission(1, 60);
      expect(resultLong.allowed).toBe(false);
    });
  });

  describe('Performance tests', () => {
    const bounds = { length: 60, width: 30, height: 8 };

    test('should handle 20x20x20 grid in reasonable time', () => {
      const samples = [];
      for (let i = 0; i < 10; i++) {
        samples.push({
          x: Math.random() * 60,
          y: Math.random() * 30,
          z: Math.random() * 8,
          value: Math.random() * 500,
        });
      }

      const startTime = Date.now();
      const grid = interpolator.generateVoxelGridOptimized(samples, bounds, 20);
      const duration = Date.now() - startTime;

      expect(grid.data.length).toBe(8000);
      expect(duration).toBeLessThan(1000);
    });

    test('should handle 30x30x30 grid in acceptable time', () => {
      const samples = [];
      for (let i = 0; i < 20; i++) {
        samples.push({
          x: Math.random() * 60,
          y: Math.random() * 30,
          z: Math.random() * 8,
          value: Math.random() * 500,
        });
      }

      const startTime = Date.now();
      const grid = interpolator.generateVoxelGridOptimized(samples, bounds, 30);
      const duration = Date.now() - startTime;

      expect(grid.data.length).toBe(27000);
      console.log(`30x30x30 grid generation took ${duration}ms`);
    });
  });

  describe('Serialization', () => {
    test('should serialize grid correctly', () => {
      const samples = [
        { x: 2, y: 2, z: 2, value: 100 },
        { x: 8, y: 8, z: 8, value: 200 },
      ];
      const bounds = { length: 10, width: 10, height: 10 };
      const grid = interpolator.generateVoxelGrid(samples, bounds, 5);

      const serialized = interpolator.serializeGrid(grid);

      expect(Array.isArray(serialized.data)).toBe(true);
      expect(serialized.data.length).toBe(125);
      expect(serialized.size).toBe(5);
      expect(typeof serialized.maxValue).toBe('number');
    });
  });
});
