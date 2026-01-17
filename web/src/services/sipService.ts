import { UserAgent, Inviter, SessionState, Session } from 'sip.js';

export interface SipConfig {
  wssUrl: string;
  sipUri: string;
  joinToken: string;
  turnConfig: {
    urls: string[];
    username: string;
    credential: string;
  };
}

export interface SipCallbacks {
  onConnected?: () => void;
  onDisconnected?: () => void;
  onCallEstablished?: (session: Session) => void;
  onCallEnded?: () => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onError?: (error: Error) => void;
}

class SipService {
  private userAgent: UserAgent | null = null;
  private session: Session | null = null;
  private localStream: MediaStream | null = null;
  private callbacks: SipCallbacks = {};
  private config: SipConfig | null = null;

  async connect(config: SipConfig, callbacks: SipCallbacks = {}): Promise<void> {
    this.config = config;
    this.callbacks = callbacks;

    try {
      // Parse WSS URL for domain
      const wssUrl = new URL(config.wssUrl);
      const domain = wssUrl.hostname;

      const uri = UserAgent.makeURI(`sip:user@${domain}`);
      if (!uri) {
        throw new Error('Failed to create SIP URI');
      }

      this.userAgent = new UserAgent({
        uri,
        transportOptions: {
          server: config.wssUrl,
        },
        sessionDescriptionHandlerFactoryOptions: {
          peerConnectionConfiguration: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              {
                urls: config.turnConfig.urls,
                username: config.turnConfig.username,
                credential: config.turnConfig.credential,
              },
            ],
          },
        },
        authorizationUsername: 'user',
        authorizationPassword: config.joinToken,
      });

      this.userAgent.delegate = {
        onConnect: () => {
          console.log('[SIP] UserAgent connected');
          this.callbacks.onConnected?.();
        },
        onDisconnect: (error) => {
          console.log('[SIP] UserAgent disconnected', error);
          this.callbacks.onDisconnected?.();
        },
      };

      await this.userAgent.start();
      console.log('[SIP] UserAgent started');
    } catch (error) {
      console.error('[SIP] Connection error:', error);
      this.callbacks.onError?.(error as Error);
      throw error;
    }
  }

  async call(targetUri: string): Promise<void> {
    if (!this.userAgent || !this.config) {
      throw new Error('SIP not connected');
    }

    try {
      // Get local media
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });

      const target = UserAgent.makeURI(targetUri);
      if (!target) {
        throw new Error('Invalid target URI');
      }

      const inviter = new Inviter(this.userAgent, target, {
        sessionDescriptionHandlerOptions: {
          constraints: {
            audio: true,
            video: true,
          },
        },
        extraHeaders: [`X-Join-Token: ${this.config.joinToken}`],
      });

      this.session = inviter;

      inviter.stateChange.addListener((state: SessionState) => {
        console.log('[SIP] Session state:', state);
        switch (state) {
          case SessionState.Established:
            this.callbacks.onCallEstablished?.(inviter);
            this.setupRemoteStream();
            break;
          case SessionState.Terminated:
            this.callbacks.onCallEnded?.();
            this.cleanupSession();
            break;
        }
      });

      await inviter.invite();
      console.log('[SIP] INVITE sent to', targetUri);
    } catch (error) {
      console.error('[SIP] Call error:', error);
      this.callbacks.onError?.(error as Error);
      throw error;
    }
  }

  private setupRemoteStream(): void {
    if (!this.session) return;

    const sdh = this.session.sessionDescriptionHandler;
    if (!sdh) return;

    const pc = (sdh as any).peerConnection as RTCPeerConnection;
    if (!pc) return;

    pc.ontrack = (event: RTCTrackEvent) => {
      console.log('[SIP] Remote track received');
      if (event.streams && event.streams[0]) {
        this.callbacks.onRemoteStream?.(event.streams[0]);
      }
    };

    // Check existing tracks
    pc.getReceivers().forEach((receiver) => {
      if (receiver.track) {
        const stream = new MediaStream([receiver.track]);
        this.callbacks.onRemoteStream?.(stream);
      }
    });
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  async mute(muted: boolean): Promise<void> {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
  }

  async setVideoEnabled(enabled: boolean): Promise<void> {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  }

  async hangup(): Promise<void> {
    if (this.session) {
      try {
        switch (this.session.state) {
          case SessionState.Initial:
          case SessionState.Establishing:
            if (this.session instanceof Inviter) {
              await this.session.cancel();
            }
            break;
          case SessionState.Established:
            await this.session.bye();
            break;
        }
      } catch (error) {
        console.error('[SIP] Hangup error:', error);
      }
    }
    this.cleanupSession();
  }

  private cleanupSession(): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    this.session = null;
  }

  async disconnect(): Promise<void> {
    await this.hangup();
    if (this.userAgent) {
      await this.userAgent.stop();
      this.userAgent = null;
    }
    this.config = null;
    this.callbacks = {};
  }

  isConnected(): boolean {
    return this.userAgent !== null && this.userAgent.isConnected();
  }
}

export const sipService = new SipService();
