import * as THREE from 'three';
import { riskLevelToColor } from '../utils/colors.js';

class RiskZoneVisualizer {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.riskGroup = new THREE.Group();
    this.riskGroup.name = 'riskZones';
    this.sceneManager.addToScene(this.riskGroup);

    this.zones = [];
  }

  updateRiskZones(zones, bounds) {
    this.clear();

    if (!zones || zones.length === 0) return;

    for (const zone of zones) {
      this._createZone(zone, bounds);
    }
  }

  _createZone(zone, bounds) {
    const level = zone.level || zone.risk_level;
    const color = riskLevelToColor(level);

    const zoneGroup = new THREE.Group();
    zoneGroup.name = `riskZone_${level}`;

    const edgesMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color(color.r / 255, color.g / 255, color.b / 255),
      transparent: true,
      opacity: 0.8,
    });

    const geometry = new THREE.BoxGeometry(
      bounds.length * 0.8,
      bounds.height * 0.6,
      bounds.width * 0.8
    );

    const edges = new THREE.EdgesGeometry(geometry);
    const line = new THREE.LineSegments(edges, edgesMaterial);
    line.position.set(
      bounds.length / 2,
      bounds.height * 0.3,
      bounds.width / 2
    );
    zoneGroup.add(line);

    const boxMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color.r / 255, color.g / 255, color.b / 255),
      transparent: true,
      opacity: 0.05,
      side: THREE.DoubleSide,
    });

    const box = new THREE.Mesh(geometry, boxMaterial);
    box.position.copy(line.position);
    zoneGroup.add(box);

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.9)`;
    ctx.fillRect(0, 0, 256, 64);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(zone.label || `${level.toUpperCase()} RISK`, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });

    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(8, 2, 1);
    sprite.position.set(
      bounds.length / 2,
      bounds.height * 0.7,
      bounds.width / 2
    );
    zoneGroup.add(sprite);

    zoneGroup.userData = {
      level,
      zoneData: zone,
    };

    this.zones.push(zoneGroup);
    this.riskGroup.add(zoneGroup);
  }

  setVisible(visible) {
    this.riskGroup.visible = visible;
  }

  animate(delta, elapsed) {
    for (const zone of this.zones) {
      const pulse = Math.sin(elapsed * 2) * 0.1 + 1;
      zone.scale.set(pulse, pulse, pulse);

      if (zone.children[2]) {
        zone.children[2].material.opacity = 0.7 + Math.sin(elapsed * 3) * 0.3;
      }
    }
  }

  clear() {
    while (this.riskGroup.children.length > 0) {
      const child = this.riskGroup.children[0];
      this.riskGroup.remove(child);

      child.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach(m => {
              if (m.map) m.map.dispose();
              m.dispose();
            });
          } else {
            if (obj.material.map) obj.material.map.dispose();
            obj.material.dispose();
          }
        }
      });
    }
    this.zones = [];
  }
}

export default RiskZoneVisualizer;
