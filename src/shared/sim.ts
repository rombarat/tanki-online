import { OBSTACLES, WORLD_SIZE, TANK_STATS, Obstacle } from "../actors/config.ts";

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export const TANK_RADIUS = 2.5;

// Check collision between a circle (tank) and an AABB (obstacle)
// Returns the correction vector to push the circle out of the AABB if colliding
export function checkCircleAABBCollision(
  cx: number,
  cz: number,
  r: number,
  ox: number,
  oz: number,
  ow: number,
  od: number
): { colliding: boolean; pushX: number; pushZ: number } {
  // AABB bounds
  const minX = ox - ow / 2;
  const maxX = ox + ow / 2;
  const minZ = oz - od / 2;
  const maxZ = oz + od / 2;

  // Closest point on AABB to circle center
  const closestX = Math.max(minX, Math.min(cx, maxX));
  const closestZ = Math.max(minZ, Math.min(cz, maxZ));

  // Distance from closest point to circle center
  const distX = cx - closestX;
  const distZ = cz - closestZ;
  const distSq = distX * distX + distZ * distZ;

  if (distSq < r * r) {
    const dist = Math.sqrt(distSq);
    if (dist === 0) {
      // Circle center is exactly inside/on the edge of AABB
      return { colliding: true, pushX: r, pushZ: 0 };
    }
    const overlap = r - dist;
    return {
      colliding: true,
      pushX: (distX / dist) * overlap,
      pushZ: (distZ / dist) * overlap,
    };
  }

  return { colliding: false, pushX: 0, pushZ: 0 };
}

// Collide against all map obstacles and world boundary
export function resolveCollisions(
  x: number,
  z: number,
  radius: number = TANK_RADIUS
): { x: number; z: number; collided: boolean } {
  let px = x;
  let pz = z;
  let collided = false;

  // 1. World boundary collision (centered at 0, size WORLD_SIZE)
  const halfWorld = WORLD_SIZE / 2;
  const bound = halfWorld - radius;
  if (px < -bound) { px = -bound; collided = true; }
  if (px > bound) { px = bound; collided = true; }
  if (pz < -bound) { pz = -bound; collided = true; }
  if (pz > bound) { pz = bound; collided = true; }

  // 2. Obstacle collisions
  for (const obs of OBSTACLES) {
    const res = checkCircleAABBCollision(px, pz, radius, obs.x, obs.z, obs.w, obs.d);
    if (res.colliding) {
      px += res.pushX;
      pz += res.pushZ;
      collided = true;
    }
  }

  return { x: px, z: pz, collided };
}

// Helper to check if a ray hits an obstacle (for Destroyer ability or shooting check)
// Simple ray-AABB intersection in 2D (xz plane)
export function rayAABBIntersection(
  origX: number,
  origZ: number,
  dirX: number,
  dirZ: number,
  obs: Obstacle
): number | null {
  const minX = obs.x - obs.w / 2;
  const maxX = obs.x + obs.w / 2;
  const minZ = obs.z - obs.d / 2;
  const maxZ = obs.z + obs.d / 2;

  let tmin = -Infinity;
  let tmax = Infinity;

  if (dirX !== 0) {
    const tx1 = (minX - origX) / dirX;
    const tx2 = (maxX - origX) / dirX;
    tmin = Math.max(tmin, Math.min(tx1, tx2));
    tmax = Math.min(tmax, Math.max(tx1, tx2));
  } else if (origX < minX || origX > maxX) {
    return null;
  }

  if (dirZ !== 0) {
    const tz1 = (minZ - origZ) / dirZ;
    const tz2 = (maxZ - origZ) / dirZ;
    tmin = Math.max(tmin, Math.min(tz1, tz2));
    tmax = Math.min(tmax, Math.max(tz1, tz2));
  } else if (origZ < minZ || origZ > maxZ) {
    return null;
  }

  if (tmax >= tmin && tmax >= 0) {
    return tmin < 0 ? 0 : tmin; // return distance parameter t
  }
  return null;
}
