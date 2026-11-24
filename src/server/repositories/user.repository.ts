import { createHash, randomBytes, randomUUID } from 'crypto';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { db, runInTransaction } from '../infra/db.ts';
import { refreshTokens, users } from '../infra/schema.ts';
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

function publicUser(user: typeof users.$inferSelect): Omit<UserRecord, 'passwordHash'> {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    status: user.status as UserRecord['status'],
  };
}

export class UserRepository {
  async create(email: string, username: string, passwordHash: string): Promise<UserRecord> {
    const id = randomUUID();
    const now = new Date();
    const normalizedEmail = email.toLowerCase();
    try {
      await db.insert(users).values({
        id,
        email: normalizedEmail,
        username,
        passwordHash,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      if (typeof err === 'object' && err !== null && 'code' in err && err.code === '23505') {
        throw new DomainError('ALREADY_EXISTS', 'Email or username already exists', 409);
      }
      throw err;
    }
    return { id, email: normalizedEmail, username, passwordHash, status: 'ACTIVE' };
  }

  async findByLogin(login: string): Promise<UserRecord | null> {
    const [row] = await db
      .select()
      .from(users)
      .where(or(eq(users.email, login.toLowerCase()), eq(users.username, login)))
      .limit(1);
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      username: row.username,
      passwordHash: row.passwordHash,
      status: row.status as UserRecord['status'],
    };
  }

  async findById(id: string): Promise<Omit<UserRecord, 'passwordHash'> | null> {
    const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ? publicUser(row) : null;
  }

  async issueRefreshToken(userId: string, ttlDays = 14): Promise<string> {
    const raw = randomBytes(36).toString('base64url');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlDays * 86_400_000);
    await db.insert(refreshTokens).values({
      id: randomUUID(),
      tokenHash: hashRefreshToken(raw),
      userId,
      expiresAt,
      createdAt: now,
    });
    return raw;
  }

  async rotateRefreshToken(
    rawToken: string
  ): Promise<{ user: Omit<UserRecord, 'passwordHash'>; refreshToken: string }> {
    return runInTransaction(async (tx) => {
      const tokenHash = hashRefreshToken(rawToken);
      const [row] = await tx
        .select()
        .from(refreshTokens)
        .where(
          and(
            eq(refreshTokens.tokenHash, tokenHash),
            isNull(refreshTokens.revokedAt),
            gt(refreshTokens.expiresAt, new Date())
          )
        )
        .for('update')
        .limit(1);

      if (!row) {
        throw new DomainError('INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired', 401);
      }

      const [account] = await tx.select().from(users).where(eq(users.id, row.userId)).limit(1);
      if (!account || account.status !== 'ACTIVE') {
        throw new DomainError('INVALID_REFRESH_TOKEN', 'Account is inactive', 401);
      }

      const now = new Date();
      await tx.update(refreshTokens).set({ revokedAt: now }).where(eq(refreshTokens.id, row.id));

      const refreshToken = randomBytes(36).toString('base64url');
      await tx.insert(refreshTokens).values({
        id: randomUUID(),
        tokenHash: hashRefreshToken(refreshToken),
        userId: account.id,
        expiresAt: new Date(now.getTime() + 14 * 86_400_000),
        createdAt: now,
      });

      return { user: publicUser(account), refreshToken };
    });
  }

  async revokeRefreshToken(rawToken: string): Promise<void> {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.tokenHash, hashRefreshToken(rawToken)), isNull(refreshTokens.revokedAt)));
  }
}
