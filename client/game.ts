import * as THREE from "three";
import { GameRenderer } from "./renderer/GameRenderer.ts";
import { MapRenderer } from "./renderer/MapRenderer.ts";
import { TankModel } from "./renderer/TankModel.ts";
import { ProjectileRenderer } from "./renderer/ProjectileRenderer.ts";
import { Effects } from "./renderer/Effects.ts";
import { InputHandler } from "./input/InputHandler.ts";
import { HUD } from "./ui/HUD.ts";
import { NetworkClient } from "./network/NetworkClient.ts";
import { getTeamColorHex } from "./renderer/TankFactory.ts";
import { resolveCollisions, TANK_RADIUS } from "../src/shared/sim.ts";
import { TANK_STATS } from "../src/actors/config.ts";

window.addEventListener("DOMContentLoaded", () => {
  // 1. Retrieve session parameters
  const playerId = sessionStorage.getItem("playerId") as string;
  const matchId = sessionStorage.getItem("matchId") as string;
  const teamId = sessionStorage.getItem("teamId") as "red" | "blue" | "ffa";
  const tankType = sessionStorage.getItem("tankType") as "scout" | "titan" | "destroyer" | "medic";
  const username = sessionStorage.getItem("username") || "Player";
  
  if (!playerId || !matchId || !tankType) {
    console.error("Missing session info, returning to lobby");
    window.location.href = "/index.html";
    return;
  }
  
  // 2. Initialize Three.js systems
  const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
  const gameRenderer = new GameRenderer(canvas);
  const mapRenderer = new MapRenderer(gameRenderer.scene);
  const projectileRenderer = new ProjectileRenderer();
  const effects = new Effects();
  const inputHandler = new InputHandler(canvas);
  const hud = new HUD();
  
  hud.setupPlayerDetails(username, tankType);
  
  // 3. Keep track of spawned tank models
  const tankModels: Map<string, TankModel> = new Map();
  
  // 4. Connect to match actor
  const netClient = new NetworkClient();
  const matchConn = netClient.connectToMatch(matchId, playerId);
  
  let currentSnapshot: any = null;
  let localPlayerPhysics = {
    x: 0,
    y: 0,
    z: 0,
    rotationY: 0,
    turretRotationY: 0
  };
  
  let localSpawned = false;
  let isDead = false;
  let lastMoveSentAt = 0;
  let lastTrailSpawnAt = 0;
  
  // Initialize local player start position depending on team
  if (teamId === "red") {
    localPlayerPhysics.x = -80;
    localPlayerPhysics.z = -80;
  } else if (teamId === "blue") {
    localPlayerPhysics.x = 80;
    localPlayerPhysics.z = 80;
  } else {
    localPlayerPhysics.x = (Math.random() - 0.5) * 80;
    localPlayerPhysics.z = (Math.random() - 0.5) * 80;
  }
  
  // 5. Handle Network Events
  matchConn.on("snapshot", (state: any) => {
    currentSnapshot = state;
    
    // Update local physics with server authority if not initialized or if respawned
    const localServerData = state.players[playerId];
    if (localServerData) {
      isDead = !localServerData.alive;
      
      if (!localSpawned || (!localServerData.alive && !isDead)) {
        // Initial setup or respawn: snap local physics
        localPlayerPhysics.x = localServerData.x;
        localPlayerPhysics.z = localServerData.z;
        localPlayerPhysics.rotationY = localServerData.rotationY;
        localSpawned = true;
      }
      
      hud.updateHP(localServerData.hp, localServerData.maxHp);
      hud.updateAbilityCooldown(Date.now(), localServerData.abilityCooldown);
    }
    
    hud.updateScores(state);
  });
  
  matchConn.on("shoot", (data: any) => {
    // Create visual muzzle flash
    effects.createMuzzleFlash(gameRenderer.scene, data.x, 2, data.z, data.vx, data.vz);
  });
  
  matchConn.on("playerHit", (data: any) => {
    // Trigger screen vignettes
    if (data.playerId === playerId) {
      if (data.damage > 0) {
        hud.flashHit();
      } else {
        hud.flashHeal();
      }
    }
  });
  
  matchConn.on("playerKilled", (data: any) => {
    console.log(`${data.attackerUsername} killed ${data.victimUsername}`);
    
    // Create explosion at victim position
    const victimModel = tankModels.get(data.victimId);
    if (victimModel) {
      effects.createExplosion(gameRenderer.scene, victimModel.mesh.position.x, 2.0, victimModel.mesh.position.z, true);
    }
    
    const isTeam = currentSnapshot?.mode === "team";
    hud.addKill(data.attackerUsername, data.victimUsername, playerId, data.attackerId, data.victimId, isTeam);
  });
  
  matchConn.on("abilityUsed", (data: any) => {
    if (data.abilityType === "medic") {
      const actor = currentSnapshot?.players[data.playerId];
      if (actor) {
        effects.createHealEffect(gameRenderer.scene, actor.x, actor.z);
      }
    }
  });
  
  matchConn.on("gameOver", (data: any) => {
    console.log("Game over!", data);
    hud.showGameOver(data.winnerTeam, data.winnerUsername);
  });
  
  // 6. Game Animation Loop
  const clock = new THREE.Clock();
  
  function animate() {
    requestAnimationFrame(animate);
    
    const dt = clock.getDelta();
    const now = Date.now();
    
    if (currentSnapshot) {
      // A. Local Player Movement & Actions
      const localServerData = currentSnapshot.players[playerId];
      if (localServerData && localServerData.alive) {
        const stats = TANK_STATS[localServerData.tankType];
        
        // Speed multiplier if Scout is dashing
        const isDashing = localServerData.tankType === "scout" && now < localServerData.abilityActiveUntil;
        const maxSpeed = stats.speed * (isDashing ? 1.8 : 1.0);
        
        // Turn tank base
        const turnSpeed = 2.5; // rads/sec
        if (inputHandler.state.left) {
          localPlayerPhysics.rotationY += turnSpeed * dt;
        }
        if (inputHandler.state.right) {
          localPlayerPhysics.rotationY -= turnSpeed * dt;
        }
        
        // Drive tank forward/backward
        let driveDir = 0;
        if (inputHandler.state.forward) driveDir = 1;
        if (inputHandler.state.backward) driveDir = -1;
        
        if (driveDir !== 0) {
          localPlayerPhysics.x += Math.sin(localPlayerPhysics.rotationY) * driveDir * maxSpeed * dt;
          localPlayerPhysics.z += Math.cos(localPlayerPhysics.rotationY) * driveDir * maxSpeed * dt;
          
          // Spawn dust tracks for Scout when sprinting
          if (isDashing && now - lastTrailSpawnAt > 100) {
            effects.createDashTrail(gameRenderer.scene, localPlayerPhysics.x, localPlayerPhysics.z);
            lastTrailSpawnAt = now;
          }
        }
        
        // Collide against walls
        const res = resolveCollisions(localPlayerPhysics.x, localPlayerPhysics.z, TANK_RADIUS);
        localPlayerPhysics.x = res.x;
        localPlayerPhysics.z = res.z;
        
        // Update aim direction
        inputHandler.updateAimAngle(gameRenderer.camera, new THREE.Vector3(localPlayerPhysics.x, 0, localPlayerPhysics.z));
        localPlayerPhysics.turretRotationY = inputHandler.state.aimAngle;
        
        // Send rate-limited movement to server (20Hz)
        if (now - lastMoveSentAt > 50) {
          netClient.sendMove(
            localPlayerPhysics.x,
            0,
            localPlayerPhysics.z,
            localPlayerPhysics.rotationY,
            localPlayerPhysics.turretRotationY
          );
          lastMoveSentAt = now;
        }
        
        // Trigger shooting
        if (inputHandler.state.fire && now - localServerData.lastFiredAt >= stats.fireRate * 1000) {
          // Calculate fire velocity vector
          const fireSpeed = 60; // projectile speed
          const vx = Math.sin(localPlayerPhysics.turretRotationY) * fireSpeed;
          const vz = Math.cos(localPlayerPhysics.turretRotationY) * fireSpeed;
          
          // Project shot position slightly ahead of barrel
          const spawnDist = 4.5;
          const px = localPlayerPhysics.x + Math.sin(localPlayerPhysics.turretRotationY) * spawnDist;
          const pz = localPlayerPhysics.z + Math.cos(localPlayerPhysics.turretRotationY) * spawnDist;
          
          netClient.sendFire(px, pz, vx, vz);
          
          // Local cooldown prediction
          localServerData.lastFiredAt = now;
        }
        
        // Trigger special ability
        if (inputHandler.state.ability && now >= localServerData.abilityCooldown) {
          netClient.sendUseAbility();
          localServerData.abilityCooldown = now + stats.abilityCooldown; // local prediction
          inputHandler.state.ability = false; // consume
        }
        
        // Trigger team switch
        if (inputHandler.state.switchTeam && now - localServerData.lastTeamSwitch >= 15000) {
          netClient.sendSwitchTeam();
          localServerData.lastTeamSwitch = now;
          inputHandler.state.switchTeam = false;
        }
      }
      
      // B. Spawn, Update, or Despawn player meshes based on server snapshot
      for (const [id, player] of Object.entries(currentSnapshot.players) as [string, any][]) {
        if (!player.alive) {
          // Remove mesh if dead
          if (tankModels.has(id)) {
            tankModels.get(id)!.destroy(gameRenderer.scene);
            tankModels.delete(id);
          }
          continue;
        }
        
        let model = tankModels.get(id);
        if (!model) {
          // Spawn new model
          const color = getTeamColorHex(player.teamId);
          model = new TankModel(gameRenderer.scene, player.tankType, color);
          tankModels.set(id, model);
        }
        
        // Update positions
        if (id === playerId) {
          // For local player: render local physics position (instant response)
          model.update(
            localPlayerPhysics.x,
            0,
            localPlayerPhysics.z,
            localPlayerPhysics.rotationY,
            localPlayerPhysics.turretRotationY,
            inputHandler.state.forward || inputHandler.state.backward,
            dt
          );
        } else {
          // For remote players: smooth-lerp towards reported coordinates
          const curPos = model.mesh.position;
          const targetX = THREE.MathUtils.lerp(curPos.x, player.x, dt * 10);
          const targetZ = THREE.MathUtils.lerp(curPos.z, player.z, dt * 10);
          
          // Animate treads if moved
          const isMoving = Math.sqrt((player.x - curPos.x) ** 2 + (player.z - curPos.z) ** 2) > 0.05;
          
          model.update(
            targetX,
            0,
            targetZ,
            player.rotationY,
            player.turretRotationY,
            isMoving,
            dt
          );
        }
        
        // Update visual effects states (Shields, Speeds)
        const isShieldActive = player.tankType === "titan" && now < player.abilityActiveUntil;
        const isDashActive = player.tankType === "scout" && now < player.abilityActiveUntil;
        
        model.setShield(isShieldActive);
        model.setDash(isDashActive);
      }
      
      // Despawn disconnected/left players
      for (const id of tankModels.keys()) {
        if (!currentSnapshot.players[id]) {
          tankModels.get(id)!.destroy(gameRenderer.scene);
          tankModels.delete(id);
        }
      }
      
      // C. Render Projectiles
      projectileRenderer.update(gameRenderer.scene, currentSnapshot.projectiles);
      
      // D. Update Scoreboard Overlay
      hud.showScoreboard(inputHandler.state.showScoreboard, currentSnapshot.players, playerId, currentSnapshot.mode);
      
      // E. Update Minimap
      hud.updateMinimap(playerId, currentSnapshot.players, 200);
    }
    
    // F. Update visual particles
    effects.update(gameRenderer.scene, dt);
    
    // G. Camera Follow local player position
    if (localSpawned) {
      gameRenderer.updateCamera(localPlayerPhysics, dt);
    }
    
    // H. Draw Frame
    gameRenderer.render();
  }
  
  // Start loop
  animate();
});
