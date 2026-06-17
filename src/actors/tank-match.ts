import { type ActorContextOf, actor, event, UserError } from "rivetkit";
import { resolveCollisions, TANK_RADIUS, rayAABBIntersection } from "../shared/sim.ts";
import type { registry } from "../index.ts";
import {
	Mode,
	TICK_MS,
	WORLD_SIZE,
	TANK_STATS,
	SCORE_LIMIT,
	RESPAWN_TIME_MS,
	TEAM_SWITCH_COOLDOWN_MS,
	OBSTACLES,
} from "./config.ts";

export interface PlayerEntry {
	connId: string | null;
	teamId: "red" | "blue" | "ffa";
	tankType: "scout" | "titan" | "destroyer" | "medic";
	username: string;
	x: number;
	y: number;
	z: number;
	rotationY: number;
	turretRotationY: number;
	hp: number;
	maxHp: number;
	alive: boolean;
	score: number;
	abilityActiveUntil: number;
	abilityCooldown: number;
	lastTeamSwitch: number;
	lastPositionAt: number;
	respawnAt: number;
	lastFiredAt: number;
}

export interface ProjectileEntry {
	id: string;
	ownerId: string;
	x: number;
	y: number;
	z: number;
	vx: number;
	vz: number;
	damage: number;
	createdAt: number;
	piercing: boolean;
}

interface MatchState {
	matchId: string;
	mode: Mode;
	capacity: number;
	tick: number;
	phase: "waiting" | "live" | "finished";
	players: Record<string, PlayerEntry>;
	projectiles: Record<string, ProjectileEntry>;
	teamScores: { red: number; blue: number };
	winnerTeam: "red" | "blue" | "ffa" | null;
	winnerPlayerId: string | null;
	winnerUsername: string | null;
}

interface AssignedPlayer {
	playerId: string;
	teamId: "red" | "blue" | "ffa";
	tankType: "scout" | "titan" | "destroyer" | "medic";
	username: string;
}

