import SceneManager from './scene/SceneManager.js';
import WarehouseBuilder from './scene/WarehouseBuilder.js';
import SensorVisualizer from './scene/SensorVisualizer.js';
import VentVisualizer from './scene/VentVisualizer.js';
import VoxelCloud from './scene/VoxelCloud.js';
import RiskZoneVisualizer from './scene/RiskZoneVisualizer.js';
import ApiClient from './api/apiClient.js';
import WebSocketClient from './api/websocketClient.js';
import { formatNumber, formatDateTime, formatTime } from './utils/colors.js';

class App {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.api = new ApiClient('');
    this.ws = null;

    this.warehouses = [];
    this.currentWarehouse = null;
    this.currentWarehouseId = null;

    this.sceneManager = null;
    this.warehouseBuilder = null;
    this.sensorVisualizer = null;
    this.ventVisualizer = null;
    this.voxelCloud = null;
    this.riskZoneVisualizer = null;

    this.settings = {
      showVoxels: true,
      showSensors: true,
      showVents: true,
      showWarehouse: true,
      showGrid: false,
      voxelOpacity: 0.6,
      voxelSize: 20,
    };

    this.historicalMode = false;
    this.historicalTime = null;
    this.isPlaying = false;
    this.playInterval = null;

    this.tooltip = document.getElementById('tooltip');

