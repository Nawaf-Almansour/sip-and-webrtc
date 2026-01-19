type MessageHandler = (message: any) => void;

interface TrackMetadata {
  participantId: string;
  type: 'camera' | 'screen' | 'audio';
  mode: 'p2p' | 'mcu';
  mid?: string;
  timestamp: number;
}

interface ParticipantTracks {
  audio: MediaStreamTrack | null;
  camera: MediaStreamTrack | null;
  screen: MediaStreamTrack | null;
}

interface PeerConnection {
  pc: RTCPeerConnection;
  stream?: MediaStream;
  cameraStream?: MediaStream;
  screenStream?: MediaStream;
}

export class WebRTCService {
  private ws: WebSocket | null = null;
  private localStream: MediaStream | null = null;
  private localTracks: ParticipantTracks = {
    audio: null,
    camera: null,
    screen: null,
  };
  private transceiverMap = new Map<string, string>();  // MID -> track type
  private peerConnections = new Map<string, PeerConnection>();
  private pendingIceCandidates = new Map<string, RTCIceCandidateInit[]>();  // Queue ICE candidates
  private participantId: string = '';
  private meetingId: string = '';
  private displayName: string = '';
  private connectionMode: 'p2p' | 'mcu' = 'p2p';
  private trackMetadataMap = new Map<string, TrackMetadata>();  // trackId -> metadata
  private iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
  private onRemoteStream: ((participantId: string, stream: MediaStream) => void) | null = null;
  private onRemoteCameraStream: ((participantId: string, stream: MediaStream) => void) | null = null;
  private onRemoteScreenStream: ((participantId: string, stream: MediaStream) => void) | null = null;
  private onParticipantLeft: ((participantId: string) => void) | null = null;
  private onParticipantJoined: ((participantId: string, displayName: string) => void) | null = null;
  private onChatMessage: ((from: string, displayName: string, message: string, timestamp: string) => void) | null = null;

  connect(
    meetingId: string,
    participantId: string,
    displayName: string,
    localStream: MediaStream,
    callbacks: {
      onRemoteStream: (participantId: string, stream: MediaStream) => void;
      onRemoteCameraStream?: (participantId: string, stream: MediaStream) => void;
      onRemoteScreenStream?: (participantId: string, stream: MediaStream) => void;
      onParticipantLeft: (participantId: string) => void;
      onParticipantJoined: (participantId: string, displayName: string) => void;
      onChatMessage?: (from: string, displayName: string, message: string, timestamp: string) => void;
    },
    iceServers?: RTCIceServer[],
    wsToken?: string
  ) {
    if (iceServers && iceServers.length > 0) {
      this.iceServers = iceServers;
      console.log('[WebRTC] Using provided ICE servers:', iceServers);
    }
    this.meetingId = meetingId;
    this.participantId = participantId;
    this.displayName = displayName;
    this.localStream = localStream;
    
    // Initialize local tracks from stream
    const audioTrack = localStream.getAudioTracks()[0];
    const videoTrack = localStream.getVideoTracks()[0];
    this.localTracks.audio = audioTrack || null;
    this.localTracks.camera = videoTrack || null;
    this.localTracks.screen = null;
    
    this.onRemoteStream = callbacks.onRemoteStream;
    this.onRemoteCameraStream = callbacks.onRemoteCameraStream || null;
    this.onRemoteScreenStream = callbacks.onRemoteScreenStream || null;
    this.onParticipantLeft = callbacks.onParticipantLeft;
    this.onParticipantJoined = callbacks.onParticipantJoined;
    this.onChatMessage = callbacks.onChatMessage || null;

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
    
    // Use nullish coalescing for cleaner token fallback
    const token = wsToken ?? 'guest';
    
    console.log('[WebSocket] Token value:', token);
    console.log('[WebSocket] Using guest token:', token === 'guest');
    
    this.ws = new WebSocket(wsUrl);
    
    this.ws.onopen = () => {
      console.log('[WebSocket] Connected to signaling server');
      console.log('[WebSocket] Sending join message:', { 
        meetingId, 
        participantId, 
        displayName,
        token
      });
      this.send({
        type: 'join',
        meetingId,
        participantId,
        displayName,
        token,
      });
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('[WebSocket] Received message:', message.type, message);
        this.handleMessage(message);
      } catch (err) {
        console.error('[WebSocket] Failed to parse message:', event.data, err);
      }
    };

