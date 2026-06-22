import * as THREE from 'three';
import { concentrationToColor } from '../utils/colors.js';

class VoxelCloud {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.voxelGroup = new THREE.Group();
    this.voxelGroup.name = 'voxelCloud';
    this.sceneManager.addToScene(this.voxelGroup);

    this.voxels = [];
    this.gridData = null;
    this.maxValue = 500;
    this.opacity = 0.6;
    this.threshold = 50;

    this.instancedMesh = null;
    this.dummy = new THREE.Object3D();
  }

  updateGrid(gridData) {
    this.gridData = gridData;
    this.maxValue = gridData.maxValue || 500;
    this._buildVoxels();
  }

  _buildVoxels() {
    this.clear();

    if (!this.gridData || !this.gridData.data) return;

    const { data, dimensions, steps, bounds } = this.gridData;
    const { x: dimX, y: dimY, z: dimZ } = dimensions;

    let voxelCount = 0;
    for (let i = 0; i < data.length; i++) {
      if (data[i] >= this.threshold) {
        voxelCount++;
      }
    }

    if (voxelCount === 0) return;

    const voxelGeo = new THREE.BoxGeometry(
      steps.x * 0.9,
      steps.z * 0.9,
      steps.y * 0.9
    );

    const voxelMat = new THREE.MeshStandardMaterial({
      transparent: true,
      opacity: this.opacity,
      roughness: 0.8,
      metalness: 0.1,
      vertexColors: false,
    });

    this.instancedMesh = new THREE.InstancedMesh(voxelGeo, voxelMat, voxelCount);
    this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const colors = new Float32Array(voxelCount * 3);

    let index = 0;
    for (let ix = 0; ix < dimX; ix++) {
      for (let iy = 0; iy < dimY; iy++) {
        for (let iz = 0; iz < dimZ; iz++) {
          const dataIndex = ix + iy * dimX + iz * dimX * dimY;
          const value = data[dataIndex];

          if (value >= this.threshold) {
            const posX = ix * steps.x + steps.x / 2;
            const posY = iz * steps.y + steps.y / 2;
            const posZ = iy * steps.z + steps.z / 2;

            this.dummy.position.set(posX, posY, posZ);
            this.dummy.updateMatrix();
            this.instancedMesh.setMatrixAt(index, this.dummy.matrix);

            const { r, g, b } = concentrationToColor(value, this.maxValue);
            colors[index * 3] = r / 255;
            colors[index * 3 + 1] = g / 255;
            colors[index * 3 + 2] = b / 255;

            index++;
          }
        }
      }
    }

    this.instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
    this.instancedMesh.instanceColor.needsUpdate = true;
    this.instancedMesh.instanceMatrix.needsUpdate = true;

    this.voxelGroup.add(this.instancedMesh);
  }

  setOpacity(opacity) {
    this.opacity = opacity;
    if (this.instancedMesh && this.instancedMesh.material) {
      this.instancedMesh.material.opacity = opacity;
      this.instancedMesh.material.transparent = opacity < 1;
      this.instancedMesh.material.needsUpdate = true;
    }
  }

  setThreshold(threshold) {
    this.threshold = threshold;
    if (this.gridData) {
      this._buildVoxels();
    }
  }

  setMaxValue(maxValue) {
    this.maxValue = maxValue;
    if (this.gridData) {
      this._buildVoxels();
    }
  }

  setVisible(visible) {
    this.voxelGroup.visible = visible;
  }

  animate(delta, elapsed) {
    if (this.instancedMesh && this.instancedMesh.material) {
      const pulse = Math.sin(elapsed * 0.5) * 0.1;
      this.instancedMesh.material.opacity = this.opacity * (0.9 + pulse);
    }
  }

  clear() {
    while (this.voxelGroup.children.length > 0) {
      const child = this.voxelGroup.children[0];
      this.voxelGroup.remove(child);

      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    }
    this.instancedMesh = null;
    this.voxels = [];
  }

  getVoxelCount() {
    return this.instancedMesh ? this.instancedMesh.count : 0;
  }
}

export default VoxelCloud;
