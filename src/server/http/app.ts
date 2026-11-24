import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import bcrypt from 'bcryptjs';
import { GameEngine } from '../engine/game-engine.ts';
import { GameRepository } from '../repositories/game.repository.ts';
import { UserRepository } from '../repositories/user.repository.ts';
import { AuctionService } from '../services/auction.service.ts';
import { TradeService } from '../services/trade.service.ts';
import { BuildingService } from '../services/building.service.ts';
import { MortgageService } from '../services/mortgage.service.ts';
import { CardsService } from '../services/cards.service.ts';
import { DomainError, invariant } from '../domain/errors.ts';
import { checkDbHealth } from '../infra/db.ts';
import { signAccess, verifyAccess } from '../auth/tokens.ts';
import { env } from '../config/env.ts';
import { emitGameUpdate, sanitizePublicState } from '../socket/socket.ts';
import type { GameState, Player } from '../domain/types.ts';

export const app = express();
app.set('trust proxy', 1);

const engine = new GameEngine();
const repo = new GameRepository();
const userRepo = new UserRepository();
const auction = new AuctionService();
const trade = new TradeService();
const building = new BuildingService();
const mortgage = new MortgageService();
const cards = new CardsService(engine);

const allowedOrigins = [env.CLIENT_ORIGIN, env.APP_URL]
  .flatMap((v) => v.split(','))
  .map((v) => v.trim())
  .filter((v) => v && v !== '*');

// Allow iframe embedding and Vite dev scripts while keeping standard security headers
app.use(
  helmet({
    contentSecurityPolicy: false,
    frameguard: false,
    crossOriginEmbedderPolicy: false,
  })
);
if (allowedOrigins.length > 0) {
  app.use(cors({ origin: allowedOrigins, credentials: true }));
}
app.use(express.json({ limit: '256kb' }));

const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
const authRateLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const refreshCookieName = 'manopoly_refresh';
const refreshCookieMaxAge = 14 * 24 * 60 * 60 * 1000;

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/api/auth',
    maxAge: refreshCookieMaxAge,
  };
}

function readRefreshCookie(req: Request): string | undefined {
  const cookieHeader = req.header('cookie');
  if (!cookieHeader) return undefined;
  for (const pair of cookieHeader.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 0 || pair.slice(0, separator).trim() !== refreshCookieName) continue;
    const value = pair.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

app.use('/api', apiLimiter);

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'manopoly-integrated', time: new Date().toISOString() });
});

app.get('/health/ready', async (_req, res) => {
  try {
    const dbOk = await checkDbHealth();
    res.json({ ok: dbOk, database: dbOk });
  } catch {
    res.status(503).json({ ok: false, database: false });
  }
});

app.post('/api/auth/register', authRateLimit, async (req, res, next) => {
  try {
    const b = z
      .object({
        email: z.string().email().max(254),
        username: z
          .string()
          .min(3)
          .max(24)
          .regex(/^[a-zA-Z0-9_]+$/),
        password: z.string().min(10).max(128),
      })
      .parse(req.body);
    const passwordHash = await bcrypt.hash(b.password, 12);
    const user = await userRepo.create(b.email, b.username, passwordHash);
    const refreshToken = await userRepo.issueRefreshToken(user.id);
    res.cookie(refreshCookieName, refreshToken, refreshCookieOptions());
    res.status(201).json({
      user: { id: user.id, email: user.email, username: user.username },
      accessToken: signAccess(user.id),
    });
  } catch (e) {
    next(e);
  }
});

app.post('/api/auth/login', authRateLimit, async (req, res, next) => {
  try {
    const b = z
      .object({
        login: z.string().min(1),
        password: z.string().min(1),
      })
      .parse(req.body);
    const user = await userRepo.findByLogin(b.login);
    if (
      !user ||
      user.status !== 'ACTIVE' ||
      !(await bcrypt.compare(b.password, user.passwordHash))
    ) {
      throw new DomainError('INVALID_CREDENTIALS', 'Invalid login or password', 401);
    }
    const refreshToken = await userRepo.issueRefreshToken(user.id);
    res.cookie(refreshCookieName, refreshToken, refreshCookieOptions());
    res.json({
      user: { id: user.id, email: user.email, username: user.username },
      accessToken: signAccess(user.id),
    });
  } catch (e) {
    next(e);
  }
});

app.get('/api/auth/me', async (req, res, next) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      throw new DomainError('UNAUTHORIZED', 'Bearer access token required', 401);
    }
    const user = await userRepo.findById(userId);
    if (!user) {
      throw new DomainError('UNAUTHORIZED', 'User not found', 401);
    }
    res.json({ user: { id: user.id, email: user.email, username: user.username } });
  } catch (e) {
    next(e);
  }
});

