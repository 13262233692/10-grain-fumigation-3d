import * as THREE from 'three';

class WarehouseBuilder {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.warehouseGroup = new THREE.Group();
    this.warehouseGroup.name = 'warehouse';
    this.sceneManager.addToScene(this.warehouseGroup);

    this.walls = [];
    this.floor = null;
    this.ceiling = null;
    this.gridHelper = null;
  }

  build(warehouseData) {
    this.clear();

    const length = parseFloat(warehouseData.length_m) || 60;
    const width = parseFloat(warehouseData.width_m) || 30;
    const height = parseFloat(warehouseData.height_m) || 8;

    this.floor = this._createFloor(length, width);
    this.warehouseGroup.add(this.floor);

    this.walls = this._createWalls(length, width, height);
    this.walls.forEach(wall => this.warehouseGroup.add(wall));

    this.ceiling = this._createCeiling(length, width, height);
    this.warehouseGroup.add(this.ceiling);

    this._createFrame(length, width, height);

    this._createGrainSurface(length, width, height);

    return {
      group: this.warehouseGroup,
      dimensions: { length, width, height },
    };
  }

  _createFloor(length, width) {
    const geometry = new THREE.PlaneGeometry(length, width);
    const material = new THREE.MeshStandardMaterial({
      color: 0x3d2817,
      roughness: 0.9,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });

    const floor = new THREE.Mesh(geometry, material);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(length / 2, 0, width / 2);
    floor.receiveShadow = true;
    floor.name = 'floor';

    return floor;
  }

  _createWalls(length, width, height) {
    const walls = [];
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4c4a8,
      roughness: 0.8,
      metalness: 0.1,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });

    const frameMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b7355,
      roughness: 0.7,
      metalness: 0.2,
    });

    const backWall = new THREE.Mesh(
      new THREE.PlaneGeometry(length, height),
      wallMaterial.clone()
    );
    backWall.position.set(length / 2, height / 2, 0);
    backWall.name = 'backWall';
    walls.push(backWall);

    const frontWall = new THREE.Mesh(
      new THREE.PlaneGeometry(length, height),
      wallMaterial.clone()
    );
    frontWall.position.set(length / 2, height / 2, width);
    frontWall.name = 'frontWall';
    walls.push(frontWall);

    const leftWall = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      wallMaterial.clone()
    );
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(0, height / 2, width / 2);
    leftWall.name = 'leftWall';
    walls.push(leftWall);

    const rightWall = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      wallMaterial.clone()
    );
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(length, height / 2, width / 2);
    rightWall.name = 'rightWall';
    walls.push(rightWall);

    const frameThickness = 0.3;
    const frameDepth = 0.3;

    const corners = [
      [0, 0],
      [length, 0],
      [0, width],
      [length, width],
    ];

    corners.forEach(([x, z]) => {
      const column = new THREE.Mesh(
        new THREE.BoxGeometry(frameThickness, height, frameDepth),
        frameMaterial
      );
      column.position.set(x, height / 2, z);
      column.castShadow = true;
      this.warehouseGroup.add(column);
    });

    const beamGeo = new THREE.BoxGeometry(length + frameThickness, frameThickness, frameDepth);
    const topBeam1 = new THREE.Mesh(beamGeo, frameMaterial);
    topBeam1.position.set(length / 2, height, 0);
    topBeam1.castShadow = true;
    this.warehouseGroup.add(topBeam1);

    const topBeam2 = new THREE.Mesh(beamGeo, frameMaterial);
    topBeam2.position.set(length / 2, height, width);
    topBeam2.castShadow = true;
    this.warehouseGroup.add(topBeam2);

    const sideBeamGeo = new THREE.BoxGeometry(frameThickness, frameThickness, width + frameDepth);
    const sideBeam1 = new THREE.Mesh(sideBeamGeo, frameMaterial);
    sideBeam1.position.set(0, height, width / 2);
    sideBeam1.castShadow = true;
    this.warehouseGroup.add(sideBeam1);

    const sideBeam2 = new THREE.Mesh(sideBeamGeo, frameMaterial);
    sideBeam2.position.set(length, height, width / 2);
    sideBeam2.castShadow = true;
    this.warehouseGroup.add(sideBeam2);

    return walls;
  }

  _createCeiling(length, width, height) {
    const geometry = new THREE.PlaneGeometry(length, width);
    const material = new THREE.MeshStandardMaterial({
      color: 0xc4b896,
      roughness: 0.8,
      metalness: 0.1,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5,
    });

    const ceiling = new THREE.Mesh(geometry, material);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(length / 2, height, width / 2);
    ceiling.name = 'ceiling';

    return ceiling;
  }

  _createFrame(length, width, height) {
    const roofMaterial = new THREE.MeshStandardMaterial({
      color: 0x6b8e23,
      roughness: 0.6,
      metalness: 0.3,
      transparent: true,
      opacity: 0.4,
    });

    const roofHeight = 4;
    const roofShape = new THREE.Shape();
    roofShape.moveTo(0, 0);
    roofShape.lineTo(length / 2, roofHeight);
    roofShape.lineTo(length, 0);
    roofShape.lineTo(0, 0);

    const extrudeSettings = {
      depth: width,
      bevelEnabled: false,
    };

    const roofGeo = new THREE.ExtrudeGeometry(roofShape, extrudeSettings);
    const roof = new THREE.Mesh(roofGeo, roofMaterial);
    roof.position.set(0, height, 0);
    roof.name = 'roof';
    this.warehouseGroup.add(roof);
  }

  _createGrainSurface(length, width, height) {
    const grainHeight = height * 0.7;

    const grainGeometry = new THREE.PlaneGeometry(length, width, 30, 15);
    const positions = grainGeometry.attributes.position;

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      
      const distFromCenter = Math.sqrt(
        Math.pow(x / (length / 2), 2) + Math.pow(y / (width / 2), 2)
      );
      const peakHeight = grainHeight * (1 - distFromCenter * 0.3);
      const noise = (Math.sin(x * 0.5) * Math.cos(y * 0.7)) * 0.2;
      
      positions.setZ(i, peakHeight + noise);
    }

    grainGeometry.computeVertexNormals();

    const grainMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4a574,
      roughness: 0.9,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });

    const grain = new THREE.Mesh(grainGeometry, grainMaterial);
    grain.rotation.x = -Math.PI / 2;
    grain.position.set(length / 2, 0, width / 2);
    grain.receiveShadow = true;
    grain.name = 'grainSurface';

    this.warehouseGroup.add(grain);
  }

  showGrid(show) {
    if (show && !this.gridHelper) {
      const length = 60;
      const width = 30;
      const size = Math.max(length, width);
      
      this.gridHelper = new THREE.GridHelper(size, 20, 0x409eff, 0x2a3f5f);
      this.gridHelper.position.set(length / 2, 0.01, width / 2);
      this.warehouseGroup.add(this.gridHelper);
    } else if (!show && this.gridHelper) {
      this.warehouseGroup.remove(this.gridHelper);
      this.gridHelper = null;
    }
  }

  setVisible(visible) {
    this.warehouseGroup.visible = visible;
  }

  setOpacity(opacity) {
    this.walls.forEach(wall => {
      if (wall.material) {
        wall.material.opacity = opacity * 0.3;
      }
    });
    if (this.ceiling && this.ceiling.material) {
      this.ceiling.material.opacity = opacity * 0.5;
    }
  }

  clear() {
    while (this.warehouseGroup.children.length > 0) {
      const child = this.warehouseGroup.children[0];
      this.warehouseGroup.remove(child);
      
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    }
    
    this.walls = [];
    this.floor = null;
    this.ceiling = null;
    this.gridHelper = null;
  }
}

export default WarehouseBuilder;