export const tankMatch = actor({
	options: { name: "Tank Match", icon: "crosshairs" },
	events: {
		snapshot: event<MatchState>(),
		shoot: event<{
			playerId: string;
			projectileId: string;
			x: number;
			z: number;
			vx: number;
			vz: number;
			piercing: boolean;
		}>(),
		playerHit: event<{
			playerId: string;
			damage: number;
			hp: number;
			attackerId: string;
		}>(),
		playerKilled: event<{
			victimId: string;
			attackerId: string;
			victimUsername: string;
			attackerUsername: string;
		}>(),
		abilityUsed: event<{
			playerId: string;
			abilityType: string;
			duration: number;
		}>(),
		teamSwitched: event<{
			playerId: string;
			teamId: "red" | "blue";
		}>(),
		gameOver: event<{
			winnerTeam: "red" | "blue" | "ffa" | null;
			winnerPlayerId: string | null;
			winnerUsername: string | null;
		}>(),
	},
	createState: (
		_c,
		input: {
			matchId: string;
			mode: Mode;
			capacity: number;
			assignedPlayers: AssignedPlayer[];
		},
	): MatchState => {
		const players: Record<string, PlayerEntry> = {};
		for (const ap of input.assignedPlayers) {
			const stats = TANK_STATS[ap.tankType];
			// Determine initial spawn position
			let x = 0, z = 0;
			if (ap.teamId === "red") {
				x = -80 + Math.random() * 20;
				z = -80 + Math.random() * 20;
			} else if (ap.teamId === "blue") {
				x = 80 - Math.random() * 20;
				z = 80 - Math.random() * 20;
			} else {
				x = -60 + Math.random() * 120;
				z = -60 + Math.random() * 120;
			}

			players[ap.playerId] = {
				connId: null,
				teamId: ap.teamId,
				tankType: ap.tankType,
				username: ap.username,
				x,
				y: 0,
				z,
				rotationY: 0,
				turretRotationY: 0,
				hp: stats.hp,
				maxHp: stats.hp,
				alive: true,
				score: 0,
				abilityActiveUntil: 0,
				abilityCooldown: 0,
				lastTeamSwitch: 0,
				lastPositionAt: Date.now(),
				respawnAt: 0,
				lastFiredAt: 0,
			};
		}
		return {
			matchId: input.matchId,
			mode: input.mode,
			capacity: input.capacity,
			tick: 0,
			phase: "waiting",
			players,
			projectiles: {},
			teamScores: { red: 0, blue: 0 },
			winnerTeam: null,
			winnerPlayerId: null,
			winnerUsername: null,
		};
	},
	onConnect: (c, conn) => {
		const playerId = (conn.params as { playerId?: string })?.playerId;
		if (!playerId) {
			conn.disconnect("missing_player_id");
			return;
		}
		const player = c.state.players[playerId];
		if (!player) {
			conn.disconnect("invalid_player");
			return;
		}
		player.connId = conn.id;

		if (c.state.phase === "waiting") {
			const allConnected = Object.values(c.state.players).every(
				(p) => p.connId !== null,
			);
			if (allConnected) {
				c.state.phase = "live";
			}
		}

		c.broadcast("snapshot", c.state);
	},
	onDisconnect: (c, conn) => {
		const found = Object.values(c.state.players).find(
			(p) => p.connId === conn.id,
		);
		if (found) {
			found.connId = null;
		}

		// Terminate match if all players are disconnected for a while
		const activeCount = Object.values(c.state.players).filter(
			(p) => p.connId !== null,
		).length;
		if (activeCount === 0 && c.state.phase === "live") {
			// Schedule termination
			c.state.phase = "finished";
		}
	},
	onDestroy: async (c) => {
		const client = c.client<typeof registry>();
		await client.tankMatchmaker
			.getOrCreate(["main"])
			.send("matchCompleted", { matchId: c.state.matchId });
	},
	actions: {
		move: (c, input: { x: number; y: number; z: number; rotationY: number; turretRotationY: number }) => {
			const playerId = getPlayerIdByConn(c);
			const player = c.state.players[playerId];
			if (!player || !player.alive || c.state.phase !== "live") return;

			// Basic Speed anti-cheat verification
			const stats = TANK_STATS[player.tankType];
			const isDashing = player.tankType === "scout" && Date.now() < player.abilityActiveUntil;
			const maxSpeed = stats.speed * (isDashing ? 2.0 : 1.0);

			const dt = (Date.now() - player.lastPositionAt) / 1000;
			if (dt > 0.05) {
				const dx = input.x - player.x;
				const dz = input.z - player.z;
				const dist = Math.sqrt(dx * dx + dz * dz);
				const maxDistAllowed = maxSpeed * dt * 1.8 + 2; // 80% tolerance for latency/frame updates

				if (dist > maxDistAllowed && dist > 5) {
					// Client speed warning or snap back - for MVP let's log and cap position
					console.warn(`Speed violation for ${player.username}: moved ${dist.toFixed(2)} in ${dt.toFixed(2)}s (max: ${maxDistAllowed.toFixed(2)})`);
					// For harsh cheats, snap back: do not apply. For now we apply but warning is visible.
				}
			}

			// Validate against obstacles
			const resolved = resolveCollisions(input.x, input.z, TANK_RADIUS);
			player.x = resolved.x;
			player.z = resolved.z;
			player.y = input.y;
			player.rotationY = input.rotationY;
			player.turretRotationY = input.turretRotationY;
			player.lastPositionAt = Date.now();
		},
		fire: (c, input: { x: number; z: number; vx: number; vz: number }) => {
			const playerId = getPlayerIdByConn(c);
			const player = c.state.players[playerId];
			if (!player || !player.alive || c.state.phase !== "live") return;

			const stats = TANK_STATS[player.tankType];
			const now = Date.now();
			if (now - player.lastFiredAt < stats.fireRate * 1000) {
				return; // rate limit firing
			}
			player.lastFiredAt = now;

			const projId = crypto.randomUUID();
			const isPiercing = player.tankType === "destroyer" && now < player.abilityActiveUntil;

			const projectile: ProjectileEntry = {
				id: projId,
				ownerId: playerId,
				x: input.x,
				y: 2, // projectile spawn height
				z: input.z,
				vx: input.vx,
				vz: input.vz,
				damage: stats.damage,
				createdAt: now,
				piercing: isPiercing,
			};

			c.state.projectiles[projId] = projectile;

			if (isPiercing) {
				// Piercing shot active used, clear active flag
				player.abilityActiveUntil = 0;
			}

			c.broadcast("shoot", {
				playerId,
				projectileId: projId,
				x: input.x,
				z: input.z,
				vx: input.vx,
				vz: input.vz,
				piercing: isPiercing,
			});
		},
		useAbility: (c) => {
			const playerId = getPlayerIdByConn(c);
			const player = c.state.players[playerId];
			if (!player || !player.alive || c.state.phase !== "live") return;

			const now = Date.now();
			if (now < player.abilityCooldown) {
				throw new UserError("Ability is on cooldown");
			}

			const stats = TANK_STATS[player.tankType];
			let duration = 0;

			if (player.tankType === "scout") {
				duration = 2000; // 2s sprint
				player.abilityActiveUntil = now + duration;
				player.abilityCooldown = now + stats.abilityCooldown;
			} else if (player.tankType === "titan") {
				duration = 3000; // 3s shield
				player.abilityActiveUntil = now + duration;
				player.abilityCooldown = now + stats.abilityCooldown;
			} else if (player.tankType === "destroyer") {
				duration = 5000; // Next shot within 5s is piercing
				player.abilityActiveUntil = now + duration;
				player.abilityCooldown = now + stats.abilityCooldown;
			} else if (player.tankType === "medic") {
				// Area heal
				duration = 0;
				player.abilityCooldown = now + stats.abilityCooldown;

				// Heal self
				player.hp = Math.min(player.maxHp, player.hp + 40);

				// Heal allies in radius 15
				for (const [otherId, other] of Object.entries(c.state.players)) {
					if (otherId === playerId || !other.alive) continue;
					if (c.state.mode === "team" && other.teamId !== player.teamId) continue;

					const dx = other.x - player.x;
					const dz = other.z - player.z;
					const dist = Math.sqrt(dx * dx + dz * dz);
					if (dist <= 15) {
						other.hp = Math.min(other.maxHp, other.hp + 40);
						c.broadcast("playerHit", {
							playerId: otherId,
							damage: -40, // Negative damage = heal
							hp: other.hp,
							attackerId: playerId,
						});
					}
				}
			}

			c.broadcast("abilityUsed", {
				playerId,
				abilityType: player.tankType,
				duration,
			});
		},
		switchTeam: (c) => {
			const playerId = getPlayerIdByConn(c);
			const player = c.state.players[playerId];
			if (!player || c.state.mode !== "team" || c.state.phase !== "live") return;

			const now = Date.now();
			if (now - player.lastTeamSwitch < TEAM_SWITCH_COOLDOWN_MS) {
				throw new UserError("Team switch is on cooldown");
			}

			// Balance check
			const targetTeam = player.teamId === "red" ? "blue" : "red";
			const targetCount = Object.values(c.state.players).filter(p => p.teamId === targetTeam).length;
			const currentCount = Object.values(c.state.players).filter(p => p.teamId === player.teamId).length;

			if (targetCount > currentCount) {
				throw new UserError("Target team has too many players");
			}

			player.teamId = targetTeam;
			player.lastTeamSwitch = now;

			// Kill and respawn player on switch
			player.alive = false;
			player.hp = 0;
			player.respawnAt = now + RESPAWN_TIME_MS;

			c.broadcast("teamSwitched", { playerId, teamId: targetTeam });
			c.broadcast("playerKilled", {
				victimId: playerId,
				attackerId: "",
				victimUsername: player.username,
				attackerUsername: "System (Team Switch)",
			});
		},
	},
	run: async (c) => {
		const tickInterval = setInterval(() => {
			try {
				if (c.state.phase === "live") {
					updatePhysics(c);
				}
				c.broadcast("snapshot", c.state);
			} catch (err) {
				console.error("Error in game loop:", err);
			}
		}, TICK_MS);

		// Clean up interval when actor is destroyed
		c.onAbort(() => {
			clearInterval(tickInterval);
		});

		// Wait forever until abort
		await new Promise(() => {});
	},
});

