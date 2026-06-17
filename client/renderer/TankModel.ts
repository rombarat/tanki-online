import * as THREE from "three";
import { TANK_RADIUS } from "../../src/shared/sim.ts";

export class TankModel {
  public mesh: THREE.Group;
  private chassis: THREE.Mesh | THREE.Group;
  private turret: THREE.Group;
  private barrel: THREE.Mesh | THREE.Group;
  private leftTread: THREE.Mesh;
  private rightTread: THREE.Mesh;
  
  private shieldMesh: THREE.Mesh | null = null;
  private isShieldActive: boolean = false;
  private treadOffset: number = 0;
  
  constructor(scene: THREE.Scene, type: string, colorHex: number) {
    this.mesh = new THREE.Group();
    
    // Core material for body
    const bodyMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      metalness: 0.7,
      roughness: 0.2,
    });
    
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      metalness: 0.8,
      roughness: 0.4,
    });

    const highlightMat = new THREE.MeshStandardMaterial({
      color: 0xffdd44, // gold trim
      metalness: 0.9,
      roughness: 0.1,
    });

    // Create different shapes based on tank type
    if (type === "scout") {
      // Scout: sleek, small
      const chassisGeo = new THREE.BoxGeometry(3.5, 1.0, 4.5);
      const chassisMesh = new THREE.Mesh(chassisGeo, bodyMat);
      chassisMesh.position.y = 0.5;
      this.mesh.add(chassisMesh);
      this.chassis = chassisMesh;

      // Treads
      const treadGeo = new THREE.BoxGeometry(0.8, 0.9, 4.8);
      this.leftTread = new THREE.Mesh(treadGeo, darkMat);
      this.leftTread.position.set(-2.0, 0.45, 0);
      this.rightTread = new THREE.Mesh(treadGeo, darkMat);
      this.rightTread.position.set(2.0, 0.45, 0);
      this.mesh.add(this.leftTread, this.rightTread);

      // Turret
      this.turret = new THREE.Group();
      this.turret.position.set(0, 1.0, -0.2);
      const turretGeo = new THREE.CylinderGeometry(1.0, 1.2, 0.8, 8);
      const turretMesh = new THREE.Mesh(turretGeo, bodyMat);
      turretMesh.position.y = 0.4;
      this.turret.add(turretMesh);

      // Barrel
      const barrelGeo = new THREE.CylinderGeometry(0.18, 0.15, 2.5, 8);
      barrelGeo.rotateX(Math.PI / 2);
      barrelGeo.translate(0, 0, 1.25);
      this.barrel = new THREE.Mesh(barrelGeo, darkMat);
      this.barrel.position.set(0, 0.4, 0.8);
      this.turret.add(this.barrel);

      this.mesh.add(this.turret);
    } else if (type === "titan") {
      // Titan: heavy, wide
      this.chassis = new THREE.Group();
      const lowerChassis = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.8, 6.0), bodyMat);
      lowerChassis.position.y = 0.4;
      const upperChassis = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.6, 4.8), bodyMat);
      upperChassis.position.y = 1.0;
      this.chassis.add(lowerChassis, upperChassis);
      this.mesh.add(this.chassis);

      // Treads (very wide)
      const treadGeo = new THREE.BoxGeometry(1.4, 1.1, 6.2);
      this.leftTread = new THREE.Mesh(treadGeo, darkMat);
      this.leftTread.position.set(-2.8, 0.55, 0);
      this.rightTread = new THREE.Mesh(treadGeo, darkMat);
      this.rightTread.position.set(2.8, 0.55, 0);
      this.mesh.add(this.leftTread, this.rightTread);

      // Turret (fat, square)
      this.turret = new THREE.Group();
      this.turret.position.set(0, 1.2, -0.4);
      const turretMesh = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.0, 2.6), bodyMat);
      turretMesh.position.y = 0.5;
      this.turret.add(turretMesh);

      // Barrel (double barrel)
      const barrelGroup = new THREE.Group();
      const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 2.2, 8), darkMat);
      b1.rotateX(Math.PI / 2);
      b1.position.set(-0.4, 0.5, 1.1);
      const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 2.2, 8), darkMat);
      b2.rotateX(Math.PI / 2);
      b2.position.set(0.4, 0.5, 1.1);
      barrelGroup.add(b1, b2);
      this.barrel = barrelGroup;
      this.turret.add(barrelGroup);
      this.mesh.add(this.turret);

      // Build shield mesh (inactive initially)
      const shieldGeo = new THREE.SphereGeometry(TANK_RADIUS * 1.5, 16, 16);
      const shieldMat = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.35,
        wireframe: true,
      });
      this.shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
      this.shieldMesh.position.y = 1.0;
      this.shieldMesh.visible = false;
      this.mesh.add(this.shieldMesh);
    } else if (type === "destroyer") {
      // Destroyer: long, armored
      const chassisGeo = new THREE.BoxGeometry(4.2, 1.1, 5.5);
      const chassisMesh = new THREE.Mesh(chassisGeo, bodyMat);
      chassisMesh.position.y = 0.55;
      this.mesh.add(chassisMesh);
      this.chassis = chassisMesh;

      // Add extra armor plates on side
      const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 4.0), highlightMat);
      p1.position.set(-2.2, 0.7, 0);
      const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 4.0), highlightMat);
      p2.position.set(2.2, 0.7, 0);
      this.mesh.add(p1, p2);

      // Treads
      const treadGeo = new THREE.BoxGeometry(1.0, 1.0, 5.8);
      this.leftTread = new THREE.Mesh(treadGeo, darkMat);
      this.leftTread.position.set(-2.2, 0.5, 0);
      this.rightTread = new THREE.Mesh(treadGeo, darkMat);
      this.rightTread.position.set(2.2, 0.5, 0);
      this.mesh.add(this.leftTread, this.rightTread);

      // Turret (low profile, aggressive)
      this.turret = new THREE.Group();
      this.turret.position.set(0, 1.1, -0.6);
      const turretMesh = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 2.2), bodyMat);
      turretMesh.position.y = 0.4;
      this.turret.add(turretMesh);

      // Huge barrel
      const barrelGeo = new THREE.CylinderGeometry(0.35, 0.3, 3.8, 8);
      barrelGeo.rotateX(Math.PI / 2);
      barrelGeo.translate(0, 0, 1.9);
      this.barrel = new THREE.Mesh(barrelGeo, darkMat);
      this.barrel.position.set(0, 0.4, 1.1);
      
      // Muzzle brake
      const muzzleGeo = new THREE.CylinderGeometry(0.5, 0.4, 0.6, 8);
      muzzleGeo.rotateX(Math.PI / 2);
      muzzleGeo.translate(0, 0, 3.8);
      const muzzle = new THREE.Mesh(muzzleGeo, highlightMat);
      this.barrel.add(muzzle);

      this.turret.add(this.barrel);
      this.mesh.add(this.turret);
    } else {
      // Medic: boxy, radar
      const chassisGeo = new THREE.BoxGeometry(4.0, 1.2, 5.0);
      const chassisMesh = new THREE.Mesh(chassisGeo, bodyMat);
      chassisMesh.position.y = 0.6;
      this.mesh.add(chassisMesh);
      this.chassis = chassisMesh;

      // Cross symbol detail (Red Cross style, green/white for healing)
      const crossMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
      const crossH = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.4), crossMat);
      crossH.position.set(0, 1.21, 1.5);
      const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 1.5), crossMat);
      crossV.position.set(0, 1.21, 1.5);
      this.mesh.add(crossH, crossV);

      // Treads
      const treadGeo = new THREE.BoxGeometry(0.9, 1.0, 5.2);
      this.leftTread = new THREE.Mesh(treadGeo, darkMat);
      this.leftTread.position.set(-2.1, 0.5, 0);
      this.rightTread = new THREE.Mesh(treadGeo, darkMat);
      this.rightTread.position.set(2.1, 0.5, 0);
      this.mesh.add(this.leftTread, this.rightTread);

      // Turret
      this.turret = new THREE.Group();
      this.turret.position.set(0, 1.2, 0.0);
      const turretMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.8, 12), bodyMat);
      turretMesh.position.y = 0.4;
      this.turret.add(turretMesh);

      // Emitter barrel
      const barrelGeo = new THREE.CylinderGeometry(0.2, 0.25, 2.0, 8);
      barrelGeo.rotateX(Math.PI / 2);
      barrelGeo.translate(0, 0, 1.0);
      this.barrel = new THREE.Mesh(barrelGeo, darkMat);
      this.barrel.position.set(0, 0.4, 1.0);
      
      // Radar/Dish details
      const dishGeo = new THREE.ConeGeometry(0.6, 0.4, 8);
      dishGeo.rotateX(-Math.PI / 3);
      const dish = new THREE.Mesh(dishGeo, highlightMat);
      dish.position.set(-0.8, 1.0, -0.5);
      this.turret.add(dish);

      this.turret.add(this.barrel);
      this.mesh.add(this.turret);
    }
    
    // Add shadow support to all children
    this.mesh.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
    
    scene.add(this.mesh);
  }
  
  public update(x: number, y: number, z: number, rotationY: number, turretRotationY: number, isMoving: boolean, dt: number) {
    // Set position
    this.mesh.position.set(x, y, z);
    
    // Base rotation
    this.mesh.rotation.y = rotationY;
    
    // Turret rotation (relative to parent mesh)
    this.turret.rotation.y = turretRotationY - rotationY;
    
    // Animate treads if moving
    if (isMoving) {
      this.treadOffset += dt * 5;
      const scaleLeft = 1 + Math.sin(this.treadOffset * 4) * 0.03;
      const scaleRight = 1 + Math.cos(this.treadOffset * 4) * 0.03;
      this.leftTread.scale.set(1, 1, scaleLeft);
      this.rightTread.scale.set(1, 1, scaleRight);
    } else {
      this.leftTread.scale.set(1, 1, 1);
      this.rightTread.scale.set(1, 1, 1);
    }

    // Shield animation
    if (this.shieldMesh && this.isShieldActive) {
      this.shieldMesh.rotation.y += dt * 1.5;
      this.shieldMesh.rotation.x += dt * 0.8;
      const pulse = 1.3 + Math.sin(Date.now() * 0.01) * 0.05;
      this.shieldMesh.scale.set(pulse, pulse, pulse);
    }
  }

  public setShield(active: boolean) {
    this.isShieldActive = active;
    if (this.shieldMesh) {
      this.shieldMesh.visible = active;
    }
  }

  public setDash(active: boolean) {
    if (active) {
      this.chassis.rotation.x = -0.05; // tilt back
    } else {
      this.chassis.rotation.x = 0;
    }
  }

  public destroy(scene: THREE.Scene) {
    scene.remove(this.mesh);
    this.mesh.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        node.geometry.dispose();
        if (Array.isArray(node.material)) {
          node.material.forEach((m) => m.dispose());
        } else {
          node.material.dispose();
        }
      }
    });
  }
}
