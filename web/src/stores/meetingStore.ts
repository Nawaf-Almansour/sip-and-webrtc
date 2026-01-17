import { create } from 'zustand';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'failed';

export interface Participant {
  id: string;
  displayName: string;
  isLocal: boolean;
  isMuted: boolean;
  isVideoEnabled: boolean;
  stream?: MediaStream;
}

interface MeetingState {
  meetingId: string | null;
  status: ConnectionStatus;
  participants: Participant[];
  localParticipant: Participant | null;
  isMuted: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  error: string | null;
  
  // Actions
  setMeetingId: (meetingId: string | null) => void;
  setStatus: (status: ConnectionStatus) => void;
  addParticipant: (participant: Participant) => void;
  removeParticipant: (participantId: string) => void;
  updateParticipant: (participantId: string, updates: Partial<Participant>) => void;
  setLocalParticipant: (participant: Participant | null) => void;
  setMuted: (muted: boolean) => void;
  setVideoEnabled: (enabled: boolean) => void;
  setScreenSharing: (sharing: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState = {
  meetingId: null,
  status: 'idle' as ConnectionStatus,
  participants: [],
  localParticipant: null,
  isMuted: false,
  isVideoEnabled: true,
  isScreenSharing: false,
  error: null,
};

export const useMeetingStore = create<MeetingState>((set) => ({
  ...initialState,
  
  setMeetingId: (meetingId) => set({ meetingId }),
  setStatus: (status) => set({ status }),
  
  addParticipant: (participant) => set((state) => ({
    participants: [...state.participants, participant],
  })),
  
  removeParticipant: (participantId) => set((state) => ({
    participants: state.participants.filter(p => p.id !== participantId),
  })),
  
  updateParticipant: (participantId, updates) => set((state) => ({
    participants: state.participants.map(p => 
      p.id === participantId ? { ...p, ...updates } : p
    ),
  })),
  
  setLocalParticipant: (participant) => set({ localParticipant: participant }),
  setMuted: (muted) => set({ isMuted: muted }),
  setVideoEnabled: (enabled) => set({ isVideoEnabled: enabled }),
  setScreenSharing: (sharing) => set({ isScreenSharing: sharing }),
  setError: (error) => set({ error }),
  reset: () => set(initialState),
}));