function getPlayerIdByConn(c: ActorContextOf<typeof tankMatch>): string {
	const playerId = Object.keys(c.state.players).find(
		(id) => c.state.players[id].connId === c.conn.id,
	);
	if (!playerId) {
		throw new UserError("Unauthorized connection");
	}
	return playerId;
}

function updatePhysics(c: ActorContextOf<typeof tankMatch>) {
	c.state.tick++;
	const dt = TICK_MS / 1000;
	const now = Date.now();

	// 1. Update projectles
	for (const [id, proj] of Object.entries(c.state.projectiles)) {
		proj.x += proj.vx * dt;
		proj.z += proj.vz * dt;

		// Check obstacle hit (skip for piercing)
		let hitObstacle = false;
		if (!proj.piercing) {
			for (const obs of OBSTACLES) {
				// Raycast or bounding box hit check
				const halfW = obs.w / 2;
				const halfD = obs.d / 2;
				if (
					proj.x >= obs.x - halfW &&
					proj.x <= obs.x + halfW &&
					proj.z >= obs.z - halfD &&
					proj.z <= obs.z + halfD
				) {
					hitObstacle = true;
					break;
				}
			}
		}

		// Check world bounds
		const halfWorld = WORLD_SIZE / 2;
		const outOfBounds =
			Math.abs(proj.x) > halfWorld || Math.abs(proj.z) > halfWorld;

		if (hitObstacle || outOfBounds || now - proj.createdAt > 3000) {
			// Destroy projectile
			delete c.state.projectiles[id];
			continue;
		}

		// Check player hits
		for (const [targetId, target] of Object.entries(c.state.players)) {
			if (!target.alive || targetId === proj.ownerId) continue;

			// Team game: friendly fire is off
			if (c.state.mode === "team" && target.teamId === c.state.players[proj.ownerId]?.teamId) {
				continue;
			}

			const dx = target.x - proj.x;
			const dz = target.z - proj.z;
			const distSq = dx * dx + dz * dz;

			if (distSq < TANK_RADIUS * TANK_RADIUS) {
				// Hit target!
				let finalDmg = proj.damage;

				// Titan shield check
				const hasShield = target.tankType === "titan" && now < target.abilityActiveUntil;
				// Scout active dash: 50% damage reduction
				const hasDashReduction = target.tankType === "scout" && now < target.abilityActiveUntil;

				if (hasShield) {
					finalDmg = 0;
				} else if (hasDashReduction) {
					finalDmg = Math.round(finalDmg * 0.5);
				}

				target.hp = Math.max(0, target.hp - finalDmg);

				c.broadcast("playerHit", {
					playerId: targetId,
					damage: finalDmg,
					hp: target.hp,
					attackerId: proj.ownerId,
				});

				// Kill handling
				if (target.hp <= 0) {
					target.alive = false;
					target.respawnAt = now + RESPAWN_TIME_MS;

					const killer = c.state.players[proj.ownerId];
					if (killer) {
						killer.score++;
						if (c.state.mode === "team" && (killer.teamId === "red" || killer.teamId === "blue")) {
							c.state.teamScores[killer.teamId]++;
						}
						c.broadcast("playerKilled", {
							victimId: targetId,
							attackerId: proj.ownerId,
							victimUsername: target.username,
							attackerUsername: killer.username,
						});

						// Win check
						checkWinCondition(c, killer.teamId, proj.ownerId);
					}
				}

				// Destroy projectile (unless piercing)
				if (!proj.piercing) {
					delete c.state.projectiles[id];
					break;
				}
			}
		}
	}

	// 2. Handle respawns
	for (const player of Object.values(c.state.players)) {
		if (!player.alive && now >= player.respawnAt) {
			player.alive = true;
			const stats = TANK_STATS[player.tankType];
			player.hp = stats.hp;

			// Respawn position
			let rx = 0, rz = 0;
			if (player.teamId === "red") {
				rx = -80 + Math.random() * 20;
				rz = -80 + Math.random() * 20;
			} else if (player.teamId === "blue") {
				rx = 80 - Math.random() * 20;
				rz = 80 - Math.random() * 20;
			} else {
				rx = -60 + Math.random() * 120;
				rz = -60 + Math.random() * 120;
			}

			player.x = rx;
			player.z = rz;
			player.y = 0;
			player.rotationY = 0;
			player.turretRotationY = 0;
			player.lastPositionAt = now;
		}
	}
}

function checkWinCondition(c: ActorContextOf<typeof tankMatch>, teamId: "red" | "blue" | "ffa", killerId: string) {
	if (c.state.phase !== "live") return;

	if (c.state.mode === "team" && (teamId === "red" || teamId === "blue")) {
		const score = c.state.teamScores[teamId];
		if (score >= SCORE_LIMIT) {
			c.state.phase = "finished";
			c.state.winnerTeam = teamId;
			c.state.winnerPlayerId = killerId;
			c.state.winnerUsername = c.state.players[killerId]?.username ?? "";

			c.broadcast("gameOver", {
				winnerTeam: teamId,
				winnerPlayerId: killerId,
				winnerUsername: c.state.winnerUsername,
			});
		}
	} else {
		// FFA win check
		const score = c.state.players[killerId]?.score ?? 0;
		if (score >= SCORE_LIMIT) {
			c.state.phase = "finished";
			c.state.winnerTeam = "ffa";
			c.state.winnerPlayerId = killerId;
			c.state.winnerUsername = c.state.players[killerId]?.username ?? "";

			c.broadcast("gameOver", {
				winnerTeam: "ffa",
				winnerPlayerId: killerId,
				winnerUsername: c.state.winnerUsername,
			});
		}
	}
}
