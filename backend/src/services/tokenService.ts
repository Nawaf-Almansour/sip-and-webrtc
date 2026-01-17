import { nanoid } from 'nanoid';
import { redis } from '../store/redis.js';
import { config } from '../config/index.js';

export interface TokenData {
  type: 'call' | 'meeting';
  id: string;
  role: string;
  createdAt: string;
}

export async function createJoinToken(
  type: 'call' | 'meeting',
  id: string,
  role: string = 'participant'
): Promise<string> {
  const token = nanoid(21);
  const data: TokenData = {
    type,
    id,
    role,
    createdAt: new Date().toISOString(),
  };

  await redis.setex(
    `join:${token}`,
    config.token.ttlSeconds,
    JSON.stringify(data)
  );

  return token;
}

export async function validateToken(token: string): Promise<TokenData | null> {
  const data = await redis.get(`join:${token}`);
  if (!data) return null;

  try {
    return JSON.parse(data) as TokenData;
  } catch {
    return null;
  }
}

export async function invalidateToken(token: string): Promise<void> {
  await redis.del(`join:${token}`);
}
