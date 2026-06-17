import * as THREE from "three";
import { OBSTACLES, WORLD_SIZE } from "../../src/actors/config.ts";

export class MapRenderer {
  private obstacles: THREE.Group;
  
  constructor(scene: THREE.Scene) {
    this.obstacles = new THREE.Group();
    scene.add(this.obstacles);
    
    // Set environment styling (Premium desert aesthetics)
    scene.background = new THREE.Color(0xe0b080); // Sand twilight sky
    scene.fog = new THREE.FogExp2(0xe0b080, 0.007); // Sandy haze
    
    this.buildGround(scene);
    this.buildLights(scene);
    this.buildObstacles();
    this.buildEnvironment();
  }
  
  private buildGround(scene: THREE.Scene) {
    // Large ground plane
    const groundGeo = new THREE.PlaneGeometry(WORLD_SIZE * 1.5, WORLD_SIZE * 1.5, 32, 32);
    
    // Displace vertices slightly to create sand dunes
    const pos = groundGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      // Generate noise dunes
      const z = Math.sin(x * 0.04) * Math.cos(y * 0.04) * 2.5 + Math.sin(x * 0.1) * 0.5;
      pos.setZ(i, z);
    }
    groundGeo.computeVertexNormals();
    
    // Create canvas texture for sand texture effect
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#e6c280";
      ctx.fillRect(0, 0, 256, 256);
      
      // Noise grains
      for (let i = 0; i < 5000; i++) {
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        ctx.fillStyle = Math.random() > 0.5 ? "#dfb875" : "#ebd095";
        ctx.fillRect(x, y, 1, 1);
      }
    }
    
    const groundTexture = new THREE.CanvasTexture(canvas);
    groundTexture.wrapS = THREE.RepeatWrapping;
    groundTexture.wrapT = THREE.RepeatWrapping;
    groundTexture.repeat.set(20, 20);
    
    const groundMat = new THREE.MeshStandardMaterial({
      map: groundTexture,
      roughness: 0.9,
      metalness: 0.1,
    });
    
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    
    // Boundary fence/indicator
    const borderGeo = new THREE.RingGeometry(WORLD_SIZE / 2, WORLD_SIZE / 2 + 2, 64);
    const borderMat = new THREE.MeshBasicMaterial({
      color: 0x8b4513,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5,
    });
    const border = new THREE.Mesh(borderGeo, borderMat);
    border.rotation.x = -Math.PI / 2;
    border.position.y = 0.1;
    scene.add(border);
  }
  
  private buildLights(scene: THREE.Scene) {
    const ambient = new THREE.AmbientLight(0xfff0dd, 0.6); // Warm ambient
    scene.add(ambient);
    
    const sun = new THREE.DirectionalLight(0xffe5cc, 1.2); // Golden sun
    sun.position.set(60, 100, 40);
    sun.castShadow = true;
    
    // Quality shadows
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 300;
    
    const d = WORLD_SIZE * 0.7;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.bias = -0.0005;
    
    scene.add(sun);
  }
  
  private buildObstacles() {
    // Materials
    const concreteMat = new THREE.MeshStandardMaterial({
      color: 0x8a7f76,
      roughness: 0.6,
      metalness: 0.3,
    });
    
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0xbc9c7e,
      roughness: 0.8,
      metalness: 0.1,
    });
    
    const barrelMat = new THREE.MeshStandardMaterial({
      color: 0xbb3333, // red explosive barrels
      roughness: 0.3,
      metalness: 0.8,
    });

    const barrelAccentMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.5,
      metalness: 0.9,
    });

    for (const obs of OBSTACLES) {
      if (obs.type === "building") {
        // Render building
        const group = new THREE.Group();
        group.position.set(obs.x, obs.h / 2, obs.z);

        const core = new THREE.Mesh(new THREE.BoxGeometry(obs.w, obs.h, obs.d), concreteMat);
        core.castShadow = true;
        core.receiveShadow = true;
        group.add(core);

        // Add a trim decoration on top
        const trim = new THREE.Mesh(new THREE.BoxGeometry(obs.w + 0.5, 0.4, obs.d + 0.5), wallMat);
        trim.position.y = obs.h / 2;
        trim.castShadow = true;
        group.add(trim);
        
        this.obstacles.add(group);
      } else if (obs.type === "wall") {
        // Render wall
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(obs.w, obs.h, obs.d), wallMat);
        mesh.position.set(obs.x, obs.h / 2, obs.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.obstacles.add(mesh);
      } else if (obs.type === "barrel") {
        // Render barrel stack
        const group = new THREE.Group();
        group.position.set(obs.x, 0, obs.z);

        const barrelGeo = new THREE.CylinderGeometry(0.8, 0.8, 2.2, 12);
        const barrel = new THREE.Mesh(barrelGeo, barrelMat);
        barrel.position.y = 1.1;
        barrel.castShadow = true;
        barrel.receiveShadow = true;
        
        // Add black stripe around barrel
        const stripeGeo = new THREE.CylinderGeometry(0.81, 0.81, 0.3, 12);
        const stripe = new THREE.Mesh(stripeGeo, barrelAccentMat);
        stripe.position.y = 1.1;
        barrel.add(stripe);

        group.add(barrel);
        this.obstacles.add(group);
      }
    }
  }

  private buildEnvironment() {
    // Scattered Palm trees (decorative)
    const palmLocations = [
      { x: -50, z: 50 }, { x: 50, z: 50 },
      { x: -50, z: -50 }, { x: 50, z: -50 },
      { x: -85, z: 10 }, { x: 85, z: -10 }
    ];

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x228b22, roughness: 0.6 });

    palmLocations.forEach((loc) => {
      const tree = new THREE.Group();
      tree.position.set(loc.x, 0, loc.z);

      // Trunk
      const trunkHeight = 6 + Math.random() * 4;
      const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, trunkHeight, 8);
      trunkGeo.translate(0, trunkHeight / 2, 0);
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.castShadow = true;
      tree.add(trunk);

      // Leaves
      const leafCount = 5;
      for (let i = 0; i < leafCount; i++) {
        const leafGeo = new THREE.ConeGeometry(1.8, 3.5, 4);
        leafGeo.rotateX(Math.PI / 4 + Math.random() * 0.1);
        leafGeo.rotateY((i * Math.PI * 2) / leafCount);
        const leaf = new THREE.Mesh(leafGeo, leafMat);
        leaf.position.y = trunkHeight - 0.5;
        leaf.castShadow = true;
        tree.add(leaf);
      }

      this.obstacles.add(tree);
    });

    // Decorative Rocks/Boulders
    const rockLocations = [
      { x: -25, z: 0 }, { x: 25, z: 0 },
      { x: 0, z: -25 }, { x: 0, z: 25 },
      { x: -70, z: -70 }, { x: 70, z: 70 }
    ];

    const rockMat = new THREE.MeshStandardMaterial({ color: 0x7c7c7c, roughness: 0.8 });
    rockLocations.forEach((loc) => {
      const rockGeo = new THREE.IcosahedronGeometry(2 + Math.random() * 2, 1);
      // Distort geometry slightly
      const pos = rockGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        pos.setX(i, pos.getX(i) * (0.8 + Math.random() * 0.4));
        pos.setY(i, pos.getY(i) * (0.8 + Math.random() * 0.4));
        pos.setZ(i, pos.getZ(i) * (0.8 + Math.random() * 0.4));
      }
      rockGeo.computeVertexNormals();

      const rock = new THREE.Mesh(rockGeo, rockMat);
      rock.position.set(loc.x, 0.5, loc.z);
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.obstacles.add(rock);
    });
  }
}
