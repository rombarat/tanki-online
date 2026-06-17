import * as THREE from "three";

export class Effects {
  private activeEffects: { mesh: THREE.Object3D; update: (dt: number) => boolean }[] = [];
  
  constructor() {}
  
  public update(scene: THREE.Scene, dt: number) {
    const nextEffects: typeof this.activeEffects = [];
    
    for (const effect of this.activeEffects) {
      const keep = effect.update(dt);
      if (!keep) {
        scene.remove(effect.mesh);
        effect.mesh.traverse((node) => {
          if (node instanceof THREE.Mesh) {
            node.geometry.dispose();
            if (Array.isArray(node.material)) {
              node.material.forEach((m) => m.dispose());
            } else {
              node.material.dispose();
            }
          }
        });
      } else {
        nextEffects.push(effect);
      }
    }
    
    this.activeEffects = nextEffects;
  }
  
  public createExplosion(scene: THREE.Scene, x: number, y: number, z: number, big: boolean = false) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    
    const count = big ? 30 : 15;
    const particles: { mesh: THREE.Mesh; vx: number; vy: number; vz: number; decay: number }[] = [];
    
    const colors = [0xffaa00, 0xff3300, 0xffdd44, 0x555555]; // Fire and smoke
    
    for (let i = 0; i < count; i++) {
      const size = 0.2 + Math.random() * (big ? 0.8 : 0.4);
      const geo = new THREE.BoxGeometry(size, size, size);
      const mat = new THREE.MeshBasicMaterial({
        color: colors[Math.floor(Math.random() * colors.length)],
        transparent: true,
        opacity: 1.0,
      });
      const mesh = new THREE.Mesh(geo, mat);
      
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos((Math.random() * 2) - 1);
      const speed = 4 + Math.random() * (big ? 14 : 7);
      
      const vx = Math.sin(phi) * Math.cos(theta) * speed;
      const vy = Math.cos(phi) * speed + 3; // Explode upward
      const vz = Math.sin(phi) * Math.sin(theta) * speed;
      
      group.add(mesh);
      particles.push({ mesh, vx, vy, vz, decay: 1.2 + Math.random() * 1.2 });
    }
    
    scene.add(group);
    
    let age = 0;
    this.activeEffects.push({
      mesh: group,
      update: (dt) => {
        age += dt;
        let anyAlive = false;
        
        for (const p of particles) {
          p.mesh.position.x += p.vx * dt;
          p.mesh.position.y += p.vy * dt;
          p.mesh.position.z += p.vz * dt;
          
          p.vy -= 9.8 * dt; // gravity
          
          const remaining = 1 - (age / p.decay);
          if (remaining > 0) {
            p.mesh.scale.set(remaining, remaining, remaining);
            if (p.mesh.material instanceof THREE.MeshBasicMaterial) {
              p.mesh.material.opacity = remaining;
            }
            anyAlive = true;
          } else {
            p.mesh.visible = false;
          }
        }
        
        return anyAlive && age < 2.5;
      }
    });
  }

  public createHealEffect(scene: THREE.Scene, x: number, z: number) {
    const group = new THREE.Group();
    group.position.set(x, 0.2, z);

    // Expand green ring
    const ringGeo = new THREE.RingGeometry(0.1, 0.4, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    group.add(ring);

    // Floating green crosses
    const crossCount = 10;
    const crosses: { mesh: THREE.Group; vy: number; vx: number; vz: number; life: number; age: number }[] = [];
    const crossMat = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.9,
    });

    for (let i = 0; i < crossCount; i++) {
      const cross = new THREE.Group();
      
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.2), crossMat);
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), crossMat);
      cross.add(h, v);
      
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * 8;
      cross.position.set(Math.cos(angle) * radius, 0.5, Math.sin(angle) * radius);
      
      group.add(cross);
      
      crosses.push({
        mesh: cross,
        vy: 2.0 + Math.random() * 2.0,
        vx: (Math.random() - 0.5) * 0.5,
        vz: (Math.random() - 0.5) * 0.5,
        life: 1.0 + Math.random() * 0.8,
        age: 0,
      });
    }

    scene.add(group);

    let ringRadius = 0.5;
    this.activeEffects.push({
      mesh: group,
      update: (dt) => {
        ringRadius += dt * 25.0;
        ring.scale.set(ringRadius, ringRadius, 1);
        ringMat.opacity = Math.max(0, 0.8 - (ringRadius / 20.0));
        
        let anyAlive = false;
        for (const c of crosses) {
          c.age += dt;
          if (c.age < c.life) {
            c.mesh.position.y += c.vy * dt;
            c.mesh.position.x += c.vx * dt;
            c.mesh.position.z += c.vz * dt;
            c.mesh.rotation.y += dt * 2;
            
            const remaining = 1 - (c.age / c.life);
            c.mesh.scale.set(remaining, remaining, remaining);
            anyAlive = true;
          } else {
            c.mesh.visible = false;
          }
        }
        
        return (anyAlive || ringMat.opacity > 0);
      }
    });
  }

  public createMuzzleFlash(scene: THREE.Scene, x: number, y: number, z: number, vx: number, vz: number) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const dir = new THREE.Vector3(vx, 0, vz).normalize();

    const light = new THREE.PointLight(0xffcc44, 4.0, 10);
    group.add(light);

    const sparkCount = 8;
    const sparks: { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number; age: number }[] = [];
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });

    for (let i = 0; i < sparkCount; i++) {
      const spark = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.15), sparkMat);
      group.add(spark);

      const sDir = dir.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.4
      )).normalize();

      const speed = 10 + Math.random() * 8;
      sparks.push({
        mesh: spark,
        velocity: sDir.multiplyScalar(speed),
        life: 0.12 + Math.random() * 0.12,
        age: 0,
      });
    }

    scene.add(group);

    let age = 0;
    this.activeEffects.push({
      mesh: group,
      update: (dt) => {
        age += dt;
        
        light.intensity = Math.max(0, 4.0 - age * 30.0);
        
        let anyAlive = false;
        for (const s of sparks) {
          s.age += dt;
          if (s.age < s.life) {
            s.mesh.position.addScaledVector(s.velocity, dt);
            anyAlive = true;
          } else {
            s.mesh.visible = false;
          }
        }

        return age < 0.25 && (anyAlive || light.intensity > 0);
      }
    });
  }

  public createDashTrail(scene: THREE.Scene, x: number, z: number) {
    const geo = new THREE.IcosahedronGeometry(0.4 + Math.random() * 0.4, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xc2a278,
      transparent: true,
      opacity: 0.5,
      roughness: 1.0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x + (Math.random() - 0.5) * 1.5, 0.15, z + (Math.random() - 0.5) * 1.5);
    
    scene.add(mesh);
    
    let age = 0;
    const life = 0.4 + Math.random() * 0.4;
    
    this.activeEffects.push({
      mesh,
      update: (dt) => {
        age += dt;
        mesh.position.y += dt * 1.2;
        const scale = 1.0 + age * 1.8;
        mesh.scale.set(scale, scale, scale);
        
        const remaining = 1 - (age / life);
        if (remaining > 0) {
          mat.opacity = remaining * 0.5;
          return true;
        }
        return false;
      }
    });
  }
}
