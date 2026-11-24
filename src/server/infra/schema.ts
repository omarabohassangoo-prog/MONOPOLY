import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

const timestampColumn = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    username: text('username').notNull(),
    passwordHash: text('password_hash').notNull(),
    status: text('status').notNull().default('ACTIVE'),
    createdAt: timestampColumn('created_at').notNull(),
    updatedAt: timestampColumn('updated_at').notNull(),
  },
  (table) => [uniqueIndex('users_email_unique').on(table.email), uniqueIndex('users_username_unique').on(table.username)]
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: text('id').primaryKey(),
    tokenHash: text('token_hash').notNull(),
    userId: text('user_id').notNull(),
    expiresAt: timestampColumn('expires_at').notNull(),
    revokedAt: timestampColumn('revoked_at'),
    createdAt: timestampColumn('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('refresh_tokens_token_hash_unique').on(table.tokenHash),
    index('idx_refresh_tokens_user').on(table.userId, table.expiresAt),
  ]
);

export const games = pgTable(
  'games',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull(),
    status: text('status').notNull().default('WAITING'),
    hostId: text('host_id').notNull(),
    settings: jsonb('settings').notNull(),
    state: jsonb('state').notNull(),
    version: integer('version').notNull().default(0),
    createdAt: timestampColumn('created_at').notNull(),
    updatedAt: timestampColumn('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('games_code_unique').on(table.code),
    index('idx_games_status_created').on(table.status, table.createdAt),
  ]
);

export const gamePlayers = pgTable(
  'game_players',
  {
    id: text('id').primaryKey(),
    gameId: text('game_id').notNull(),
    userId: text('user_id'),
    displayName: text('display_name').notNull(),
    token: text('token').notNull(),
    color: text('color').notNull(),
    cash: integer('cash').notNull().default(1500),
    position: integer('position').notNull().default(0),
    status: text('status').notNull().default('ACTIVE'),
    jailTurns: integer('jail_turns').notNull().default(0),
    getOutOfJailCards: integer('get_out_of_jail_cards').notNull().default(0),
    orderIndex: integer('order_index').notNull(),
  },
  (table) => [
    uniqueIndex('game_players_game_order_unique').on(table.gameId, table.orderIndex),
    index('idx_game_players_game_status').on(table.gameId, table.status),
  ]
);

export const ownedProperties = pgTable(
  'owned_properties',
  {
    id: text('id').primaryKey(),
    gameId: text('game_id').notNull(),
    playerId: text('player_id').notNull(),
    squareId: integer('square_id').notNull(),
    houses: integer('houses').notNull().default(0),
    hotels: integer('hotels').notNull().default(0),
    mortgaged: integer('mortgaged').notNull().default(0),
  },
  (table) => [
    uniqueIndex('owned_properties_game_square_unique').on(table.gameId, table.squareId),
    index('idx_owned_properties_player').on(table.playerId),
  ]
);

export const transactions = pgTable(
  'transactions',
  {
    id: text('id').primaryKey(),
    gameId: text('game_id').notNull(),
    actorId: text('actor_id'),
    type: text('type').notNull(),
    amount: integer('amount').notNull(),
    details: jsonb('details').notNull(),
    createdAt: timestampColumn('created_at').notNull(),
  },
  (table) => [index('idx_transactions_game_created').on(table.gameId, table.createdAt)]
);

export const gameEvents = pgTable(
  'game_events',
  {
    id: text('id').primaryKey(),
    gameId: text('game_id').notNull(),
    sequence: integer('sequence').notNull(),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: timestampColumn('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('game_events_game_sequence_unique').on(table.gameId, table.sequence),
    index('idx_game_events_game_created').on(table.gameId, table.createdAt),
  ]
);
