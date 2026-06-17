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
		queueForMatch: async (c, { mode, tankType, username }: { mode: Mode; tankType: string; username: string }): Promise<{ playerId: string }> => {
			const playerId = crypto.randomUUID();
			const connId = c.conn ? c.conn.id : null;
			await c.queue.send("queueForMatch", {
				mode,
				playerId,
				connId,
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
			const connId = c.conn ? c.conn.id : null;
			const rows = await c.db.execute<{
				match_id: string;
				player_id: string;
				team_id: string;
				mode: string;
				conn_id: string | null;
			}>(
				`SELECT * FROM assignments WHERE player_id = ? AND (conn_id = ? OR conn_id IS NULL)`,
				playerId,
				connId,
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
	connId: string | null,
	tankType: string,
	username: string,
): Promise<void> {
	const config = MODE_CONFIG[mode];

	// Find an existing match with space
	const rows = await c.db.execute<{ match_id: string; capacity: number; current_count: number }>(`
		SELECT m.match_id, m.capacity, COUNT(a.player_id) as current_count
		FROM matches m
		LEFT JOIN assignments a ON m.match_id = a.match_id
		WHERE m.mode = ?
		GROUP BY m.match_id
		HAVING current_count < m.capacity
		ORDER BY m.created_at ASC
		LIMIT 1
	`, mode);

	let matchId: string;
	let teamId: "red" | "blue" | "ffa" = "ffa";

	const client = c.client<typeof registry>();

	if (rows.length > 0) {
		// Found existing match with space!
		const matchRow = rows[0]!;
		matchId = matchRow.match_id;

		if (mode === "team") {
			// Balance teams: count players in red vs blue for this match
			const teamCounts = await c.db.execute<{ team_id: string; cnt: number }>(`
				SELECT team_id, COUNT(*) as cnt 
				FROM assignments 
				WHERE match_id = ? 
				GROUP BY team_id
			`, matchId);

			let redCount = 0;
			let blueCount = 0;
			for (const tc of teamCounts) {
				if (tc.team_id === "red") redCount = tc.cnt;
				if (tc.team_id === "blue") blueCount = tc.cnt;
			}
			teamId = redCount <= blueCount ? "red" : "blue";
		}

		// Connect to the match and add the player
		const matchActor = client.tankMatch.getOrCreate([matchId]);
		await matchActor.joinPlayer({
			playerId,
			teamId,
			tankType: tankType as any,
			username,
		});

		console.log(`Player ${username} (${playerId}) joined existing match ${matchId}`);
	} else {
		// Create new match!
		matchId = crypto.randomUUID();
		if (mode === "team") {
			teamId = "red";
		}

		await client.tankMatch.create([matchId], {
			input: {
				matchId,
				mode,
				capacity: config.capacity,
				assignedPlayers: [
					{
						playerId,
						teamId,
						tankType: tankType as any,
						username,
					}
				],
			},
		});

		await c.db.execute(
			`INSERT INTO matches (match_id, mode, capacity, created_at) VALUES (?, ?, ?, ?)`,
			matchId,
			mode,
			config.capacity,
			Date.now(),
		);

		console.log(`Created new match ${matchId} for player ${username}`);
	}

	// Insert assignment (exactly 5 parameters)
	await c.db.execute(
		`INSERT INTO assignments (player_id, match_id, team_id, mode, conn_id) VALUES (?, ?, ?, ?, ?)`,
		playerId,
		matchId,
		teamId,
		mode,
		connId,
	);

	// Broadcast assignmentReady event
	c.broadcast("assignmentReady", {
		matchId,
		playerId,
		teamId,
		mode,
		connId,
	} satisfies TankAssignment);
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
