import * as THREE from "three";

export class GameRenderer {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  
  private cameraTarget: THREE.Vector3 = new THREE.Vector3();
  
  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    
    // Camera setup
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 30, -50); // initial start position
    
    // WebGL Renderer configuration
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    window.addEventListener("resize", this.handleResize);
  }
  
  private handleResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };
  
  // Third-person camera follow logic
  public updateCamera(playerPos: { x: number; y: number; z: number; rotationY: number }, dt: number) {
    const target = new THREE.Vector3(playerPos.x, playerPos.y + 1.5, playerPos.z);
    
    // Calculate position behind the tank based on its rotation
    const angle = playerPos.rotationY;
    const distance = 25;
    const height = 10;
    
    const behindX = playerPos.x - Math.sin(angle) * distance;
    const behindZ = playerPos.z - Math.cos(angle) * distance;
    const idealPos = new THREE.Vector3(behindX, playerPos.y + height, behindZ);
    
    // Lerp both camera position and looking target for fluid tracking
    const followSpeed = 6.0;
    this.camera.position.lerp(idealPos, dt * followSpeed);
    this.cameraTarget.lerp(target, dt * followSpeed);
    
    this.camera.lookAt(this.cameraTarget);
  }
  
  public render() {
    this.renderer.render(this.scene, this.camera);
  }
  
  public destroy() {
    window.removeEventListener("resize", this.handleResize);
    this.renderer.dispose();
  }
}
