import * as THREE from "three";
import type { ProjectileEntry } from "../../src/actors/tank-match.ts";

export class ProjectileRenderer {
  private projectiles: Map<string, { mesh: THREE.Mesh; light?: THREE.PointLight }> = new Map();
  
  constructor() {}
  
  public update(scene: THREE.Scene, serverProjectiles: Record<string, ProjectileEntry>) {
    // 1. Add new or update existing
    for (const [id, entry] of Object.entries(serverProjectiles)) {
      if (this.projectiles.has(id)) {
        const item = this.projectiles.get(id)!;
        item.mesh.position.set(entry.x, entry.y, entry.z);
        if (item.light) {
          item.light.position.set(entry.x, entry.y, entry.z);
        }
      } else {
        // Create new projectile visual
        const isPiercing = entry.piercing;
        const radius = isPiercing ? 0.45 : 0.22;
        const length = isPiercing ? 1.8 : 0.8;
        
        const geo = new THREE.CylinderGeometry(radius, radius, length, 8);
        geo.rotateX(Math.PI / 2); // Align forward
        
        const mat = new THREE.MeshBasicMaterial({
          color: isPiercing ? 0xcc33ff : 0xffaa00, // Purple for piercing, orange for normal
        });
        
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(entry.x, entry.y, entry.z);
        
        // Align orientation with velocity vector
        const velocity = new THREE.Vector3(entry.vx, 0, entry.vz).normalize();
        const mx = new THREE.Matrix4().lookAt(new THREE.Vector3(), velocity, new THREE.Vector3(0, 1, 0));
        mesh.quaternion.setFromRotationMatrix(mx);
        
        scene.add(mesh);
        
        // Add dynamic light
        let light: THREE.PointLight | undefined;
        if (isPiercing) {
          light = new THREE.PointLight(0xcc33ff, 2.5, 12);
          light.position.set(entry.x, entry.y, entry.z);
          scene.add(light);
        } else {
          light = new THREE.PointLight(0xffaa00, 1.2, 7);
          light.position.set(entry.x, entry.y, entry.z);
          scene.add(light);
        }
        
        this.projectiles.set(id, { mesh, light });
      }
    }
    
    // 2. Remove old
    for (const [id, item] of this.projectiles.entries()) {
      if (!serverProjectiles[id]) {
        scene.remove(item.mesh);
        item.mesh.geometry.dispose();
        if (Array.isArray(item.mesh.material)) {
          item.mesh.material.forEach((m) => m.dispose());
        } else {
          item.mesh.material.dispose();
        }
        
        if (item.light) {
          scene.remove(item.light);
        }
        this.projectiles.delete(id);
      }
    }
  }
  
  public clear(scene: THREE.Scene) {
    for (const [id, item] of this.projectiles.entries()) {
      scene.remove(item.mesh);
      item.mesh.geometry.dispose();
      if (Array.isArray(item.mesh.material)) {
        item.mesh.material.forEach((m) => m.dispose());
      } else {
        item.mesh.material.dispose();
      }
      if (item.light) {
        scene.remove(item.light);
      }
    }
    this.projectiles.clear();
  }
}
