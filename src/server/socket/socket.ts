import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import { env } from '../config/env.ts';
import { GameRepository } from '../repositories/game.repository.ts';

const hash = (s: string) => createHash('sha256').update(s).digest();
let socketServer: Server | undefined;

export const emitGameUpdate = (gameId: string, state: unknown): void => {
  socketServer?.to(`game:${gameId}`).emit('game:state', state);
};

export function sanitizePublicState(s: any) {
  const copy = structuredClone(s);
  delete copy.processedActionIds;
  for (const p of copy.players ?? []) {
    delete p.token;
  }
  if (copy.cardDecks) {
    copy.cardDecks = {
      chanceCount: copy.cardDecks.chance?.length ?? 0,
      communityCount: copy.cardDecks.community?.length ?? 0,
      chanceDiscardCount: copy.cardDecks.chanceDiscard?.length ?? 0,
      communityDiscardCount: copy.cardDecks.communityDiscard?.length ?? 0,
    };
  }
  return copy;
}

async function broadcastPresence(io: Server, gameId: string) {
  try {
    const sockets = await io.in(`game:${gameId}`).fetchSockets();
    const onlineSet = new Set<string>();
    let spectatorCount = 0;
    for (const s of sockets) {
      if (s.data.isSpectator) {
        spectatorCount++;
      } else if (typeof s.data.playerId === 'string') {
        onlineSet.add(s.data.playerId);
      }
    }
    io.to(`game:${gameId}`).emit('game:presence', {
      onlinePlayerIds: Array.from(onlineSet),
      spectatorCount,
    });
  } catch {
    // Ignore transient room broadcast errors
  }
}

export const attachSocket = (server: HttpServer): Server => {
  const allowedOrigins = [env.CLIENT_ORIGIN, env.APP_URL]
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter((v) => v && v !== '*');

  const io = new Server(server, {
    cors:
      allowedOrigins.length > 0
        ? { origin: allowedOrigins, credentials: true }
        : undefined,
    maxHttpBufferSize: 64 * 1024,
  });

  const repo = new GameRepository();
  socketServer = io;

  io.use((socket, next) => {
    const token = String(socket.handshake.auth?.playerToken ?? '');
    if (token) {
      socket.data.playerTokenHash = hash(token);
    }
    next();
  });

  io.on('connection', (socket) => {
    const leaveCurrentRoom = async () => {
      const prevGameId = socket.data.joinedGameId as string | undefined;
      if (prevGameId) {
        await socket.leave(`game:${prevGameId}`);
        socket.data.joinedGameId = undefined;
        socket.data.playerId = undefined;
        socket.data.playerName = undefined;
        socket.data.playerColor = undefined;
        socket.data.isSpectator = false;
        await broadcastPresence(io, prevGameId);
      }
    };

    socket.on(
      'game:join',
      async (payload: { gameId: string }, ack?: (x: unknown) => void) => {
        try {
          if (!socket.data.playerTokenHash) {
            throw new Error('PLAYER_TOKEN_REQUIRED');
          }
          if (!payload?.gameId || typeof payload.gameId !== 'string') {
            throw new Error('INVALID_GAME_ID');
          }
          const g = repo.get(payload.gameId);
          if (!g?.state) throw new Error('GAME_NOT_FOUND');

          const s = g.state;
          const player = s.players.find((p) => {
            const stored = Buffer.from(p.token, 'hex');
            return (
              stored.length === 32 &&
              timingSafeEqual(stored, socket.data.playerTokenHash as Buffer)
            );
          });
          if (!player) throw new Error('NOT_A_GAME_MEMBER');

          await leaveCurrentRoom();
          socket.data.joinedGameId = g.id;
          socket.data.playerId = player.id;
          socket.data.playerName = player.name;
          socket.data.playerColor = player.color;
          socket.data.isSpectator = false;

          await socket.join(`game:${g.id}`);
          socket.emit('game:state', sanitizePublicState(s));
          await broadcastPresence(io, g.id);
          ack?.({ ok: true, playerId: player.id, gameId: g.id });
        } catch (e) {
          ack?.({
            ok: false,
            error: e instanceof Error ? e.message : 'JOIN_FAILED',
          });
        }
      }
    );

    socket.on(
      'game:spectate',
      async (payload: { gameId: string }, ack?: (x: unknown) => void) => {
        try {
          if (!payload?.gameId || typeof payload.gameId !== 'string') {
            throw new Error('INVALID_GAME_ID');
          }
          const g = repo.get(payload.gameId);
          if (!g?.state) throw new Error('GAME_NOT_FOUND');
          if (g.state.settings?.allowSpectators === false) {
            throw new Error('SPECTATORS_DISABLED');
          }

          await leaveCurrentRoom();
          socket.data.joinedGameId = g.id;
          socket.data.playerId = undefined;
          socket.data.playerName = undefined;
          socket.data.playerColor = undefined;
          socket.data.isSpectator = true;

          await socket.join(`game:${g.id}`);
          socket.emit('game:state', sanitizePublicState(g.state));
          await broadcastPresence(io, g.id);
          ack?.({ ok: true, gameId: g.id, spectator: true });
        } catch (e) {
          ack?.({
            ok: false,
            error: e instanceof Error ? e.message : 'SPECTATE_FAILED',
          });
        }
      }
    );

    socket.on(
      'chat:send',
      (payload: { text?: string }, ack?: (x: unknown) => void) => {
        const gameId = socket.data.joinedGameId as string | undefined;
        const playerId = socket.data.playerId as string | undefined;
        if (!gameId || socket.data.isSpectator || !playerId) {
          ack?.({ ok: false, error: 'CHAT_NOT_ALLOWED' });
          return;
        }
        const text = String(payload?.text ?? '').trim();
        if (!text || text.length > 240) {
          ack?.({ ok: false, error: 'INVALID_CHAT_MESSAGE' });
          return;
        }
        io.to(`game:${gameId}`).emit('chat:message', {
          id: randomUUID(),
          senderId: playerId,
          senderName: String(socket.data.playerName ?? 'Player'),
          senderColor: String(socket.data.playerColor ?? '#0F5132'),
          text,
          at: new Date().toISOString(),
        });
        ack?.({ ok: true });
      }
    );

    socket.on('game:leave', async (ack?: (x: unknown) => void) => {
      await leaveCurrentRoom();
      ack?.({ ok: true });
    });

    socket.on('disconnect', () => {
      const prevGameId = socket.data.joinedGameId as string | undefined;
      socket.data.joinedGameId = undefined;
      if (prevGameId) {
        void broadcastPresence(io, prevGameId);
      }
    });
  });

  return io;
};
