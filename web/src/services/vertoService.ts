/**
 * Verto Service - FreeSWITCH Verto Protocol Client
 * 
 * Verto is a JSON-RPC based protocol for WebRTC communication with FreeSWITCH
 */

export interface VertoConfig {
  wssUrl: string;
  login: string;
  password: string;
  callerIdName?: string;
  callerIdNumber?: string;
  turnConfig?: {
    urls: string[];
    username: string;
    credential: string;
  };
}

export interface VertoCallbacks {
  onConnected?: () => void;
  onDisconnected?: () => void;
  onCallStarted?: () => void;
  onCallEnded?: () => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onLocalStream?: (stream: MediaStream) => void;
  onError?: (error: Error) => void;
  onMessage?: (from: string, message: string) => void;
}

interface VertoMessage {
  jsonrpc: '2.0';
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
}

class VertoService {
  private ws: WebSocket | null = null;
  private config: VertoConfig | null = null;
  private callbacks: VertoCallbacks = {};
  private messageId = 1;
  private pendingRequests: Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }> = new Map();
  private sessionId: string | null = null;
  private callId: string | null = null;
  private localStream: MediaStream | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  async connect(config: VertoConfig, callbacks: VertoCallbacks = {}): Promise<void> {
    this.config = config;
    this.callbacks = callbacks;
    this.sessionId = this.generateUUID();

    return new Promise((resolve, reject) => {
      try {
        console.log('[Verto] Connecting to:', config.wssUrl);
        this.ws = new WebSocket(config.wssUrl);

        this.ws.onopen = async () => {
          console.log('[Verto] WebSocket connected');
          this.reconnectAttempts = 0;
          
          try {
            await this.login();
            this.startHeartbeat();
            this.callbacks.onConnected?.();
            resolve();
          } catch (error) {
            reject(error);
          }
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (error) => {
          console.error('[Verto] WebSocket error:', error);
          this.callbacks.onError?.(new Error('WebSocket connection error'));
        };

        this.ws.onclose = (event) => {
          console.log('[Verto] WebSocket closed:', event.code, event.reason);
          this.stopHeartbeat();
          this.callbacks.onDisconnected?.();
          
          if (this.reconnectAttempts < this.maxReconnectAttempts && event.code !== 1000) {
            this.reconnectAttempts++;
            console.log(`[Verto] Reconnecting... attempt ${this.reconnectAttempts}`);
            setTimeout(() => this.connect(config, callbacks), 2000 * this.reconnectAttempts);
          }
        };

        setTimeout(() => {
          if (this.ws?.readyState !== WebSocket.OPEN) {
            reject(new Error('Connection timeout'));
          }
        }, 10000);

      } catch (error) {
        reject(error);
      }
    });
  }

  private async login(): Promise<void> {
    if (!this.config) throw new Error('Not configured');

    const result = await this.sendRequest('login', {
      login: this.config.login,
      passwd: this.config.password,
      sessid: this.sessionId,
    });

    console.log('[Verto] Login result:', result);
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.sendRequest('echo', { test: 'ping' }).catch(() => {});
      }
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  async call(destination: string, localStream: MediaStream): Promise<void> {
    if (!this.ws || !this.config) {
      throw new Error('Not connected');
    }

    this.localStream = localStream;
    this.callId = this.generateUUID();

    try {
      // Create peer connection
      this.peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          ...(this.config.turnConfig ? [{
            urls: this.config.turnConfig.urls,
            username: this.config.turnConfig.username,
            credential: this.config.turnConfig.credential,
          }] : []),
        ],
      });

      // Add local tracks
      localStream.getTracks().forEach(track => {
        this.peerConnection!.addTrack(track, localStream);
      });

      // Handle remote tracks
      this.peerConnection.ontrack = (event) => {
        console.log('[Verto] Remote track received');
        if (event.streams && event.streams[0]) {
          this.callbacks.onRemoteStream?.(event.streams[0]);
        }
      };

      // Handle ICE candidates
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          this.sendRequest('verto.info', {
            dialogParams: {
              callID: this.callId,
            },
            msg: {
              type: 'candidate',
              candidate: event.candidate,
            },
          }).catch(console.error);
        }
      };

      // Create offer
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await this.peerConnection.setLocalDescription(offer);

      // Wait for ICE gathering
      await this.waitForIceGathering();

      // Send invite
      const result = await this.sendRequest('verto.invite', {
        dialogParams: {
          callID: this.callId,
          destination_number: destination,
          caller_id_name: this.config.callerIdName || 'WebRTC User',
          caller_id_number: this.config.callerIdNumber || '1000',
          remote_caller_id_name: destination,
          remote_caller_id_number: destination,
        },
        sdp: this.peerConnection.localDescription?.sdp,
      });

      console.log('[Verto] Invite result:', result);
      this.callbacks.onCallStarted?.();

    } catch (error) {
      console.error('[Verto] Call error:', error);
      this.callbacks.onError?.(error as Error);
      throw error;
    }
  }

  private async waitForIceGathering(): Promise<void> {
    if (!this.peerConnection) return;

    if (this.peerConnection.iceGatheringState === 'complete') {
      return;
    }

    return new Promise((resolve) => {
      const checkState = () => {
        if (this.peerConnection?.iceGatheringState === 'complete') {
          resolve();
        }
      };

      this.peerConnection!.onicegatheringstatechange = checkState;
      
      // Timeout after 5 seconds
      setTimeout(resolve, 5000);
    });
  }

  private handleMessage(data: string): void {
    try {
      const message: VertoMessage = JSON.parse(data);
      console.log('[Verto] Received:', message);

      // Handle response to our request
      if (message.id && this.pendingRequests.has(message.id)) {
        const pending = this.pendingRequests.get(message.id)!;
        this.pendingRequests.delete(message.id);

        if (message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result);
        }
        return;
      }

      // Handle incoming method calls
      if (message.method) {
        this.handleMethod(message);
      }

    } catch (error) {
      console.error('[Verto] Parse error:', error);
    }
  }

  private handleMethod(message: VertoMessage): void {
    switch (message.method) {
      case 'verto.answer':
        this.handleAnswer(message.params as Record<string, unknown>);
        break;
      case 'verto.bye':
        this.handleBye();
        break;
      case 'verto.media':
        this.handleMedia(message.params as Record<string, unknown>);
        break;
      case 'verto.display':
        // Display update - ignore for now
        break;
      case 'verto.info':
        this.handleInfo(message.params as Record<string, unknown>);
        break;
      default:
        console.log('[Verto] Unhandled method:', message.method);
    }

    // Send acknowledgment
    if (message.id) {
      this.sendResponse(message.id, { message: 'ok' });
    }
  }

  private async handleAnswer(params: Record<string, unknown>): Promise<void> {
    console.log('[Verto] Call answered');
    
    const sdp = params.sdp as string;
    if (sdp && this.peerConnection) {
      try {
        await this.peerConnection.setRemoteDescription({
          type: 'answer',
          sdp,
        });
        console.log('[Verto] Remote description set');
      } catch (error) {
        console.error('[Verto] Error setting remote description:', error);
      }
    }
  }

  private handleBye(): void {
    console.log('[Verto] Call ended');
    this.cleanupCall();
    this.callbacks.onCallEnded?.();
  }

  private async handleMedia(params: Record<string, unknown>): Promise<void> {
    const sdp = params.sdp as string;
    if (sdp && this.peerConnection) {
      try {
        await this.peerConnection.setRemoteDescription({
          type: 'answer',
          sdp,
        });
      } catch (error) {
        console.error('[Verto] Error handling media:', error);
      }
    }
  }

  private handleInfo(params: Record<string, unknown>): void {
    const msg = params.msg as Record<string, unknown>;
    if (msg?.type === 'candidate' && this.peerConnection) {
      const candidate = msg.candidate as RTCIceCandidateInit;
      this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
    }
  }

  private sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const id = this.messageId++;
      const message: VertoMessage = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      this.pendingRequests.set(id, { resolve, reject });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);

      console.log('[Verto] Sending:', message);
      this.ws.send(JSON.stringify(message));
    });
  }

  private sendResponse(id: number, result: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const message: VertoMessage = {
      jsonrpc: '2.0',
      id,
      result,
    };

    this.ws.send(JSON.stringify(message));
  }

  async hangup(): Promise<void> {
    if (this.callId) {
      try {
        await this.sendRequest('verto.bye', {
          dialogParams: {
            callID: this.callId,
          },
        });
      } catch (error) {
        console.error('[Verto] Hangup error:', error);
      }
    }
    this.cleanupCall();
  }

  private cleanupCall(): void {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    this.callId = null;
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

  async disconnect(): Promise<void> {
    await this.hangup();
    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.close(1000, 'Normal closure');
      this.ws = null;
    }
    
    this.config = null;
    this.callbacks = {};
    this.sessionId = null;
    this.pendingRequests.clear();
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

export const vertoService = new VertoService();
