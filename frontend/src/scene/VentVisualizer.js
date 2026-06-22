import * as THREE from 'three';

class VentVisualizer {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.ventGroup = new THREE.Group();
    this.ventGroup.name = 'vents';
    this.sceneManager.addToScene(this.ventGroup);

    this.vents = new Map();
  }

  updateVents(ventList) {
    const currentIds = new Set();

    for (const vent of ventList) {
      currentIds.add(vent.id);

      if (this.vents.has(vent.id)) {
        this._updateVent(vent.id, vent);
      } else {
        this._createVent(vent);
      }
    }

    for (const [id] of this.vents) {
      if (!currentIds.has(id)) {
        this._removeVent(id);
      }
    }
  }

  _createVent(vent) {
    const ventGroup = new THREE.Group();
    ventGroup.name = `vent_${vent.id}`;

    const posX = parseFloat(vent.pos_x || 0);
    const posY = parseFloat(vent.pos_y || 0);
    const posZ = parseFloat(vent.pos_z || 0);

    const frameSize = 2;
    const frameThickness = 0.2;

    const frameMaterial = new THREE.MeshStandardMaterial({
      color: 0x444444,
      roughness: 0.4,
      metalness: 0.7,
    });

    const frameGeo1 = new THREE.BoxGeometry(frameSize, frameThickness, frameThickness);
    const frameTop = new THREE.Mesh(frameGeo1, frameMaterial);
    frameTop.position.y = frameSize / 2;
    ventGroup.add(frameTop);

    const frameBottom = new THREE.Mesh(frameGeo1, frameMaterial);
    frameBottom.position.y = -frameSize / 2;
    ventGroup.add(frameBottom);

    const frameGeo2 = new THREE.BoxGeometry(frameThickness, frameSize, frameThickness);
    const frameLeft = new THREE.Mesh(frameGeo2, frameMaterial);
    frameLeft.position.x = -frameSize / 2;
    ventGroup.add(frameLeft);

    const frameRight = new THREE.Mesh(frameGeo2, frameMaterial);
    frameRight.position.x = frameSize / 2;
    ventGroup.add(frameRight);

    const bladeCount = 5;
    const blades = [];
    const bladeMaterial = new THREE.MeshStandardMaterial({
      color: 0x666666,
      roughness: 0.3,
      metalness: 0.8,
    });

    for (let i = 0; i < bladeCount; i++) {
      const bladeGeo = new THREE.BoxGeometry(frameSize * 0.9, 0.15, frameThickness * 0.8);
      const blade = new THREE.Mesh(bladeGeo, bladeMaterial);
      blade.position.y = -frameSize / 2 + (i + 0.5) * (frameSize / bladeCount);
      blade.userData.originalRotation = 0;
      ventGroup.add(blade);
      blades.push(blade);
    }

    const flowGroup = new THREE.Group();
    const flowParticles = [];
    const flowCount = 20;
    const flowMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.6,
    });

    for (let i = 0; i < flowCount; i++) {
      const particleGeo = new THREE.SphereGeometry(0.1, 8, 8);
      const particle = new THREE.Mesh(particleGeo, flowMaterial.clone());
      particle.position.set(
        (Math.random() - 0.5) * frameSize * 0.8,
        (Math.random() - 0.5) * frameSize * 0.8,
        Math.random() * 5
      );
      particle.userData.speed = 0.02 + Math.random() * 0.03;
      particle.userData.offset = Math.random();
      flowGroup.add(particle);
      flowParticles.push(particle);
    }

    flowGroup.visible = false;
    ventGroup.add(flowGroup);

    const direction = vent.direction || 'out';

    ventGroup.position.set(posX, posY, posZ);

    if (vent.direction === 'in' || vent.direction === 'out') {
      if (posX === 0) {
        ventGroup.rotation.y = Math.PI / 2;
      }
    }

    const ventObj = {
      group: ventGroup,
      blades,
      flowGroup,
      flowParticles,
      flowMaterial,
      data: vent,
      isOpen: vent.is_open || false,
      fanSpeed: vent.fan_speed || 0,
      direction,
    };

    this.vents.set(vent.id, ventObj);
    this.ventGroup.add(ventGroup);

    this._updateVentState(ventObj);
  }

  _updateVent(id, vent) {
    const ventObj = this.vents.get(id);
    if (!ventObj) return;

    ventObj.data = vent;
    ventObj.isOpen = vent.is_open || false;
    ventObj.fanSpeed = vent.fan_speed || 0;

    this._updateVentState(ventObj);
  }

  _updateVentState(ventObj) {
    const { blades, flowGroup, isOpen, fanSpeed } = ventObj;

    const targetRotation = isOpen ? -Math.PI / 4 : 0;

    blades.forEach((blade, i) => {
      blade.rotation.x = targetRotation;
    });

    flowGroup.visible = isOpen && fanSpeed > 0;

    if (isOpen) {
      const intensity = fanSpeed / 100;
      ventObj.flowParticles.forEach((p) => {
        p.material.opacity = 0.3 + intensity * 0.5;
      });
    }
  }

  _removeVent(id) {
    const ventObj = this.vents.get(id);
    if (!ventObj) return;

    this.ventGroup.remove(ventObj.group);

    ventObj.group.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });

    this.vents.delete(id);
  }

  setVisible(visible) {
    this.ventGroup.visible = visible;
  }

  animate(delta, elapsed) {
    for (const [, ventObj] of this.vents) {
      if (ventObj.isOpen && ventObj.fanSpeed > 0) {
        const speed = ventObj.fanSpeed / 100 * 0.1;

        ventObj.flowParticles.forEach((particle) => {
          let z = particle.position.z + speed * delta * 60;
          if (z > 8) {
            z = 0;
            particle.position.x = (Math.random() - 0.5) * 1.5;
            particle.position.y = (Math.random() - 0.5) * 1.5;
          }
          particle.position.z = z;

          const alpha = Math.sin(z / 8 * Math.PI) * 0.8;
          particle.material.opacity = alpha * (ventObj.fanSpeed / 100);
        });
      }
    }
  }

  clear() {
    for (const [id] of this.vents) {
      this._removeVent(id);
    }
    this.vents.clear();
  }
}

export default VentVisualizer;
