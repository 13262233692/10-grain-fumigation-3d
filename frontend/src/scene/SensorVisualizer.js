import * as THREE from 'three';
import { concentrationToColor } from '../utils/colors.js';

class SensorVisualizer {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.sensorGroup = new THREE.Group();
    this.sensorGroup.name = 'sensors';
    this.sceneManager.addToScene(this.sensorGroup);

    this.sensors = new Map();
    this.pulseAnimation = null;
    this.maxConcentration = 500;
  }

  setMaxConcentration(max) {
    this.maxConcentration = max;
    this._updateColors();
  }

  updateSensors(sensorDataList) {
    const currentIds = new Set();

    for (const data of sensorDataList) {
      const id = data.sensor_id || data.id;
      currentIds.add(id);

      if (this.sensors.has(id)) {
        this._updateSensor(id, data);
      } else {
        this._createSensor(id, data);
      }
    }

    for (const [id, sensor] of this.sensors) {
      if (!currentIds.has(id)) {
        this._removeSensor(id);
      }
    }
  }

  _createSensor(id, data) {
    const sensorGroup = new THREE.Group();
    sensorGroup.name = `sensor_${id}`;

    const posX = parseFloat(data.pos_x || data.posX || 0);
    const posY = parseFloat(data.pos_y || data.posY || 0);
    const posZ = parseFloat(data.pos_z || data.posZ || 0);

    const baseGeometry = new THREE.CylinderGeometry(0.3, 0.4, 0.2, 16);
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: 0x555555,
      roughness: 0.5,
      metalness: 0.8,
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = 0.1;
    base.castShadow = true;
    sensorGroup.add(base);

    const bodyGeometry = new THREE.CylinderGeometry(0.2, 0.3, 0.8, 16);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.3,
      metalness: 0.9,
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.6;
    body.castShadow = true;
    sensorGroup.add(body);

    const capGeometry = new THREE.SphereGeometry(0.25, 16, 16);
    const capMaterial = new THREE.MeshStandardMaterial({
      color: 0x409eff,
      emissive: 0x409eff,
      emissiveIntensity: 0.5,
      roughness: 0.2,
      metalness: 0.9,
    });
    const cap = new THREE.Mesh(capGeometry, capMaterial);
    cap.position.y = 1.1;
    cap.castShadow = true;
    sensorGroup.add(cap);

    const ringGeometry = new THREE.RingGeometry(0.4, 0.5, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x409eff,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    sensorGroup.add(ring);

    sensorGroup.position.set(posX, posY, posZ);

    const sensorObj = {
      group: sensorGroup,
      base,
      body,
      cap,
      ring,
      capMaterial,
      ringMaterial,
      data,
    };

    cap.userData = {
      sensorId: id,
      sensorData: data,
      onHover: (userData, intersection) => this._onHover(userData, intersection),
      onHoverOut: (userData) => this._onHoverOut(userData),
      onClick: (userData) => this._onClick(userData),
    };

    this.sceneManager.addInteractiveObject(cap);

    this.sensors.set(id, sensorObj);
    this.sensorGroup.add(sensorGroup);
  }

  _updateSensor(id, data) {
    const sensor = this.sensors.get(id);
    if (!sensor) return;

    sensor.data = data;

    const concentration = parseFloat(data.concentration_ppm || data.value || 0);
    const { r, g, b } = concentrationToColor(concentration, this.maxConcentration);
    const color = new THREE.Color(r / 255, g / 255, b / 255);

    sensor.capMaterial.color.copy(color);
    sensor.capMaterial.emissive.copy(color);
    sensor.capMaterial.emissiveIntensity = 0.3 + (concentration / this.maxConcentration) * 0.7;

    sensor.ringMaterial.color.copy(color);

    const status = data.effectiveStatus || data.status || 'online';
    const isOffline = status === 'offline';

    if (isOffline) {
      sensor.capMaterial.opacity = 0.3;
      sensor.capMaterial.transparent = true;
      sensor.ringMaterial.opacity = 0.2;
    } else {
      sensor.capMaterial.opacity = 1;
      sensor.capMaterial.transparent = false;
      sensor.ringMaterial.opacity = 0.6;
    }

    sensor.cap.userData.sensorData = data;
  }

  _removeSensor(id) {
    const sensor = this.sensors.get(id);
    if (!sensor) return;

    this.sceneManager.removeInteractiveObject(sensor.cap);
    this.sensorGroup.remove(sensor.group);

    sensor.group.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });

    this.sensors.delete(id);
  }

  _updateColors() {
    for (const [id, sensor] of this.sensors) {
      this._updateSensor(id, sensor.data);
    }
  }

  _onHover(userData, intersection) {
    const event = new CustomEvent('sensorHover', {
      detail: {
        sensorData: userData.sensorData,
        intersection,
      },
    });
    window.dispatchEvent(event);
  }

  _onHoverOut(userData) {
    const event = new CustomEvent('sensorHoverOut', {
      detail: { sensorData: userData.sensorData },
    });
    window.dispatchEvent(event);
  }

  _onClick(userData) {
    const event = new CustomEvent('sensorClick', {
      detail: { sensorData: userData.sensorData },
    });
    window.dispatchEvent(event);
  }

  setVisible(visible) {
    this.sensorGroup.visible = visible;
  }

  animate(delta, elapsed) {
    for (const [, sensor] of this.sensors) {
      const pulse = Math.sin(elapsed * 2) * 0.5 + 0.5;
      const baseIntensity = 0.3 + (parseFloat(sensor.data.concentration_ppm || 0) / this.maxConcentration) * 0.7;
      sensor.capMaterial.emissiveIntensity = baseIntensity + pulse * 0.2;

      const ringScale = 1 + pulse * 0.3;
      sensor.ring.scale.set(ringScale, ringScale, 1);
      sensor.ringMaterial.opacity = 0.6 - pulse * 0.4;
    }
  }

  clear() {
    for (const [id] of this.sensors) {
      this._removeSensor(id);
    }
    this.sensors.clear();
  }
}

export default SensorVisualizer;
