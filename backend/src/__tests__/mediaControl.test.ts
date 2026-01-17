import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const BASE_URL = 'http://localhost:3000';

describe('PHASE 4.5 - Media Control Tests', () => {
  let callId: string;
  let meetingId: string;
  let participantIds: string[] = [];

  describe('1:1 Call Tests', () => {
    it('should create a 1:1 call', async () => {
      const res = await fetch(`${BASE_URL}/api/calls`, { method: 'POST' });
      const data = await res.json() as any;
      
      expect(res.status).toBe(201);
      expect(data.callId).toBeDefined();
      callId = data.callId;
    });

    it('should allow party A to join', async () => {
      const res = await fetch(`${BASE_URL}/api/calls/${callId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'A', displayName: 'User A' }),
      });
      const data = await res.json() as any;
      
      expect(res.status).toBe(200);
      expect(data.participantId).toBeDefined();
      expect(data.joinToken).toBeDefined();
      participantIds.push(data.participantId);
    });

    it('should allow party B to join', async () => {
      const res = await fetch(`${BASE_URL}/api/calls/${callId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'B', displayName: 'User B' }),
      });
      const data = await res.json() as any;
      
      expect(res.status).toBe(200);
      expect(data.participantId).toBeDefined();
      participantIds.push(data.participantId);
    });

    it('should show both participants in call', async () => {
      const res = await fetch(`${BASE_URL}/api/calls/${callId}/participants`);
      const data = await res.json() as any;
      
      expect(res.status).toBe(200);
      expect(data.count).toBe(2);
    });

    it('should end call and cleanup endpoints', async () => {
      const res = await fetch(`${BASE_URL}/api/calls/${callId}/end`, { method: 'POST' });
      const data = await res.json() as any;
      
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      
      // Verify call is ended
      const checkRes = await fetch(`${BASE_URL}/api/calls/${callId}`);
      const checkData = await checkRes.json() as any;
      expect(checkData.status).toBe('ENDED');
    });
  });

  describe('Room/Meeting Tests', () => {
    it('should create a meeting room', async () => {
      const res = await fetch(`${BASE_URL}/api/meetings`, { method: 'POST' });
      const data = await res.json() as any;
      
      expect(res.status).toBe(201);
      expect(data.meetingId).toBeDefined();
      meetingId = data.meetingId;
    });

    it('should allow host to join', async () => {
      const res = await fetch(`${BASE_URL}/api/meetings/${meetingId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'Host', role: 'host' }),
      });
      const data = await res.json() as any;
      
      expect(res.status).toBe(200);
      expect(data.participantId).toBeDefined();
      participantIds = [data.participantId];
    });

    it('should allow participant 1 to join (visible to others)', async () => {
      const res = await fetch(`${BASE_URL}/api/meetings/${meetingId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'Participant 1', role: 'participant' }),
      });
      const data = await res.json() as any;
      
      expect(res.status).toBe(200);
      participantIds.push(data.participantId);
      
      // Check participant is visible
      const listRes = await fetch(`${BASE_URL}/api/meetings/${meetingId}/participants`);
      const listData = await listRes.json() as any;
      expect(listData.count).toBe(2);
    });

    it('should allow participant 2 to join (3+ participants)', async () => {
      const res = await fetch(`${BASE_URL}/api/meetings/${meetingId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'Participant 2', role: 'participant' }),
      });
      const data = await res.json() as any;
      
      expect(res.status).toBe(200);
      participantIds.push(data.participantId);
      
      // Check 3 participants
      const listRes = await fetch(`${BASE_URL}/api/meetings/${meetingId}/participants`);
      const listData = await listRes.json() as any;
      expect(listData.count).toBe(3);
    });

    it('should handle mute/unmute', async () => {
      const participantId = participantIds[1];
      
      // Mute
      const muteRes = await fetch(`${BASE_URL}/api/meetings/${meetingId}/participants/${participantId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isMuted: true }),
      });
      expect(muteRes.status).toBe(200);
      
      // Check muted
      const listRes = await fetch(`${BASE_URL}/api/meetings/${meetingId}/participants`);
      const listData = await listRes.json() as any;
      const participant = listData.participants.find((p: any) => p.id === participantId);
      expect(participant.isMuted).toBe(true);
      
      // Unmute
      const unmuteRes = await fetch(`${BASE_URL}/api/meetings/${meetingId}/participants/${participantId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isMuted: false }),
      });
      expect(unmuteRes.status).toBe(200);
    });

    it('should handle participant leave (no ghost sessions)', async () => {
      const participantId = participantIds[2];
      
      const res = await fetch(`${BASE_URL}/api/meetings/${meetingId}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId }),
      });
      expect(res.status).toBe(200);
      
      // Check participant removed
      const listRes = await fetch(`${BASE_URL}/api/meetings/${meetingId}/participants`);
      const listData = await listRes.json() as any;
      expect(listData.count).toBe(2);
      
      // Verify no ghost - participant should not be in list
      const ghost = listData.participants.find((p: any) => p.id === participantId);
      expect(ghost).toBeUndefined();
    });

    it('should end meeting', async () => {
      const res = await fetch(`${BASE_URL}/api/meetings/${meetingId}/end`, { method: 'POST' });
      const data = await res.json() as any;
      
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });
});
