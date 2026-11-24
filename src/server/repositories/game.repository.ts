import { randomUUID } from 'crypto';
import { and, desc, eq, gt, inArray, or } from 'drizzle-orm';
import { db, runInTransaction } from '../infra/db.ts';
import {
  gameEvents,
  gamePlayers,
  games,
  ownedProperties,
  transactions,
} from '../infra/schema.ts';
import type { GameState } from '../domain/types.ts';

export interface StoredGameRow {
  id: string;
  code: string;
  status: string;
  hostId: string;
  settings: unknown;
  state: GameState;
  version: number;
  createdAt: string;
  updatedAt: string;
}

function storedGame(row: typeof games.$inferSelect): StoredGameRow {
  return {
    ...row,
    settings: row.settings,
    state: row.state as GameState,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function playerRows(state: GameState) {
  return state.players.map((player, orderIndex) => ({
    id: player.id,
    gameId: state.id,
    userId: player.userId ?? null,
    displayName: player.name,
    token: player.token,
    color: player.color,
    cash: player.cash,
    position: player.position,
    status: player.status,
    jailTurns: player.jailTurns,
    getOutOfJailCards: player.getOutOfJailCards,
    orderIndex,
  }));
}

function eventPayload(event: GameState['log'][number]) {
  return { message: event.message, data: event.data, at: event.at };
}

export class GameRepository {
  async create(state: GameState, hostId: string, settings: unknown = {}): Promise<StoredGameRow> {
    const now = new Date();
    await runInTransaction(async (tx) => {
      await tx.insert(games).values({
        id: state.id,
        code: state.code,
        status: state.status,
        hostId,
        settings,
        state,
        version: state.version,
        createdAt: now,
        updatedAt: now,
      });
      if (state.players.length > 0) await tx.insert(gamePlayers).values(playerRows(state));
      if (state.log.length > 0) {
        await tx.insert(gameEvents).values(
          state.log.map((event, i) => ({
            id: randomUUID(),
            gameId: state.id,
            sequence: i + 1,
            type: event.type,
            payload: eventPayload(event),
            createdAt: now,
          }))
        );
      }
    });
    return {
      id: state.id,
      code: state.code,
      status: state.status,
      hostId,
      settings,
      state,
      version: state.version,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  }

  async get(idOrCode: string): Promise<StoredGameRow | null> {
    const [row] = await db
      .select()
      .from(games)
      .where(or(eq(games.id, idOrCode), eq(games.code, idOrCode.toUpperCase())))
      .limit(1);
    return row ? storedGame(row) : null;
  }

  async save(state: GameState, expectedVersion: number): Promise<StoredGameRow | null> {
    state.version = expectedVersion + 1;
    await runInTransaction(async (tx) => {
      const [current] = await tx.select().from(games).where(eq(games.id, state.id)).for('update').limit(1);
      if (!current) throw new Error('GAME_NOT_FOUND');
      if (current.version !== expectedVersion) throw new Error('GAME_VERSION_CONFLICT');

      const oldState = current.state as Partial<GameState>;
      const oldSeq = Number(oldState.eventSequence ?? 0);
      const newSeq = Number(state.eventSequence ?? 0);
      const now = new Date();
      const updated = await tx
        .update(games)
        .set({ state, status: state.status, version: expectedVersion + 1, updatedAt: now })
        .where(and(eq(games.id, state.id), eq(games.version, expectedVersion)))
        .returning({ id: games.id });
      if (updated.length !== 1) throw new Error('GAME_VERSION_CONFLICT');

      await tx.delete(ownedProperties).where(eq(ownedProperties.gameId, state.id));
      await tx.delete(gamePlayers).where(eq(gamePlayers.gameId, state.id));
      if (state.players.length > 0) await tx.insert(gamePlayers).values(playerRows(state));
      if (state.assets.length > 0) {
        await tx.insert(ownedProperties).values(
          state.assets.map((asset) => ({
            id: randomUUID(),
            gameId: state.id,
            playerId: asset.ownerId,
            squareId: asset.squareId,
            houses: asset.houses,
            hotels: asset.hotels,
            mortgaged: asset.mortgaged ? 1 : 0,
          }))
        );
      }

      const eventDelta = Math.max(0, newSeq - oldSeq);
      const newEvents = eventDelta > 0 ? state.log.slice(-Math.min(1000, eventDelta)) : [];
      if (newEvents.length > 0) {
        const firstSeq = newSeq - newEvents.length + 1;
        const eventRows = newEvents.map((event, i) => ({
          id: randomUUID(),
          gameId: state.id,
          sequence: firstSeq + i,
          type: event.type,
          payload: eventPayload(event),
          createdAt: now,
        }));
        await tx.insert(gameEvents).values(eventRows);

        const transactionRows = newEvents.flatMap((event) => {
          const d = (event.data ?? {}) as Record<string, unknown>;
          let type: string | null = null;
          let amount = 0;
          let actorId =
            (d.playerId as string | undefined) ??
            (d.fromId as string | undefined) ??
            (d.bidderId as string | undefined) ??
            null;

          switch (event.type) {
            case 'ASSET_PURCHASED':
              type = 'PURCHASE';
              amount = -Number(d.price ?? 0);
              break;
            case 'AUCTION_CLOSED':
              if (d.bidderId) {
                type = 'PURCHASE';
                actorId = String(d.bidderId);
                amount = -Number(d.bid ?? 0);
              }
              break;
            case 'RENT':
              type = 'RENT';
              amount = -Number(d.amount ?? 0);
              break;
            case 'TAX_PAID':
              type = 'TAX';
              amount = -Number(d.amount ?? 0);
              break;
            case 'CARD_PAYMENT':
            case 'CARD_REPAIRS':
            case 'CARD_COLLECTION':
            case 'JAIL_BAIL_PAID':
              type = 'FEE';
              amount = -Number(d.amount ?? 0);
              break;
            case 'PASSED_GO':
            case 'FREE_PARKING_COLLECTED':
            case 'CARD_CASH_RECEIVED':
              type = 'FEE';
              amount = Number(d.amount ?? 0);
              break;
            case 'BUILDING_BUILT':
              type = 'BUILDING';
              amount = -Number(d.cost ?? 0);
              break;
            case 'BUILDING_SOLD':
              type = 'BUILDING';
              amount = Number(d.refund ?? 0);
              break;
            case 'PROPERTY_MORTGAGED':
              type = 'MORTGAGE';
              amount = Number(d.value ?? 0);
              break;
            case 'PROPERTY_UNMORTGAGED':
              type = 'UNMORTGAGE';
              amount = -Number(d.cost ?? 0);
              break;
            case 'TRADE_ACCEPTED':
              type = 'TRADE';
              break;
            case 'PLAYER_BANKRUPT':
              type = 'BANKRUPTCY';
              break;
          }

          return type
            ? [{
                id: randomUUID(),
                gameId: state.id,
                actorId,
                type,
                amount,
                details: {
                  eventType: event.type,
                  message: event.message,
                  data: d,
                  at: event.at,
                },
                createdAt: now,
              }]
            : [];
        });
        if (transactionRows.length > 0) await tx.insert(transactions).values(transactionRows);
      }
    });
    return this.get(state.id);
  }

  async listEvents(gameId: string, afterSequence = 0) {
    const rows = await db
      .select()
      .from(gameEvents)
      .where(and(eq(gameEvents.gameId, gameId), gt(gameEvents.sequence, afterSequence)))
      .orderBy(gameEvents.sequence)
      .limit(500);
    return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  }

  async listTransactions(gameId: string) {
    const rows = await db
      .select()
      .from(transactions)
      .where(eq(transactions.gameId, gameId))
      .orderBy(desc(transactions.createdAt))
      .limit(200);
    return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  }

  async listActiveGames(): Promise<StoredGameRow[]> {
    const rows = await db.select().from(games).where(eq(games.status, 'ACTIVE'));
    return rows.map(storedGame);
  }

  async listOpen(statusFilter: 'WAITING' | 'ACTIVE' = 'WAITING') {
    const rows = await db
      .select({ id: games.id, code: games.code, status: games.status, settings: games.settings, createdAt: games.createdAt })
      .from(games)
      .where(eq(games.status, statusFilter))
      .orderBy(desc(games.createdAt))
      .limit(50);

    if (rows.length === 0) return [];
    const playerRowsResult = await db
      .select({ gameId: gamePlayers.gameId, displayName: gamePlayers.displayName, color: gamePlayers.color, status: gamePlayers.status })
      .from(gamePlayers)
      .where(inArray(gamePlayers.gameId, rows.map((row) => row.id)))
      .orderBy(gamePlayers.orderIndex);
    const playersByGame = new Map<string, typeof playerRowsResult>();
    for (const player of playerRowsResult) {
      const players = playersByGame.get(player.gameId) ?? [];
      players.push(player);
      playersByGame.set(player.gameId, players);
    }

    return rows
      .map((row) => {
        const settings = row.settings as {
          maxPlayers?: number;
          freeParkingPot?: boolean;
          allowSpectators?: boolean;
        };
        return {
          id: row.id,
          code: row.code,
          status: row.status,
          maxPlayers: settings.maxPlayers ?? 8,
          freeParkingPot: Boolean(settings.freeParkingPot),
          allowSpectators: settings.allowSpectators !== false,
          createdAt: row.createdAt.toISOString(),
          players: (playersByGame.get(row.id) ?? []).map(({ displayName, color, status }) => ({ displayName, color, status })),
        };
      })
      .filter((game) => (statusFilter === 'ACTIVE' ? game.allowSpectators : true));
  }
}
