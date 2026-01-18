import { useRef, useEffect, useState } from 'react';

export type LayoutType = 'grid' | 'speaker' | 'sidebar';

interface Participant {
  id: string;
  displayName: string;
  stream?: MediaStream;
  cameraStream?: MediaStream;
  screenStream?: MediaStream;
  isLocal?: boolean;
  isSpeaking?: boolean;
}

interface VideoGridProps {
  participants: Participant[];
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

  // Main video (screen if available, otherwise camera)
  const mainStream = screenStream || cameraStream || stream;
  const hasScreenShare = !!screenStream;

  useEffect(() => {
    if (videoRef.current && mainStream) {
      videoRef.current.srcObject = mainStream;
    }
  }, [mainStream]);

  useEffect(() => {
    if (pipVideoRef.current && cameraStream && hasScreenShare) {
      pipVideoRef.current.srcObject = cameraStream;
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
  localStream, 
  localCameraStream,
  localScreenStream,
  remoteStreams, 
  remoteCameraStreams,
  remoteScreenStreams,
  layout = 'grid', 
  activeSpeakerId 
}: VideoGridProps) {
  const gridCols = participants.length <= 1 ? 1 : participants.length <= 4 ? 2 : 3;

  // Grid Layout - default responsive grid
  if (layout === 'grid') {
    return (
      <div
        className="grid gap-4 h-full"
        style={{
          gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
        }}
      >
        {participants.map((participant) => {
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
    );
  }

  // Speaker Layout - large active speaker with small thumbnails
  if (layout === 'speaker') {
    const activeSpeaker = participants.find(p => p.id === activeSpeakerId) || participants[0];
    const otherParticipants = participants.filter(p => p.id !== activeSpeaker?.id);

    return (
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
    );
  }

  // Sidebar Layout - main view with sidebar of participants
  if (layout === 'sidebar') {
    const mainParticipant = participants.find(p => p.id === activeSpeakerId) || participants[0];
    const sidebarParticipants = participants.filter(p => p.id !== mainParticipant?.id);

    return (
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
    );
  }

  return null;
}
