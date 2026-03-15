import {
  type User, type InsertUser,
  type Team, type InsertTeam,
  type Player, type InsertPlayer,
  type Game, type InsertGame,
  type GameEvent, type InsertGameEvent,
  type PlayerBoxScore, type TeamBoxScore,
} from "@shared/schema";
import { randomUUID } from "crypto";

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

export class MemStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private teams: Map<string, Team> = new Map();
  private players: Map<string, Player> = new Map();
  private games: Map<string, Game> = new Map();
  private gameEvents: Map<string, GameEvent> = new Map();

  constructor() {
    // Create a default user
    const defaultUser: User = {
      id: 'default-user',
      email: 'scorer@swishnstats.com',
      displayName: 'Scorer',
      avatarUrl: null,
      createdAt: new Date(),
    };
    this.users.set(defaultUser.id, defaultUser);
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id, avatarUrl: insertUser.avatarUrl ?? null, createdAt: new Date() };
    this.users.set(id, user);
    return user;
  }

  // Teams
  async getTeams(userId: string): Promise<Team[]> {
    return Array.from(this.teams.values()).filter(t => t.userId === userId);
  }

  async getTeam(id: string): Promise<Team | undefined> {
    return this.teams.get(id);
  }

  async createTeam(insertTeam: InsertTeam): Promise<Team> {
    const id = randomUUID();
    const team: Team = { ...insertTeam, id, createdAt: new Date() };
    this.teams.set(id, team);
    return team;
  }

  async updateTeam(id: string, data: Partial<InsertTeam>): Promise<Team | undefined> {
    const team = this.teams.get(id);
    if (!team) return undefined;
    const updated = { ...team, ...data };
    this.teams.set(id, updated);
    return updated;
  }

  async deleteTeam(id: string): Promise<boolean> {
    return this.teams.delete(id);
  }

  // Players
  async getPlayersByTeam(teamId: string): Promise<Player[]> {
    return Array.from(this.players.values()).filter(p => p.teamId === teamId);
  }

  async getPlayer(id: string): Promise<Player | undefined> {
    return this.players.get(id);
  }

  async createPlayer(insertPlayer: InsertPlayer): Promise<Player> {
    const id = randomUUID();
    const player: Player = {
      ...insertPlayer,
      id,
      isActive: insertPlayer.isActive ?? true,
      createdAt: new Date(),
    };
    this.players.set(id, player);
    return player;
  }

  async updatePlayer(id: string, data: Partial<InsertPlayer>): Promise<Player | undefined> {
    const player = this.players.get(id);
    if (!player) return undefined;
    const updated = { ...player, ...data };
    this.players.set(id, updated);
    return updated;
  }

  async deletePlayer(id: string): Promise<boolean> {
    return this.players.delete(id);
  }

  // Games
  async getGames(userId: string): Promise<Game[]> {
    return Array.from(this.games.values())
      .filter(g => g.userId === userId)
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }

  async getGame(id: string): Promise<Game | undefined> {
    return this.games.get(id);
  }

  async createGame(insertGame: InsertGame): Promise<Game> {
    const id = randomUUID();
    const game: Game = {
      ...insertGame,
      id,
      status: insertGame.status || 'setup',
      gameFormat: insertGame.gameFormat || 'quarters',
      periodLength: insertGame.periodLength || 10,
      currentPeriod: 1,
      venue: insertGame.venue ?? null,
      gameDate: insertGame.gameDate ?? null,
      createdAt: new Date(),
    };
    this.games.set(id, game);
    return game;
  }

  async updateGame(id: string, data: Partial<Game>): Promise<Game | undefined> {
    const game = this.games.get(id);
    if (!game) return undefined;
    const updated = { ...game, ...data };
    this.games.set(id, updated);
    return updated;
  }

  // Game Events
  async getGameEvents(gameId: string): Promise<GameEvent[]> {
    return Array.from(this.gameEvents.values())
      .filter(e => e.gameId === gameId && !e.isDeleted)
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }

  async createGameEvent(insertEvent: InsertGameEvent): Promise<GameEvent> {
    const id = randomUUID();
    const event: GameEvent = {
      ...insertEvent,
      id,
      playerId: insertEvent.playerId ?? null,
      gameClockSeconds: insertEvent.gameClockSeconds ?? null,
      courtX: insertEvent.courtX ?? null,
      courtY: insertEvent.courtY ?? null,
      shotResult: insertEvent.shotResult ?? null,
      assistPlayerId: insertEvent.assistPlayerId ?? null,
      metadata: insertEvent.metadata ?? null,
      isDeleted: false,
      createdAt: new Date(),
    };
    this.gameEvents.set(id, event);
    return event;
  }

  async softDeleteGameEvent(id: string): Promise<boolean> {
    const event = this.gameEvents.get(id);
    if (!event) return false;
    event.isDeleted = true;
    this.gameEvents.set(id, event);
    return true;
  }

  // Box Score
  async getBoxScore(gameId: string, teamId: string): Promise<TeamBoxScore> {
    const team = this.teams.get(teamId);
    const events = Array.from(this.gameEvents.values())
      .filter(e => e.gameId === gameId && e.teamId === teamId && !e.isDeleted);
    
    const teamPlayers = Array.from(this.players.values()).filter(p => p.teamId === teamId);
    
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

    const players = Array.from(playerStatsMap.values());
    const totals = {
      minutes: 0,
      points: players.reduce((s, p) => s + p.points, 0),
      fgm: players.reduce((s, p) => s + p.fgm, 0),
      fga: players.reduce((s, p) => s + p.fga, 0),
      threePm: players.reduce((s, p) => s + p.threePm, 0),
      threePa: players.reduce((s, p) => s + p.threePa, 0),
      ftm: players.reduce((s, p) => s + p.ftm, 0),
      fta: players.reduce((s, p) => s + p.fta, 0),
      oreb: players.reduce((s, p) => s + p.oreb, 0),
      dreb: players.reduce((s, p) => s + p.dreb, 0),
      reb: players.reduce((s, p) => s + p.reb, 0),
      ast: players.reduce((s, p) => s + p.ast, 0),
      stl: players.reduce((s, p) => s + p.stl, 0),
      blk: players.reduce((s, p) => s + p.blk, 0),
      to: players.reduce((s, p) => s + p.to, 0),
      pf: players.reduce((s, p) => s + p.pf, 0),
      plusMinus: 0,
    };

    return {
      teamId,
      teamName: team?.name || 'Unknown',
      players,
      totals,
    };
  }
}

export const storage = new MemStorage();
