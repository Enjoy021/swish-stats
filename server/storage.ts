import {
  type User, type InsertUser,
  type Team, type InsertTeam,
  type Player, type InsertPlayer,
  type Game, type InsertGame,
  type GameEvent, type InsertGameEvent,
  type PlayerBoxScore, type TeamBoxScore,
  users, teams, players, games, gameEvents,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and, desc, or, sql } from "drizzle-orm";
import path from "path";

// Database path: use DATABASE_PATH env var (for Render persistent disk) or default to project root
const dbPath = process.env.DATABASE_PATH
  ? path.join(process.env.DATABASE_PATH, "data.db")
  : "data.db";

// Initialize SQLite database with WAL mode for better performance
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

// Create tables if they don't exist (auto-migration)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    name TEXT NOT NULL,
    number INTEGER NOT NULL,
    position TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    home_team_id TEXT NOT NULL,
    away_team_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'setup',
    game_format TEXT NOT NULL DEFAULT 'quarters',
    period_length INTEGER NOT NULL DEFAULT 10,
    current_period INTEGER NOT NULL DEFAULT 1,
    venue TEXT,
    game_date TEXT,
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS game_events (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL,
    player_id TEXT,
    team_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    quarter INTEGER NOT NULL,
    game_clock_seconds INTEGER,
    court_x REAL,
    court_y REAL,
    shot_result TEXT,
    assist_player_id TEXT,
    metadata TEXT,
    created_at TEXT,
    is_deleted INTEGER DEFAULT 0
  );
