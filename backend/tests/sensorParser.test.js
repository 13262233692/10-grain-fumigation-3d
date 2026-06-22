const SensorParser = require('../src/parsers/sensorParser');

describe('SensorParser', () => {
  let parser;

  beforeEach(() => {
    parser = new SensorParser();
  });

  describe('JSON format parsing', () => {
    test('should parse valid JSON message', () => {
      const message = JSON.stringify({
        warehouseCode: 'WH-001',
        sensorCode: 'PH3-001',
        sensorType: 'PH3',
        posX: 10.5,
        posY: 20.3,
        posZ: 3.5,
        concentration: 150.5,
        temperature: 25.3,
        humidity: 65.2,
        readingTime: '2024-01-15T10:30:00.000Z',
        statusCode: 0,
      });

      const result = parser.parse(message);

      expect(result.valid).toBe(true);
      expect(result.warehouseCode).toBe('WH-001');
      expect(result.sensorCode).toBe('PH3-001');
      expect(result.sensorType).toBe('PH3');
      expect(result.posX).toBe(10.5);
      expect(result.posY).toBe(20.3);
      expect(result.posZ).toBe(3.5);
      expect(result.concentration).toBe(150.5);
      expect(result.temperature).toBe(25.3);
      expect(result.humidity).toBe(65.2);
      expect(result.statusCode).toBe(0);
      expect(result.statusText).toBe('normal');
      expect(result.readingTime instanceof Date).toBe(true);
    });

    test('should handle JSON with snake_case keys', () => {
      const message = JSON.stringify({
        warehouse_code: 'WH-002',
        sensor_code: 'TEMP-001',
        type: 'TEMP',
        x: 5.0,
        y: 10.0,
        z: 2.0,
        value: 23.5,
        timestamp: '2024-01-15T10:30:00.000Z',
        status: 0,
      });

      const result = parser.parse(message);

      expect(result.valid).toBe(true);
      expect(result.warehouseCode).toBe('WH-002');
      expect(result.sensorCode).toBe('TEMP-001');
      expect(result.sensorType).toBe('TEMP');
      expect(result.posX).toBe(5.0);
      expect(result.concentration).toBe(23.5);
    });

    test('should reject invalid JSON', () => {
      expect(() => parser.parse('{invalid json')).toThrow('JSON parse error');
    });
  });

  describe('NMEA-like format parsing', () => {
    test('should parse valid NMEA-like message', () => {
      const message = '$WH-001,PH3-001,PH3,10.5,20.3,3.5,150.5,25.3,65.2,2024-01-15T10:30:00.000Z,0*4A';

      const result = parser.parse(message);

      expect(result.valid).toBe(true);
      expect(result.warehouseCode).toBe('WH-001');
      expect(result.sensorCode).toBe('PH3-001');
      expect(result.sensorType).toBe('PH3');
      expect(result.posX).toBe(10.5);
      expect(result.posY).toBe(20.3);
      expect(result.posZ).toBe(3.5);
      expect(result.concentration).toBe(150.5);
      expect(result.temperature).toBe(25.3);
      expect(result.humidity).toBe(65.2);
      expect(result.statusCode).toBe(0);
    });

    test('should parse NMEA-like message without checksum', () => {
      const message = '$WH-001,PH3-001,PH3,10.5,20.3,3.5,150.5';

      const result = parser.parse(message);

      expect(result.valid).toBe(true);
      expect(result.warehouseCode).toBe('WH-001');
      expect(result.concentration).toBe(150.5);
    });
  });

  describe('Delimited format parsing', () => {
    test('should parse pipe-delimited message', () => {
      const message = 'WH-001|PH3-001|200.5|25.0|60.0|2024-01-15T10:30:00Z';

      const result = parser.parse(message);

      expect(result.valid).toBe(true);
      expect(result.warehouseCode).toBe('WH-001');
      expect(result.sensorCode).toBe('PH3-001');
      expect(result.concentration).toBe(200.5);
      expect(result.temperature).toBe(25.0);
      expect(result.humidity).toBe(60.0);
    });

    test('should parse semicolon-delimited message', () => {
      const message = 'WH-001;PH3-002;150.0;22.5;55.0;2024-01-15T10:30:00Z';

      const result = parser.parse(message);

      expect(result.valid).toBe(true);
      expect(result.warehouseCode).toBe('WH-001');
      expect(result.concentration).toBe(150.0);
    });
  });

  describe('Validation', () => {
    test('should detect missing warehouse code', () => {
      const message = JSON.stringify({
        sensorCode: 'PH3-001',
        concentration: 100,
      });

      const result = parser.parse(message);

      expect(result.valid).toBe(false);
      expect(result.validationErrors).toContain('warehouseCode is required');
    });

    test('should detect missing sensor code', () => {
      const message = JSON.stringify({
        warehouseCode: 'WH-001',
        concentration: 100,
      });

      const result = parser.parse(message);

      expect(result.valid).toBe(false);
      expect(result.validationErrors).toContain('sensorCode is required');
    });

    test('should detect negative concentration', () => {
      const message = JSON.stringify({
        warehouseCode: 'WH-001',
        sensorCode: 'PH3-001',
        concentration: -50,
      });

      const result = parser.parse(message);

      expect(result.valid).toBe(false);
      expect(result.validationErrors).toContain('concentration cannot be negative');
    });

    test('should detect out of range temperature', () => {
      const message = JSON.stringify({
        warehouseCode: 'WH-001',
        sensorCode: 'TEMP-001',
        concentration: 25,
        temperature: 200,
      });

      const result = parser.parse(message);

      expect(result.valid).toBe(false);
      expect(result.validationErrors.some(e => e.includes('temperature'))).toBe(true);
    });

    test('should detect invalid humidity', () => {
      const message = JSON.stringify({
        warehouseCode: 'WH-001',
        sensorCode: 'HUM-001',
        concentration: 50,
        humidity: 150,
      });

      const result = parser.parse(message);

      expect(result.valid).toBe(false);
      expect(result.validationErrors.some(e => e.includes('humidity'))).toBe(true);
    });
  });

  describe('Coordinate validation', () => {
    const bounds = { length: 60, width: 30, height: 8 };

    test('should accept valid coordinates', () => {
      const data = { posX: 30, posY: 15, posZ: 4 };
      const errors = parser.validateCoordinates(data, bounds);
      expect(errors.length).toBe(0);
    });

    test('should detect x coordinate out of bounds', () => {
      const data = { posX: 70, posY: 15, posZ: 4 };
      const errors = parser.validateCoordinates(data, bounds);
      expect(errors.some(e => e.includes('posX'))).toBe(true);
    });

    test('should detect y coordinate out of bounds', () => {
      const data = { posX: 30, posY: 40, posZ: 4 };
      const errors = parser.validateCoordinates(data, bounds);
      expect(errors.some(e => e.includes('posY'))).toBe(true);
    });

    test('should detect z coordinate out of bounds', () => {
      const data = { posX: 30, posY: 15, posZ: 10 };
      const errors = parser.validateCoordinates(data, bounds);
      expect(errors.some(e => e.includes('posZ'))).toBe(true);
    });

    test('should detect negative coordinates', () => {
      const data = { posX: -5, posY: 15, posZ: 4 };
      const errors = parser.validateCoordinates(data, bounds);
      expect(errors.some(e => e.includes('posX'))).toBe(true);
    });

    test('should detect missing coordinates', () => {
      const data = { posX: null, posY: null, posZ: null };
      const errors = parser.validateCoordinates(data, bounds);
      expect(errors.length).toBe(3);
    });
  });

  describe('Sensor offline detection', () => {
    test('should detect sensor as offline', () => {
      const lastSeen = new Date(Date.now() - 120000);
      const isOffline = parser.isSensorOffline(lastSeen, 60000);
      expect(isOffline).toBe(true);
    });

    test('should detect sensor as online', () => {
      const lastSeen = new Date(Date.now() - 30000);
      const isOffline = parser.isSensorOffline(lastSeen, 60000);
      expect(isOffline).toBe(false);
    });

    test('should handle null lastSeen as offline', () => {
      const isOffline = parser.isSensorOffline(null, 60000);
      expect(isOffline).toBe(true);
    });
  });

  describe('Edge cases', () => {
    test('should reject empty message', () => {
      expect(() => parser.parse('')).toThrow('Invalid message format');
    });

    test('should reject null message', () => {
      expect(() => parser.parse(null)).toThrow('Invalid message format');
    });

    test('should reject non-string message', () => {
      expect(() => parser.parse(12345)).toThrow('Invalid message format');
    });

    test('should handle status codes correctly', () => {
      const message = JSON.stringify({
        warehouseCode: 'WH-001',
        sensorCode: 'PH3-001',
        concentration: 100,
        statusCode: 2,
      });

      const result = parser.parse(message);
      expect(result.statusCode).toBe(2);
      expect(result.statusText).toBe('sensor_fault');
    });

    test('should handle unknown status code', () => {
      const message = JSON.stringify({
        warehouseCode: 'WH-001',
        sensorCode: 'PH3-001',
        concentration: 100,
        statusCode: 99,
      });

      const result = parser.parse(message);
      expect(result.statusText).toBe('unknown');
    });
  });
});
