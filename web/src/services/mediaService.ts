import { webrtcService } from './webrtc';
import { vertoService, VertoConfig } from './vertoService';

export type ConnectionMode = 'webrtc' | 'verto';

export interface MediaServiceCallbacks {
  onRemoteStream?: (participantId: string, stream: MediaStream) => void;
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
  vertoConfig?: VertoConfig;
  callbacks: MediaServiceCallbacks;
}

class MediaService {
  private mode: ConnectionMode = 'webrtc';
  private connected = false;
  private localStream: MediaStream | null = null;
  private config: MediaServiceConfig | null = null;

  async connect(config: MediaServiceConfig): Promise<void> {
    this.mode = config.mode;
    this.localStream = config.localStream;
    this.config = config;

    console.log(`[MediaService] Connecting via ${this.mode.toUpperCase()} mode`);
    console.log(`[MediaService] Using unified WebRTC P2P signaling for all participants`);

    // Always use WebRTC P2P signaling for participant communication
    // This allows WebRTC and Verto mode users to communicate with each other
    await this.connectWebRTC(config);

    this.connected = true;
    config.callbacks.onConnected?.();
  }

  private async connectWebRTC(config: MediaServiceConfig): Promise<void> {
    console.log('[MediaService] Using WebRTC P2P mode');
    
    webrtcService.connect(
      config.meetingId,
      config.participantId,
      config.displayName,
      config.localStream,
      {
        onRemoteStream: (participantId, stream) => {
          config.callbacks.onRemoteStream?.(participantId, stream);
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
      }
    );
  }

  private async connectVerto(config: MediaServiceConfig): Promise<void> {
    if (!config.vertoConfig) {
      throw new Error('Verto config required for Verto mode');
    }

    console.log('[MediaService] Using Verto/FreeSWITCH mode');
    console.log('[MediaService] WSS URL:', config.vertoConfig.wssUrl);

    await vertoService.connect(config.vertoConfig, {
      onConnected: () => {
        console.log('[MediaService] Verto connected');
      },
      onDisconnected: () => {
        console.log('[MediaService] Verto disconnected');
        this.connected = false;
        config.callbacks.onDisconnected?.();
      },
      onCallStarted: () => {
        console.log('[MediaService] Verto call started');
      },
      onCallEnded: () => {
        console.log('[MediaService] Verto call ended');
        config.callbacks.onDisconnected?.();
      },
      onRemoteStream: (stream) => {
        console.log('[MediaService] Received remote stream via Verto');
        config.callbacks.onRemoteStream?.('verto-remote', stream);
      },
      onLocalStream: (stream) => {
        console.log('[MediaService] Local stream set via Verto');
        this.localStream = stream;
      },
      onError: (error) => {
        console.error('[MediaService] Verto error:', error);
        config.callbacks.onError?.(error);
      },
    });

    // Make Verto call to the meeting room (conference)
    try {
      const destination = `conference-${config.meetingId}`;
      await vertoService.call(destination, config.localStream);
      console.log('[MediaService] Verto call initiated to:', destination);
    } catch (error) {
      console.error('[MediaService] Failed to make Verto call:', error);
      config.callbacks.onError?.(error as Error);
    }
  }

  async disconnect(): Promise<void> {
    console.log(`[MediaService] Disconnecting from ${this.mode} mode`);
    
    if (this.mode === 'verto') {
      await vertoService.disconnect();
    } else {
      webrtcService.disconnect();
    }
    
    this.connected = false;
    this.config = null;
  }

  async mute(muted: boolean): Promise<void> {
    console.log(`[MediaService] Setting mute: ${muted}`);
    
    if (this.mode === 'verto') {
      await vertoService.mute(muted);
    } else {
      if (this.localStream) {
        this.localStream.getAudioTracks().forEach(track => {
          track.enabled = !muted;
        });
      }
    }
  }

  async setVideoEnabled(enabled: boolean): Promise<void> {
    console.log(`[MediaService] Setting video enabled: ${enabled}`);
    
    if (this.mode === 'verto') {
      await vertoService.setVideoEnabled(enabled);
    } else {
      if (this.localStream) {
        this.localStream.getVideoTracks().forEach(track => {
          track.enabled = enabled;
        });
      }
    }
  }

  sendChatMessage(message: string): void {
    if (this.mode === 'webrtc') {
      webrtcService.sendChatMessage(message);
    } else {
      console.warn('[MediaService] Chat not supported in Verto mode yet');
    }
  }

  getMode(): ConnectionMode {
    return this.mode;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getLocalStream(): MediaStream | null {
    if (this.mode === 'verto') {
      return vertoService.getLocalStream();
    }
    return this.localStream;
  }

  getPeerConnection(): RTCPeerConnection | null {
    if (this.mode === 'webrtc') {
      return webrtcService.getFirstPeerConnection();
    }
    return null;
  }

  async setCameraTrack(track: MediaStreamTrack | null): Promise<void> {
    if (this.mode === 'webrtc') {
      await webrtcService.setCameraTrack(track);
    }
    // Verto mode: Camera is part of main conference, no separate track management needed
  }

  async setScreenTrack(track: MediaStreamTrack | null): Promise<void> {
    if (this.mode === 'webrtc') {
      await webrtcService.setScreenTrack(track);
    } else if (this.mode === 'verto') {
      // Phase 2: Verto screen share via separate call
      if (track && this.config) {
        const screenStream = new MediaStream([track]);
        await vertoService.startScreenShare(this.config.meetingId, screenStream);
      } else {
        await vertoService.stopScreenShare();
      }
    }
  }

  // Phase 2: Join main conference for Verto mode
  async joinMainConference(meetingId: string, localStream: MediaStream): Promise<void> {
    if (this.mode === 'verto') {
      await vertoService.joinMainConference(meetingId, localStream);
    }
  }

  // Phase 2: Subscribe to screen room for Verto mode
  async subscribeToScreenRoom(meetingId: string): Promise<void> {
    if (this.mode === 'verto') {
      await vertoService.subscribeToScreenRoom(meetingId);
    }
  }

  async replaceVideoTrack(newTrack: MediaStreamTrack): Promise<void> {
    if (this.mode === 'webrtc') {
      await webrtcService.replaceVideoTrack(newTrack);
    } else if (this.mode === 'verto') {
      await vertoService.replaceVideoTrack(newTrack);
    }
  }
}

export const mediaService = new MediaService();
