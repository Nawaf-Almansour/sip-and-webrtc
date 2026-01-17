type MessageHandler = (message: any) => void;

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

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

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
  private participantId: string = '';
  private meetingId: string = '';
  private displayName: string = '';
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
    }
  ) {
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
    
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.send({
        type: 'join',
        meetingId,
        participantId,
        displayName,
      });
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleMessage(message);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
    };
  }

  private send(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private async handleMessage(message: any) {
    switch (message.type) {
      case 'existing-participants':
        for (const participant of message.participants) {
          await this.createPeerConnection(participant.id, true);
          this.onParticipantJoined?.(participant.id, participant.displayName);
        }
        break;

      case 'user-joined':
        await this.createPeerConnection(message.participantId, false);
        this.onParticipantJoined?.(message.participantId, message.displayName);
        break;

      case 'user-left':
        this.closePeerConnection(message.participantId);
        this.onParticipantLeft?.(message.participantId);
        break;

      case 'offer':
        await this.handleOffer(message.from, message.offer);
        break;

      case 'answer':
        await this.handleAnswer(message.from, message.answer);
        break;

      case 'ice-candidate':
        await this.handleIceCandidate(message.from, message.candidate);
        break;

      case 'chat':
        this.onChatMessage?.(message.from, message.displayName, message.message, message.timestamp);
        break;
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

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Add transceivers for each track type (audio, camera, screen)
    const audioTransceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
    const cameraTransceiver = pc.addTransceiver('video', { direction: 'sendrecv' });
    const screenTransceiver = pc.addTransceiver('video', { direction: 'sendrecv' });

    // Store MID mappings after negotiation
    pc.addEventListener('negotiationneeded', () => {
      if (audioTransceiver.mid) {
        this.transceiverMap.set(audioTransceiver.mid, 'audio');
      }
      if (cameraTransceiver.mid) {
        this.transceiverMap.set(cameraTransceiver.mid, 'camera');
      }
      if (screenTransceiver.mid) {
        this.transceiverMap.set(screenTransceiver.mid, 'screen');
      }
    });

    // Assign local tracks to transceivers
    if (this.localTracks.audio) {
      await audioTransceiver.sender.replaceTrack(this.localTracks.audio);
    }
    if (this.localTracks.camera) {
      await cameraTransceiver.sender.replaceTrack(this.localTracks.camera);
    }
    if (this.localTracks.screen) {
      await screenTransceiver.sender.replaceTrack(this.localTracks.screen);
    }

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
      const trackType = this.getTrackType(event.transceiver.mid, event.track.label);
      const stream = event.streams[0];
      const peerConn = this.peerConnections.get(remoteId);
      
      if (!peerConn) return;

      // Handle different track types
      if (trackType === 'camera') {
        peerConn.cameraStream = stream;
        this.onRemoteCameraStream?.(remoteId, stream);
        this.onRemoteStream?.(remoteId, stream); // Backward compatibility
      } else if (trackType === 'screen') {
        peerConn.screenStream = stream;
        this.onRemoteScreenStream?.(remoteId, stream);
      } else {
        // Fallback for audio or unknown
        peerConn.stream = stream;
        this.onRemoteStream?.(remoteId, stream);
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
    let peerConn = this.peerConnections.get(fromId);
    
    if (!peerConn) {
      await this.createPeerConnection(fromId, false);
      peerConn = this.peerConnections.get(fromId);
    }

    if (!peerConn) return;

    try {
      await peerConn.pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConn.pc.createAnswer();
      await peerConn.pc.setLocalDescription(answer);
      this.send({
        type: 'answer',
        to: fromId,
        answer: peerConn.pc.localDescription,
      });
    } catch (err) {
      console.error('Error handling offer:', err);
    }
  }

  private async handleAnswer(fromId: string, answer: RTCSessionDescriptionInit) {
    const peerConn = this.peerConnections.get(fromId);
    if (!peerConn) return;

    try {
      await peerConn.pc.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
      console.error('Error handling answer:', err);
    }
  }

  private async handleIceCandidate(fromId: string, candidate: RTCIceCandidateInit) {
    const peerConn = this.peerConnections.get(fromId);
    if (!peerConn) return;

    try {
      await peerConn.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error('Error adding ICE candidate:', err);
    }
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
    console.log('[WebRTC] Setting camera track');
    this.localTracks.camera = track;
    
    // Update all peer connections
    const promises = Array.from(this.peerConnections.values()).map(async (peerConn) => {
      const transceivers = peerConn.pc.getTransceivers();
      // Find camera transceiver (second video transceiver, index 1)
      const cameraTransceiver = transceivers.find((t, idx) => 
        t.receiver.track?.kind === 'video' && idx === 1
      );
      
      if (cameraTransceiver?.sender) {
        await cameraTransceiver.sender.replaceTrack(track);
        console.log('[WebRTC] Camera track replaced successfully');
      }
    });
    
    await Promise.all(promises);
  }

  async setScreenTrack(track: MediaStreamTrack | null) {
    console.log('[WebRTC] Setting screen track');
    this.localTracks.screen = track;
    
    // Update all peer connections
    const promises = Array.from(this.peerConnections.values()).map(async (peerConn) => {
      const transceivers = peerConn.pc.getTransceivers();
      // Find screen transceiver (third video transceiver, index 2)
      const screenTransceiver = transceivers.find((t, idx) => 
        t.receiver.track?.kind === 'video' && idx === 2
      );
      
      if (screenTransceiver?.sender) {
        await screenTransceiver.sender.replaceTrack(track);
        console.log('[WebRTC] Screen track replaced successfully');
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
}

export const webrtcService = new WebRTCService();
