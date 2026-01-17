import { create } from 'zustand';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'failed';

interface CallState {
  callId: string | null;
  status: ConnectionStatus;
  isMuted: boolean;
  isVideoEnabled: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  error: string | null;
  
  // Actions
  setCallId: (callId: string | null) => void;
  setStatus: (status: ConnectionStatus) => void;
  setMuted: (muted: boolean) => void;
  setVideoEnabled: (enabled: boolean) => void;
  setLocalStream: (stream: MediaStream | null) => void;
  setRemoteStream: (stream: MediaStream | null) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState = {
  callId: null,
  status: 'idle' as ConnectionStatus,
  isMuted: false,
  isVideoEnabled: true,
  localStream: null,
  remoteStream: null,
  error: null,
};

export const useCallStore = create<CallState>((set) => ({
  ...initialState,
  
  setCallId: (callId) => set({ callId }),
  setStatus: (status) => set({ status }),
  setMuted: (muted) => set({ isMuted: muted }),
  setVideoEnabled: (enabled) => set({ isVideoEnabled: enabled }),
  setLocalStream: (stream) => set({ localStream: stream }),
  setRemoteStream: (stream) => set({ remoteStream: stream }),
  setError: (error) => set({ error }),
  reset: () => set(initialState),
}));
