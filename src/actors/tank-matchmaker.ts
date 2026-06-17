import { type ActorContextOf, actor, event, queue } from "rivetkit";
import { db, type RawAccess } from "rivetkit/db";

import type { registry } from "../index.ts";
import { MODE_CONFIG, type Mode } from "./config.ts";

export interface TankAssignment {
	matchId: string;
	playerId: string;
	teamId: "red" | "blue" | "ffa";
	mode: Mode;
	connId: string | null;
}

type QueuePlayerRow = {
	player_id: string;
	conn_id: string | null;
	tank_type: string;
	username: string;
};

export const tankMatchmaker = actor({
	options: { name: "Tank Matchmaker", icon: "crosshairs" },
	db: db({
		onMigrate: migrateTables,
	}),
	queues: {
		queueForMatch: queue<{
			mode: Mode;
			playerId: string;
			connId: string;
			tankType: string;
			username: string;
		}>(),
		unqueueForMatch: queue<{ connId: string }>(),
		matchCompleted: queue<{ matchId: string }>(),
	},
	events: {
		assignmentReady: event<TankAssignment>(),
		queueUpdate: event<{ counts: Record<string, number> }>(),
	},
	actions: {
		queueForMatch: async (c, { mode, tankType, username }: { mode: Mode; tankType: string; username: string }) => {
			const playerId = crypto.randomUUID();
			await c.queue.send("queueForMatch", {
				mode,
				playerId,
				connId: c.conn.id,
				tankType,
				username,
			});
			return { playerId };
		},
		getQueueSizes: async (c) => {
			const rows = await c.db.execute<{ mode: string; cnt: number }>(
				`SELECT mode, COUNT(*) as cnt FROM player_pool GROUP BY mode`,
			);
			const counts: Record<string, number> = { team: 0, ffa: 0 };
			for (const row of rows) {
				counts[row.mode] = row.cnt;
			}
			return counts;
		},
		getAssignment: async (c, { playerId }: { playerId: string }) => {
			const rows = await c.db.execute<{
				match_id: string;
				player_id: string;
				team_id: string;
				mode: string;
				conn_id: string | null;
			}>(
				`SELECT * FROM assignments WHERE player_id = ? AND conn_id = ?`,
				playerId,
				c.conn.id,
			);
			if (rows.length === 0) return null;
			const row = rows[0]!;
			return {
				matchId: row.match_id,
				playerId: row.player_id,
				teamId: row.team_id as "red" | "blue" | "ffa",
				mode: row.mode as Mode,
				connId: row.conn_id,
			};
		},
		listRooms: async (c) => {
			const rows = await c.db.execute<{ match_id: string; mode: string; capacity: number }>(
				`SELECT * FROM matches`
			);
			return rows.map(r => ({ matchId: r.match_id, mode: r.mode, capacity: r.capacity }));
		}
	},
	onDisconnect: async (c, conn) => {
		await c.queue.send("unqueueForMatch", { connId: conn.id });
	},
	run: async (c) => {
		for await (const message of c.queue.iter()) {
			if (message.name === "queueForMatch") {
				await processQueueEntry(
					c,
					message.body.mode,
					message.body.playerId,
					message.body.connId,
					message.body.tankType,
					message.body.username,
				);
			} else if (message.name === "unqueueForMatch") {
				await c.db.execute(
					`DELETE FROM player_pool WHERE conn_id = ?`,
					message.body.connId,
				);
				await broadcastQueueSizes(c);
			} else if (message.name === "matchCompleted") {
				await c.db.execute(
					`DELETE FROM matches WHERE match_id = ?`,
					message.body.matchId,
				);
				await c.db.execute(
					`DELETE FROM assignments WHERE match_id = ?`,
					message.body.matchId,
				);
			}
		}
	},
});

async function broadcastQueueSizes(c: ActorContextOf<typeof tankMatchmaker>) {
	const rows = await c.db.execute<{ mode: string; cnt: number }>(
		`SELECT mode, COUNT(*) as cnt FROM player_pool GROUP BY mode`,
	);
	const counts: Record<string, number> = { team: 0, ffa: 0 };
	for (const row of rows) {
		counts[row.mode] = row.cnt;
	}
	c.broadcast("queueUpdate", { counts });
}

