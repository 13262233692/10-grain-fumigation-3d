const SensorParser = require('../src/parsers/sensorParser');
const IDWInterpolator = require('../src/interpolation/idwInterpolator');
const ApiClient = require('../src/api/apiClient');

class DataSimulator {
  constructor(apiBaseUrl = 'http://localhost:3000') {
    this.api = new ApiClient(apiBaseUrl);
    this.parser = new SensorParser();
    this.interpolator = new IDWInterpolator();
    this.interval = null;
    this.sensors = [];
    this.warehouseCode = 'WH-001';
  }

  setSensors(sensors) {
    this.sensors = sensors;
  }

  setWarehouseCode(code) {
    this.warehouseCode = code;
  }

  generateReading(sensor, timestamp) {
    const baseConcentration = sensor.baseConcentration || 200;
    const noise = (Math.random() - 0.5) * 50;
    const drift = Math.sin(timestamp / 60000) * 20;
    const concentration = Math.max(0, baseConcentration + noise + drift);

    const baseTemp = 25;
    const tempNoise = (Math.random() - 0.5) * 2;
    const temperature = baseTemp + tempNoise;

    const baseHum = 60;
    const humNoise = (Math.random() - 0.5) * 5;
    const humidity = Math.max(0, Math.min(100, baseHum + humNoise));

    const statusCode = Math.random() < 0.05 ? 1 : 0;

    return {
      warehouseCode: this.warehouseCode,
      sensorCode: sensor.code,
      sensorType: sensor.type || 'PH3',
      posX: sensor.x,
      posY: sensor.y,
      posZ: sensor.z,
      concentration: sensor.type === 'PH3' ? concentration : (sensor.type === 'TEMP' ? temperature : humidity),
      temperature,
      humidity,
      readingTime: new Date(timestamp).toISOString(),
      statusCode,
    };
  }

  generateMessage(sensor, timestamp) {
    const reading = this.generateReading(sensor, timestamp);
    return JSON.stringify(reading);
  }

  async sendReading(sensor, timestamp) {
    const message = this.generateMessage(sensor, timestamp);

    try {
      const result = await this.api.sendSensorData(message);
      return result;
    } catch (err) {
      console.error('Failed to send reading:', err.message);
      return { success: false, error: err.message };
    }
  }

  async sendBatchReadings(timestamp) {
    const messages = this.sensors.map(s => this.generateMessage(s, timestamp));

    try {
      const result = await this.api.sendBatchSensorData(messages);
      return result;
    } catch (err) {
      console.error('Failed to send batch readings:', err.message);
      return { success: false, error: err.message };
    }
  }

  start(intervalMs = 5000) {
    if (this.interval) {
      this.stop();
    }

    console.log(`[Simulator] Starting data simulation with ${this.sensors.length} sensors, interval: ${intervalMs}ms`);

    const sendData = () => {
      const now = Date.now();
      this.sendBatchReadings(now)
        .then(result => {
          if (result.success) {
            console.log(`[Simulator] Sent ${result.processed}/${result.total} readings`);
          }
        })
        .catch(err => {
          console.error('[Simulator] Error:', err.message);
        });
    };

    sendData();
    this.interval = setInterval(sendData, intervalMs);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log('[Simulator] Stopped');
    }
  }
}

if (require.main === module) {
  const simulator = new DataSimulator(process.env.API_URL || 'http://localhost:3000');

  const sensors = [
    { code: 'PH3-001', type: 'PH3', x: 10, y: 2, z: 10, baseConcentration: 150 },
    { code: 'PH3-002', type: 'PH3', x: 30, y: 4, z: 15, baseConcentration: 280 },
    { code: 'PH3-003', type: 'PH3', x: 50, y: 3, z: 20, baseConcentration: 420 },
    { code: 'PH3-004', type: 'PH3', x: 20, y: 6, z: 25, baseConcentration: 180 },
    { code: 'PH3-005', type: 'PH3', x: 45, y: 5, z: 5, baseConcentration: 350 },
    { code: 'TEMP-001', type: 'TEMP', x: 15, y: 3, z: 15, baseConcentration: 25 },
    { code: 'HUM-001', type: 'HUM', x: 15, y: 3, z: 15, baseConcentration: 60 },
  ];

  simulator.setSensors(sensors);
  simulator.setWarehouseCode('WH-001');
  simulator.start(3000);

  process.on('SIGINT', () => {
    console.log('\nStopping simulator...');
    simulator.stop();
    process.exit(0);
  });
}

module.exports = DataSimulator;
