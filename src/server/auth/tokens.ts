import jwt from 'jsonwebtoken';
import { env } from '../config/env.ts';

export const signAccess = (userId: string): string =>
  jwt.sign({ sub: userId, type: 'access' }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'],
  });

export const verifyAccess = (token: string): jwt.JwtPayload =>
  jwt.verify(token, env.JWT_ACCESS_SECRET, {
    algorithms: ['HS256'],
  }) as jwt.JwtPayload;