app.post('/api/auth/refresh', authRateLimit, async (req, res, next) => {
  try {
    const refreshToken = readRefreshCookie(req);
    if (!refreshToken) {
      throw new DomainError('INVALID_REFRESH_TOKEN', 'Refresh token is missing or expired', 401);
    }
    const rotated = await userRepo.rotateRefreshToken(refreshToken);
    res.cookie(refreshCookieName, rotated.refreshToken, refreshCookieOptions());
    res.json({
      user: { id: rotated.user.id, email: rotated.user.email, username: rotated.user.username },
      accessToken: signAccess(rotated.user.id),
    });
  } catch (e) {
    next(e);
  }
});

app.post('/api/auth/logout', async (req, res, next) => {
  try {
    const refreshToken = readRefreshCookie(req);
    if (refreshToken) await userRepo.revokeRefreshToken(refreshToken);
    const { maxAge: _maxAge, ...clearOptions } = refreshCookieOptions();
    res.clearCookie(refreshCookieName, clearOptions);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function safeEqual(storedHash: string, rawToken: string): boolean {
  try {
    const storedBuf = Buffer.from(storedHash, 'hex');
    const candidateBuf = createHash('sha256').update(rawToken).digest();
    return storedBuf.length === candidateBuf.length && timingSafeEqual(storedBuf, candidateBuf);
  } catch {
    return false;
  }
}

function actorFor(s: GameState, req: Request): Player {
  const token = String(req.header('x-player-token') ?? '');
  if (!token) {
    throw new DomainError('PLAYER_TOKEN_REQUIRED', 'x-player-token header is required', 401);
  }
  const actor = s.players.find((p) => safeEqual(p.token, token));
  if (!actor) {
    throw new DomainError('INVALID_PLAYER_TOKEN', 'Invalid player token', 401);
  }
  return actor;
}

function publicResult(result: unknown, state: GameState) {
  if (result === state) return { updated: true };
  if (result && typeof result === 'object' && 'state' in result && (result as any).state === state) {
    return { ...(result as Record<string, unknown>), state: sanitizePublicState(state) };
  }
  return result;
}

async function resolveUserId(req: Request): Promise<string | undefined> {
  const header = String(req.header('authorization') ?? '');
  if (!header) return undefined;
  if (!header.startsWith('Bearer ')) {
    throw new DomainError('INVALID_AUTHORIZATION', 'Use Bearer access token', 401);
  }
  try {
    const payload = verifyAccess(header.slice(7));
    if (!payload.sub || payload.type !== 'access') {
      throw new Error('invalid access token');
    }
    const user = await userRepo.findById(String(payload.sub));
    if (!user || user.status !== 'ACTIVE') {
      throw new Error('inactive user');
    }
    return user.id;
  } catch {
    throw new DomainError('INVALID_ACCESS_TOKEN', 'Access token is invalid or expired', 401);
  }
}

app.post('/api/games', async (req, res, next) => {
  try {
    const b = z
      .object({
        name: z.string().trim().min(2).max(24),
        settings: z
          .object({
            maxPlayers: z.number().int().min(2).max(8).optional(),
            freeParkingPot: z.boolean().optional(),
            auctionOnDecline: z.boolean().optional(),
            turnTimeoutSeconds: z.number().int().min(30).max(600).optional(),
            allowSpectators: z.boolean().optional(),
          })
          .optional(),
      })
      .parse(req.body);

    const userId = await resolveUserId(req);
    const id = randomUUID();
    const playerToken = randomBytes(32).toString('base64url');
    const player: Player = {
      id,
      userId,
      name: b.name,
      token: tokenHash(playerToken),
      color: '#2563eb',
      cash: 1500,
      position: 0,
      status: 'ACTIVE',
      jailTurns: 0,
      getOutOfJailCards: 0,
    };

    const code = randomBytes(3).toString('hex').toUpperCase();
    const state = engine.create(code, player, b.settings);
    await repo.create(state, userId ?? id, state.settings);

    res.status(201).json({
      game: sanitizePublicState(state),
      player: { id, token: playerToken },
    });
  } catch (e) {
    next(e);
  }
});

app.get('/api/games', async (_req, res, next) => {
  try {
    const [waitingGames, activeGames] = await Promise.all([
      repo.listOpen('WAITING'),
      repo.listOpen('ACTIVE'),
    ]);
    res.json({
      games: waitingGames,
      activeSpectatableGames: activeGames,
    });
  } catch (e) {
    next(e);
  }
});

app.get('/api/games/:id', async (req, res, next) => {
  try {
    const g = await repo.get(req.params.id!);
    if (!g) return res.status(404).json({ error: 'GAME_NOT_FOUND' });
    const state = g.state;
    if (!state.settings?.allowSpectators) actorFor(state, req);
    res.json({ game: sanitizePublicState(state) });
  } catch (e) {
    next(e);
  }
});

app.get('/api/games/:id/events', async (req, res, next) => {
  try {
    const g = await repo.get(req.params.id!);
    if (!g) return res.status(404).json({ error: 'GAME_NOT_FOUND' });
    const state = g.state;
    if (!state.settings?.allowSpectators) actorFor(state, req);
    const after = Number(req.query.after ?? 0);
    if (!Number.isInteger(after) || after < 0) {
      throw new DomainError('INVALID_SEQUENCE', 'after must be a non-negative integer');
    }
    res.json({ events: await repo.listEvents(g.id, after) });
  } catch (e) {
    next(e);
  }
});

app.get('/api/games/:id/transactions', async (req, res, next) => {
  try {
    const g = await repo.get(req.params.id!);
    if (!g) return res.status(404).json({ error: 'GAME_NOT_FOUND' });
    const state = g.state;
    if (!state.settings?.allowSpectators) actorFor(state, req);
    res.json({ transactions: await repo.listTransactions(g.id) });
  } catch (e) {
    next(e);
  }
});

app.post('/api/games/:id/join', async (req, res, next) => {
  try {
    const g = await repo.get(req.params.id!);
    if (!g || !g.state) return res.status(404).json({ error: 'GAME_NOT_FOUND' });

    const b = z.object({ name: z.string().trim().min(2).max(24) }).parse(req.body);
    const s = g.state;
    const userId = await resolveUserId(req);
    const id = randomUUID();
    const token = randomBytes(32).toString('base64url');
    const colors = [
      '#2563eb',
      '#dc2626',
      '#16a34a',
      '#9333ea',
      '#ea580c',
      '#0891b2',
      '#be123c',
      '#a16207',
    ];

    engine.addPlayer(s, {
      id,
      userId,
      name: b.name,
      token: tokenHash(token),
      color: colors[s.players.length % colors.length]!,
      cash: s.settings.startingCash,
      position: 0,
      status: 'ACTIVE',
      jailTurns: 0,
      getOutOfJailCards: 0,
    });

    await repo.save(s, g.version);
    const pub = sanitizePublicState(s);
    emitGameUpdate(g.id, pub);
    res.json({ game: pub, player: { id, token } });
  } catch (e) {
    next(e);
  }
});

const mutate = async (
  req: Request,
  res: Response,
  next: NextFunction,
  fn: (s: GameState, actor: Player) => unknown
) => {
  try {
    const g = await repo.get(req.params.id!);
    if (!g || !g.state) return res.status(404).json({ error: 'GAME_NOT_FOUND' });

    const s = g.state;
    const actor = actorFor(s, req);
    const actionId = String(req.header('x-action-id') ?? '');
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actionId)
    ) {
      throw new DomainError('ACTION_ID_REQUIRED', 'Provide a unique UUID in x-action-id', 400);
    }

    if ((s.processedActionIds ?? []).includes(actionId)) {
      return res.status(409).json({
        error: 'DUPLICATE_ACTION',
        message: 'This action was already processed',
        state: sanitizePublicState(s),
      });
    }

    const out = fn(s, actor);
    s.processedActionIds ??= [];
    s.processedActionIds.push(actionId);
    if (s.processedActionIds.length > 200) {
      s.processedActionIds.splice(0, s.processedActionIds.length - 200);
    }

    await repo.save(s, g.version);
    const pub = sanitizePublicState(s);
    emitGameUpdate(g.id, pub);
    res.json({ result: publicResult(out, s), state: pub });
  } catch (e) {
    next(e);
  }
};

app.post('/api/games/:id/start', (req, res, next) =>
  mutate(req, res, next, (s, a) => {
    invariant(s.players[0]?.id === a.id, 'HOST_ONLY', 'Only the room host may start');
    return engine.start(s);
  })
);
app.post('/api/games/:id/roll', (req, res, next) =>
  mutate(req, res, next, (s, a) => engine.roll(s, a.id))
);
app.post('/api/games/:id/buy', (req, res, next) =>
  mutate(req, res, next, (s, a) => engine.buy(s, a.id))
);
app.post('/api/games/:id/decline-purchase', (req, res, next) =>
  mutate(req, res, next, (s, a) => engine.declinePurchase(s, a.id))
);
app.post('/api/games/:id/pay-rent', (req, res, next) =>
  mutate(req, res, next, (s, a) => engine.settleRent(s, a.id))
);
app.post('/api/games/:id/pay-tax', (req, res, next) =>
  mutate(req, res, next, (s, a) => engine.settleTax(s, a.id))
);
app.post('/api/games/:id/declare-bankruptcy', (req, res, next) =>
  mutate(req, res, next, (s, a) => engine.declareBankruptcy(s, a.id))
);
app.post('/api/games/:id/pay-jail', (req, res, next) =>
  mutate(req, res, next, (s, a) => engine.payJail(s, a.id))
);
app.post('/api/games/:id/use-jail-card', (req, res, next) =>
  mutate(req, res, next, (s, a) => engine.useJailCard(s, a.id))
);
app.post('/api/games/:id/end-turn', (req, res, next) =>
  mutate(req, res, next, (s, a) => engine.endTurn(s, a.id))
);
app.post('/api/games/:id/leave', (req, res, next) =>
  mutate(req, res, next, (s, a) => engine.leaveGame(s, a.id))
);
app.post('/api/games/:id/resolve-mortgage', (req, res, next) =>
  mutate(req, res, next, (s, a) => {
    const b = z
      .object({
        squareId: z.number().int().min(0).max(39),
        unmortgageNow: z.boolean(),
      })
      .parse(req.body);
    return engine.resolveTransferredMortgage(s, a.id, b.squareId, b.unmortgageNow);
  })
);

app.post('/api/games/:id/auction/bid', (req, res, next) =>
  mutate(req, res, next, (s, a) => {
    const b = z.object({ amount: z.number().int().positive() }).parse(req.body);
    const result = auction.bid(s, a.id, b.amount);
    if (auction.isComplete(s)) {
      return auction.close(s);
    }
    return result;
  })
);
app.post('/api/games/:id/auction/pass', (req, res, next) =>
  mutate(req, res, next, (s, a) => {
    const complete = auction.pass(s, a.id);
    if (complete) {
      return auction.close(s);
    }
    return { complete: false };
  })
);
app.post('/api/games/:id/auction/close', (req, res, next) =>
  mutate(req, res, next, (s) => auction.close(s))
);

app.post('/api/games/:id/trade/propose', (req, res, next) =>
  mutate(req, res, next, (s, a) => {
    const b = z
      .object({
        toId: z.string(),
        cashFrom: z.number().int().nonnegative(),
        cashTo: z.number().int().nonnegative(),
        assetsFrom: z.array(z.number().int().min(0).max(39)),
        assetsTo: z.array(z.number().int().min(0).max(39)),
      })
      .parse(req.body);
    return trade.propose(s, a.id, b.toId, b);
  })
);
app.post('/api/games/:id/trade/respond', (req, res, next) =>
  mutate(req, res, next, (s, a) => {
    const b = z.object({ accept: z.boolean() }).parse(req.body);
    return trade.respond(s, a.id, b.accept);
  })
);

app.post('/api/games/:id/build', (req, res, next) =>
  mutate(req, res, next, (s, a) => {
    const b = z.object({ squareId: z.number().int().min(0).max(39) }).parse(req.body);
    return building.build(s, a.id, b.squareId);
  })
);
app.post('/api/games/:id/sell-building', (req, res, next) =>
  mutate(req, res, next, (s, a) => {
    const b = z.object({ squareId: z.number().int().min(0).max(39) }).parse(req.body);
    return building.sell(s, a.id, b.squareId);
  })
);
app.post('/api/games/:id/mortgage', (req, res, next) =>
  mutate(req, res, next, (s, a) => {
    const b = z.object({ squareId: z.number().int().min(0).max(39) }).parse(req.body);
    return mortgage.mortgage(s, a.id, b.squareId);
  })
);
app.post('/api/games/:id/unmortgage', (req, res, next) =>
  mutate(req, res, next, (s, a) => {
    const b = z.object({ squareId: z.number().int().min(0).max(39) }).parse(req.body);
    return mortgage.unmortgage(s, a.id, b.squareId);
  })
);
app.post('/api/games/:id/draw-card', (req, res, next) =>
  mutate(req, res, next, (s, a) => {
    const b = z.object({ deck: z.enum(['CHANCE', 'COMMUNITY']) }).parse(req.body);
    return cards.draw(s, a, b.deck);
  })
);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof DomainError) {
    return res.status(err.status).json({ error: err.code, message: err.message });
  }
  if (err instanceof z.ZodError) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', details: z.flattenError(err) });
  }
  if (err instanceof Error && err.message === 'GAME_VERSION_CONFLICT') {
    return res.status(409).json({
      error: 'GAME_VERSION_CONFLICT',
      message: 'Game changed concurrently; reload the latest state',
    });
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: env.NODE_ENV === 'production' ? 'Unexpected error' : message,
  });
});
