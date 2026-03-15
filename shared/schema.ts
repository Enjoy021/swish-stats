import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, real, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const positionEnum = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
export type Position = typeof positionEnum[number];

export const gameStatusEnum = ['setup', 'live', 'paused', 'completed'] as const;
export type GameStatus = typeof gameStatusEnum[number];

export const gameFormatEnum = ['quarters', 'halves'] as const;
export type GameFormat = typeof gameFormatEnum[number];

export const eventTypeEnum = [
  '2pt_attempt', '2pt_made', '3pt_attempt', '3pt_made',
  'ft_attempt', 'ft_made',
  'offensive_rebound', 'defensive_rebound', 'team_rebound',
  'assist', 'turnover', 'steal', 'block',
  'personal_foul', 'technical_foul', 'unsportsmanlike_foul', 'foul_drawn',
  'substitution_in', 'substitution_out',
  'timeout', 'period_start', 'period_end'
] as const;
export type EventType = typeof eventTypeEnum[number];

export const shotResultEnum = ['made', 'missed'] as const;
export type ShotResult = typeof shotResultEnum[number];

// Tables
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const teams = pgTable("teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  userId: varchar("user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const players = pgTable("players", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").notNull(),
  name: text("name").notNull(),
  number: integer("number").notNull(),
  position: text("position").notNull(), // PG/SG/SF/PF/C
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const games = pgTable("games", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  homeTeamId: varchar("home_team_id").notNull(),
  awayTeamId: varchar("away_team_id").notNull(),
  userId: varchar("user_id").notNull(),
  status: text("status").notNull().default('setup'), // setup/live/paused/completed
  gameFormat: text("game_format").notNull().default('quarters'), // quarters/halves
  periodLength: integer("period_length").notNull().default(10), // minutes
  currentPeriod: integer("current_period").notNull().default(1),
  venue: text("venue"),
  gameDate: text("game_date"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const gameEvents = pgTable("game_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameId: varchar("game_id").notNull(),
  playerId: varchar("player_id"),
  teamId: varchar("team_id").notNull(),
  eventType: text("event_type").notNull(),
  quarter: integer("quarter").notNull(),
  gameClockSeconds: integer("game_clock_seconds"),
  courtX: real("court_x"),
  courtY: real("court_y"),
  shotResult: text("shot_result"), // made/missed/null
  assistPlayerId: varchar("assist_player_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  isDeleted: boolean("is_deleted").default(false),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertTeamSchema = createInsertSchema(teams).omit({ id: true, createdAt: true });
export const insertPlayerSchema = createInsertSchema(players).omit({ id: true, createdAt: true });
export const insertGameSchema = createInsertSchema(games).omit({ id: true, createdAt: true, currentPeriod: true });
export const insertGameEventSchema = createInsertSchema(gameEvents).omit({ id: true, createdAt: true, isDeleted: true });

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teams.$inferSelect;
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof players.$inferSelect;
export type InsertGame = z.infer<typeof insertGameSchema>;
export type Game = typeof games.$inferSelect;
export type InsertGameEvent = z.infer<typeof insertGameEventSchema>;
export type GameEvent = typeof gameEvents.$inferSelect;

// Box score stat type
export interface PlayerBoxScore {
  playerId: string;
  playerName: string;
  playerNumber: number;
  minutes: number;
  points: number;
  fgm: number;
  fga: number;
  threePm: number;
  threePa: number;
  ftm: number;
  fta: number;
  oreb: number;
  dreb: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  to: number;
  pf: number;
  plusMinus: number;
}

export interface TeamBoxScore {
  teamId: string;
  teamName: string;
  players: PlayerBoxScore[];
  totals: Omit<PlayerBoxScore, 'playerId' | 'playerName' | 'playerNumber'>;
}
