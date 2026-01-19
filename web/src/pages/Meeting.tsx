import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Mic, MicOff, Video, VideoOff, Monitor, Link2, PhoneOff, Users, Settings, MessageSquare, Grid3x3, Maximize, PanelRight, X } from 'lucide-react';
import VideoGrid, { LayoutType } from '../components/VideoGrid';
import MeetingQuality from '../components/MeetingQuality';
import { mediaService } from '../services/mediaService';
import { useSpeakerDetection } from '../hooks/useSpeakerDetection';

interface JoinData {
  sipUri: string;
  joinToken: string;
  wssUrl: string;
  participantId: string;
  turnConfig: {
    urls: string[];
    username: string;
    credential: string;
  };
}

interface Participant {
  id: string;
  shortId?: string;
  displayName: string;
  role: string;
  connectionMode?: string;
  isMuted?: boolean;
  isVideoOff?: boolean;
  joinedAt: string;
  stream?: MediaStream;
  isLocal?: boolean;
}

export default function Meeting() {
  const { meetingId } = useParams<{ meetingId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const displayName = searchParams.get('name') || 'Guest';
  const role = searchParams.get('role') || 'participant';
  const connectionMode = (searchParams.get('mode') as 'webrtc' | 'verto') || 'webrtc';

  const [joinData, setJoinData] = useState<JoinData | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [remoteCameraStreams, setRemoteCameraStreams] = useState<Map<string, MediaStream>>(new Map());
  const [remoteScreenStreams, setRemoteScreenStreams] = useState<Map<string, MediaStream>>(new Map());
  
  // Mapping between signaling IDs (guest-xxxx) and backend UUIDs
  const participantIdMapRef = useRef<Map<string, string>>(new Map());
  
  // Debug: Log stream maps whenever they change
  useEffect(() => {
    console.log('[Meeting] Stream maps state:', {
      remoteStreamsSize: remoteStreams.size,
      remoteCameraStreamsSize: remoteCameraStreams.size,
      remoteScreenStreamsSize: remoteScreenStreams.size,
      remoteStreamKeys: Array.from(remoteStreams.keys()),
      remoteCameraStreamKeys: Array.from(remoteCameraStreams.keys()),
      remoteScreenStreamKeys: Array.from(remoteScreenStreams.keys()),
      participantIds: participants.map(p => p.id),
    });
  }, [remoteStreams, remoteCameraStreams, remoteScreenStreams, participants]);
  const [showParticipants, setShowParticipants] = useState(true);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [localCameraStream, setLocalCameraStream] = useState<MediaStream | null>(null);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notifications, setNotifications] = useState<{id: string; message: string; type: 'join' | 'leave'}[]>([]);
  const [showHostControls, setShowHostControls] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<{id: string; from: string; displayName: string; message: string; timestamp: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [waitingParticipants, setWaitingParticipants] = useState<{id: string; displayName: string; shortId: string}[]>([]);
  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(null);
  const [layout, setLayout] = useState<LayoutType>('grid');
  const localStreamRef = useRef<MediaStream | null>(null);
  const hasJoinedRef = useRef(false);
  const webrtcConnectedRef = useRef(false);
  const isHost = role === 'host';

  // Listen for layout updates from backend
  useEffect(() => {
    const handleLayoutUpdate = (message: any) => {
      if (message.type === 'layout-update') {
        console.log('[Meeting] 📐 Received layout update from backend:', {
          layout: message.layout,
          reason: message.reason,
          participantCount: message.participantCount,
          screenSharerId: message.screenSharerId,
          activeSpeakerId: message.activeSpeakerId,
          timestamp: new Date(message.timestamp).toLocaleTimeString(),
        });
        setLayout(message.layout);
      }
    };

    // Subscribe to layout updates
    mediaService.on('layout-update', handleLayoutUpdate);

    return () => {
      mediaService.off('layout-update', handleLayoutUpdate);
    };
  }, []);

  const addNotification = (message: string, type: 'join' | 'leave') => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 3000);
  };

  // Normalize participant ID: convert signaling ID (guest-xxxx) to backend UUID
  const normalizeParticipantId = (id: string): string => {
    // If it's already a UUID, return as-is
    if (id.includes('-') && id.length === 36) {
      return id;
    }
    
    // If it's a signaling ID (guest-xxxx), try to find the backend UUID
    if (participantIdMapRef.current.has(id)) {
      return participantIdMapRef.current.get(id)!;
    }
    
    // If we have participants, try to match by index or other means
    // For now, return the signaling ID as fallback
    return id;
  };

  // Get backend UUID from signaling ID by matching with participants
  const getBackendIdFromSignalingId = (signalingId: string): string => {
    // First check if we have a direct mapping
    if (participantIdMapRef.current.has(signalingId)) {
      return participantIdMapRef.current.get(signalingId)!;
    }
    
    // Try to find matching participant by display name or other attributes
    // For now, just return the signaling ID as fallback
    console.log('[Meeting] No mapping found for signaling ID:', signalingId, 'using as-is');
    return signalingId;
  };

  const shareUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/join/${meetingId}` 
    : '';

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const startLocalMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setLocalCameraStream(stream);
      return stream;
    } catch (err: any) {
      console.error('Failed to get local media:', err);
      
      let errorMessage = 'Failed to access camera/microphone. ';
      
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMessage += 'Permission denied. Please click the camera icon (🎥) in your browser\'s address bar and allow access to camera and microphone, then refresh the page.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMessage += 'No camera or microphone found. Please connect your devices and refresh the page.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        errorMessage += 'Camera/microphone is already in use by another application. Please close other apps using your camera/microphone and refresh the page.';
      } else if (err.name === 'OverconstrainedError') {
        errorMessage += 'Camera/microphone constraints could not be satisfied. Please check your device settings.';
      } else if (err.name === 'NotSupportedError') {
        errorMessage += 'Your browser does not support camera/microphone access. Please use a modern browser like Chrome, Firefox, or Edge.';
      } else if (err.name === 'TypeError') {
        errorMessage += 'Camera/microphone access requires HTTPS. If accessing from another device, please use HTTPS or access from localhost.';
      } else {
        errorMessage += 'Please check your browser permissions and device settings.';
      }
      
      setError(errorMessage);
      return null;
    }
  }, []);

  const fetchParticipants = useCallback(async () => {
    try {
      const res = await fetch(`/api/meetings/${meetingId}/participants`);
      if (res.ok) {
        const data = await res.json();
        setParticipants(prev => {
          return data.participants.map((p: Participant) => {
            const existing = prev.find(ep => ep.id === p.id);
            return {
              ...p,
              stream: existing?.stream,
              isLocal: p.id === joinData?.participantId,
            };
          });
        });
      }
    } catch (err) {
      console.error('Failed to fetch participants:', err);
    }
  }, [meetingId, joinData?.participantId]);

  useEffect(() => {
    if (!searchParams.get('name')) {
      navigate(`/?redirect=meeting&id=${meetingId}`);
      return;
    }

    if (hasJoinedRef.current) {
      return;
    }

    const joinMeeting = async () => {
      try {
        hasJoinedRef.current = true;
        const stream = await startLocalMedia();
        
        if (!stream) {
          throw new Error('Failed to get camera/microphone access');
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const res = await fetch(`/api/meetings/${meetingId}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayName, role, connectionMode }),
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);

        if (!res.ok) {
          hasJoinedRef.current = false;
          throw new Error('Failed to join meeting');
        }

        const data = await res.json();
        setJoinData(data);
        setConnected(true);

        // Connect using mediaService (supports both WebRTC P2P and SIP)
        if (localStreamRef.current && !webrtcConnectedRef.current) {
          webrtcConnectedRef.current = true;
          
          console.log(`[Meeting] Connecting via ${connectionMode} mode`);
          
          await mediaService.connect({
            mode: connectionMode,
            meetingId: meetingId!,
            participantId: data.participantId,
            displayName,
            localStream: localStreamRef.current,
            turnConfig: data.turnConfig,
            vertoConfig: connectionMode === 'verto' ? {
              wssUrl: `wss://${window.location.host}/verto`,
              login: 'admin@192.168.100.218',
              password: 'admin',
              callerIdName: displayName,
              callerIdNumber: data.participantId,
              turnConfig: data.turnConfig,
            } : {
              wssUrl: '',
              login: '',
              password: '',
            },
            callbacks: {
              onRemoteStream: (signalingId: string, stream: MediaStream) => {
                // Normalize the participant ID (convert guest-xxxx to UUID if needed)
                const normalizedId = normalizeParticipantId(signalingId);
                
                console.log('[Meeting] Received remote stream from:', {
                  signalingId,
                  normalizedId,
                  streamId: stream.id,
                });
                
                const audioTracks = stream.getAudioTracks();
                const videoTracks = stream.getVideoTracks();
                console.log('[Meeting] Stream routing:', {
                  signalingId,
                  normalizedId,
                  audioTracks: audioTracks.length,
                  videoTracks: videoTracks.length,
                });
                
                // Store streams under the normalized participant ID
                setRemoteStreams(prev => new Map(prev).set(normalizedId, stream));
                
                // In VERTO mode, populate camera streams from the main remote stream
                if (videoTracks.length > 0) {
                  setRemoteCameraStreams(prev => new Map(prev).set(normalizedId, stream));
                  console.log('[Meeting] Added camera stream for participant:', normalizedId);
                }
              },
              onRemoteCameraStream: (participantId: string, stream: MediaStream) => {
                // Normalize the participant ID
                const normalizedId = normalizeParticipantId(participantId);
                
                console.log('[Meeting] 📹 Received remote camera stream from:', {
                  participantId,
                  normalizedId,
                });
                const audioTracks = stream.getAudioTracks();
                const videoTracks = stream.getVideoTracks();
                console.log('[Meeting] Camera stream tracks:', {
                  participantId,
                  normalizedId,
                  audio: audioTracks.length,
                  video: videoTracks.length,
                  streamId: stream.id,
                });
                
                // Store under normalized ID
                setRemoteCameraStreams(prev => new Map(prev).set(normalizedId, stream));
              },
              onRemoteScreenStream: (participantId: string, stream: MediaStream) => {
                // Normalize the participant ID
                const normalizedId = normalizeParticipantId(participantId);
                
                console.log('[Meeting] 📺 Received remote screen stream from:', {
                  participantId,
                  normalizedId,
                });
                const audioTracks = stream.getAudioTracks();
                const videoTracks = stream.getVideoTracks();
                console.log('[Meeting] Screen stream tracks:', {
                  participantId,
                  normalizedId,
                  audio: audioTracks.length,
                  video: videoTracks.length,
                  streamId: stream.id,
                });
                
                // Store under normalized ID
                setRemoteScreenStreams(prev => new Map(prev).set(normalizedId, stream));
              },
              onParticipantLeft: (participantId: string) => {
                console.log('👋 PARTICIPANT LEFT:', {
                  participantId,
                  timestamp: new Date().toISOString(),
                  totalParticipants: participants.length - 1,
                });
                setRemoteStreams(prev => {
                  const newMap = new Map(prev);
                  newMap.delete(participantId);
                  return newMap;
                });
                setRemoteCameraStreams(prev => {
                  const newMap = new Map(prev);
                  newMap.delete(participantId);
                  return newMap;
                });
                setRemoteScreenStreams(prev => {
                  const newMap = new Map(prev);
                  newMap.delete(participantId);
                  return newMap;
                });
                setParticipants(prev => prev.filter(p => p.id !== participantId));
                addNotification('A participant left the meeting', 'leave');
              },
              onParticipantJoined: (signalingId: string, name: string) => {
                console.log('👋 PARTICIPANT JOINED:', {
                  signalingId,
                  displayName: name,
                  timestamp: new Date().toISOString(),
                  totalParticipants: participants.length + 1,
                });
                // Map signaling ID to backend UUID when participant joins
                // This will be matched with fetchParticipants results
                participantIdMapRef.current.set(signalingId, signalingId);
                addNotification(`${name} joined the meeting`, 'join');
              },
              onChatMessage: (from: string, senderName: string, message: string, timestamp: number) => {
                setChatMessages(prev => [...prev, {
                  id: `${from}-${timestamp}`,
                  from,
                  displayName: senderName,
                  message,
                  timestamp: String(timestamp),
                }]);
              },
              onError: (error: Error) => {
                console.error('Media service error:', error);
                setError(error?.message || String(error) || 'Unknown error');
              },
              onConnected: () => {
                console.log('[Meeting] Media service connected');
              },
            },
          });
          
          // Get peer connection for quality monitoring after connection is established
          setTimeout(() => {
            const pc = mediaService.getPeerConnection();
            console.log('[Meeting] Peer connection retrieved:', pc ? 'Available' : 'Not available');
            if (pc) {
              setPeerConnection(pc);
            }
          }, 3000);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    };

    joinMeeting();

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      mediaService.disconnect();
    };
  }, [meetingId, displayName, role, navigate, searchParams, startLocalMedia, connectionMode]);

  useEffect(() => {
    if (!connected || !joinData) return;
    fetchParticipants();
  }, [connected, joinData, fetchParticipants]);

  useEffect(() => {
    if (!connected) return;

    const interval = setInterval(fetchParticipants, 3000);
    return () => clearInterval(interval);
  }, [connected, fetchParticipants]);

  // Fetch waiting room participants for host
  const fetchWaitingRoom = useCallback(async () => {
    if (!isHost || !meetingId) return;
    try {
      const res = await fetch(`/api/meetings/${meetingId}/waiting-room`);
      if (res.ok) {
        const data = await res.json();
        setWaitingParticipants(data.waitingParticipants);
      }
    } catch (err) {
      console.error('Failed to fetch waiting room:', err);
    }
  }, [isHost, meetingId]);

  useEffect(() => {
    if (!connected || !isHost) return;
    fetchWaitingRoom();
    const interval = setInterval(fetchWaitingRoom, 3000);
    return () => clearInterval(interval);
  }, [connected, isHost, fetchWaitingRoom]);

  const handleLeave = async () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (joinData?.participantId) {
      await fetch(`/api/meetings/${meetingId}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId: joinData.participantId }),
      });
    }
    window.location.href = '/';
  };

  const updateParticipantStatus = async (newIsMuted: boolean, newIsVideoOff: boolean) => {
    if (joinData?.participantId) {
      try {
        await fetch(`/api/meetings/${meetingId}/participants/${joinData.participantId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isMuted: newIsMuted, isVideoOff: newIsVideoOff }),
        });
      } catch (error: any) {
        console.error('Failed to update status:', error);
        if (error.name === 'AbortError') {
          setError('Request timeout. Please check your connection and try again.');
        } else {
          setError(error.message || 'Failed to update status. Please try again.');
        }
      }
    }
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const newMuted = !isMuted;
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !newMuted;
      });
      setIsMuted(newMuted);
      console.log('🎤 AUDIO STATE CHANGED:', {
        isMuted: newMuted,
        timestamp: new Date().toISOString(),
        participantId: joinData?.participantId,
        audioTracksCount: localStreamRef.current.getAudioTracks().length,
      });
      updateParticipantStatus(newMuted, isVideoOff);
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const newVideoOff = !isVideoOff;
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = !newVideoOff;
      });
      setIsVideoOff(newVideoOff);
      console.log('📹 VIDEO STATE CHANGED:', {
        isVideoOff: newVideoOff,
        timestamp: new Date().toISOString(),
        participantId: joinData?.participantId,
        videoTracksCount: localStreamRef.current.getVideoTracks().length,
      });
      updateParticipantStatus(isMuted, newVideoOff);
    }
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      // Stop screen sharing (camera stays active)
      try {
        await mediaService.setScreenTrack(null);
        setLocalScreenStream(null);
        setIsScreenSharing(false);
        console.log('📺 SCREEN SHARE STOPPED:', {
          timestamp: new Date().toISOString(),
          participantId: joinData?.participantId,
          cameraStillActive: true,
        });
      } catch (err) {
        console.error('Failed to stop screen share:', err);
      }
    } else {
      // Start screen sharing (camera stays active)
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        
        console.log('📺 SCREEN SHARE STARTED:', {
          timestamp: new Date().toISOString(),
          participantId: joinData?.participantId,
          screenTrackId: screenTrack.id,
          screenTrackLabel: screenTrack.label,
          cameraStillActive: true,
        });
        
        // Handle when user stops sharing via browser UI
        screenTrack.onended = () => {
          console.log('📺 SCREEN SHARE ENDED (user stopped):', {
            timestamp: new Date().toISOString(),
            participantId: joinData?.participantId,
          });
          mediaService.setScreenTrack(null);
          setLocalScreenStream(null);
          setIsScreenSharing(false);
        };

        await mediaService.setScreenTrack(screenTrack);
        setLocalScreenStream(screenStream);
        setIsScreenSharing(true);
      } catch (err) {
        if (err instanceof Error) {
          if (err.name === 'NotAllowedError') {
            console.log('📺 SCREEN SHARE DENIED:', {
              reason: 'User denied permission',
              timestamp: new Date().toISOString(),
              participantId: joinData?.participantId,
            });
          } else if (err.name === 'NotFoundError') {
            console.log('📺 SCREEN SHARE FAILED:', {
              reason: 'No screen share source available',
              timestamp: new Date().toISOString(),
              participantId: joinData?.participantId,
            });
          } else {
            console.error('📺 SCREEN SHARE ERROR:', {
              error: err.message,
              timestamp: new Date().toISOString(),
              participantId: joinData?.participantId,
            });
          }
        }
      }
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-xl mb-4">{error}</div>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const videoParticipants = participants.map(p => {
    const isLocal = p.id === joinData?.participantId;
    return {
      ...p,
      isLocal,
      stream: isLocal ? undefined : remoteStreams.get(p.id),
      cameraStream: isLocal ? localCameraStream : (remoteCameraStreams.get(p.id) as MediaStream | undefined),
      screenStream: isLocal ? localScreenStream : (remoteScreenStreams.get(p.id) as MediaStream | undefined),
    };
  });

  // Speaker detection (after videoParticipants is defined)
  const activeSpeakerId = useSpeakerDetection(
    videoParticipants,
    localStream,
    0.1
  );

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      <div className="flex-1 flex">
        <div className="flex-1 p-4">
          <VideoGrid 
            participants={videoParticipants} 
            localParticipantId={joinData?.participantId}
            localStream={localStream}
            remoteStreams={remoteStreams}
            layout={layout}
            activeSpeakerId={activeSpeakerId}
          />
        </div>

        {showParticipants && (
          <div className="w-72 bg-gray-800 border-l border-gray-700 p-4 overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-semibold">Participants ({participants.length})</h3>
              <button
                onClick={() => setShowParticipants(false)}
                className="text-gray-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            <ul className="space-y-2">
              {participants.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center space-x-3 p-2 rounded-lg bg-gray-700"
                >
                  <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold relative">
                    {p.displayName.charAt(0).toUpperCase()}
                    {p.shortId && (
                      <span className="absolute -bottom-1 -right-1 bg-gray-900 text-[10px] px-1 rounded text-gray-300">
                        #{p.shortId}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm truncate">
                      {p.displayName}
                      {p.id === joinData?.participantId && (
                        <span className="text-blue-400 ml-1">(You)</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-gray-400 text-xs capitalize">{p.role}</div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        p.connectionMode === 'verto' 
                          ? 'bg-purple-500/20 text-purple-300' 
                          : 'bg-blue-500/20 text-blue-300'
                      }`}>
                        {p.connectionMode === 'verto' ? 'SIP' : 'WebRTC'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1">
                    <span className={`${p.isMuted ? 'text-red-400' : 'text-green-400'}`} title={p.isMuted ? 'Muted' : 'Unmuted'}>
                      {p.isMuted ? <MicOff size={16} /> : <Mic size={16} />}
                    </span>
                    <span className={`${p.isVideoOff ? 'text-red-400' : 'text-green-400'}`} title={p.isVideoOff ? 'Camera off' : 'Camera on'}>
                      {p.isVideoOff ? <VideoOff size={16} /> : <Video size={16} />}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="p-4 bg-gray-800">
        <div className="text-center text-gray-400 text-sm mb-2">
          {displayName} | Meeting ID: {meetingId?.slice(0, 8)}... | {connected ? 'Connected' : 'Connecting...'} | {participants.length} participant(s)
        </div>
        <div className="flex justify-center items-center space-x-4">
          <button
            onClick={toggleMute}
            className={`p-3 rounded-full ${isMuted ? 'bg-red-600' : 'bg-gray-600'} text-white hover:opacity-80`}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
          <button
            onClick={toggleVideo}
            className={`p-3 rounded-full ${isVideoOff ? 'bg-red-600' : 'bg-gray-600'} text-white hover:opacity-80`}
            title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
          >
            {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
          </button>
          <button
            onClick={toggleScreenShare}
            className={`p-3 rounded-full ${isScreenSharing ? 'bg-green-600' : 'bg-gray-600'} text-white hover:opacity-80`}
            title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
          >
            <Monitor size={20} />
          </button>
          <button
            onClick={() => setShowShareModal(true)}
            className="p-3 rounded-full bg-blue-600 text-white hover:bg-blue-700"
            title="Share meeting link"
          >
            <Link2 size={20} />
          </button>
          <button
            onClick={handleLeave}
            className="p-3 rounded-full bg-red-600 text-white hover:bg-red-700"
            title="Leave meeting"
          >
            <PhoneOff size={20} />
          </button>
          {!showParticipants && (
            <button
              onClick={() => setShowParticipants(true)}
              className="p-3 rounded-full bg-gray-600 text-white hover:bg-gray-500"
              title="Show participants"
            >
              <Users size={20} />
            </button>
          )}
          {isHost && (
            <button
              onClick={() => setShowHostControls(true)}
              className="p-3 rounded-full bg-purple-600 text-white hover:bg-purple-700"
              title="Host controls"
            >
              <Settings size={20} />
            </button>
          )}
          <button
            onClick={() => setShowChat(!showChat)}
            className={`p-3 rounded-full ${showChat ? 'bg-blue-600' : 'bg-gray-600'} text-white hover:opacity-80 relative`}
            title="Chat"
          >
            <MessageSquare size={20} />
            {chatMessages.length > 0 && !showChat && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                {chatMessages.length > 9 ? '9+' : chatMessages.length}
              </span>
            )}
          </button>
          <MeetingQuality peerConnection={peerConnection} localStream={localStream} />
          
          {/* Layout Selector */}
          <div className="flex gap-1 bg-gray-700 rounded-full p-1">
            <button
              onClick={() => setLayout('grid')}
              className={`p-2 rounded-full ${layout === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
              title="Grid view"
            >
              <Grid3x3 size={20} />
            </button>
            <button
              onClick={() => setLayout('speaker')}
              className={`p-2 rounded-full ${layout === 'speaker' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
              title="Speaker view"
            >
              <Maximize size={20} />
            </button>
            <button
              onClick={() => setLayout('sidebar')}
              className={`p-2 rounded-full ${layout === 'sidebar' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
              title="Sidebar view"
            >
              <PanelRight size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Chat Panel */}
      {showChat && (
        <div className="fixed bottom-24 right-4 w-80 h-96 bg-gray-800 rounded-lg shadow-xl flex flex-col z-40">
          <div className="p-3 border-b border-gray-700 flex justify-between items-center">
            <h3 className="text-white font-semibold">Chat</h3>
            <button onClick={() => setShowChat(false)} className="text-gray-400 hover:text-white"><X size={20} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {chatMessages.map((msg) => (
              <div key={msg.id} className={`${msg.from === joinData?.participantId ? 'text-right' : ''}`}>
                <div className={`inline-block max-w-[80%] px-3 py-2 rounded-lg ${
                  msg.from === joinData?.participantId ? 'bg-blue-600 text-white' : 'bg-gray-700 text-white'
                }`}>
                  {msg.from !== joinData?.participantId && (
                    <div className="text-xs text-gray-300 mb-1">{msg.displayName}</div>
                  )}
                  <div className="text-sm">{msg.message}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-gray-700">
            <div className="flex space-x-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && chatInput.trim()) {
                    mediaService.sendChatMessage(chatInput.trim());
                    setChatInput('');
                  }
                }}
                placeholder="Type a message..."
                className="flex-1 px-3 py-2 bg-gray-700 text-white rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={() => {
                  if (chatInput.trim()) {
                    mediaService.sendChatMessage(chatInput.trim());
                    setChatInput('');
                  }
                }}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`px-4 py-2 rounded-lg shadow-lg text-white text-sm animate-pulse ${
              n.type === 'join' ? 'bg-green-600' : 'bg-orange-600'
            }`}
          >
            {n.message}
          </div>
        ))}
      </div>

      {/* Host Controls Modal */}
      {showHostControls && isHost && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-96 shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-white">Host Controls</h2>
              <button
                onClick={() => setShowHostControls(false)}
                className="text-gray-400 hover:text-white"
              >
                <X size={24} />
              </button>
            </div>
            <div className="space-y-3">
              <button
                onClick={async () => {
                  await fetch(`/api/meetings/${meetingId}/mute-all`, { method: 'POST' });
                  fetchParticipants();
                  setShowHostControls(false);
                }}
                className="w-full py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700"
              >
                🔇 Mute All Participants
              </button>
              <button
                onClick={async () => {
                  await fetch(`/api/meetings/${meetingId}/end`, { method: 'POST' });
                  window.location.href = '/';
                }}
                className="w-full py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                🛑 End Meeting for All
              </button>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-700">
              <h3 className="text-white text-sm font-semibold mb-2">Kick Participant</h3>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {participants.filter(p => p.id !== joinData?.participantId).map((p) => (
                  <div key={p.id} className="flex items-center justify-between bg-gray-700 p-2 rounded">
                    <span className="text-white text-sm">{p.displayName}</span>
                    <button
                      onClick={async () => {
                        await fetch(`/api/meetings/${meetingId}/kick`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ participantId: p.id }),
                        });
                        fetchParticipants();
                      }}
                      className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                    >
                      Kick
                    </button>
                  </div>
                ))}
              </div>
            </div>
            {/* Waiting Room Section */}
            <div className="mt-4 pt-4 border-t border-gray-700">
              <h3 className="text-white text-sm font-semibold mb-2">
                Waiting Room ({waitingParticipants.length})
              </h3>
              {waitingParticipants.length === 0 ? (
                <p className="text-gray-500 text-sm">No one is waiting</p>
              ) : (
                <>
                  <button
                    onClick={async () => {
                      await fetch(`/api/meetings/${meetingId}/waiting-room/admit-all`, { method: 'POST' });
                      fetchWaitingRoom();
                    }}
                    className="w-full py-2 mb-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                  >
                    ✓ Admit All
                  </button>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {waitingParticipants.map((p) => (
                      <div key={p.id} className="flex items-center justify-between bg-gray-700 p-2 rounded">
                        <span className="text-white text-sm">{p.displayName}</span>
                        <div className="flex space-x-1">
                          <button
                            onClick={async () => {
                              await fetch(`/api/meetings/${meetingId}/waiting-room/admit`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ participantId: p.id }),
                              });
                              fetchWaitingRoom();
                            }}
                            className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                          >
                            Admit
                          </button>
                          <button
                            onClick={async () => {
                              await fetch(`/api/meetings/${meetingId}/waiting-room/deny`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ participantId: p.id }),
                              });
                              fetchWaitingRoom();
                            }}
                            className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                          >
                            Deny
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showShareModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-96 shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-white">Share Meeting</h2>
              <button
                onClick={() => setShowShareModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <X size={24} />
              </button>
            </div>
            <p className="text-gray-400 mb-4">Share this link with others to invite them to the meeting:</p>
            <div className="flex items-center space-x-2 mb-4">
              <input
                type="text"
                value={shareUrl}
                readOnly
                className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 text-sm"
              />
              <button
                onClick={copyShareLink}
                className={`px-4 py-2 rounded-lg text-white ${copied ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <div className="text-center">
              <p className="text-gray-500 text-sm">Meeting ID: {meetingId}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