    this.ws.onerror = (error) => {
      console.error('[WebSocket] Connection error:', error);
      console.error('[WebSocket] Error details:', {
        type: error instanceof Event ? error.type : 'unknown',
        message: error instanceof Error ? error.message : String(error),
      });
    };

    this.ws.onclose = (event) => {
      console.log('[WebSocket] Connection closed');
      console.log('[WebSocket] Close code:', event.code, 'Reason:', event.reason);
    };
  }

  private send(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('[WebSocket] Sending message:', message.type, message);
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('[WebSocket] Cannot send message - WebSocket not ready. State:', this.ws?.readyState);
    }
  }

  private async handleMessage(message: any) {
    console.log('[WebSocket] Handling message type:', message.type);
    try {
      switch (message.type) {
        case 'error':
        case 'auth_error':
          console.error('[WebSocket] Authentication error:', message.message);
          console.error('[WebSocket] Error details:', message);
          break;

        case 'existing-participants':
          console.log('[WebSocket] Processing existing participants:', message.participants?.length || 0);
          for (const participant of message.participants) {
            console.log('[WebSocket] Creating peer connection for existing participant:', participant.id);
            await this.createPeerConnection(participant.id, true);
            this.onParticipantJoined?.(participant.id, participant.displayName);
          }
          break;

        case 'user-joined':
          console.log('[WebSocket] User joined:', message.participantId, message.displayName);
          await this.createPeerConnection(message.participantId, false);
          this.onParticipantJoined?.(message.participantId, message.displayName);
          break;

        case 'user-left':
          console.log('[WebSocket] User left:', message.participantId);
          this.closePeerConnection(message.participantId);
          this.onParticipantLeft?.(message.participantId);
          break;

        case 'offer':
          console.log('[WebSocket] Received offer from:', message.from);
          await this.handleOffer(message.from, message.offer);
          break;

        case 'answer':
          console.log('[WebSocket] Received answer from:', message.from);
          await this.handleAnswer(message.from, message.answer);
          break;

        case 'ice-candidate':
          console.log('[WebSocket] Received ICE candidate from:', message.from);
          await this.handleIceCandidate(message.from, message.candidate);
          break;

        case 'chat':
          console.log('[WebSocket] Received chat message from:', message.from);
          this.onChatMessage?.(message.from, message.displayName, message.message, message.timestamp);
          break;

        default:
          console.warn('[WebSocket] Unknown message type:', message.type);
      }
    } catch (err) {
      console.error('[WebSocket] Error handling message:', err, 'Message:', message);
    }
  }

  sendChatMessage(message: string) {
    this.send({
      type: 'chat',
      message,
    });
  }

  private async createPeerConnection(remoteId: string, createOffer: boolean) {
    if (this.peerConnections.has(remoteId)) {
      return;
    }

    console.log('[WebRTC] Creating peer connection, createOffer:', createOffer);
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });

    // Add local tracks using addTrack - this creates transceivers automatically
    // and ensures sendrecv direction with actual tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream!);
        
        // Determine track type from label or kind
        let trackType: 'camera' | 'screen' | 'audio' = 'camera';
        if (track.kind === 'audio') {
          trackType = 'audio';
        } else if (track.label.includes('screen') || track.label.includes('Screen')) {
          trackType = 'screen';
        }
        
        // Add metadata to track
        const metadata: TrackMetadata = {
          participantId: this.participantId,
          type: trackType,
          mode: this.connectionMode,
          timestamp: Date.now(),
        };
        this.trackMetadataMap.set(track.id, metadata);
        (track as any).meta = metadata;
        
        console.log(`[WebRTC] Added ${track.kind} track via addTrack`, {
          trackId: track.id,
          trackLabel: track.label,
          trackType,
          mode: this.connectionMode,
          enabled: track.enabled,
          kind: track.kind,
        });
        
        // Track enabled/disabled state changes
        track.onended = () => {
          console.log(`[WebRTC] ${track.kind} track ended:`, {
            trackId: track.id,
            trackLabel: track.label,
            metadata: this.trackMetadataMap.get(track.id),
          });
          this.trackMetadataMap.delete(track.id);
        };
        
        track.onmute = () => {
          console.log(`[WebRTC] ${track.kind} track muted:`, {
            trackId: track.id,
            trackLabel: track.label,
            metadata: this.trackMetadataMap.get(track.id),
          });
        };
        
        track.onunmute = () => {
          console.log(`[WebRTC] ${track.kind} track unmuted:`, {
            trackId: track.id,
            trackLabel: track.label,
            metadata: this.trackMetadataMap.get(track.id),
          });
        };
      });
    }

    // Add a third transceiver for screen share (initially empty)
    // Only do this for offerer to avoid duplicates
    if (createOffer) {
      const screenTransceiver = pc.addTransceiver('video', { direction: 'sendrecv' });
      console.log('[WebRTC] Added screen transceiver for offer');
    }

    console.log('[WebRTC] Transceivers after setup:', pc.getTransceivers().length);

    // Store MID mappings after SDP is created
    pc.addEventListener('icegatheringstatechange', () => {
      console.log('[WebRTC] ICE gathering state:', pc.iceGatheringState);
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.send({
          type: 'ice-candidate',
          to: remoteId,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      console.log('[WebRTC] ontrack event:', {
        mid: event.transceiver.mid,
        trackKind: event.track.kind,
        trackLabel: event.track.label,
        trackId: event.track.id,
        streamId: event.streams[0]?.id,
        transceiverDirection: event.transceiver.direction,
        transceiverCurrentDirection: event.transceiver.currentDirection,
        remoteId,
      });
      
      const peerConn = this.peerConnections.get(remoteId);
      
      if (!peerConn) {
        console.warn('[WebRTC] No peer connection found for remote:', remoteId);
        return;
      }

      // Determine track type based on track kind and MID
      let trackType: 'camera' | 'screen' | 'audio' = 'camera';
      if (event.track.kind === 'audio') {
        trackType = 'audio';
      } else if (event.track.kind === 'video') {
        // Use MID to determine if it's camera (0) or screen (2)
        // MID 0 = camera, MID 1 = audio, MID 2 = screen
        if (event.transceiver.mid === '0') {
          trackType = 'camera';
        } else if (event.transceiver.mid === '2') {
          trackType = 'screen';
        } else {
          // Fallback: first video is camera, second is screen
          trackType = !peerConn.cameraStream ? 'camera' : 'screen';
        }
      }
      
      // Add metadata to remote track
      const remoteMetadata: TrackMetadata = {
        participantId: remoteId,
        type: trackType,
        mode: this.connectionMode,
        mid: event.transceiver.mid || undefined,
        timestamp: Date.now(),
      };
      this.trackMetadataMap.set(event.track.id, remoteMetadata);
      (event.track as any).meta = remoteMetadata;
      
      console.log('[WebRTC] Track type determined:', trackType, 'for mid:', event.transceiver.mid, 'from:', remoteId, 'metadata:', remoteMetadata);
      
      // Create proper stream if not provided
      let stream = event.streams[0];
      if (!stream && event.track) {
        console.log('[WebRTC] Creating new stream for track:', trackType, 'from:', remoteId);
        stream = new MediaStream([event.track]);
      }

      // Add track state change listeners
      event.track.onended = () => {
        console.log(`[WebRTC] ${trackType} track ended from ${remoteId}:`, {
          trackId: event.track.id,
          trackLabel: event.track.label,
          metadata: this.trackMetadataMap.get(event.track.id),
        });
        this.trackMetadataMap.delete(event.track.id);
      };
      
      event.track.onmute = () => {
        console.log(`[WebRTC] ${trackType} track muted from ${remoteId}:`, {
          trackId: event.track.id,
          trackLabel: event.track.label,
          metadata: this.trackMetadataMap.get(event.track.id),
        });
      };
      
      event.track.onunmute = () => {
        console.log(`[WebRTC] ${trackType} track unmuted from ${remoteId}:`, {
          trackId: event.track.id,
          trackLabel: event.track.label,
          metadata: this.trackMetadataMap.get(event.track.id),
        });
      };

      // Handle tracks by type
      if (trackType === 'audio') {
        console.log('[WebRTC] 🎤 AUDIO track received from:', remoteId, 'stream:', stream?.id);
        peerConn.stream = stream;
        this.onRemoteStream?.(remoteId, stream);
      } else if (trackType === 'camera') {
        console.log('[WebRTC] 📹 CAMERA video track received from:', remoteId, 'stream:', stream?.id);
        peerConn.cameraStream = stream;
        this.onRemoteCameraStream?.(remoteId, stream);
        this.onRemoteStream?.(remoteId, stream);
      } else if (trackType === 'screen') {
        console.log('[WebRTC] 📺 SCREEN SHARE track received from:', remoteId, 'stream:', stream?.id);
        peerConn.screenStream = stream;
        this.onRemoteScreenStream?.(remoteId, stream);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`ICE connection state with ${remoteId}: ${pc.iceConnectionState}`);
    };

    this.peerConnections.set(remoteId, { pc });

    if (createOffer) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.send({
          type: 'offer',
          to: remoteId,
          offer: pc.localDescription,
        });
      } catch (err) {
        console.error('Error creating offer:', err);
      }
    }
  }

  private getTrackType(mid: string | null, label: string): string {
    // Primary: Use MID mapping (reliable)
    if (mid && this.transceiverMap.has(mid)) {
      return this.transceiverMap.get(mid)!;
    }
    
    // Fallback: Use label (less reliable, Safari can change labels)
    if (label.includes('camera')) return 'camera';
    if (label.includes('screen')) return 'screen';
    
    return 'unknown';
  }

  private async handleOffer(fromId: string, offer: RTCSessionDescriptionInit) {
    console.log(`[WebRTC] Received offer from ${fromId}`);
    let peerConn = this.peerConnections.get(fromId);
    
    if (!peerConn) {
      await this.createPeerConnection(fromId, false);
      peerConn = this.peerConnections.get(fromId);
    }

    if (!peerConn) return;

    try {
      await peerConn.pc.setRemoteDescription(new RTCSessionDescription(offer));
      console.log(`[WebRTC] Set remote description from ${fromId}`);
      console.log(`[WebRTC] Transceivers after setRemoteDescription:`, peerConn.pc.getTransceivers().length);
      
      // Process any queued ICE candidates now that remote description is set
      await this.processPendingIceCandidates(fromId);
      
      const answer = await peerConn.pc.createAnswer();
      await peerConn.pc.setLocalDescription(answer);
      console.log(`[WebRTC] Sending answer to ${fromId}`);
      this.send({
        type: 'answer',
        to: fromId,
        answer: peerConn.pc.localDescription,
      });
    } catch (err) {
      console.error('[WebRTC] Error handling offer:', err);
    }
  }

  private async handleAnswer(fromId: string, answer: RTCSessionDescriptionInit) {
    console.log(`[WebRTC] Received answer from ${fromId}`);
    const peerConn = this.peerConnections.get(fromId);
    if (!peerConn) return;

    try {
      await peerConn.pc.setRemoteDescription(new RTCSessionDescription(answer));
      console.log(`[WebRTC] Set remote description (answer) from ${fromId}`);
      
      // Process any queued ICE candidates now that remote description is set
      await this.processPendingIceCandidates(fromId);
    } catch (err) {
      console.error('[WebRTC] Error handling answer:', err);
    }
  }

  private async handleIceCandidate(fromId: string, candidate: RTCIceCandidateInit) {
    const peerConn = this.peerConnections.get(fromId);
    
    if (!peerConn) {
      // Queue ICE candidate if peer connection doesn't exist yet
      console.log(`[WebRTC] Queuing ICE candidate for ${fromId} (peer not ready)`);
      if (!this.pendingIceCandidates.has(fromId)) {
        this.pendingIceCandidates.set(fromId, []);
      }
      this.pendingIceCandidates.get(fromId)!.push(candidate);
      return;
    }

    // Check if remote description is set
    if (!peerConn.pc.remoteDescription) {
      console.log(`[WebRTC] Queuing ICE candidate for ${fromId} (no remote description)`);
      if (!this.pendingIceCandidates.has(fromId)) {
        this.pendingIceCandidates.set(fromId, []);
      }
      this.pendingIceCandidates.get(fromId)!.push(candidate);
      return;
    }

    try {
      await peerConn.pc.addIceCandidate(new RTCIceCandidate(candidate));
      console.log(`[WebRTC] Added ICE candidate from ${fromId}`);
    } catch (err) {
      console.error('[WebRTC] Error adding ICE candidate:', err);
    }
  }

  private async processPendingIceCandidates(remoteId: string) {
    const pending = this.pendingIceCandidates.get(remoteId);
    if (!pending || pending.length === 0) return;

    const peerConn = this.peerConnections.get(remoteId);
    if (!peerConn || !peerConn.pc.remoteDescription) return;

    console.log(`[WebRTC] Processing ${pending.length} pending ICE candidates for ${remoteId}`);
    
    for (const candidate of pending) {
      try {
        await peerConn.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('[WebRTC] Error adding pending ICE candidate:', err);
      }
    }
    
    this.pendingIceCandidates.delete(remoteId);
  }

  private closePeerConnection(remoteId: string) {
    const peerConn = this.peerConnections.get(remoteId);
    if (peerConn) {
      peerConn.pc.close();
      this.peerConnections.delete(remoteId);
    }
  }

  getPeerConnections(): Map<string, RTCPeerConnection> {
    const connections = new Map<string, RTCPeerConnection>();
    this.peerConnections.forEach((value, key) => {
      connections.set(key, value.pc);
    });
    return connections;
  }

  getFirstPeerConnection(): RTCPeerConnection | null {
    const firstEntry = this.peerConnections.values().next();
    return firstEntry.done ? null : firstEntry.value.pc;
  }

  async setCameraTrack(track: MediaStreamTrack | null) {
    console.log('[WebRTC] Setting camera track:', track ? 'active' : 'null');
    this.localTracks.camera = track;
    
    // Update all peer connections
    const promises = Array.from(this.peerConnections.values()).map(async (peerConn) => {
      const transceivers = peerConn.pc.getTransceivers();
      // Find the first video transceiver (camera) - it's the one we added with addTrack
      const videoTransceivers = transceivers.filter(t => t.receiver.track?.kind === 'video' || t.sender.track?.kind === 'video');
      const cameraTransceiver = videoTransceivers[0]; // First video is camera
      
      if (cameraTransceiver?.sender) {
        await cameraTransceiver.sender.replaceTrack(track);
        console.log('[WebRTC] Camera track replaced successfully');
      } else {
        console.warn('[WebRTC] Camera transceiver not found');
      }
    });
    
    await Promise.all(promises);
  }

  async setScreenTrack(track: MediaStreamTrack | null) {
    console.log('[WebRTC] Setting screen track:', track ? 'active' : 'null');
    this.localTracks.screen = track;
    
    // Update all peer connections
    const promises = Array.from(this.peerConnections.values()).map(async (peerConn) => {
      const transceivers = peerConn.pc.getTransceivers();
      console.log('[WebRTC] All transceivers for screen share:', transceivers.map((t, i) => ({
        index: i,
        mid: t.mid,
        direction: t.direction,
        senderTrackKind: t.sender.track?.kind,
        receiverTrackKind: t.receiver.track?.kind
      })));
      
      // Find the screen transceiver - it's the video transceiver WITHOUT a sender track
      // (audio and camera transceivers have tracks from addTrack)
      let screenTransceiver = transceivers.find(t => 
        t.receiver.track?.kind === 'video' && !t.sender.track
      );
      
      // If no empty video transceiver, this might be a renegotiation - find by stored reference
      // or use the last video transceiver
      if (!screenTransceiver) {
        const videoTransceivers = transceivers.filter(t => 
          t.receiver.track?.kind === 'video' || t.sender.track?.kind === 'video'
        );
        // Last video transceiver is screen (we add camera first, then screen)
        if (videoTransceivers.length >= 2) {
          screenTransceiver = videoTransceivers[videoTransceivers.length - 1];
        }
      }
      
      if (screenTransceiver?.sender) {
        await screenTransceiver.sender.replaceTrack(track);
        console.log('[WebRTC] Screen track replaced successfully, mid:', screenTransceiver.mid);
        
        // If adding track, we need to renegotiate to inform the remote peer
        if (track) {
          console.log('[WebRTC] Renegotiating after screen track added');
          const offer = await peerConn.pc.createOffer();
          await peerConn.pc.setLocalDescription(offer);
          
          // Find the remote ID for this peer connection
          for (const [remoteId, conn] of this.peerConnections.entries()) {
            if (conn === peerConn) {
              this.send({
                type: 'offer',
                to: remoteId,
                offer: peerConn.pc.localDescription,
              });
              break;
            }
          }
        }
      } else {
        console.warn('[WebRTC] Screen transceiver not found, total transceivers:', transceivers.length);
      }
    });
    
    await Promise.all(promises);
  }

  async replaceVideoTrack(newTrack: MediaStreamTrack) {
    console.log('[WebRTC] Replacing video track in all peer connections');
    const promises: Promise<void>[] = [];

    this.peerConnections.forEach((peerConnection) => {
      const senders = peerConnection.pc.getSenders();
      const videoSender = senders.find(sender => sender.track?.kind === 'video');
      
      if (videoSender) {
        promises.push(
          videoSender.replaceTrack(newTrack).then(() => {
            console.log('[WebRTC] Video track replaced successfully');
          }).catch(err => {
            console.error('[WebRTC] Failed to replace track:', err);
          })
        );
      }
    });

    await Promise.all(promises);
  }

  disconnect() {
    this.peerConnections.forEach((pc) => {
      pc.pc.close();
    });
    this.peerConnections.clear();

    if (this.ws) {
      this.send({ type: 'leave' });
      this.ws.close();
      this.ws = null;
    }
  }

  getRemoteStream(participantId: string): MediaStream | undefined {
    return this.peerConnections.get(participantId)?.stream;
  }

  getPeerConnectionStatus(): { [key: string]: any } {
    const status: { [key: string]: any } = {};
    this.peerConnections.forEach((conn, participantId) => {
      status[participantId] = {
        connectionState: conn.pc.connectionState,
        iceConnectionState: conn.pc.iceConnectionState,
        iceGatheringState: conn.pc.iceGatheringState,
        signalingState: conn.pc.signalingState,
      };
    });
    return status;
  }
}

export const webrtcService = new WebRTCService();
