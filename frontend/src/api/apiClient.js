class ApiClient {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}/api${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error);
      throw error;
    }
  }

  async getWarehouses() {
    const result = await this.request('/warehouses');
    return result.data || [];
  }

  async getWarehouse(code) {
    const result = await this.request(`/warehouses/${code}`);
    return result.data;
  }

  async getSensors(warehouseId) {
    const result = await this.request(`/warehouses/${warehouseId}/sensors`);
    return result.data || [];
  }

  async getLatestSensorReadings(warehouseId) {
    const result = await this.request(`/warehouses/${warehouseId}/sensor-readings`);
    return result.data || [];
  }

  async getVents(warehouseId) {
    const result = await this.request(`/warehouses/${warehouseId}/vents`);
    return result.data || [];
  }

  async getVoxelGrid(warehouseId, gridSize = null) {
    const params = gridSize ? `?gridSize=${gridSize}` : '';
    const result = await this.request(`/warehouses/${warehouseId}/voxel-grid${params}`);
    return result.data;
  }

  async getSensorStatuses(warehouseId) {
    const result = await this.request(`/warehouses/${warehouseId}/sensor-status`);
    return result.data || [];
  }

  async getRiskZones(warehouseId) {
    const result = await this.request(`/warehouses/${warehouseId}/risk-zones`);
    return result.data || [];
  }

  async getHistoricalReadings(warehouseId, startTime, endTime) {
    const params = new URLSearchParams();
    if (startTime) params.set('start_time', startTime.toISOString());
    if (endTime) params.set('end_time', endTime.toISOString());
    const query = params.toString() ? `?${params.toString()}` : '';
    const result = await this.request(`/warehouses/${warehouseId}/historical-readings${query}`);
    return result.data || [];
  }

  async getHistoricalSensorReadings(warehouseId, snapshotTime, windowMs) {
    const params = new URLSearchParams();
    params.set('snapshot_time', snapshotTime.toISOString());
    if (windowMs) params.set('window_ms', windowMs);
    const result = await this.request(`/warehouses/${warehouseId}/historical-sensor-readings?${params.toString()}`);
    return result.data || [];
  }

  async getHistoricalVoxel(warehouseId, snapshotTime, gridSize = null, windowMs = null) {
    const params = new URLSearchParams();
    params.set('snapshot_time', snapshotTime.toISOString());
    if (gridSize) params.set('grid_size', gridSize);
    if (windowMs) params.set('window_ms', windowMs);
    const result = await this.request(`/warehouses/${warehouseId}/historical-voxel?${params.toString()}`);
    return result.data;
  }

  async getFullHistoricalVoxel(warehouseId, snapshotTime, gridSize = null, windowMs = null) {
    const params = new URLSearchParams();
    params.set('snapshot_time', snapshotTime.toISOString());
    params.set('full', 'true');
    if (gridSize) params.set('grid_size', gridSize);
    if (windowMs) params.set('window_ms', windowMs);
    const result = await this.request(`/warehouses/${warehouseId}/historical-voxel?${params.toString()}`);
    return result.data;
  }

  async getEntryPermission(warehouseId, position = null) {
    const params = new URLSearchParams();
    if (position) {
      params.set('x', position.x);
      params.set('y', position.y);
      params.set('z', position.z);
    }
    const query = params.toString() ? `?${params.toString()}` : '';
    const result = await this.request(`/warehouses/${warehouseId}/entry-permission${query}`);
    return result.data;
  }

  async sendSensorData(message) {
    const result = await this.request('/sensor-data', {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
    return result;
  }

  async sendBatchSensorData(messages) {
    const result = await this.request('/sensor-data/batch', {
      method: 'POST',
      body: JSON.stringify({ messages }),
    });
    return result;
  }

  async updateVent(ventId, isOpen, fanSpeed = 0) {
    const result = await this.request(`/vents/${ventId}`, {
      method: 'PUT',
      body: JSON.stringify({ is_open: isOpen, fan_speed: fanSpeed }),
    });
    return result.data;
  }

  async createVentilationSimulation(warehouseId, params) {
    const result = await this.request(`/warehouses/${warehouseId}/ventilation-simulations`, {
      method: 'POST',
      body: JSON.stringify({
        name: params.name,
        vent_config: params.ventConfig,
        grid_size: params.gridSize,
        total_seconds: params.totalSeconds,
        time_step_seconds: params.timeStepSeconds,
        initial_snapshot_time: params.initialSnapshotTime ? params.initialSnapshotTime.toISOString() : null,
      }),
    });
    return result.data;
  }

  async listVentilationSimulations(warehouseId, options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', options.limit);
    if (options.offset) params.set('offset', options.offset);
    if (options.status) params.set('status', options.status);
    const query = params.toString() ? `?${params.toString()}` : '';
    const result = await this.request(`/warehouses/${warehouseId}/ventilation-simulations${query}`);
    return result.data || [];
  }

  async getVentilationSimulation(simId) {
    const result = await this.request(`/ventilation-simulations/${simId}`);
    return result.data;
  }

  async cancelVentilationSimulation(simId) {
    const result = await this.request(`/ventilation-simulations/${simId}/cancel`, {
      method: 'POST',
    });
    return result.data;
  }

  async deleteVentilationSimulation(simId) {
    const result = await this.request(`/ventilation-simulations/${simId}`, {
      method: 'DELETE',
    });
    return result.data;
  }
}

export default ApiClient;
