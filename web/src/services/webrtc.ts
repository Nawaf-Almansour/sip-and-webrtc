type MessageHandler = (message: any) => void;

interface PeerConnection {
  pc: RTCPeerConnection;
  stream?: MediaStream;
}

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export class WebRTCService {
  private ws: WebSocket | null = null;
  private localStream: MediaStream | null = null;
  private peerConnections = new Map<string, PeerConnection>();
  private participantId: string = '';
  private meetingId: string = '';
  private displayName: string = '';
  private onRemoteStream: ((participantId: string, stream: MediaStream) => void) | null = null;
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
      onParticipantLeft: (participantId: string) => void;
      onParticipantJoined: (participantId: string, displayName: string) => void;
      onChatMessage?: (from: string, displayName: string, message: string, timestamp: string) => void;
    }
  ) {
    this.meetingId = meetingId;
    this.participantId = participantId;
    this.displayName = displayName;
    this.localStream = localStream;
    this.onRemoteStream = callbacks.onRemoteStream;
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
      const stream = event.streams[0];
      const peerConn = this.peerConnections.get(remoteId);
      if (peerConn) {
        peerConn.stream = stream;
      }
      this.onRemoteStream?.(remoteId, stream);
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`ICE connection state with ${remoteId}: ${pc.iceConnectionState}`);
    };

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream!);
      });
    }

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

  disconnect() {
    this.peerConnections.forEach((peerConn, id) => {
      peerConn.pc.close();
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