async function processQueueEntry(
	c: ActorContextOf<typeof tankMatchmaker>,
	mode: Mode,
	playerId: string,
	connId: string,
	tankType: string,
	username: string,
): Promise<void> {
	const config = MODE_CONFIG[mode];

	await c.db.execute(
		`INSERT OR REPLACE INTO player_pool (player_id, mode, tank_type, username, queued_at, conn_id) VALUES (?, ?, ?, ?, ?, ?)`,
		playerId,
		mode,
		tankType,
		username,
		Date.now(),
		connId,
	);

	await broadcastQueueSizes(c);

	const countRows = await c.db.execute<{ cnt: number }>(
		`SELECT COUNT(*) as cnt FROM player_pool WHERE mode = ?`,
		mode,
	);
	const count = countRows[0]?.cnt ?? 0;

	if (count >= config.capacity) {
		await fillMatch(c, mode, config);
	}
}

async function fillMatch(
	c: ActorContextOf<typeof tankMatchmaker>,
	mode: Mode,
	config: { capacity: number; teams: ("red" | "blue" | "ffa")[] },
) {
	const queued = await c.db.execute<QueuePlayerRow>(
		`SELECT player_id, conn_id, tank_type, username FROM player_pool WHERE mode = ? ORDER BY queued_at ASC LIMIT ?`,
		mode,
		config.capacity,
	);

	const queuedPlayers = queued.map((r) => ({
		playerId: r.player_id,
		connId: r.conn_id,
		tankType: r.tank_type,
		username: r.username,
	}));
	const playerIds = queuedPlayers.map((r) => r.playerId);

	for (const pid of playerIds) {
		await c.db.execute(`DELETE FROM player_pool WHERE player_id = ?`, pid);
	}

	const matchId = crypto.randomUUID();
	const assignedPlayers = queuedPlayers.map((queuedPlayer, idx) => {
		let teamId: "red" | "blue" | "ffa" = "ffa";
		if (mode === "team") {
			teamId = idx % 2 === 0 ? "red" : "blue";
		}
		return {
			playerId: queuedPlayer.playerId,
			connId: queuedPlayer.connId,
			teamId,
			tankType: queuedPlayer.tankType,
			username: queuedPlayer.username,
		};
	});

	const client = c.client<typeof registry>();
	await client.tankMatch.create([matchId], {
		input: {
			matchId,
			mode,
			capacity: config.capacity,
			assignedPlayers: assignedPlayers.map((ap) => ({
				playerId: ap.playerId,
				teamId: ap.teamId,
				tankType: ap.tankType,
				username: ap.username,
			})),
		},
	});

	await c.db.execute(
		`INSERT INTO matches (match_id, mode, capacity, created_at) VALUES (?, ?, ?, ?)`,
		matchId,
		mode,
		config.capacity,
		Date.now(),
	);

	await broadcastQueueSizes(c);

	for (const ap of assignedPlayers) {
		await c.db.execute(
			`INSERT INTO assignments (player_id, match_id, team_id, mode, conn_id) VALUES (?, ?, ?, ?, ?, ?)`,
			ap.playerId,
			matchId,
			ap.teamId,
			mode,
			ap.connId,
		);
		c.broadcast("assignmentReady", {
			matchId,
			playerId: ap.playerId,
			teamId: ap.teamId,
			mode,
			connId: ap.connId,
		} satisfies TankAssignment);
	}
}

async function migrateTables(dbHandle: RawAccess) {
	await dbHandle.execute(`
		CREATE TABLE IF NOT EXISTS player_pool (
			player_id TEXT PRIMARY KEY,
			mode TEXT NOT NULL,
			tank_type TEXT NOT NULL,
			username TEXT NOT NULL,
			queued_at INTEGER NOT NULL,
			conn_id TEXT
		)
	`);
	await dbHandle.execute(`
		CREATE TABLE IF NOT EXISTS matches (
			match_id TEXT PRIMARY KEY,
			mode TEXT NOT NULL,
			capacity INTEGER NOT NULL,
			created_at INTEGER NOT NULL
		)
	`);
	await dbHandle.execute(`
		CREATE TABLE IF NOT EXISTS assignments (
			player_id TEXT PRIMARY KEY,
			match_id TEXT NOT NULL,
			team_id TEXT NOT NULL,
			mode TEXT NOT NULL,
			conn_id TEXT
		)
	`);
}
