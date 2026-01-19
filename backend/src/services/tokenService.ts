import { nanoid } from 'nanoid';
import jwt from 'jsonwebtoken';
import { redis } from '../store/redis.js';
import { config } from '../config/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

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

export interface WebSocketTokenPayload {
  participantId: string;
  meetingId: string;
  displayName: string;
  role: string;
}

export function createWebSocketToken(payload: WebSocketTokenPayload): string {
  return jwt.sign(
    {
      participantId: payload.participantId,
      meetingId: payload.meetingId,
      displayName: payload.displayName,
      role: payload.role,
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

export function verifyWebSocketToken(token: string): WebSocketTokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as WebSocketTokenPayload;
    return decoded;
  } catch {
    return null;
  }
}
