import { describe, it, expect } from 'vitest';

describe('REST API Endpoints', () => {
  const BASE_URL = 'http://localhost:3000';

  describe('Calls API', () => {
    it('should create a new call', async () => {
      const res = await fetch(`${BASE_URL}/api/calls`, { method: 'POST' });
      const data = await res.json();
      
      expect(res.status).toBe(201);
      expect(data.callId).toBeDefined();
      expect(data.joinUrlA).toContain('/call/');
      expect(data.joinUrlB).toContain('/call/');
    });

    it('should get call details', async () => {
      // Create a call first
      const createRes = await fetch(`${BASE_URL}/api/calls`, { method: 'POST' });
      const { callId } = await createRes.json();
      
      // Get call details
      const res = await fetch(`${BASE_URL}/api/calls/${callId}`);
      const data = await res.json();
      
      expect(res.status).toBe(200);
      expect(data.callId).toBe(callId);
      expect(data.status).toBe('PENDING');
    });

    it('should return 404 for non-existent call', async () => {
      const res = await fetch(`${BASE_URL}/api/calls/non-existent-id`);
      expect(res.status).toBe(404);
    });
  });

  describe('Meetings API', () => {
    it('should create a new meeting', async () => {
      const res = await fetch(`${BASE_URL}/api/meetings`, { method: 'POST' });
      const data = await res.json();
      
      expect(res.status).toBe(201);
      expect(data.meetingId).toBeDefined();
      expect(data.joinUrl).toContain('/meeting/');
      expect(data.hostUrl).toContain('role=host');
    });

    it('should create meeting with waiting room enabled', async () => {
      const res = await fetch(`${BASE_URL}/api/meetings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waitingRoomEnabled: true }),
      });
      const data = await res.json();
      
      expect(res.status).toBe(201);
      expect(data.meetingId).toBeDefined();
    });

    it('should join meeting and get participant status', async () => {
      // Create meeting
      const createRes = await fetch(`${BASE_URL}/api/meetings`, { method: 'POST' });
      const { meetingId } = await createRes.json();
      
      // Join meeting
      const joinRes = await fetch(`${BASE_URL}/api/meetings/${meetingId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'Test User', role: 'participant' }),
      });
      const joinData = await joinRes.json();
      
      expect(joinRes.status).toBe(200);
      expect(joinData.participantId).toBeDefined();
      expect(joinData.displayName).toBe('Test User');
      expect(joinData.status).toBe('approved');
    });

    it('should get meeting participants', async () => {
      // Create and join meeting
      const createRes = await fetch(`${BASE_URL}/api/meetings`, { method: 'POST' });
      const { meetingId } = await createRes.json();
      
      await fetch(`${BASE_URL}/api/meetings/${meetingId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'User 1' }),
      });
      
      // Get participants
      const res = await fetch(`${BASE_URL}/api/meetings/${meetingId}/participants`);
      const data = await res.json();
      
      expect(res.status).toBe(200);
      expect(data.participants).toBeInstanceOf(Array);
      expect(data.count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Waiting Room API', () => {
    it('should put participant in waiting room when enabled', async () => {
      // Create meeting with waiting room
      const createRes = await fetch(`${BASE_URL}/api/meetings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waitingRoomEnabled: true }),
      });
      const { meetingId } = await createRes.json();
      
      // Join as participant (not host)
      const joinRes = await fetch(`${BASE_URL}/api/meetings/${meetingId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'Waiting User', role: 'participant' }),
      });
      const joinData = await joinRes.json();
      
      expect(joinData.status).toBe('waiting');
      expect(joinData.waitingRoomEnabled).toBe(true);
    });

    it('should admit participant from waiting room', async () => {
      // Create meeting with waiting room
      const createRes = await fetch(`${BASE_URL}/api/meetings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waitingRoomEnabled: true }),
      });
      const { meetingId } = await createRes.json();
      
      // Join as participant
      const joinRes = await fetch(`${BASE_URL}/api/meetings/${meetingId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'Waiting User', role: 'participant' }),
      });
      const { participantId } = await joinRes.json();
      
      // Admit participant
      const admitRes = await fetch(`${BASE_URL}/api/meetings/${meetingId}/waiting-room/admit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId }),
      });
      const admitData = await admitRes.json();
      
      expect(admitRes.status).toBe(200);
      expect(admitData.success).toBe(true);
      
      // Check status
      const statusRes = await fetch(`${BASE_URL}/api/meetings/${meetingId}/my-status/${participantId}`);
      const statusData = await statusRes.json();
      
      expect(statusData.status).toBe('approved');
    });
  });
});
