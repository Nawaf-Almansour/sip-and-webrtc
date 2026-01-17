import { UserAgent, Registerer, Inviter, SessionState, Session } from 'sip.js';

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

export interface SipClientCallbacks {
  onConnected?: () => void;
  onDisconnected?: () => void;
  onCallAccepted?: (session: Session) => void;
  onCallEnded?: () => void;
  onError?: (error: Error) => void;
  onRemoteStream?: (stream: MediaStream) => void;
}

export class SipClient {
  private userAgent: UserAgent | null = null;
  private registerer: Registerer | null = null;
  private session: Session | null = null;
  private localStream: MediaStream | null = null;
  private callbacks: SipClientCallbacks = {};

  async connect(config: SipConfig, callbacks: SipClientCallbacks = {}): Promise<void> {
    this.callbacks = callbacks;

    const uri = UserAgent.makeURI(`sip:user@${new URL(config.wssUrl).hostname}`);
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
        console.log('SIP UserAgent connected');
        this.callbacks.onConnected?.();
      },
      onDisconnect: () => {
        console.log('SIP UserAgent disconnected');
        this.callbacks.onDisconnected?.();
      },
    };

    await this.userAgent.start();
  }

  async call(targetUri: string, joinToken: string): Promise<Session> {
    if (!this.userAgent) {
      throw new Error('UserAgent not initialized');
    }

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
      extraHeaders: [`X-Join-Token: ${joinToken}`],
    });

    this.session = inviter;

    inviter.stateChange.addListener((state: SessionState) => {
      console.log('Session state changed:', state);
      switch (state) {
        case SessionState.Established:
          this.callbacks.onCallAccepted?.(inviter);
          this.setupRemoteStream();
          break;
        case SessionState.Terminated:
          this.callbacks.onCallEnded?.();
          this.cleanup();
          break;
      }
    });

    await inviter.invite();
    return inviter;
  }

  private setupRemoteStream(): void {
    if (!this.session) return;

    const sessionDescriptionHandler = this.session.sessionDescriptionHandler;
    if (!sessionDescriptionHandler) return;

    const peerConnection = (sessionDescriptionHandler as any).peerConnection as RTCPeerConnection;
    if (!peerConnection) return;

    peerConnection.ontrack = (event: RTCTrackEvent) => {
      if (event.streams && event.streams[0]) {
        this.callbacks.onRemoteStream?.(event.streams[0]);
      }
    };
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  async mute(muted: boolean): Promise<void> {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = !muted;
      });
    }
  }

  async setVideoEnabled(enabled: boolean): Promise<void> {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }

  async hangup(): Promise<void> {
    if (this.session) {
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
    }
    this.cleanup();
  }

  private cleanup(): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    this.session = null;
  }

  async disconnect(): Promise<void> {
    await this.hangup();
    if (this.registerer) {
      await this.registerer.unregister();
    }
    if (this.userAgent) {
      await this.userAgent.stop();
    }
  }
}

export const sipClient = new SipClient();
