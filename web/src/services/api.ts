const API_BASE = '/api';

export interface CallResponse {
  callId: string;
  joinUrlA: string;
  joinUrlB: string;
}

export interface MeetingResponse {
  meetingId: string;
  joinUrl: string;
  hostUrl: string;
}

export interface JoinResponse {
  sipUri: string;
  joinToken: string;
  wssUrl: string;
  turnConfig: {
    urls: string[];
    username: string;
    credential: string;
  };
  expiresAt: string;
}

export const api = {
  async createCall(): Promise<CallResponse> {
    const res = await fetch(`${API_BASE}/calls`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to create call');
    return res.json();
  },

  async joinCall(callId: string, role: string): Promise<JoinResponse> {
    const res = await fetch(`${API_BASE}/calls/${callId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) throw new Error('Failed to join call');
    return res.json();
  },

  async endCall(callId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/calls/${callId}/end`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to end call');
  },

  async createMeeting(maxParticipants?: number): Promise<MeetingResponse> {
    const res = await fetch(`${API_BASE}/meetings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxParticipants }),
    });
    if (!res.ok) throw new Error('Failed to create meeting');
    return res.json();
  },

  async joinMeeting(meetingId: string, displayName?: string): Promise<JoinResponse> {
    const res = await fetch(`${API_BASE}/meetings/${meetingId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName }),
    });
    if (!res.ok) throw new Error('Failed to join meeting');
    return res.json();
  },

  async endMeeting(meetingId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/meetings/${meetingId}/end`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to end meeting');
  },
};
