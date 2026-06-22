import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

class SceneManager {
  constructor(container) {
    this.container = container;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.clock = null;
    this.animationCallbacks = [];
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.interactiveObjects = [];
    this.hoveredObject = null;

    this._init();
    this._setupLights();
    this._setupControls();
    this._setupEventListeners();
    this._animate();
  }

  _init() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0e1a);
    this.scene.fog = new THREE.Fog(0x0a0e1a, 100, 300);

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera = new THREE.PerspectiveCamera(
      60,
      width / height,
      0.1,
      1000
    );
    this.camera.position.set(80, 50, 80);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.container.appendChild(this.renderer.domElement);

    this.clock = new THREE.Clock();
  }

  _setupLights() {
    const ambientLight = new THREE.AmbientLight(0x404060, 0.5);
    this.scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
    mainLight.position.set(50, 80, 50);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.camera.near = 0.5;
    mainLight.shadow.camera.far = 200;
    mainLight.shadow.camera.left = -80;
    mainLight.shadow.camera.right = 80;
    mainLight.shadow.camera.top = 80;
    mainLight.shadow.camera.bottom = -80;
    this.scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0x4080ff, 0.3);
    fillLight.position.set(-30, 40, -30);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x00ff88, 0.2);
    rimLight.position.set(0, 20, -50);
    this.scene.add(rimLight);
  }

  _setupControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 200;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.1;
    this.controls.target.set(30, 0, 15);
  }

  _setupEventListeners() {
    window.addEventListener('resize', () => this._onResize());
    this.renderer.domElement.addEventListener('mousemove', (e) => this._onMouseMove(e));
    this.renderer.domElement.addEventListener('click', (e) => this._onClick(e));
  }

  _onResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
  }

  _onMouseMove(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  _onClick(event) {
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const intersects = this.raycaster.intersectObjects(
      this.interactiveObjects,
      true
    );

    if (intersects.length > 0) {
      const obj = intersects[0].object;
      if (obj.userData && obj.userData.onClick) {
        obj.userData.onClick(obj.userData);
      }
    }
  }

  checkHover() {
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const intersects = this.raycaster.intersectObjects(
      this.interactiveObjects,
      true
    );

    if (intersects.length > 0) {
      const obj = intersects[0].object;

      if (this.hoveredObject !== obj) {
        if (this.hoveredObject && this.hoveredObject.userData.onHoverOut) {
          this.hoveredObject.userData.onHoverOut(this.hoveredObject.userData);
        }

        this.hoveredObject = obj;

        if (obj.userData && obj.userData.onHover) {
          obj.userData.onHover(obj.userData, intersects[0]);
        }
      }

      return obj;
    } else if (this.hoveredObject) {
      if (this.hoveredObject.userData.onHoverOut) {
        this.hoveredObject.userData.onHoverOut(this.hoveredObject.userData);
      }
      this.hoveredObject = null;
    }

    return null;
  }

  addInteractiveObject(object) {
    this.interactiveObjects.push(object);
  }

  removeInteractiveObject(object) {
    const index = this.interactiveObjects.indexOf(object);
    if (index > -1) {
      this.interactiveObjects.splice(index, 1);
    }
  }

  addToScene(object) {
    this.scene.add(object);
  }

  removeFromScene(object) {
    this.scene.remove(object);
  }

  addAnimationCallback(callback) {
    this.animationCallbacks.push(callback);
  }

  removeAnimationCallback(callback) {
    const index = this.animationCallbacks.indexOf(callback);
    if (index > -1) {
      this.animationCallbacks.splice(index, 1);
    }
  }

  _animate() {
    requestAnimationFrame(() => this._animate());

    const delta = this.clock.getDelta();
    const elapsed = this.clock.getElapsedTime();

    this.controls.update();

    for (const callback of this.animationCallbacks) {
      callback(delta, elapsed);
    }

    this.checkHover();

    this.renderer.render(this.scene, this.camera);
  }

  setCameraTarget(x, y, z) {
    this.controls.target.set(x, y, z);
  }

  setCameraPosition(x, y, z) {
    this.camera.position.set(x, y, z);
  }

  fitCameraToObject(object, offset = 1.5) {
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);
    const cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * offset;

    this.controls.target.copy(center);
    this.camera.position.set(center.x + cameraZ, center.y + cameraZ * 0.6, center.z + cameraZ);
    this.controls.update();
  }

  getWidth() {
    return this.container.clientWidth;
  }

  getHeight() {
    return this.container.clientHeight;
  }

  dispose() {
    this.controls.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}

export default SceneManager;
