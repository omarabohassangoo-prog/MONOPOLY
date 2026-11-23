process.env.MANOPOLY_DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';

let server: Server;
let baseUrl = '';

before(async () => {
  const { app } = await import('../http/app.ts');
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function jsonReq(path: string, init: RequestInit = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const data = await res.json();
  return { status: res.status, data };
}

describe('Integrated Manopoly HTTP API', () => {
  it('serves health and readiness endpoints', async () => {
    const h = await jsonReq('/health');
    assert.equal(h.status, 200);
    assert.equal(h.data.ok, true);

    const r = await jsonReq('/health/ready');
    assert.equal(r.status, 200);
    assert.equal(r.data.database, true);
  });

  it('registers, logs in, creates a room, joins by code, starts, and rejects duplicate action IDs', async () => {
    const reg = await jsonReq('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: 'player1@example.com',
        username: 'player_one',
        password: 'SuperStrongPassword123',
      }),
    });
    assert.equal(reg.status, 201);
    assert.ok(reg.data.accessToken);

    const login = await jsonReq('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        login: 'player_one',
        password: 'SuperStrongPassword123',
      }),
    });
    assert.equal(login.status, 200);

    const created = await jsonReq('/api/games', {
      method: 'POST',
      headers: { Authorization: `Bearer ${login.data.accessToken}` },
      body: JSON.stringify({ name: 'HostPlayer', settings: { maxPlayers: 4 } }),
    });
    assert.equal(created.status, 201);
    const gameId = created.data.game.id as string;
    const roomCode = created.data.game.code as string;
    const hostId = created.data.player.id as string;
    const hostToken = created.data.player.token as string;
    assert.equal(created.data.game.players[0].token, undefined);

    const listed = await jsonReq('/api/games');
    assert.equal(listed.status, 200);
    assert.ok(listed.data.games.some((g: { id: string }) => g.id === gameId));

    const joined = await jsonReq(`/api/games/${roomCode}/join`, {
      method: 'POST',
      body: JSON.stringify({ name: 'GuestPlayer' }),
    });
    assert.equal(joined.status, 200);
    const guestToken = joined.data.player.token as string;

    const nonHostStart = await jsonReq(`/api/games/${gameId}/start`, {
      method: 'POST',
      headers: {
        'x-player-token': guestToken,
        'x-action-id': randomUUID(),
      },
      body: JSON.stringify({}),
    });
    assert.equal(nonHostStart.status, 400);
    assert.equal(nonHostStart.data.error, 'HOST_ONLY');

    const startActionId = randomUUID();
    const started = await jsonReq(`/api/games/${gameId}/start`, {
      method: 'POST',
      headers: {
        'x-player-token': hostToken,
        'x-action-id': startActionId,
      },
      body: JSON.stringify({}),
    });
    assert.equal(started.status, 200);
    assert.equal(started.data.state.status, 'ACTIVE');

    const dup = await jsonReq(`/api/games/${gameId}/start`, {
      method: 'POST',
      headers: {
        'x-player-token': hostToken,
        'x-action-id': startActionId,
      },
      body: JSON.stringify({}),
    });
    assert.equal(dup.status, 409);
    assert.equal(dup.data.error, 'DUPLICATE_ACTION');

    const activePlayerId = started.data.state.players[started.data.state.currentPlayerIndex].id;
    const activeToken = activePlayerId === hostId ? hostToken : guestToken;
    const rolled = await jsonReq(`/api/games/${gameId}/roll`, {
      method: 'POST',
      headers: {
        'x-player-token': activeToken,
        'x-action-id': randomUUID(),
      },
      body: JSON.stringify({}),
    });
    assert.equal(rolled.status, 200);
    assert.ok(rolled.data.state.lastDice.total >= 2);

    const tx = await jsonReq(`/api/games/${gameId}/transactions`, {
      headers: { 'x-player-token': activeToken },
    });
    assert.equal(tx.status, 200);
    assert.ok(Array.isArray(tx.data.transactions));

    const left = await jsonReq(`/api/games/${gameId}/leave`, {
      method: 'POST',
      headers: {
        'x-player-token': guestToken,
        'x-action-id': randomUUID(),
      },
      body: JSON.stringify({}),
    });
    assert.equal(left.status, 200);
    assert.equal(left.data.state.status, 'FINISHED');
  });

  it('supports auth /me, refresh token rotation, and logout revocation', async () => {
    const reg = await jsonReq('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: 'player2@example.com',
        username: 'player_two',
        password: 'AnotherStrongPassword123',
      }),
    });
    assert.equal(reg.status, 201);
    assert.ok(reg.data.refreshToken);

    const me = await jsonReq('/api/auth/me', {
      headers: { Authorization: `Bearer ${reg.data.accessToken}` },
    });
    assert.equal(me.status, 200);
    assert.equal(me.data.user.username, 'player_two');

    const refreshed = await jsonReq('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: reg.data.refreshToken }),
    });
    assert.equal(refreshed.status, 200);
    assert.ok(refreshed.data.accessToken);
    assert.notEqual(refreshed.data.refreshToken, reg.data.refreshToken);

    // Replaying revoked refresh token fails
    const replay = await jsonReq('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: reg.data.refreshToken }),
    });
    assert.equal(replay.status, 401);

    const out = await jsonReq('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: refreshed.data.refreshToken }),
    });
    assert.equal(out.status, 200);

    const afterLogout = await jsonReq('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: refreshed.data.refreshToken }),
    });
    assert.equal(afterLogout.status, 401);
  });
});
