import { webrtcService } from './webrtc';
import { vertoService, VertoConfig } from './vertoService';

export type ConnectionMode = 'webrtc' | 'verto';

export interface MediaServiceCallbacks {
  onRemoteStream?: (participantId: string, stream: MediaStream) => void;
  onRemoteCameraStream?: (participantId: string, stream: MediaStream) => void;
  onRemoteScreenStream?: (participantId: string, stream: MediaStream) => void;
  onParticipantLeft?: (participantId: string) => void;
  onParticipantJoined?: (participantId: string, name: string) => void;
  onChatMessage?: (from: string, senderName: string, message: string, timestamp: number) => void;
  onError?: (error: Error) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

export interface MediaServiceConfig {
  mode: ConnectionMode;
  meetingId: string;
  participantId: string;
  displayName: string;
  localStream: MediaStream;
  vertoConfig: VertoConfig;
  turnConfig?: { urls: string | string[]; username?: string; credential?: string };
  wsToken?: string;
  callbacks: MediaServiceCallbacks;
}

class MediaService {
  private mode: ConnectionMode = 'verto';
  private connected = false;
  private localStream: MediaStream | null = null;
  private config: MediaServiceConfig | null = null;
  private eventListeners = new Map<string, Set<(message: any) => void>>();

  async connect(config: MediaServiceConfig): Promise<void> {
    this.mode = config.mode;
    this.localStream = config.localStream;
    this.config = config;

    console.log(`[MediaService] Connecting via ${this.mode.toUpperCase()} mode`);

    // Use WebRTC P2P signaling for all participants
    // This is the most reliable approach since Verto JSON-RPC commands are not fully supported
    await this.connectWebRTC(config);

    this.connected = true;
    config.callbacks.onConnected?.();
  }

  private async connectWebRTC(config: MediaServiceConfig): Promise<void> {
    console.log('[MediaService] Using WebRTC P2P signaling');
    
    // Build ICE servers array
    const iceServers: RTCIceServer[] = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ];
    
    // Add TURN server if provided
    if (config.turnConfig) {
      iceServers.push({
        urls: config.turnConfig.urls,
        username: config.turnConfig.username,
        credential: config.turnConfig.credential,
      });
      console.log('[MediaService] TURN server configured:', config.turnConfig.urls);
    }
    
    webrtcService.connect(
      config.meetingId,
      config.participantId,
      config.displayName,
      config.localStream,
      {
        onRemoteStream: (participantId, stream) => {
          config.callbacks.onRemoteStream?.(participantId, stream);
        },
        onRemoteCameraStream: (participantId, stream) => {
          console.log('[MediaService] Remote camera stream received:', participantId);
          config.callbacks.onRemoteCameraStream?.(participantId, stream);
        },
        onRemoteScreenStream: (participantId, stream) => {
          console.log('[MediaService] Remote screen stream received:', participantId);
          config.callbacks.onRemoteScreenStream?.(participantId, stream);
        },
        onParticipantLeft: (participantId) => {
          config.callbacks.onParticipantLeft?.(participantId);
        },
        onParticipantJoined: (participantId, name) => {
          config.callbacks.onParticipantJoined?.(participantId, name);
        },
        onChatMessage: (from, displayName, message, timestamp) => {
          config.callbacks.onChatMessage?.(from, displayName, message, typeof timestamp === 'string' ? parseInt(timestamp) : timestamp);
        },
      },
      iceServers,
      config.wsToken
    );
  }

  async disconnect(): Promise<void> {
    console.log('[MediaService] Disconnecting');
    webrtcService.disconnect();
    this.connected = false;
    this.config = null;
  }

  async mute(muted: boolean): Promise<void> {
    console.log(`[MediaService] Setting mute: ${muted}`);
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = !muted;
      });
    }
  }

  async setVideoEnabled(enabled: boolean): Promise<void> {
    console.log(`[MediaService] Setting video enabled: ${enabled}`);
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }

  sendChatMessage(message: string): void {
    console.log('[MediaService] Sending chat message:', message);
    webrtcService.sendChatMessage(message);
  }

  getMode(): ConnectionMode {
    return this.mode;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getPeerConnection(): RTCPeerConnection | null {
    return webrtcService.getFirstPeerConnection();
  }

  async setCameraTrack(track: MediaStreamTrack | null): Promise<void> {
    console.log('[MediaService] setCameraTrack');
    await webrtcService.setCameraTrack(track);
  }

  async setScreenTrack(track: MediaStreamTrack | null): Promise<void> {
    console.log('[MediaService] setScreenTrack called, track:', track ? 'active' : 'null');
    await webrtcService.setScreenTrack(track);
  }

  async joinMainConference(meetingId: string, localStream: MediaStream): Promise<void> {
    // Not needed for WebRTC P2P mode
    console.log('[MediaService] joinMainConference - not needed for P2P mode');
  }

  async subscribeToScreenRoom(meetingId: string): Promise<void> {
    // Not needed for WebRTC P2P mode
    console.log('[MediaService] subscribeToScreenRoom - not needed for P2P mode');
  }

  async replaceVideoTrack(newTrack: MediaStreamTrack): Promise<void> {
    await webrtcService.replaceVideoTrack(newTrack);
  }

  /**
   * Register event listener for messages from backend
   */
  on(eventType: string, callback: (message: any) => void): void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }
    this.eventListeners.get(eventType)!.add(callback);
  }

  /**
   * Unregister event listener
   */
  off(eventType: string, callback: (message: any) => void): void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  /**
   * Emit event to all registered listeners
   */
  emit(eventType: string, message: any): void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(message);
        } catch (error) {
          console.error(`[MediaService] Error in ${eventType} listener:`, error);
        }
      });
    }
  }
}

export const mediaService = new MediaService();
