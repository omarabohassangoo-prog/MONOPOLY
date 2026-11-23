import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { env } from '../config/env.ts';

let instance: DatabaseSync | null = null;

function initSchema(db: DatabaseSync): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id, expires_at);

    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'WAITING',
      host_id TEXT NOT NULL,
      settings TEXT NOT NULL,
      state TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_games_status_created ON games(status, created_at);

    CREATE TABLE IF NOT EXISTS game_players (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      display_name TEXT NOT NULL,
      token TEXT NOT NULL,
      color TEXT NOT NULL,
      cash INTEGER NOT NULL DEFAULT 1500,
      position INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      jail_turns INTEGER NOT NULL DEFAULT 0,
      get_out_of_jail_cards INTEGER NOT NULL DEFAULT 0,
      order_index INTEGER NOT NULL,
      UNIQUE(game_id, order_index)
    );
    CREATE INDEX IF NOT EXISTS idx_game_players_game_status ON game_players(game_id, status);

    CREATE TABLE IF NOT EXISTS owned_properties (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL REFERENCES game_players(id) ON DELETE CASCADE,
      square_id INTEGER NOT NULL,
      houses INTEGER NOT NULL DEFAULT 0,
      hotels INTEGER NOT NULL DEFAULT 0,
      mortgaged INTEGER NOT NULL DEFAULT 0,
      UNIQUE(game_id, square_id)
    );
    CREATE INDEX IF NOT EXISTS idx_owned_properties_player ON owned_properties(player_id);

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      actor_id TEXT,
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_transactions_game_created ON transactions(game_id, created_at);

    CREATE TABLE IF NOT EXISTS game_events (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      sequence INTEGER NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(game_id, sequence)
    );
    CREATE INDEX IF NOT EXISTS idx_game_events_game_created ON game_events(game_id, created_at);
  `);
}

export function getDb(): DatabaseSync {
  if (!instance) {
    const dbPath = env.MANOPOLY_DB_PATH;
    if (dbPath !== ':memory:') {
      const resolved = path.resolve(process.cwd(), dbPath);
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      instance = new DatabaseSync(resolved);
    } else {
      instance = new DatabaseSync(':memory:');
    }
    initSchema(instance);
  }
  return instance;
}

export function runInTransaction<T>(fn: (db: DatabaseSync) => T): T {
  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn(db);
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Ignore rollback errors if transaction already aborted
    }
    throw err;
  }
}

export function checkDbHealth(): boolean {
  const db = getDb();
  const row = db.prepare('SELECT 1 AS ok').get() as { ok: number } | undefined;
  return row?.ok === 1;
}
