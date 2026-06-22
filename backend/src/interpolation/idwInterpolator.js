const config = require('../config');

class IDWInterpolator {
  constructor(options = {}) {
    this.power = options.power || config.voxel.idwPower;
    this.epsilon = options.epsilon || 1e-10;
  }

  interpolatePoint(point, samples) {
    if (!samples || samples.length === 0) {
      return 0;
    }

    let weightedSum = 0;
    let weightSum = 0;

    for (const sample of samples) {
      const dx = point.x - sample.x;
      const dy = point.y - sample.y;
      const dz = point.z - sample.z;

      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (distance < this.epsilon) {
        return sample.value;
      }

      const weight = 1 / Math.pow(distance, this.power);
      weightedSum += weight * sample.value;
      weightSum += weight;
    }

    return weightSum > 0 ? weightedSum / weightSum : 0;
  }

  generateVoxelGrid(samples, bounds, gridSize) {
    const size = gridSize || config.voxel.gridSize;

    const stepX = bounds.length / size;
    const stepY = bounds.width / size;
    const stepZ = bounds.height / size;

    const grid = {
      size,
      dimensions: { x: size, y: size, z: size },
      steps: { x: stepX, y: stepY, z: stepZ },
      bounds: { ...bounds },
      data: new Float32Array(size * size * size),
      maxValue: 0,
      minValue: Infinity,
    };

    for (let ix = 0; ix < size; ix++) {
      for (let iy = 0; iy < size; iy++) {
        for (let iz = 0; iz < size; iz++) {
          const point = {
            x: ix * stepX + stepX / 2,
            y: iy * stepY + stepY / 2,
            z: iz * stepZ + stepZ / 2,
          };

          const value = this.interpolatePoint(point, samples);
          const index = ix + iy * size + iz * size * size;

          grid.data[index] = value;

          if (value > grid.maxValue) grid.maxValue = value;
          if (value < grid.minValue) grid.minValue = value;
        }
      }
    }

    return grid;
  }

  generateVoxelGridOptimized(samples, bounds, gridSize) {
    const size = gridSize || config.voxel.gridSize;
    const stepX = bounds.length / size;
    const stepY = bounds.width / size;
    const stepZ = bounds.height / size;

    const grid = {
      size,
      dimensions: { x: size, y: size, z: size },
      steps: { x: stepX, y: stepY, z: stepZ },
      bounds: { ...bounds },
      data: new Float32Array(size * size * size),
      maxValue: 0,
      minValue: Infinity,
    };

    const sampleValues = samples.map(s => s.value);
    const sampleX = samples.map(s => s.x);
    const sampleY = samples.map(s => s.y);
    const sampleZ = samples.map(s => s.z);
    const numSamples = samples.length;

    for (let ix = 0; ix < size; ix++) {
      const px = ix * stepX + stepX / 2;

      for (let iy = 0; iy < size; iy++) {
        const py = iy * stepY + stepY / 2;

        for (let iz = 0; iz < size; iz++) {
          const pz = iz * stepZ + stepZ / 2;
          const index = ix + iy * size + iz * size * size;

          let weightedSum = 0;
          let weightSum = 0;
          let foundExact = false;

          for (let s = 0; s < numSamples; s++) {
            const dx = px - sampleX[s];
            const dy = py - sampleY[s];
            const dz = pz - sampleZ[s];

            const distSq = dx * dx + dy * dy + dz * dz;

            if (distSq < this.epsilon * this.epsilon) {
              grid.data[index] = sampleValues[s];
              foundExact = true;
              break;
            }

            const dist = Math.sqrt(distSq);
            const weight = 1 / Math.pow(dist, this.power);
            weightedSum += weight * sampleValues[s];
            weightSum += weight;
          }

          if (!foundExact) {
            const value = weightSum > 0 ? weightedSum / weightSum : 0;
            grid.data[index] = value;
          }

          if (grid.data[index] > grid.maxValue) grid.maxValue = grid.data[index];
          if (grid.data[index] < grid.minValue) grid.minValue = grid.data[index];
        }
      }
    }

    return grid;
  }

  calculateRiskZones(grid, thresholds) {
    const zones = [];
    const size = grid.size;
    const data = grid.data;

    let lowCount = 0;
    let mediumCount = 0;
    let highCount = 0;

    const lowVoxels = [];
    const mediumVoxels = [];
    const highVoxels = [];

    for (let ix = 0; ix < size; ix++) {
      for (let iy = 0; iy < size; iy++) {
        for (let iz = 0; iz < size; iz++) {
          const index = ix + iy * size + iz * size * size;
          const value = data[index];

          if (value >= thresholds.high) {
            highCount++;
            highVoxels.push({ ix, iy, iz, value });
          } else if (value >= thresholds.medium) {
            mediumCount++;
            mediumVoxels.push({ ix, iy, iz, value });
          } else if (value >= thresholds.low) {
            lowCount++;
            lowVoxels.push({ ix, iy, iz, value });
          }
        }
      }
    }

    if (highCount > 0) {
      zones.push({
        level: 'high',
        label: '高风险区',
        count: highCount,
        concentrationMin: thresholds.high,
        concentrationMax: grid.maxValue,
        color: '#ff0000',
        voxelCount: highCount,
      });
    }

    if (mediumCount > 0) {
      zones.push({
        level: 'medium',
        label: '中风险区',
        count: mediumCount,
        concentrationMin: thresholds.medium,
        concentrationMax: thresholds.high,
        color: '#ffaa00',
        voxelCount: mediumCount,
      });
    }

    if (lowCount > 0) {
      zones.push({
        level: 'low',
        label: '低风险区',
        count: lowCount,
        concentrationMin: thresholds.low,
        concentrationMax: thresholds.medium,
        color: '#ffff00',
        voxelCount: lowCount,
      });
    }

    return {
      zones,
      totalVoxels: size * size * size,
      lowVoxels,
      mediumVoxels,
      highVoxels,
    };
  }

  getEntryPermission(concentration, durationMinutes = 0) {
    const rules = {
      safe: {
        maxConcentration: 0.3,
        label: '安全',
        description: '浓度低于职业接触限值，可正常作业',
        ppeRequired: false,
      },
      caution: {
        maxConcentration: 2,
        label: '注意',
        description: '需佩戴过滤式防毒面具，限时作业',
        ppeRequired: true,
        maxDuration: 30,
      },
      danger: {
        maxConcentration: 10,
        label: '危险',
        description: '需佩戴正压式呼吸器，双人作业',
        ppeRequired: true,
        maxDuration: 15,
      },
      severe: {
        maxConcentration: Infinity,
        label: '严重危险',
        description: '禁止人员进入',
        ppeRequired: true,
        maxDuration: 0,
      },
    };

    if (concentration <= rules.safe.maxConcentration) {
      return { ...rules.safe, allowed: true };
    }

    if (concentration <= rules.caution.maxConcentration) {
      return {
        ...rules.caution,
        allowed: durationMinutes <= rules.caution.maxDuration,
      };
    }

    if (concentration <= rules.danger.maxConcentration) {
      return {
        ...rules.danger,
        allowed: durationMinutes <= rules.danger.maxDuration,
      };
    }

    return { ...rules.severe, allowed: false };
  }

  serializeGrid(grid) {
    return {
      size: grid.size,
      dimensions: grid.dimensions,
      steps: grid.steps,
      bounds: grid.bounds,
      data: Array.from(grid.data),
      maxValue: grid.maxValue,
      minValue: grid.minValue,
    };
  }
}

module.exports = IDWInterpolator;
