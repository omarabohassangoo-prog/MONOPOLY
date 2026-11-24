import { sql } from 'drizzle-orm';
import { drizzle as drizzlePostgres } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import { env } from '../config/env.ts';
import * as schema from './schema.ts';

const isTest = env.NODE_ENV === 'test';
const testClient = isTest ? new PGlite() : null;
const pool = isTest ? null : new Pool({ connectionString: env.DATABASE_URL });

export const db = testClient
  ? drizzlePglite(testClient, { schema })
  : drizzlePostgres(pool!, { schema });

const testSchema = testClient
  ? testClient.exec(`
      CREATE TABLE users (
        id text PRIMARY KEY, email text NOT NULL UNIQUE, username text NOT NULL UNIQUE,
        password_hash text NOT NULL, status text NOT NULL DEFAULT 'ACTIVE',
        created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
      );
      CREATE TABLE refresh_tokens (
        id text PRIMARY KEY, token_hash text NOT NULL UNIQUE,
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL
      );
      CREATE TABLE games (
        id text PRIMARY KEY, code text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'WAITING',
        host_id text NOT NULL, settings jsonb NOT NULL, state jsonb NOT NULL,
        version integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
      );
      CREATE TABLE game_players (
        id text PRIMARY KEY, game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        user_id text REFERENCES users(id) ON DELETE SET NULL, display_name text NOT NULL,
        token text NOT NULL, color text NOT NULL, cash integer NOT NULL DEFAULT 1500,
        position integer NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'ACTIVE',
        jail_turns integer NOT NULL DEFAULT 0, get_out_of_jail_cards integer NOT NULL DEFAULT 0,
        order_index integer NOT NULL, UNIQUE(game_id, order_index)
      );
      CREATE TABLE owned_properties (
        id text PRIMARY KEY, game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        player_id text NOT NULL REFERENCES game_players(id) ON DELETE CASCADE,
        square_id integer NOT NULL, houses integer NOT NULL DEFAULT 0,
        hotels integer NOT NULL DEFAULT 0, mortgaged integer NOT NULL DEFAULT 0,
        UNIQUE(game_id, square_id)
      );
      CREATE TABLE transactions (
        id text PRIMARY KEY, game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        actor_id text, type text NOT NULL, amount integer NOT NULL,
        details jsonb NOT NULL, created_at timestamptz NOT NULL
      );
      CREATE TABLE game_events (
        id text PRIMARY KEY, game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        sequence integer NOT NULL, type text NOT NULL, payload jsonb NOT NULL,
        created_at timestamptz NOT NULL, UNIQUE(game_id, sequence)
      );
    `)
  : Promise.resolve();

export async function runInTransaction<T>(fn: (tx: any) => Promise<T> | T): Promise<T> {
  await testSchema;
  return db.transaction(async (tx) => await fn(tx));
}

export async function checkDbHealth(): Promise<boolean> {
  await testSchema;
  await db.execute(sql`SELECT 1 AS ok`);
  return true;
}

export async function closeDb(): Promise<void> {
  await testSchema;
  if (testClient) await testClient.close();
  if (pool) await pool.end();
}
