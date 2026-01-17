import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createJoinToken, validateToken } from '../services/tokenService';

describe('Token Service', () => {
  describe('createJoinToken', () => {
    it('should create a valid token for call', async () => {
      const token = await createJoinToken('call', 'test-call-id', 'A');
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(10);
    });

    it('should create a valid token for meeting', async () => {
      const token = await createJoinToken('meeting', 'test-meeting-id', 'host');
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(10);
    });

    it('should create unique tokens for different calls', async () => {
      const token1 = await createJoinToken('call', 'call-1', 'A');
      const token2 = await createJoinToken('call', 'call-2', 'A');
      expect(token1).not.toBe(token2);
    });
  });

  describe('validateToken', () => {
    it('should validate a valid token', async () => {
      const token = await createJoinToken('call', 'test-call-id', 'A');
      const result = await validateToken(token);
      
      expect(result).toBeDefined();
      expect(result?.type).toBe('call');
      expect(result?.id).toBe('test-call-id');
      expect(result?.role).toBe('A');
    });

    it('should return null for invalid token', async () => {
      const result = await validateToken('invalid-token-12345');
      expect(result).toBeNull();
    });

    it('should return null for empty token', async () => {
      const result = await validateToken('');
      expect(result).toBeNull();
    });

    it('should validate meeting token with host role', async () => {
      const token = await createJoinToken('meeting', 'meeting-123', 'host');
      const result = await validateToken(token);
      
      expect(result).toBeDefined();
      expect(result?.type).toBe('meeting');
      expect(result?.id).toBe('meeting-123');
      expect(result?.role).toBe('host');
    });

    it('should validate meeting token with participant role', async () => {
      const token = await createJoinToken('meeting', 'meeting-456', 'participant');
      const result = await validateToken(token);
      
      expect(result).toBeDefined();
      expect(result?.role).toBe('participant');
    });
  });
});
