export interface Participant {
  id: string;
  displayName: string;
  role: string;
  isLocal: boolean;
  audioEnabled: boolean;
  videoEnabled: boolean;
}

export interface CallState {
  callId: string | null;
  status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'failed';
  localParticipant: Participant | null;
  remoteParticipant: Participant | null;
  error: string | null;
}

export interface MeetingState {
  meetingId: string | null;
  status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'failed';
  participants: Participant[];
  localParticipant: Participant | null;
  error: string | null;
}

export interface TurnConfig {
  urls: string[];
  username: string;
  credential: string;
}

export interface JoinData {
  sipUri: string;
  joinToken: string;
  wssUrl: string;
  turnConfig: TurnConfig;
  expiresAt: string;
}
