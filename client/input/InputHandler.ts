import * as THREE from "three";

export interface InputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  fire: boolean;
  ability: boolean;
  switchTeam: boolean;
  showScoreboard: boolean;
  aimAngle: number; // Target turret rotation angle in radians
}

export class InputHandler {
  public state: InputState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    fire: false,
    ability: false,
    switchTeam: false,
    showScoreboard: false,
    aimAngle: 0,
  };
  
  private mouse = new THREE.Vector2();
  private raycaster = new THREE.Raycaster();
  private aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.0); // Turret height plane
  
  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("mousemove", this.handleMouseMove);
    canvas.addEventListener("mousedown", this.handleMouseDown);
    canvas.addEventListener("mouseup", this.handleMouseUp);
    
    // Prevent browser default context menu on game canvas
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  
  private handleKeyDown = (e: KeyboardEvent) => {
    switch (e.code) {
      case "KeyW":
      case "ArrowUp":
        this.state.forward = true;
        break;
      case "KeyS":
      case "ArrowDown":
        this.state.backward = true;
        break;
      case "KeyA":
      case "ArrowLeft":
        this.state.left = true;
        break;
      case "KeyD":
      case "ArrowRight":
        this.state.right = true;
        break;
      case "KeyE":
        this.state.ability = true;
        break;
      case "KeyT":
        this.state.switchTeam = true;
        break;
      case "Tab":
        e.preventDefault();
        this.state.showScoreboard = true;
        break;
    }
  };
  
  private handleKeyUp = (e: KeyboardEvent) => {
    switch (e.code) {
      case "KeyW":
      case "ArrowUp":
        this.state.forward = false;
        break;
      case "KeyS":
      case "ArrowDown":
        this.state.backward = false;
        break;
      case "KeyA":
      case "ArrowLeft":
        this.state.left = false;
        break;
      case "KeyD":
      case "ArrowRight":
        this.state.right = false;
        break;
      case "KeyE":
        this.state.ability = false;
        break;
      case "KeyT":
        this.state.switchTeam = false;
        break;
      case "Tab":
        this.state.showScoreboard = false;
        break;
    }
  };
  
  private handleMouseMove = (e: MouseEvent) => {
    this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  };
  
  private handleMouseDown = (e: MouseEvent) => {
    if (e.button === 0) { // Left click
      this.state.fire = true;
    }
  };
  
  private handleMouseUp = (e: MouseEvent) => {
    if (e.button === 0) {
      this.state.fire = false;
    }
  };
  
  // Projects mouse position onto aiming plane and calculates turret angle relative to tank
  public updateAimAngle(camera: THREE.Camera, tankPosition: THREE.Vector3) {
    this.raycaster.setFromCamera(this.mouse, camera);
    const intersectPoint = new THREE.Vector3();
    
    this.raycaster.ray.intersectPlane(this.aimPlane, intersectPoint);
    
    const dx = intersectPoint.x - tankPosition.x;
    const dz = intersectPoint.z - tankPosition.z;
    
    // Angle in radians (XZ plane projection)
    this.state.aimAngle = Math.atan2(dx, dz);
  }
  
  public destroy(canvas: HTMLCanvasElement) {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("mousemove", this.handleMouseMove);
    canvas.removeEventListener("mousedown", this.handleMouseDown);
    canvas.removeEventListener("mouseup", this.handleMouseUp);
  }
}
