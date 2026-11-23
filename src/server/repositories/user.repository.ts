import { createHash, randomBytes, randomUUID } from 'crypto';
import { getDb } from '../infra/db.ts';
import { DomainError } from '../domain/errors.ts';

export interface UserRecord {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  status: 'ACTIVE' | 'BLOCKED';
}

function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export class UserRepository {
  create(email: string, username: string, passwordHash: string): UserRecord {
    const db = getDb();
    const id = randomUUID();
    const now = new Date().toISOString();
    const normalizedEmail = email.toLowerCase();
    try {
      db.prepare(
        `INSERT INTO users (id, email, username, password_hash, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)`
      ).run(id, normalizedEmail, username, passwordHash, now, now);
    } catch (err) {
      if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
        throw new DomainError('ALREADY_EXISTS', 'Email or username already exists', 409);
      }
      throw err;
    }
    return {
      id,
      email: normalizedEmail,
      username,
      passwordHash,
      status: 'ACTIVE',
    };
  }

  findByLogin(login: string): UserRecord | null {
    const db = getDb();
    const row = db
      .prepare(
        `SELECT id, email, username, password_hash AS passwordHash, status
         FROM users
         WHERE email = ? OR username = ?
         LIMIT 1`
      )
      .get(login.toLowerCase(), login) as UserRecord | undefined;
    return row ?? null;
  }

  findById(id: string): Omit<UserRecord, 'passwordHash'> | null {
    const db = getDb();
    const row = db
      .prepare(`SELECT id, email, username, status FROM users WHERE id = ? LIMIT 1`)
      .get(id) as Omit<UserRecord, 'passwordHash'> | undefined;
    return row ?? null;
  }

  issueRefreshToken(userId: string, ttlDays = 14): string {
    const db = getDb();
    const raw = randomBytes(36).toString('base64url');
    const now = new Date();
    const expires = new Date(now.getTime() + ttlDays * 86_400_000);
    db.prepare(
      `INSERT INTO refresh_tokens (id, token_hash, user_id, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(randomUUID(), hashRefreshToken(raw), userId, expires.toISOString(), now.toISOString());
    return raw;
  }

  rotateRefreshToken(rawToken: string): { user: Omit<UserRecord, 'passwordHash'>; refreshToken: string } {
    const db = getDb();
    const tokenHash = hashRefreshToken(rawToken);
    const row = db
      .prepare(
        `SELECT id, user_id AS userId, expires_at AS expiresAt, revoked_at AS revokedAt
         FROM refresh_tokens
         WHERE token_hash = ?
         LIMIT 1`
      )
      .get(tokenHash) as
      | { id: string; userId: string; expiresAt: string; revokedAt: string | null }
      | undefined;

    if (!row || row.revokedAt || Date.now() > Date.parse(row.expiresAt)) {
      throw new DomainError('INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired', 401);
    }

    const user = this.findById(row.userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new DomainError('INVALID_REFRESH_TOKEN', 'Account is inactive', 401);
    }

    db.prepare(`UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?`).run(
      new Date().toISOString(),
      row.id
    );

    const nextRefresh = this.issueRefreshToken(user.id);
    return { user, refreshToken: nextRefresh };
  }

  revokeRefreshToken(rawToken: string): void {
    const db = getDb();
    db.prepare(`UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL`).run(
      new Date().toISOString(),
      hashRefreshToken(rawToken)
    );
  }
}
