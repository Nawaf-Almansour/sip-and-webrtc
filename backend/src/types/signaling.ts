/**
 * Signaling protocol message types for WebRTC and Verto communication
 */

export type LayoutType = 'grid' | 'speaker' | 'sidebar' | 'presentation';

export type LayoutChangeReason =
  | 'screen-share-started'
  | 'screen-share-stopped'
  | 'participant-joined'
  | 'participant-left'
  | 'speaker-changed'
  | 'connection-mode-changed'
  | 'manual-override';

/**
 * Layout update message sent from backend to all clients
 * Notifies clients when the optimal layout has changed
 */
export interface LayoutUpdateMessage {
  type: 'layout-update';
  layout: LayoutType;
  reason: LayoutChangeReason;
  timestamp: number;
  meetingId: string;
  screenSharerId?: string;
  activeSpeakerId?: string;
  participantCount: number;
}

/**
 * Participant joined message
 */
export interface ParticipantJoinedMessage {
  type: 'participant-joined';
  participantId: string;
  displayName: string;
  timestamp: number;
  totalParticipants: number;
}

/**
 * Participant left message
 */
export interface ParticipantLeftMessage {
  type: 'participant-left';
  participantId: string;
  displayName: string;
  timestamp: number;
  totalParticipants: number;
}

/**
 * Screen share started message
 */
export interface ScreenShareStartedMessage {
  type: 'screen-share-started';
  participantId: string;
  displayName: string;
  timestamp: number;
}

/**
 * Screen share stopped message
 */
export interface ScreenShareStoppedMessage {
  type: 'screen-share-stopped';
  participantId: string;
  displayName: string;
  timestamp: number;
}

/**
 * Active speaker changed message
 */
export interface ActiveSpeakerChangedMessage {
  type: 'active-speaker-changed';
  participantId?: string;
  displayName?: string;
  timestamp: number;
}

/**
 * Connection mode changed message
 */
export interface ConnectionModeChangedMessage {
  type: 'connection-mode-changed';
  mode: 'p2p' | 'mcu';
  reason: string;
  timestamp: number;
}

/**
 * Union type for all signaling messages
 */
export type SignalingMessage =
  | LayoutUpdateMessage
  | ParticipantJoinedMessage
  | ParticipantLeftMessage
  | ScreenShareStartedMessage
  | ScreenShareStoppedMessage
  | ActiveSpeakerChangedMessage
  | ConnectionModeChangedMessage;
