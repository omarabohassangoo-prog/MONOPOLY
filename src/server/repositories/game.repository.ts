import { randomUUID } from 'crypto';
import { getDb, runInTransaction } from '../infra/db.ts';
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

export class GameRepository {
  create(state: GameState, hostId: string, settings: unknown = {}): StoredGameRow {
    return runInTransaction((db) => {
      const now = new Date().toISOString();
      const snapshotJson = JSON.stringify(state);
      const settingsJson = JSON.stringify(settings);

      db.prepare(
        `INSERT INTO games (id, code, status, host_id, settings, state, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        state.id,
        state.code,
        state.status,
        hostId,
        settingsJson,
        snapshotJson,
        state.version,
        now,
        now
      );

      const insertPlayer = db.prepare(
        `INSERT INTO game_players (
          id, game_id, user_id, display_name, token, color, cash, position, status, jail_turns, get_out_of_jail_cards, order_index
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      state.players.forEach((p, i) => {
        insertPlayer.run(
          p.id,
          state.id,
          p.userId ?? null,
          p.name,
          p.token,
          p.color,
          p.cash,
          p.position,
          p.status,
          p.jailTurns,
          p.getOutOfJailCards,
          i
        );
      });

      if (state.log.length > 0) {
        const insertEvent = db.prepare(
          `INSERT INTO game_events (id, game_id, sequence, type, payload, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        );
        state.log.forEach((event, i) => {
          insertEvent.run(
            randomUUID(),
            state.id,
            i + 1,
            event.type,
            JSON.stringify({ message: event.message, data: event.data, at: event.at }),
            now
          );
        });
      }

      return {
        id: state.id,
        code: state.code,
        status: state.status,
        hostId,
        settings,
        state,
        version: state.version,
        createdAt: now,
        updatedAt: now,
      };
    });
  }

  get(idOrCode: string): StoredGameRow | null {
    const db = getDb();
    const row = db
      .prepare(
        `SELECT id, code, status, host_id AS hostId, settings, state, version, created_at AS createdAt, updated_at AS updatedAt
         FROM games
         WHERE id = ? OR UPPER(code) = UPPER(?)
         LIMIT 1`
      )
      .get(idOrCode, idOrCode) as
      | {
          id: string;
          code: string;
          status: string;
          hostId: string;
          settings: string;
          state: string;
          version: number;
          createdAt: string;
          updatedAt: string;
        }
      | undefined;

    if (!row) return null;
    return {
      id: row.id,
      code: row.code,
      status: row.status,
      hostId: row.hostId,
      settings: JSON.parse(row.settings),
      state: JSON.parse(row.state) as GameState,
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  save(state: GameState, expectedVersion: number): StoredGameRow | null {
    state.version = expectedVersion + 1;
    return runInTransaction((db) => {
      const current = db
        .prepare(`SELECT state FROM games WHERE id = ?`)
        .get(state.id) as { state: string } | undefined;
      if (!current) throw new Error('GAME_NOT_FOUND');

      const oldState = JSON.parse(current.state) as Partial<GameState>;
      const oldSeq = Number(oldState.eventSequence ?? 0);
      const newSeq = Number(state.eventSequence ?? 0);
      const now = new Date().toISOString();

      const updateRes = db
        .prepare(
          `UPDATE games SET state = ?, status = ?, version = ?, updated_at = ?
           WHERE id = ? AND version = ?`
        )
        .run(JSON.stringify(state), state.status, expectedVersion + 1, now, state.id, expectedVersion);

      if (updateRes.changes !== 1) {
        throw new Error('GAME_VERSION_CONFLICT');
      }

      db.prepare(`DELETE FROM owned_properties WHERE game_id = ?`).run(state.id);
      db.prepare(`DELETE FROM game_players WHERE game_id = ?`).run(state.id);

      const insertPlayer = db.prepare(
        `INSERT INTO game_players (
          id, game_id, user_id, display_name, token, color, cash, position, status, jail_turns, get_out_of_jail_cards, order_index
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      state.players.forEach((p, i) => {
        insertPlayer.run(
          p.id,
          state.id,
          p.userId ?? null,
          p.name,
          p.token,
          p.color,
          p.cash,
          p.position,
          p.status,
          p.jailTurns,
          p.getOutOfJailCards,
          i
        );
      });

      if (state.assets.length > 0) {
        const insertAsset = db.prepare(
          `INSERT INTO owned_properties (id, game_id, player_id, square_id, houses, hotels, mortgaged)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        );
        for (const a of state.assets) {
          insertAsset.run(
            randomUUID(),
            state.id,
            a.ownerId,
            a.squareId,
            a.houses,
            a.hotels,
            a.mortgaged ? 1 : 0
          );
        }
      }

      const eventDelta = Math.max(0, newSeq - oldSeq);
      const newEvents = eventDelta > 0 ? state.log.slice(-Math.min(1000, eventDelta)) : [];
      if (newEvents.length > 0) {
        const firstSeq = newSeq - newEvents.length + 1;
        const insertEvent = db.prepare(
          `INSERT INTO game_events (id, game_id, sequence, type, payload, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        );
        const insertTx = db.prepare(
          `INSERT INTO transactions (id, game_id, actor_id, type, amount, details, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        );

        newEvents.forEach((event, i) => {
          insertEvent.run(
            randomUUID(),
            state.id,
            firstSeq + i,
            event.type,
            JSON.stringify({ message: event.message, data: event.data, at: event.at }),
            now
          );

          const d = (event.data ?? {}) as Record<string, unknown>;
          let txType: string | null = null;
          let amount = 0;
          let actorId: string | null =
            (d.playerId as string | undefined) ??
            (d.fromId as string | undefined) ??
            (d.bidderId as string | undefined) ??
            null;

          switch (event.type) {
            case 'ASSET_PURCHASED':
              txType = 'PURCHASE';
              amount = -(Number(d.price ?? 0));
              break;
            case 'AUCTION_CLOSED':
              if (d.bidderId) {
                txType = 'PURCHASE';
                actorId = String(d.bidderId);
                amount = -(Number(d.bid ?? 0));
              }
              break;
            case 'RENT':
              txType = 'RENT';
              amount = -(Number(d.amount ?? 0));
              break;
            case 'TAX_PAID':
              txType = 'TAX';
              amount = -(Number(d.amount ?? 0));
              break;
            case 'CARD_PAYMENT':
            case 'CARD_REPAIRS':
            case 'CARD_COLLECTION':
            case 'JAIL_BAIL_PAID':
              txType = 'FEE';
              amount = -(Number(d.amount ?? 0));
              break;
            case 'PASSED_GO':
            case 'FREE_PARKING_COLLECTED':
            case 'CARD_CASH_RECEIVED':
              txType = 'FEE';
              amount = Number(d.amount ?? 0);
              break;
            case 'BUILDING_BUILT':
              txType = 'BUILDING';
              amount = -(Number(d.cost ?? 0));
              break;
            case 'BUILDING_SOLD':
              txType = 'BUILDING';
              amount = Number(d.refund ?? 0);
              break;
            case 'PROPERTY_MORTGAGED':
              txType = 'MORTGAGE';
              amount = Number(d.value ?? 0);
              break;
            case 'PROPERTY_UNMORTGAGED':
              txType = 'UNMORTGAGE';
              amount = -(Number(d.cost ?? 0));
              break;
            case 'TRADE_ACCEPTED':
              txType = 'TRADE';
              break;
            case 'PLAYER_BANKRUPT':
              txType = 'BANKRUPTCY';
              break;
            default:
              break;
          }

          if (txType) {
            insertTx.run(
              randomUUID(),
              state.id,
              actorId,
              txType,
              amount,
              JSON.stringify({
                eventType: event.type,
                message: event.message,
                data: d,
                at: event.at,
              }),
              now
            );
          }
        });
      }

      return this.get(state.id);
    });
  }

  listEvents(gameId: string, afterSequence = 0) {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT id, game_id AS gameId, sequence, type, payload, created_at AS createdAt
         FROM game_events
         WHERE game_id = ? AND sequence > ?
         ORDER BY sequence ASC
         LIMIT 500`
      )
      .all(gameId, afterSequence) as {
      id: string;
      gameId: string;
      sequence: number;
      type: string;
      payload: string;
      createdAt: string;
    }[];

    return rows.map((r) => ({
      ...r,
      payload: JSON.parse(r.payload),
    }));
  }

  listTransactions(gameId: string) {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT id, game_id AS gameId, actor_id AS actorId, type, amount, details, created_at AS createdAt
         FROM transactions
         WHERE game_id = ?
         ORDER BY created_at DESC
         LIMIT 200`
      )
      .all(gameId) as {
      id: string;
      gameId: string;
      actorId: string | null;
      type: string;
      amount: number;
      details: string;
      createdAt: string;
    }[];

    return rows.map((r) => ({
      ...r,
      details: JSON.parse(r.details),
    }));
  }

  listActiveGames(): StoredGameRow[] {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT id, code, status, host_id AS hostId, settings, state, version, created_at AS createdAt, updated_at AS updatedAt
         FROM games
         WHERE status = 'ACTIVE'`
      )
      .all() as {
      id: string;
      code: string;
      status: string;
      hostId: string;
      settings: string;
      state: string;
      version: number;
      createdAt: string;
      updatedAt: string;
    }[];

    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      status: row.status,
      hostId: row.hostId,
      settings: JSON.parse(row.settings),
      state: JSON.parse(row.state) as GameState,
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  listOpen(statusFilter: 'WAITING' | 'ACTIVE' = 'WAITING') {
    const db = getDb();
    const games = db
      .prepare(
        `SELECT id, code, status, settings, created_at AS createdAt
         FROM games
         WHERE status = ?
         ORDER BY created_at DESC
         LIMIT 50`
      )
      .all(statusFilter) as {
      id: string;
      code: string;
      status: string;
      settings: string;
      createdAt: string;
    }[];

    const playerQuery = db.prepare(
      `SELECT display_name AS displayName, color, status
       FROM game_players
       WHERE game_id = ?
       ORDER BY order_index ASC`
    );

    return games
      .map((g) => {
        const settings = JSON.parse(g.settings) as {
          maxPlayers?: number;
          freeParkingPot?: boolean;
          allowSpectators?: boolean;
        };
        const players = playerQuery.all(g.id) as {
          displayName: string;
          color: string;
          status: string;
        }[];
        return {
          id: g.id,
          code: g.code,
          status: g.status,
          maxPlayers: settings.maxPlayers ?? 8,
          freeParkingPot: Boolean(settings.freeParkingPot),
          allowSpectators: settings.allowSpectators !== false,
          createdAt: g.createdAt,
          players,
        };
      })
      .filter((g) => (statusFilter === 'ACTIVE' ? g.allowSpectators : true));
  }
}