    this._init();
  }

  async _init() {
    this.sceneManager = new SceneManager(this.container);
    this.warehouseBuilder = new WarehouseBuilder(this.sceneManager);
    this.sensorVisualizer = new SensorVisualizer(this.sceneManager);
    this.ventVisualizer = new VentVisualizer(this.sceneManager);
    this.voxelCloud = new VoxelCloud(this.sceneManager);
    this.riskZoneVisualizer = new RiskZoneVisualizer(this.sceneManager);

    this.sceneManager.addAnimationCallback((delta, elapsed) => {
      this.sensorVisualizer.animate(delta, elapsed);
      this.ventVisualizer.animate(delta, elapsed);
      this.voxelCloud.animate(delta, elapsed);
      this.riskZoneVisualizer.animate(delta, elapsed);
    });

    this._setupEventListeners();
    this._setupControls();
    this._setupTooltip();

    await this._loadWarehouses();
    await this._connectWebSocket();

    this._startDataRefresh();
    this._updateTime();
    setInterval(() => this._updateTime(), 1000);
  }

  async _loadWarehouses() {
    try {
      this.warehouses = await this.api.getWarehouses();

      const select = document.getElementById('warehouse-select');
      select.innerHTML = '';

      this.warehouses.forEach((wh, index) => {
        const option = document.createElement('option');
        option.value = wh.id;
        option.textContent = `${wh.code} - ${wh.name}`;
        select.appendChild(option);
      });

      if (this.warehouses.length > 0) {
        this._selectWarehouse(this.warehouses[0].id);
      }
    } catch (err) {
      console.error('Failed to load warehouses:', err);
      this._loadMockData();
    }
  }

  async _selectWarehouse(warehouseId) {
    this._exitHistoricalMode();

    this.currentWarehouseId = warehouseId;
    this.currentWarehouse = this.warehouses.find(w => w.id === warehouseId);

    if (this.currentWarehouse) {
      this.warehouseBuilder.build(this.currentWarehouse);

      const dims = {
        length: parseFloat(this.currentWarehouse.length_m),
        width: parseFloat(this.currentWarehouse.width_m),
        height: parseFloat(this.currentWarehouse.height_m),
      };

      this.sceneManager.setCameraTarget(
        dims.length / 2,
        dims.height / 2,
        dims.width / 2
      );
      this.sceneManager.setCameraPosition(
        dims.length * 1.2,
        dims.height * 1.5,
        dims.width * 1.5
      );

      document.getElementById('time-slider').value = 100;
      document.getElementById('time-display').textContent = '实时模式';

      this._refreshData();
    }
  }

  async _refreshData() {
    if (!this.currentWarehouseId) return;

    try {
      const [sensorReadings, vents, voxelData] = await Promise.all([
        this.api.getLatestSensorReadings(this.currentWarehouseId),
        this.api.getVents(this.currentWarehouseId),
        this.api.getVoxelGrid(this.currentWarehouseId, this.settings.voxelSize),
      ]);

      this.sensorVisualizer.updateSensors(sensorReadings);
      this.ventVisualizer.updateVents(vents);

      if (voxelData && voxelData.grid) {
        this.voxelCloud.updateGrid(voxelData.grid);
        this.sensorVisualizer.setMaxConcentration(voxelData.grid.maxValue || 500);

        if (voxelData.riskZones) {
          const bounds = {
            length: parseFloat(this.currentWarehouse.length_m),
            width: parseFloat(this.currentWarehouse.width_m),
            height: parseFloat(this.currentWarehouse.height_m),
          };
          this.riskZoneVisualizer.updateRiskZones(voxelData.riskZones, bounds);
        }
      }

      this._updateStats(sensorReadings, voxelData);
      this._updateSensorList(sensorReadings);
      this._updateRiskIndicators(voxelData);

    } catch (err) {
      console.error('Failed to refresh data:', err);
    }
  }

  _updateStats(sensorReadings, voxelData) {
    const ph3Readings = sensorReadings.filter(
      r => r.type === 'PH3' && r.concentration_ppm !== null && r.concentration_ppm !== undefined
    );

    const tempReadings = sensorReadings.filter(
      r => r.type === 'TEMP' && r.temperature !== null && r.temperature !== undefined
    );

    const humReadings = sensorReadings.filter(
      r => r.type === 'HUM' && r.humidity !== null && r.humidity !== undefined
    );

    if (ph3Readings.length > 0) {
      const maxConc = Math.max(...ph3Readings.map(r => parseFloat(r.concentration_ppm)));
      const avgConc = ph3Readings.reduce((sum, r) => sum + parseFloat(r.concentration_ppm), 0) / ph3Readings.length;

      document.getElementById('max-concentration').textContent = formatNumber(maxConc, 1);
      document.getElementById('avg-concentration').textContent = formatNumber(avgConc, 1);
    }

    if (tempReadings.length > 0) {
      const avgTemp = tempReadings.reduce((sum, r) => sum + parseFloat(r.temperature), 0) / tempReadings.length;
      document.getElementById('avg-temperature').textContent = formatNumber(avgTemp, 1);
    }

    if (humReadings.length > 0) {
      const avgHum = humReadings.reduce((sum, r) => sum + parseFloat(r.humidity), 0) / humReadings.length;
      document.getElementById('avg-humidity').textContent = formatNumber(avgHum, 1);
    }
  }

  _updateSensorList(sensorReadings) {
    const list = document.getElementById('sensor-list');
    list.innerHTML = '';

    sensorReadings.forEach(sensor => {
      const item = document.createElement('div');
      item.className = 'sensor-item';

      const isOffline = sensor.effectiveStatus === 'offline' || sensor.status === 'offline';
      const dot = document.createElement('div');
      dot.className = `sensor-dot ${isOffline ? 'offline' : 'online'}`;

      const code = document.createElement('span');
      code.className = 'sensor-code';
      code.textContent = sensor.code;

      const value = document.createElement('span');
      value.className = 'sensor-value';
      if (sensor.type === 'PH3') {
        value.textContent = `${formatNumber(sensor.concentration_ppm)} ppm`;
      } else if (sensor.type === 'TEMP') {
        value.textContent = `${formatNumber(sensor.temperature)} °C`;
      } else if (sensor.type === 'HUM') {
        value.textContent = `${formatNumber(sensor.humidity)} %`;
      } else {
        value.textContent = formatNumber(sensor.concentration_ppm || sensor.value);
      }

      item.appendChild(dot);
      item.appendChild(code);
      item.appendChild(value);
      list.appendChild(item);
    });
  }

  _updateRiskIndicators(voxelData) {
    const container = document.getElementById('risk-indicators');
    container.innerHTML = '';

    if (!voxelData || !voxelData.riskZones || voxelData.riskZones.length === 0) {
      const indicator = document.createElement('div');
      indicator.className = 'risk-indicator low';
      indicator.innerHTML = `
        <div class="risk-icon"></div>
        <div class="risk-text">当前无风险区域</div>
      `;
      container.appendChild(indicator);
      return;
    }

    const orderedZones = [...voxelData.riskZones].sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return (order[a.level] || 99) - (order[b.level] || 99);
    });

    orderedZones.forEach(zone => {
      const indicator = document.createElement('div');
      indicator.className = `risk-indicator ${zone.level}`;
      indicator.innerHTML = `
        <div class="risk-icon"></div>
        <div class="risk-text">${zone.label}</div>
        <div class="risk-value">${zone.voxelCount || zone.count} 体素</div>
      `;
      container.appendChild(indicator);
    });
  }

  async _connectWebSocket() {
    try {
      const wsUrl = this._getWebSocketUrl();
      this.ws = new WebSocketClient(wsUrl);

      this.ws.on('connected', () => {
        this._updateWsStatus(true);
        this.ws.subscribe('sensor_update');
        this.ws.subscribe('sensor_batch_update');
        this.ws.subscribe('sensor_status');
      });

      this.ws.on('disconnected', () => {
        this._updateWsStatus(false);
      });

      this.ws.on('sensor_update', (data) => {
        if (!this.historicalMode && data.warehouseId === this.currentWarehouseId) {
          this._refreshData();
        }
      });

      this.ws.on('sensor_batch_update', () => {
        if (!this.historicalMode) {
          this._refreshData();
        }
      });

      this.ws.on('sensor_status', () => {
        if (!this.historicalMode) {
          this._refreshData();
        }
      });

      await this.ws.connect();
    } catch (err) {
      console.error('WebSocket connection failed:', err);
      this._updateWsStatus(false);
    }
  }

  _getWebSocketUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}`;
  }

  _updateWsStatus(connected) {
    const dot = document.getElementById('ws-status');
    if (connected) {
      dot.classList.remove('offline');
    } else {
      dot.classList.add('offline');
    }
  }

  _setupEventListeners() {
    document.getElementById('warehouse-select').addEventListener('change', (e) => {
      this._selectWarehouse(e.target.value);
    });

    window.addEventListener('sensorHover', (e) => {
      this._showSensorTooltip(e.detail.sensorData, e.detail.intersection);
    });

    window.addEventListener('sensorHoverOut', () => {
      this._hideTooltip();
    });

    window.addEventListener('sensorClick', (e) => {
      console.log('Sensor clicked:', e.detail.sensorData);
    });

    window.addEventListener('resize', () => {
    });
  }

  _setupControls() {
    const toggles = [
      { id: 'toggle-voxels', setting: 'showVoxels', callback: (v) => this.voxelCloud.setVisible(v) },
      { id: 'toggle-sensors', setting: 'showSensors', callback: (v) => this.sensorVisualizer.setVisible(v) },
      { id: 'toggle-vents', setting: 'showVents', callback: (v) => this.ventVisualizer.setVisible(v) },
      { id: 'toggle-warehouse', setting: 'showWarehouse', callback: (v) => this.warehouseBuilder.setVisible(v) },
      { id: 'toggle-grid', setting: 'showGrid', callback: (v) => this.warehouseBuilder.showGrid(v) },
    ];

    toggles.forEach(({ id, setting, callback }) => {
      const element = document.getElementById(id);
      element.addEventListener('click', () => {
        this.settings[setting] = !this.settings[setting];
        element.classList.toggle('active', this.settings[setting]);
        callback(this.settings[setting]);
      });
    });

    const voxelOpacitySlider = document.getElementById('voxel-opacity');
    const voxelOpacityValue = document.getElementById('voxel-opacity-value');
    voxelOpacitySlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      this.settings.voxelOpacity = value;
      voxelOpacityValue.textContent = value.toFixed(1);
      this.voxelCloud.setOpacity(value);
    });

    const voxelSizeSlider = document.getElementById('voxel-size');
    const voxelSizeValue = document.getElementById('voxel-size-value');
    voxelSizeSlider.addEventListener('change', async (e) => {
      const value = parseInt(e.target.value, 10);
      this.settings.voxelSize = value;
      voxelSizeValue.textContent = value;
      
      if (this.currentWarehouseId) {
        const voxelData = await this.api.getVoxelGrid(this.currentWarehouseId, value);
        if (voxelData && voxelData.grid) {
          this.voxelCloud.updateGrid(voxelData.grid);
        }
      }
    });

    const timeSlider = document.getElementById('time-slider');
    timeSlider.addEventListener('input', (e) => {
      const value = parseInt(e.target.value, 10);
      this._updateHistoricalTime(value);
    });

    document.getElementById('btn-play').addEventListener('click', () => {
      this._togglePlay();
    });

    document.getElementById('btn-reset').addEventListener('click', () => {
      this._resetTime();
    });

    document.getElementById('btn-live').addEventListener('click', () => {
      this._goLive();
    });
  }

  _setupTooltip() {
    this.container = document.getElementById('canvas-container');
  }

  _showSensorTooltip(sensorData, intersection) {
    const tooltip = this.tooltip;
    const titleEl = document.getElementById('tooltip-title');
    const contentEl = document.getElementById('tooltip-content');

    titleEl.textContent = sensorData.code;

    let content = '';
    content += `<div class="tooltip-row"><span>类型</span><span>${sensorData.type || sensorData.sensor_type}</span></div>`;
    content += `<div class="tooltip-row"><span>浓度</span><span>${formatNumber(sensorData.concentration_ppm)} ppm</span></div>`;
    
    if (sensorData.temperature !== null && sensorData.temperature !== undefined) {
      content += `<div class="tooltip-row"><span>温度</span><span>${formatNumber(sensorData.temperature)} °C</span></div>`;
    }
    if (sensorData.humidity !== null && sensorData.humidity !== undefined) {
      content += `<div class="tooltip-row"><span>湿度</span><span>${formatNumber(sensorData.humidity)} %RH</span></div>`;
    }
    
    content += `<div class="tooltip-row"><span>状态</span><span>${sensorData.status || 'online'}</span></div>`;
    content += `<div class="tooltip-row"><span>位置</span><span>(${formatNumber(sensorData.pos_x)}, ${formatNumber(sensorData.pos_z)}, ${formatNumber(sensorData.pos_y)})</span></div>`;

    if (sensorData.reading_time || sensorData.last_seen) {
      content += `<div class="tooltip-row"><span>更新时间</span><span>${formatDateTime(sensorData.reading_time || sensorData.last_seen)}</span></div>`;
    }

    contentEl.innerHTML = content;

    const canvasRect = document.getElementById('canvas-container').getBoundingClientRect();
    let x = 0, y = 0;
    
    if (intersection) {
      const vector = intersection.point.clone();
      vector.project(this.sceneManager.camera);
      
      x = (vector.x * 0.5 + 0.5) * canvasRect.width + canvasRect.left;
      y = (-vector.y * 0.5 + 0.5) * canvasRect.height + canvasRect.top;
    }

    tooltip.style.left = `${x + 15}px`;
    tooltip.style.top = `${y + 15}px`;
    tooltip.classList.add('visible');
  }

  _hideTooltip() {
    this.tooltip.classList.remove('visible');
  }

  _clearSceneState() {
    if (this.historicalFetchTimeout) {
      clearTimeout(this.historicalFetchTimeout);
      this.historicalFetchTimeout = null;
    }

    if (this.isPlaying) {
      this._togglePlay();
    }

    this.voxelCloud.clear();
    this.sensorVisualizer.clear();
    this.riskZoneVisualizer.clear();
    this.ventVisualizer.clear();
    this._hideTooltip();
  }

  _enterHistoricalMode() {
    if (!this.historicalMode) {
      console.log('[App] Entering historical mode');
      this.historicalMode = true;
    }
  }

  _exitHistoricalMode() {
    if (this.historicalMode) {
      console.log('[App] Exiting historical mode, returning to live mode');
      this.historicalMode = false;
      this.historicalTime = null;
      this._clearSceneState();
    }
  }

  async _refreshHistoricalData(snapshotTime) {
    if (!this.currentWarehouseId) return;

    try {
      const fullData = await this.api.getFullHistoricalVoxel(
        this.currentWarehouseId,
        snapshotTime,
        this.settings.voxelSize
      );

      if (!fullData) {
        console.warn('[Historical] No data for snapshot time:', snapshotTime);
        return;
      }

      const { grid, riskZones, sensorReadings } = fullData;

      if (grid) {
        this.voxelCloud.updateGrid(grid);
        this.sensorVisualizer.setMaxConcentration(grid.maxValue || 500);
      }

      if (sensorReadings && sensorReadings.length > 0) {
        this.sensorVisualizer.updateSensors(sensorReadings);
        this._updateStats(sensorReadings, { riskZones });
        this._updateSensorList(sensorReadings);
      }

      if (riskZones && this.currentWarehouse) {
        const bounds = {
          length: parseFloat(this.currentWarehouse.length_m),
          width: parseFloat(this.currentWarehouse.width_m),
          height: parseFloat(this.currentWarehouse.height_m),
        };
        this.riskZoneVisualizer.updateRiskZones(riskZones, bounds);
      }

      this._updateRiskIndicators({ riskZones });

      try {
        const vents = await this.api.getVents(this.currentWarehouseId);
        this.ventVisualizer.updateVents(vents);
      } catch (ventErr) {
        console.warn('[Historical] Failed to fetch vents:', ventErr.message);
      }

    } catch (err) {
      console.error('[Historical] Failed to refresh historical data:', err);
    }
  }

  _startDataRefresh() {
    setInterval(() => {
      if (!this.historicalMode && this.currentWarehouseId) {
        this._refreshData();
      }
    }, 5000);
  }

  _updateTime() {
    const el = document.getElementById('current-time');
    el.textContent = formatDateTime(new Date());
  }

  _updateHistoricalTime(value) {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const targetTime = oneHourAgo + (value / 100) * (now - oneHourAgo);

    this.historicalTime = new Date(targetTime);
    this._enterHistoricalMode();

    document.getElementById('time-display').textContent = formatDateTime(this.historicalTime);

    if (this.historicalFetchTimeout) {
      clearTimeout(this.historicalFetchTimeout);
    }

    this.historicalFetchTimeout = setTimeout(async () => {
      await this._refreshHistoricalData(this.historicalTime);
    }, 200);
  }

  _togglePlay() {
    const btn = document.getElementById('btn-play');
    
    if (this.isPlaying) {
      this.isPlaying = false;
      btn.textContent = '播放';
      btn.classList.remove('active');
      
      if (this.playInterval) {
        clearInterval(this.playInterval);
        this.playInterval = null;
      }
    } else {
      this.isPlaying = true;
      btn.textContent = '暂停';
      btn.classList.add('active');

      this.playInterval = setInterval(() => {
        const slider = document.getElementById('time-slider');
        let value = parseInt(slider.value, 10);
        value += 1;
        
        if (value >= 100) {
          value = 100;
          this._togglePlay();
        }
        
        slider.value = value;
        this._updateHistoricalTime(value);
      }, 100);
    }
  }

  _resetTime() {
    document.getElementById('time-slider').value = 0;
    this._updateHistoricalTime(0);
  }

  _goLive() {
    this._exitHistoricalMode();

    document.getElementById('time-slider').value = 100;
    document.getElementById('time-display').textContent = '实时模式';

    this._refreshData();
  }

  _loadMockData() {
    console.log('Loading mock data...');
    
    const mockWarehouse = {
      id: 'mock-wh-001',
      code: 'WH-001',
      name: '一号平房仓 (模拟)',
      length_m: 60,
      width_m: 30,
      height_m: 8,
      grain_type: '小麦',
      capacity_tons: 5000,
    };

    this.warehouses = [mockWarehouse];
    this.currentWarehouse = mockWarehouse;
    this.currentWarehouseId = mockWarehouse.id;

    const select = document.getElementById('warehouse-select');
    select.innerHTML = '';
    const option = document.createElement('option');
    option.value = mockWarehouse.id;
    option.textContent = `${mockWarehouse.code} - ${mockWarehouse.name}`;
    select.appendChild(option);

    this.warehouseBuilder.build(mockWarehouse);
    this.sceneManager.setCameraTarget(30, 4, 15);
    this.sceneManager.setCameraPosition(80, 50, 60);

    this._loadMockSensors();
    this._loadMockVents();
    this._loadMockVoxelGrid();

    this._updateWsStatus(false);
  }

  _loadMockSensors() {
    const mockSensors = [
      { sensor_id: 's1', code: 'PH3-001', type: 'PH3', pos_x: 10, pos_y: 2, pos_z: 10, concentration_ppm: 150, status: 'online' },
      { sensor_id: 's2', code: 'PH3-002', type: 'PH3', pos_x: 30, pos_y: 4, pos_z: 15, concentration_ppm: 280, status: 'online' },
      { sensor_id: 's3', code: 'PH3-003', type: 'PH3', pos_x: 50, pos_y: 3, pos_z: 20, concentration_ppm: 420, status: 'online' },
      { sensor_id: 's4', code: 'PH3-004', type: 'PH3', pos_x: 20, pos_y: 6, pos_z: 25, concentration_ppm: 180, status: 'online' },
      { sensor_id: 's5', code: 'PH3-005', type: 'PH3', pos_x: 45, pos_y: 5, pos_z: 5, concentration_ppm: 350, status: 'offline' },
      { sensor_id: 's6', code: 'TEMP-001', type: 'TEMP', pos_x: 15, pos_y: 3, pos_z: 15, temperature: 23.5, status: 'online' },
      { sensor_id: 's7', code: 'HUM-001', type: 'HUM', pos_x: 15, pos_y: 3, pos_z: 15, humidity: 62, status: 'online' },
    ];

    this.sensorVisualizer.updateSensors(mockSensors);
    this._updateStats(mockSensors, null);
    this._updateSensorList(mockSensors);
  }

  _loadMockVents() {
    const mockVents = [
      { id: 'v1', code: 'VENT-IN-01', name: '进风口1', pos_x: 0, pos_y: 2, pos_z: 15, direction: 'in', is_open: true, fan_speed: 50 },
      { id: 'v2', code: 'VENT-OUT-01', name: '排风口1', pos_x: 60, pos_y: 7, pos_z: 15, direction: 'out', is_open: true, fan_speed: 80 },
    ];

    this.ventVisualizer.updateVents(mockVents);
  }

  _loadMockVoxelGrid() {
    const gridSize = 20;
    const bounds = { length: 60, width: 30, height: 8 };
    const stepX = bounds.length / gridSize;
    const stepY = bounds.width / gridSize;
    const stepZ = bounds.height / gridSize;

    const data = new Float32Array(gridSize * gridSize * gridSize);

    const sources = [
      { x: 0.5, y: 0.3, z: 0.5, value: 500 },
      { x: 0.75, y: 0.6, z: 0.3, value: 400 },
      { x: 0.3, y: 0.5, z: 0.7, value: 300 },
    ];

    let maxValue = 0;

    for (let ix = 0; ix < gridSize; ix++) {
      for (let iy = 0; iy < gridSize; iy++) {
        for (let iz = 0; iz < gridSize; iz++) {
          const nx = ix / gridSize;
          const ny = iy / gridSize;
          const nz = iz / gridSize;

          let value = 0;
          let totalWeight = 0;

          for (const src of sources) {
            const dx = nx - src.x;
            const dy = ny - src.y;
            const dz = nz - src.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.01;
            const weight = 1 / (dist * dist);
            value += src.value * weight;
            totalWeight += weight;
          }

          value = totalWeight > 0 ? value / totalWeight : 0;

          const index = ix + iy * gridSize + iz * gridSize * gridSize;
          data[index] = value;
          maxValue = Math.max(maxValue, value);
        }
      }
    }

    const gridData = {
      size: gridSize,
      dimensions: { x: gridSize, y: gridSize, z: gridSize },
      steps: { x: stepX, y: stepY, z: stepZ },
      bounds,
      data: Array.from(data),
      maxValue,
      minValue: 0,
    };

    this.voxelCloud.updateGrid(gridData);
    this.sensorVisualizer.setMaxConcentration(maxValue);

    const riskZones = [
      { level: 'high', label: '高风险区', voxelCount: 120, concentrationMin: 500 },
      { level: 'medium', label: '中风险区', voxelCount: 350, concentrationMin: 300 },
      { level: 'low', label: '低风险区', voxelCount: 600, concentrationMin: 100 },
    ];

    this.riskZoneVisualizer.updateRiskZones(riskZones, bounds);
    this._updateRiskIndicators({ riskZones });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new App();
});
