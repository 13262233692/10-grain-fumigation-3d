class SensorParser {
  constructor() {
    this.statusCodes = {
      0: 'normal',
      1: 'low_battery',
      2: 'sensor_fault',
      3: 'communication_error',
      4: 'out_of_range',
      5: 'calibration_needed',
    };
  }

  parse(rawMessage) {
    if (!rawMessage || typeof rawMessage !== 'string') {
      throw new Error('Invalid message format: message must be a non-empty string');
    }

    const trimmed = rawMessage.trim();

    if (trimmed.startsWith('{')) {
      return this._parseJson(trimmed);
    }

    if (trimmed.startsWith('$')) {
      return this._parseNmeaLike(trimmed);
    }

    return this._parseDelimited(trimmed);
  }

  _parseJson(jsonStr) {
    try {
      const data = JSON.parse(jsonStr);
      return this._normalizeAndValidate(data);
    } catch (e) {
      throw new Error(`JSON parse error: ${e.message}`);
    }
  }

  _parseNmeaLike(message) {
    const clean = message.replace(/^\$/, '').replace(/\*[0-9A-Fa-f]{2}$/, '');
    const parts = clean.split(',');

    if (parts.length < 7) {
      throw new Error(`NMEA-like message too short: ${parts.length} fields`);
    }

    const data = {
      warehouseCode: parts[0],
      sensorCode: parts[1],
      sensorType: parts[2] || 'PH3',
      posX: parseFloat(parts[3]),
      posY: parseFloat(parts[4]),
      posZ: parseFloat(parts[5]),
      concentration: parseFloat(parts[6]),
      temperature: parts[7] ? parseFloat(parts[7]) : null,
      humidity: parts[8] ? parseFloat(parts[8]) : null,
      readingTime: parts[9] ? new Date(parts[9]) : new Date(),
      statusCode: parts[10] ? parseInt(parts[10], 10) : 0,
    };

    return this._normalizeAndValidate(data);
  }

  _parseDelimited(message) {
    const delimiters = ['|', ';', '\t', ','];
    let delimiter = ',';

    for (const d of delimiters) {
      if (message.includes(d)) {
        delimiter = d;
        break;
      }
    }

    const parts = message.split(delimiter);

    if (parts.length < 6) {
      throw new Error(`Delimited message too short: ${parts.length} fields`);
    }

    const keys = [
      'warehouseCode', 'sensorCode', 'concentration',
      'temperature', 'humidity', 'readingTime'
    ];

    const data = {};
    keys.forEach((key, index) => {
      if (parts[index] !== undefined) {
        data[key] = parts[index];
      }
    });

    if (data.readingTime) {
      data.readingTime = new Date(data.readingTime);
    }

    if (data.concentration !== undefined) {
      data.concentration = parseFloat(data.concentration);
    }
    if (data.temperature !== undefined) {
      data.temperature = parseFloat(data.temperature);
    }
    if (data.humidity !== undefined) {
      data.humidity = parseFloat(data.humidity);
    }

    return this._normalizeAndValidate(data);
  }

  _normalizeAndValidate(data) {
    const result = {
      warehouseCode: data.warehouseCode || data.warehouse_code || data.whCode || '',
      sensorCode: data.sensorCode || data.sensor_code || data.id || '',
      sensorType: data.sensorType || data.type || 'PH3',
      posX: data.posX !== undefined ? parseFloat(data.posX) : (data.x !== undefined ? parseFloat(data.x) : null),
      posY: data.posY !== undefined ? parseFloat(data.posY) : (data.y !== undefined ? parseFloat(data.y) : null),
      posZ: data.posZ !== undefined ? parseFloat(data.posZ) : (data.z !== undefined ? parseFloat(data.z) : null),
      concentration: data.concentration !== undefined ? parseFloat(data.concentration) : (data.value !== undefined ? parseFloat(data.value) : null),
      temperature: data.temperature !== undefined ? parseFloat(data.temperature) : (data.temp !== undefined ? parseFloat(data.temp) : null),
      humidity: data.humidity !== undefined ? parseFloat(data.humidity) : null,
      readingTime: data.readingTime ? new Date(data.readingTime) : new Date(data.timestamp || data.time || Date.now()),
      statusCode: data.statusCode !== undefined ? parseInt(data.statusCode, 10) : (data.status !== undefined ? parseInt(data.status, 10) : 0),
      rawMessage: data.rawMessage || JSON.stringify(data),
    };

    const errors = this._validate(result);
    if (errors.length > 0) {
      result.validationErrors = errors;
      result.valid = false;
    } else {
      result.valid = true;
    }

    result.statusText = this.statusCodes[result.statusCode] || 'unknown';

    return result;
  }

  _validate(data) {
    const errors = [];

    if (!data.warehouseCode) {
      errors.push('warehouseCode is required');
    }

    if (!data.sensorCode) {
      errors.push('sensorCode is required');
    }

    if (data.concentration === null || isNaN(data.concentration)) {
      errors.push('concentration is required and must be a number');
    } else if (data.concentration < 0) {
      errors.push('concentration cannot be negative');
    }

    if (data.temperature !== null && !isNaN(data.temperature)) {
      if (data.temperature < -50 || data.temperature > 100) {
        errors.push('temperature out of reasonable range (-50 to 100)');
      }
    }

    if (data.humidity !== null && !isNaN(data.humidity)) {
      if (data.humidity < 0 || data.humidity > 100) {
        errors.push('humidity out of valid range (0 to 100)');
      }
    }

    if (!(data.readingTime instanceof Date) || isNaN(data.readingTime.getTime())) {
      errors.push('invalid readingTime');
    }

    return errors;
  }

  validateCoordinates(data, warehouseBounds) {
    const errors = [];

    if (data.posX === null || isNaN(data.posX)) {
      errors.push('posX is required');
    } else if (data.posX < 0 || data.posX > warehouseBounds.length) {
      errors.push(`posX ${data.posX} out of bounds [0, ${warehouseBounds.length}]`);
    }

    if (data.posY === null || isNaN(data.posY)) {
      errors.push('posY is required');
    } else if (data.posY < 0 || data.posY > warehouseBounds.width) {
      errors.push(`posY ${data.posY} out of bounds [0, ${warehouseBounds.width}]`);
    }

    if (data.posZ === null || isNaN(data.posZ)) {
      errors.push('posZ is required');
    } else if (data.posZ < 0 || data.posZ > warehouseBounds.height) {
      errors.push(`posZ ${data.posZ} out of bounds [0, ${warehouseBounds.height}]`);
    }

    return errors;
  }

  isSensorOffline(lastSeen, thresholdMs) {
    if (!lastSeen) return true;
    return Date.now() - new Date(lastSeen).getTime() > thresholdMs;
  }
}

module.exports = SensorParser;