`);

// Seed default user if not exists
const existingUser = db.select().from(users).where(eq(users.id, "default-user")).get();
if (!existingUser) {
  db.insert(users).values({
    id: "default-user",
    email: "scorer@swishnstats.com",
    displayName: "Scorer",
    avatarUrl: null,
  }).run();
}

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Teams
  getTeams(userId: string): Promise<Team[]>;
  getTeam(id: string): Promise<Team | undefined>;
  createTeam(team: InsertTeam): Promise<Team>;
  updateTeam(id: string, data: Partial<InsertTeam>): Promise<Team | undefined>;
  deleteTeam(id: string): Promise<boolean>;

  // Players
  getPlayersByTeam(teamId: string): Promise<Player[]>;
  getPlayer(id: string): Promise<Player | undefined>;
  createPlayer(player: InsertPlayer): Promise<Player>;
  updatePlayer(id: string, data: Partial<InsertPlayer>): Promise<Player | undefined>;
  deletePlayer(id: string): Promise<boolean>;

  // Games
  getGames(userId: string): Promise<Game[]>;
  getGame(id: string): Promise<Game | undefined>;
  createGame(game: InsertGame): Promise<Game>;
  updateGame(id: string, data: Partial<Game>): Promise<Game | undefined>;

  // Game Events
  getGameEvents(gameId: string): Promise<GameEvent[]>;
  createGameEvent(event: InsertGameEvent): Promise<GameEvent>;
  softDeleteGameEvent(id: string): Promise<boolean>;

  // Box Score
  getBoxScore(gameId: string, teamId: string): Promise<TeamBoxScore>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.id, id)).get();
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    return db.insert(users).values({
      ...insertUser,
      avatarUrl: insertUser.avatarUrl ?? null,
    }).returning().get();
  }

  // Teams
  async getTeams(userId: string): Promise<Team[]> {
    return db.select().from(teams).where(eq(teams.userId, userId)).all();
  }

  async getTeam(id: string): Promise<Team | undefined> {
    return db.select().from(teams).where(eq(teams.id, id)).get();
  }

  async createTeam(insertTeam: InsertTeam): Promise<Team> {
    return db.insert(teams).values(insertTeam).returning().get();
  }

  async updateTeam(id: string, data: Partial<InsertTeam>): Promise<Team | undefined> {
    const existing = db.select().from(teams).where(eq(teams.id, id)).get();
    if (!existing) return undefined;
    return db.update(teams).set(data).where(eq(teams.id, id)).returning().get();
  }

  async deleteTeam(id: string): Promise<boolean> {
    const result = db.delete(teams).where(eq(teams.id, id)).run();
    return result.changes > 0;
  }

  // Players
  async getPlayersByTeam(teamId: string): Promise<Player[]> {
    return db.select().from(players).where(eq(players.teamId, teamId)).all();
  }

  async getPlayer(id: string): Promise<Player | undefined> {
    return db.select().from(players).where(eq(players.id, id)).get();
  }

  async createPlayer(insertPlayer: InsertPlayer): Promise<Player> {
    return db.insert(players).values({
      ...insertPlayer,
      isActive: insertPlayer.isActive ?? true,
    }).returning().get();
  }

  async updatePlayer(id: string, data: Partial<InsertPlayer>): Promise<Player | undefined> {
    const existing = db.select().from(players).where(eq(players.id, id)).get();
    if (!existing) return undefined;
    return db.update(players).set(data).where(eq(players.id, id)).returning().get();
  }

  async deletePlayer(id: string): Promise<boolean> {
    const result = db.delete(players).where(eq(players.id, id)).run();
    return result.changes > 0;
  }

  // Games
  async getGames(userId: string): Promise<Game[]> {
    return db.select().from(games)
      .where(eq(games.userId, userId))
      .orderBy(desc(games.createdAt))
      .all();
  }

  async getGame(id: string): Promise<Game | undefined> {
    return db.select().from(games).where(eq(games.id, id)).get();
  }

  async createGame(insertGame: InsertGame): Promise<Game> {
    return db.insert(games).values({
      ...insertGame,
      status: insertGame.status || 'setup',
      gameFormat: insertGame.gameFormat || 'quarters',
      periodLength: insertGame.periodLength || 10,
      currentPeriod: 1,
      venue: insertGame.venue ?? null,
      gameDate: insertGame.gameDate ?? null,
    }).returning().get();
  }

  async updateGame(id: string, data: Partial<Game>): Promise<Game | undefined> {
    const existing = db.select().from(games).where(eq(games.id, id)).get();
    if (!existing) return undefined;
    // Remove id from update data to avoid issues
    const { id: _id, ...updateData } = data;
    return db.update(games).set(updateData).where(eq(games.id, id)).returning().get();
  }

  // Game Events
  async getGameEvents(gameId: string): Promise<GameEvent[]> {
    return db.select().from(gameEvents)
      .where(
        and(
          eq(gameEvents.gameId, gameId),
          eq(gameEvents.isDeleted, false)
        )
      )
      .orderBy(desc(gameEvents.createdAt))
      .all();
  }

  async createGameEvent(insertEvent: InsertGameEvent): Promise<GameEvent> {
    return db.insert(gameEvents).values({
      ...insertEvent,
      playerId: insertEvent.playerId ?? null,
      gameClockSeconds: insertEvent.gameClockSeconds ?? null,
      courtX: insertEvent.courtX ?? null,
      courtY: insertEvent.courtY ?? null,
      shotResult: insertEvent.shotResult ?? null,
      assistPlayerId: insertEvent.assistPlayerId ?? null,
      metadata: insertEvent.metadata ?? null,
      isDeleted: false,
    }).returning().get();
  }

  async softDeleteGameEvent(id: string): Promise<boolean> {
    const result = db.update(gameEvents)
      .set({ isDeleted: true })
      .where(eq(gameEvents.id, id))
      .run();
    return result.changes > 0;
  }

  // Box Score
  async getBoxScore(gameId: string, teamId: string): Promise<TeamBoxScore> {
    const team = db.select().from(teams).where(eq(teams.id, teamId)).get();
    const events = db.select().from(gameEvents)
      .where(
        and(
          eq(gameEvents.gameId, gameId),
          eq(gameEvents.teamId, teamId),
          eq(gameEvents.isDeleted, false)
        )
      )
      .all();

    const teamPlayers = db.select().from(players)
      .where(eq(players.teamId, teamId))
      .all();

    const playerStatsMap = new Map<string, PlayerBoxScore>();

    for (const player of teamPlayers) {
      playerStatsMap.set(player.id, {
        playerId: player.id,
        playerName: player.name,
        playerNumber: player.number,
        minutes: 0,
        points: 0,
        fgm: 0,
        fga: 0,
        threePm: 0,
        threePa: 0,
        ftm: 0,
        fta: 0,
        oreb: 0,
        dreb: 0,
        reb: 0,
        ast: 0,
        stl: 0,
        blk: 0,
        to: 0,
        pf: 0,
        plusMinus: 0,
      });
    }

    for (const event of events) {
      if (!event.playerId) continue;
      const stats = playerStatsMap.get(event.playerId);
      if (!stats) continue;

      switch (event.eventType) {
        case '2pt_made':
          stats.points += 2;
          stats.fgm += 1;
          stats.fga += 1;
          break;
        case '2pt_attempt':
          stats.fga += 1;
          break;
        case '3pt_made':
          stats.points += 3;
          stats.fgm += 1;
          stats.fga += 1;
          stats.threePm += 1;
          stats.threePa += 1;
          break;
        case '3pt_attempt':
          stats.fga += 1;
          stats.threePa += 1;
          break;
        case 'ft_made':
          stats.points += 1;
          stats.ftm += 1;
          stats.fta += 1;
          break;
        case 'ft_attempt':
          stats.fta += 1;
          break;
        case 'offensive_rebound':
          stats.oreb += 1;
          stats.reb += 1;
          break;
        case 'defensive_rebound':
          stats.dreb += 1;
          stats.reb += 1;
          break;
        case 'assist':
          stats.ast += 1;
          break;
        case 'turnover':
          stats.to += 1;
          break;
        case 'steal':
          stats.stl += 1;
          break;
        case 'block':
          stats.blk += 1;
          break;
        case 'personal_foul':
        case 'technical_foul':
        case 'unsportsmanlike_foul':
          stats.pf += 1;
          break;
      }
    }

    const playersList = Array.from(playerStatsMap.values());
    const totals = {
      minutes: 0,
      points: playersList.reduce((s, p) => s + p.points, 0),
      fgm: playersList.reduce((s, p) => s + p.fgm, 0),
      fga: playersList.reduce((s, p) => s + p.fga, 0),
      threePm: playersList.reduce((s, p) => s + p.threePm, 0),
      threePa: playersList.reduce((s, p) => s + p.threePa, 0),
      ftm: playersList.reduce((s, p) => s + p.ftm, 0),
      fta: playersList.reduce((s, p) => s + p.fta, 0),
      oreb: playersList.reduce((s, p) => s + p.oreb, 0),
      dreb: playersList.reduce((s, p) => s + p.dreb, 0),
      reb: playersList.reduce((s, p) => s + p.reb, 0),
      ast: playersList.reduce((s, p) => s + p.ast, 0),
      stl: playersList.reduce((s, p) => s + p.stl, 0),
      blk: playersList.reduce((s, p) => s + p.blk, 0),
      to: playersList.reduce((s, p) => s + p.to, 0),
      pf: playersList.reduce((s, p) => s + p.pf, 0),
      plusMinus: 0,
    };

    return {
      teamId,
      teamName: team?.name || 'Unknown',
      players: playersList,
      totals,
    };
  }
}

export const storage = new DatabaseStorage();
