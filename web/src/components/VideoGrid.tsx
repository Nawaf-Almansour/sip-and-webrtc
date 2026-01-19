import { useRef, useEffect, useState, useMemo } from 'react';

export type LayoutType = 'grid' | 'speaker' | 'sidebar' | 'presentation';

interface Participant {
  id: string;
  displayName: string;
  stream?: MediaStream | null;
  cameraStream?: MediaStream | null;
  screenStream?: MediaStream | null;
  isLocal?: boolean;
  isSpeaking?: boolean;
}

interface VideoGridProps {
  participants: Participant[];
  localParticipantId?: string;
  localStream?: MediaStream | null;
  localCameraStream?: MediaStream | null;
  localScreenStream?: MediaStream | null;
  remoteStreams?: Map<string, MediaStream>;
  remoteCameraStreams?: Map<string, MediaStream>;
  remoteScreenStreams?: Map<string, MediaStream>;
  layout?: LayoutType;
  activeSpeakerId?: string | null;
}

function VideoTile({ participant, stream, cameraStream, screenStream, isLocal, isSpeaking, isLarge, showPiP }: { 
  participant: Participant; 
  stream?: MediaStream | null; 
  cameraStream?: MediaStream | null;
  screenStream?: MediaStream | null;
  isLocal?: boolean; 
  isSpeaking?: boolean; 
  isLarge?: boolean;
  showPiP?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pipVideoRef = useRef<HTMLVideoElement>(null);
  const boundMainStreamRef = useRef<string | null>(null);
  const boundPipStreamRef = useRef<string | null>(null);

  // Main video (screen if available, otherwise camera)
  const mainStream = screenStream || cameraStream || stream;
  const hasScreenShare = !!screenStream;

  useEffect(() => {
    if (videoRef.current && mainStream) {
      if (boundMainStreamRef.current !== mainStream.id) {
        videoRef.current.srcObject = mainStream;
        boundMainStreamRef.current = mainStream.id;
        const videoTracks = mainStream.getVideoTracks();
        console.log('[VideoTile] Connected main video stream:', {
          participantId: participant.id,
          displayName: participant.displayName,
          streamId: mainStream.id,
          videoTracks: videoTracks.length,
        });
      }
    }
  }, [mainStream]);

  useEffect(() => {
    if (pipVideoRef.current && cameraStream && hasScreenShare) {
      if (boundPipStreamRef.current !== cameraStream.id) {
        pipVideoRef.current.srcObject = cameraStream;
        boundPipStreamRef.current = cameraStream.id;
        console.log('[VideoTile] Connected PiP camera stream:', {
          participantId: participant.id,
          streamId: cameraStream.id,
        });
      }
    }
  }, [cameraStream, hasScreenShare]);

  const borderClass = isSpeaking ? 'border-4 border-green-500' : 'border-2 border-transparent';

  return (
    <div className={`bg-gray-800 rounded-lg ${isLarge ? 'aspect-video' : 'aspect-video'} flex items-center justify-center relative overflow-hidden ${borderClass} transition-all duration-200`}>
      {mainStream ? (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isLocal}
            className="w-full h-full object-cover"
          />
          {/* Picture-in-Picture: Show camera when screen sharing */}
          {hasScreenShare && cameraStream && showPiP && (
            <div className="absolute bottom-4 right-4 w-32 h-24 bg-gray-900 rounded-lg overflow-hidden border-2 border-white shadow-lg">
              <video
                ref={pipVideoRef}
                autoPlay
                playsInline
                muted={isLocal}
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-1 left-1 text-white text-xs bg-black/70 px-1 py-0.5 rounded">
                Camera
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center text-white text-3xl font-semibold">
          {participant.displayName.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="absolute bottom-2 left-2 text-white text-sm bg-black/50 px-2 py-1 rounded">
        {participant.displayName} {isLocal && '(You)'}
        {hasScreenShare && <span className="ml-1 text-xs">📺</span>}
      </div>
      {!mainStream && !isLocal && (
        <div className="absolute top-2 right-2 text-yellow-400 text-xs bg-black/50 px-2 py-1 rounded">
          Connecting...
        </div>
      )}
    </div>
  );
}

export default function VideoGrid({ 
  participants, 
  localParticipantId,
  localStream, 
  localCameraStream,
  localScreenStream,
  remoteStreams, 
  remoteCameraStreams,
  remoteScreenStreams,
  layout = 'grid', 
  activeSpeakerId 
}: VideoGridProps) {
  // Auto-detect presentation mode when someone is sharing screen
  const hasScreenShare = (localScreenStream && localScreenStream.getVideoTracks().length > 0) || 
                         (remoteScreenStreams && remoteScreenStreams.size > 0);
  const effectiveLayout = hasScreenShare ? 'presentation' : layout;
  
  // Find who is sharing screen
  const screenSharerId = useMemo(() => {
    if (localScreenStream && localScreenStream.getVideoTracks().length > 0) {
      return localParticipantId;
    }
    if (remoteScreenStreams && remoteScreenStreams.size > 0) {
      // Return the first (usually only) screen sharer
      return Array.from(remoteScreenStreams.keys())[0];
    }
    return null;
  }, [localScreenStream, remoteScreenStreams, localParticipantId]);
  
  const gridCols = participants.length <= 1 ? 1 : participants.length <= 4 ? 2 : 3;

  // Render hidden audio elements for all remote streams
  const boundAudioStreamsRef = useRef<Set<string>>(new Set());
  
  const audioElements = useMemo(() => {
    if (!remoteStreams || remoteStreams.size === 0) return [];

    return Array.from(remoteStreams.entries()).map(([participantId, stream]) => {
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) return null;

      return (
        <audio
          key={`audio-${participantId}-${stream.id}`}
          autoPlay
          playsInline
          ref={(audio) => {
            if (!audio) return;

            const streamKey = `${participantId}-${stream.id}`;
            if (!boundAudioStreamsRef.current.has(streamKey)) {
              const audioStream = new MediaStream(audioTracks);
              audio.srcObject = audioStream;
              audio.muted = false;
              boundAudioStreamsRef.current.add(streamKey);

              audio.play().catch(err => {
                console.log('[VideoGrid] Audio play:', participantId, err.message);
              });

              console.log('[VideoGrid] Connected audio for:', participantId, {
                streamId: stream.id,
                audioTracks: audioTracks.length,
              });
            }
          }}
          style={{ display: 'none' }}
        />
      );
    }).filter(Boolean);
  }, [remoteStreams]);

  // Log video stream availability only once per stream
  const loggedCameraStreamsRef = useRef<Set<string>>(new Set());
  const loggedScreenStreamsRef = useRef<Set<string>>(new Set());
  
  useEffect(() => {
    if (remoteCameraStreams && remoteCameraStreams.size > 0) {
      remoteCameraStreams.forEach((stream, participantId) => {
        const streamKey = `${participantId}-${stream.id}`;
        if (!loggedCameraStreamsRef.current.has(streamKey)) {
          loggedCameraStreamsRef.current.add(streamKey);
          const videoTracks = stream.getVideoTracks();
          console.log('[VideoGrid] Camera stream available:', {
            participantId,
            streamId: stream.id,
            videoTracks: videoTracks.length,
          });
        }
      });
    }
  }, [remoteCameraStreams]);

  useEffect(() => {
    if (remoteScreenStreams && remoteScreenStreams.size > 0) {
      remoteScreenStreams.forEach((stream, participantId) => {
        const streamKey = `${participantId}-${stream.id}`;
        if (!loggedScreenStreamsRef.current.has(streamKey)) {
          loggedScreenStreamsRef.current.add(streamKey);
          const videoTracks = stream.getVideoTracks();
          console.log('[VideoGrid] Screen stream available:', {
            participantId,
            streamId: stream.id,
            videoTracks: videoTracks.length,
          });
        }
      });
    }
  }, [remoteScreenStreams]);

  const videoParticipants = useMemo(() => {
    return participants.map(p => {
      const isLocal = p.id === localParticipantId;

      return {
        ...p,
        isLocal,
        stream: undefined,
        cameraStream: isLocal ? localCameraStream : remoteCameraStreams?.get(p.id),
        screenStream: isLocal ? localScreenStream : remoteScreenStreams?.get(p.id),
      };
    });
  }, [
    participants,
    localParticipantId,
    localCameraStream,
    localScreenStream,
    remoteCameraStreams,
    remoteScreenStreams,
  ]);

  // Presentation Mode - screen share prominent with cameras in sidebar
  if (effectiveLayout === 'presentation' && screenSharerId) {
    const screenSharer = videoParticipants.find(p => p.id === screenSharerId);
    const cameraParticipants = videoParticipants.filter(p => p.id !== screenSharerId);

    return (
      <>
        {audioElements}
        <div className="flex h-full gap-4">
          {/* Main screen share view */}
          <div className="flex-1 flex flex-col">
            {screenSharer && (
              <>
                <div className="flex-1 mb-2">
                  <VideoTile
                    key={screenSharer.id}
                    participant={screenSharer}
                    stream={screenSharer.isLocal ? localStream : (screenSharer.stream || remoteStreams?.get(screenSharer.id))}
                    cameraStream={screenSharer.isLocal ? localCameraStream : (screenSharer.cameraStream || remoteCameraStreams?.get(screenSharer.id))}
                    screenStream={screenSharer.isLocal ? localScreenStream : (screenSharer.screenStream || remoteScreenStreams?.get(screenSharer.id))}
                    isLocal={screenSharer.isLocal}
                    isSpeaking={screenSharer.id === activeSpeakerId}
                    isLarge={true}
                    showPiP={true}
                  />
                </div>
                <div className="text-white text-sm bg-blue-600/80 px-3 py-1 rounded text-center">
                  📺 {screenSharer.displayName} is presenting
                </div>
              </>
            )}
          </div>
          
          {/* Camera participants sidebar */}
          {cameraParticipants.length > 0 && (
            <div className="w-72 flex flex-col gap-2 overflow-y-auto bg-gray-900/50 rounded-lg p-2">
              <div className="text-white text-xs font-semibold px-2 py-1 sticky top-0 bg-gray-800 rounded">
                Participants ({cameraParticipants.length})
              </div>
              {cameraParticipants.map((participant) => {
                const isSpeaking = participant.id === activeSpeakerId;
                const borderClass = isSpeaking ? 'border-4 border-green-500' : 'border-2 border-transparent';
                return (
                  <div key={participant.id} className={`flex-shrink-0 h-40 rounded-lg overflow-hidden ${borderClass} transition-all duration-200`}>
                    <VideoTile
                      participant={participant}
                      stream={participant.isLocal ? localStream : (participant.stream || remoteStreams?.get(participant.id))}
                      cameraStream={participant.isLocal ? localCameraStream : (participant.cameraStream || remoteCameraStreams?.get(participant.id))}
                      screenStream={participant.isLocal ? localScreenStream : (participant.screenStream || remoteScreenStreams?.get(participant.id))}
                      isLocal={participant.isLocal}
                      isSpeaking={isSpeaking}
                      showPiP={false}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </>
    );
  }

  // Grid Layout - default responsive grid
  if (effectiveLayout === 'grid') {
    return (
      <>
        {audioElements}
        <div
          className="grid gap-4 h-full"
          style={{
            gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
          }}
        >
          {videoParticipants.map((participant) => {
            const stream = participant.isLocal 
              ? localStream 
              : (participant.stream || remoteStreams?.get(participant.id));
            const cameraStream = participant.isLocal
              ? localCameraStream
              : (participant.cameraStream || remoteCameraStreams?.get(participant.id));
            const screenStream = participant.isLocal
              ? localScreenStream
              : (participant.screenStream || remoteScreenStreams?.get(participant.id));
            const isSpeaking = participant.id === activeSpeakerId;
            
            return (
              <VideoTile
                key={participant.id}
                participant={participant}
                stream={stream}
                cameraStream={cameraStream}
                screenStream={screenStream}
                isLocal={participant.isLocal}
                isSpeaking={isSpeaking}
                showPiP={true}
              />
            );
          })}
        </div>
      </>
    );
  }

  // Speaker Layout - large active speaker with small thumbnails
  if (effectiveLayout === 'speaker') {
    const activeSpeaker = participants.find(p => p.id === activeSpeakerId) || participants[0];
    const otherParticipants = participants.filter(p => p.id !== activeSpeaker?.id);

    return (
      <>
        {audioElements}
        <div className="flex flex-col h-full gap-4">
          {/* Main speaker view */}
          <div className="flex-1">
            {activeSpeaker && (
              <VideoTile
                key={activeSpeaker.id}
                participant={activeSpeaker}
                stream={activeSpeaker.isLocal ? localStream : (activeSpeaker.stream || remoteStreams?.get(activeSpeaker.id))}
                cameraStream={activeSpeaker.isLocal ? localCameraStream : (activeSpeaker.cameraStream || remoteCameraStreams?.get(activeSpeaker.id))}
                screenStream={activeSpeaker.isLocal ? localScreenStream : (activeSpeaker.screenStream || remoteScreenStreams?.get(activeSpeaker.id))}
                isLocal={activeSpeaker.isLocal}
                isSpeaking={true}
                isLarge={true}
                showPiP={true}
              />
            )}
          </div>
          {/* Thumbnail strip */}
          {otherParticipants.length > 0 && (
            <div className="flex gap-2 h-32 overflow-x-auto">
              {otherParticipants.map((participant) => (
                <div key={participant.id} className="flex-shrink-0 w-48">
                  <VideoTile
                    participant={participant}
                    stream={participant.isLocal ? localStream : (participant.stream || remoteStreams?.get(participant.id))}
                    cameraStream={participant.isLocal ? localCameraStream : (participant.cameraStream || remoteCameraStreams?.get(participant.id))}
                    screenStream={participant.isLocal ? localScreenStream : (participant.screenStream || remoteScreenStreams?.get(participant.id))}
                    isLocal={participant.isLocal}
                    isSpeaking={false}
                    showPiP={true}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </>
    );
  }

  // Sidebar Layout - main view with sidebar of participants
  if (effectiveLayout === 'sidebar') {
    const mainParticipant = participants.find(p => p.id === activeSpeakerId) || participants[0];
    const sidebarParticipants = participants.filter(p => p.id !== mainParticipant?.id);

    return (
      <>
        {audioElements}
        <div className="flex h-full gap-4">
          {/* Main view */}
          <div className="flex-1">
            {mainParticipant && (
              <VideoTile
                key={mainParticipant.id}
                participant={mainParticipant}
                stream={mainParticipant.isLocal ? localStream : (mainParticipant.stream || remoteStreams?.get(mainParticipant.id))}
                cameraStream={mainParticipant.isLocal ? localCameraStream : (mainParticipant.cameraStream || remoteCameraStreams?.get(mainParticipant.id))}
                screenStream={mainParticipant.isLocal ? localScreenStream : (mainParticipant.screenStream || remoteScreenStreams?.get(mainParticipant.id))}
                isLocal={mainParticipant.isLocal}
                isSpeaking={mainParticipant.id === activeSpeakerId}
                isLarge={true}
                showPiP={true}
              />
            )}
          </div>
          {/* Sidebar */}
          {sidebarParticipants.length > 0 && (
            <div className="w-64 flex flex-col gap-2 overflow-y-auto">
              {sidebarParticipants.map((participant) => (
                <VideoTile
                  key={participant.id}
                  participant={participant}
                  stream={participant.isLocal ? localStream : (participant.stream || remoteStreams?.get(participant.id))}
                  cameraStream={participant.isLocal ? localCameraStream : (participant.cameraStream || remoteCameraStreams?.get(participant.id))}
                  screenStream={participant.isLocal ? localScreenStream : (participant.screenStream || remoteScreenStreams?.get(participant.id))}
                  isLocal={participant.isLocal}
                  isSpeaking={participant.id === activeSpeakerId}
                  showPiP={true}
                />
              ))}
            </div>
          )}
        </div>
      </>
    );
  }

  return null;
}
