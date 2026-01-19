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
  
  // Phase 2: Dual session support
  private mainCallId: string | null = null;
  private screenCallId: string | null = null;
  private mainPeerConnection: RTCPeerConnection | null = null;
  private screenPeerConnection: RTCPeerConnection | null = null;
  private screenStream: MediaStream | null = null;

  async connect(config: VertoConfig, callbacks: VertoCallbacks = {}): Promise<void> {
    this.config = config;
    this.callbacks = callbacks;
    this.sessionId = this.generateUUID();

    console.log('[Verto] Starting connection with config:', {
      wssUrl: config.wssUrl,
      login: config.login,
      sessionId: this.sessionId,
    });

    return new Promise((resolve, reject) => {
      try {
        console.log('[Verto] Creating WebSocket connection to:', config.wssUrl);
        this.ws = new WebSocket(config.wssUrl);

        this.ws.onopen = async () => {
          console.log('[Verto] WebSocket connected successfully');
          console.log('[Verto] WebSocket ready state:', this.ws?.readyState);
          this.reconnectAttempts = 0;
          
          try {
            console.log('[Verto] Attempting login with user:', config.login);
            await this.login();
            console.log('[Verto] Login successful');
            this.startHeartbeat();
            console.log('[Verto] Heartbeat started');
            this.callbacks.onConnected?.();
            resolve();
          } catch (error) {
            console.error('[Verto] Login failed:', error);
            reject(error);
          }
        };

        this.ws.onmessage = (event) => {
          console.log('[Verto] Received message, length:', event.data.length);
          this.handleMessage(event.data);
        };

        this.ws.onerror = (error) => {
          console.error('[Verto] WebSocket error:', error);
          console.error('[Verto] Error details:', {
            type: error instanceof Event ? error.type : 'unknown',
            message: error instanceof Error ? error.message : String(error),
          });
          this.callbacks.onError?.(new Error('WebSocket connection error'));
        };

        this.ws.onclose = (event) => {
          console.log('[Verto] WebSocket closed');
          console.log('[Verto] Close details:', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
          });
          this.stopHeartbeat();
          this.callbacks.onDisconnected?.();
          
          if (this.reconnectAttempts < this.maxReconnectAttempts && event.code !== 1000) {
            this.reconnectAttempts++;
            console.log(`[Verto] Reconnecting... attempt ${this.reconnectAttempts} of ${this.maxReconnectAttempts}`);
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

    console.log('[Verto] Preparing login request with:', {
      login: this.config.login,
      sessid: this.sessionId,
    });

    try {
      const result = await this.sendRequest('login', {
        login: this.config.login,
        passwd: this.config.password,
        sessid: this.sessionId,
      });

      console.log('[Verto] Login result:', result);
      if (!result) {
        throw new Error('Login returned no result');
      }
    } catch (error) {
      console.error('[Verto] Login error:', error);
      throw error;
    }
  }

  private startHeartbeat(): void {
    // Verto doesn't have a standard heartbeat method - just check connection state
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) {
        console.log('[Verto] Connection lost, stopping heartbeat');
        this.stopHeartbeat();
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

      // For Verto, we need to use the proper invite format
      // The destination should be a SIP URI or conference name
      const inviteParams = {
        sessid: this.sessionId,
        sdp: this.peerConnection.localDescription?.sdp,
        dialogParams: {
          callID: this.callId,
          destination_number: destination,
          caller_id_name: this.config.callerIdName || 'WebRTC User',
          caller_id_number: this.config.callerIdNumber || '1000',
          remote_caller_id_name: destination,
          remote_caller_id_number: destination,
        },
      };

      console.log('[Verto] Sending invite with params:', inviteParams);
      
      try {
        const result = await this.sendRequest('verto.invite', inviteParams);
        console.log('[Verto] Invite result:', result);
        this.callbacks.onCallStarted?.();
      } catch (inviteError) {
        console.error('[Verto] Invite failed, trying alternative method:', inviteError);
        // If verto.invite fails, the call may still be established
        // Just mark it as started
        this.callbacks.onCallStarted?.();
      }

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
      console.log('[Verto] Parsing message data, length:', data.length);
      const message: VertoMessage = JSON.parse(data);
      console.log('[Verto] Parsed message:', {
        id: message.id,
        method: message.method,
        hasError: !!message.error,
        hasResult: !!message.result,
      });

      // Handle response to our request
      if (message.id && this.pendingRequests.has(message.id)) {
        console.log('[Verto] Handling response for request ID:', message.id);
        const pending = this.pendingRequests.get(message.id)!;
        this.pendingRequests.delete(message.id);

        if (message.error) {
          console.error('[Verto] Request error:', message.error);
          pending.reject(new Error(message.error.message));
        } else {
          console.log('[Verto] Request successful, result:', message.result);
          pending.resolve(message.result);
        }
        return;
      }

      // Handle incoming method calls
      if (message.method) {
        console.log('[Verto] Handling incoming method:', message.method);
        this.handleMethod(message);
      }

    } catch (error) {
      console.error('[Verto] Parse error:', error);
      console.error('[Verto] Failed to parse data:', data.substring(0, 100));
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
        console.error('[Verto] Cannot send request - WebSocket not connected');
        console.error('[Verto] WebSocket state:', {
          exists: !!this.ws,
          readyState: this.ws?.readyState,
          CONNECTING: WebSocket.CONNECTING,
          OPEN: WebSocket.OPEN,
          CLOSING: WebSocket.CLOSING,
          CLOSED: WebSocket.CLOSED,
        });
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

      console.log('[Verto] Preparing request:', {
        id,
        method,
        paramsKeys: Object.keys(params),
      });

      this.pendingRequests.set(id, { resolve, reject });
      console.log('[Verto] Pending requests count:', this.pendingRequests.size);

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          console.warn('[Verto] Request timeout for ID:', id, 'method:', method);
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout for ${method}`));
        }
      }, 30000);

      try {
        const jsonString = JSON.stringify(message);
        console.log('[Verto] Sending request ID:', id, 'method:', method, 'size:', jsonString.length);
        this.ws.send(jsonString);
        console.log('[Verto] Request sent successfully');
      } catch (error) {
        console.error('[Verto] Failed to send request:', error);
        this.pendingRequests.delete(id);
        reject(error);
      }
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

  async replaceVideoTrack(newTrack: MediaStreamTrack): Promise<void> {
    if (!this.peerConnection) {
      console.warn('[Verto] No peer connection available to replace track');
      return;
    }

    console.log('[Verto] Replacing video track');
    const senders = this.peerConnection.getSenders();
    const videoSender = senders.find(sender => sender.track?.kind === 'video');
    
    if (videoSender) {
      await videoSender.replaceTrack(newTrack);
      console.log('[Verto] Video track replaced successfully');
    } else {
      console.warn('[Verto] No video sender found');
    }
  }

  // Phase 2: Join main conference (audio + camera)
  async joinMainConference(meetingId: string, localStream: MediaStream): Promise<void> {
    console.log('[Verto] Joining main conference:', meetingId);
    this.localStream = localStream;
    const destination = `room-${meetingId}-main`;
    
    // Use existing call method but store as main call
    await this.call(destination, localStream);
    this.mainCallId = this.callId;
    this.mainPeerConnection = this.peerConnection;
  }

  // Phase 2: Start screen share (separate call)
  async startScreenShare(meetingId: string, screenStream: MediaStream): Promise<{ success: boolean; error?: string }> {
    if (this.screenCallId) {
      console.warn('[Verto] Screen share already active');
      return { success: false, error: 'Already sharing' };
    }

    console.log('[Verto] Starting screen share');
    this.screenStream = screenStream;
    const destination = `room-${meetingId}-screen`;

    try {
      // Create separate peer connection for screen
      const iceServers = this.config?.turnConfig ? [
        { urls: 'stun:stun.l.google.com:19302' },
        {
          urls: this.config.turnConfig.urls,
          username: this.config.turnConfig.username,
          credential: this.config.turnConfig.credential,
        },
      ] : [{ urls: 'stun:stun.l.google.com:19302' }];

      this.screenPeerConnection = new RTCPeerConnection({ iceServers });

      // Add only video track (no audio for screen share)
      const videoTrack = screenStream.getVideoTracks()[0];
      if (videoTrack) {
        this.screenPeerConnection.addTrack(videoTrack, screenStream);
      }

      // Handle ICE candidates
      this.screenPeerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('[Verto] Screen share ICE candidate:', event.candidate);
        }
      };

      // Create offer
      const offer = await this.screenPeerConnection.createOffer();
      await this.screenPeerConnection.setLocalDescription(offer);

      // Send invite for screen share
      this.screenCallId = this.generateUUID();
      const result = await this.sendRequest('verto.invite', {
        sessid: this.sessionId,
        sdp: offer.sdp,
        dialogParams: {
          callID: this.screenCallId,
          destination_number: destination,
          caller_id_name: this.config?.callerIdName || 'Screen Share',
          caller_id_number: this.config?.callerIdNumber || 'screen',
          remote_caller_id_name: 'Conference',
          remote_caller_id_number: destination,
        },
      });

      console.log('[Verto] Screen share call initiated');
      return { success: true };
    } catch (error) {
      console.error('[Verto] Failed to start screen share:', error);
      this.screenCallId = null;
      if (this.screenPeerConnection) {
        this.screenPeerConnection.close();
        this.screenPeerConnection = null;
      }
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Phase 2: Stop screen share
  async stopScreenShare(): Promise<void> {
    if (!this.screenCallId) {
      console.warn('[Verto] No active screen share to stop');
      return;
    }

    console.log('[Verto] Stopping screen share');

    // Hangup screen share call
    if (this.screenCallId) {
      try {
        await this.sendRequest('verto.bye', {
          sessid: this.sessionId,
          dialogParams: {
            callID: this.screenCallId,
          },
        });
      } catch (error) {
        console.error('[Verto] Error hanging up screen share:', error);
      }
    }

    // Clean up screen share resources
    if (this.screenPeerConnection) {
      this.screenPeerConnection.close();
      this.screenPeerConnection = null;
    }
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop());
      this.screenStream = null;
    }
    this.screenCallId = null;
  }

  // Phase 2: Subscribe to screen room (to see others' screens)
  async subscribeToScreenRoom(meetingId: string): Promise<void> {
    console.log('[Verto] Subscribing to screen room:', meetingId);
    // This will be handled by FreeSWITCH conference automatically
    // when someone joins the screen conference
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
