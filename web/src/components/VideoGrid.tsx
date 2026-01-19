import { useRef, useEffect, useMemo } from 'react';

export type LayoutType = 'grid' | 'speaker' | 'sidebar' | 'presentation';

export type StreamType = 'camera' | 'screen' | 'none';

interface Participant {
  id: string;
  displayName: string;
  stream?: MediaStream | null;
  streamType?: StreamType;
  isLocal?: boolean;
  isSpeaking?: boolean;
}

interface VideoGridProps {
  participants: Participant[];
  localParticipantId?: string;
  localStream?: MediaStream | null;
  remoteStreams?: Map<string, MediaStream>;
  layout?: LayoutType;
  activeSpeakerId?: string | null;
}

function VideoTile({ participant, stream, isLocal, isSpeaking, isLarge }: { 
  participant: Participant; 
  stream?: MediaStream | null; 
  isLocal?: boolean; 
  isSpeaking?: boolean; 
  isLarge?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const boundStreamRef = useRef<string | null>(null);

  // Backend determines which stream to send (camera or screen)
  const mainStream = stream;
  const streamType = participant.streamType || 'camera';

  useEffect(() => {
    if (!videoRef.current) return;
    
    if (mainStream) {
      if (boundStreamRef.current !== mainStream.id) {
        try {
          videoRef.current.srcObject = mainStream;
          boundStreamRef.current = mainStream.id;
          const videoTracks = mainStream.getVideoTracks();
          console.log('[VideoTile] Connected video stream:', {
            participantId: participant.id,
            displayName: participant.displayName,
            streamId: mainStream.id,
            streamType,
            videoTracks: videoTracks.length,
            audioTracks: mainStream.getAudioTracks().length,
          });
        } catch (error) {
          console.error('[VideoTile] Error binding stream:', error);
        }
      }
    } else {
      if (videoRef.current.srcObject !== null) {
        videoRef.current.srcObject = null;
        boundStreamRef.current = null;
      }
    }
  }, [mainStream, participant.id, streamType]);

  const borderClass = isSpeaking ? 'border-4 border-green-500' : 'border-2 border-transparent';

  return (
    <div className={`bg-gray-800 rounded-lg aspect-video flex items-center justify-center relative overflow-hidden ${borderClass} transition-all duration-200`}>
      {mainStream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center text-white text-3xl font-semibold">
          {participant.displayName.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="absolute bottom-2 left-2 text-white text-sm bg-black/50 px-2 py-1 rounded">
        {participant.displayName} {isLocal && '(You)'}
      </div>
      {mainStream && streamType && (
        <div className={`absolute top-2 right-2 text-xs px-2 py-1 rounded ${
          streamType === 'screen' ? 'bg-purple-600/80 text-white' : 'bg-blue-600/80 text-white'
        }`}>
          {streamType === 'screen' ? '📺 Screen' : '📷 Camera'}
        </div>
      )}
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
  remoteStreams, 
  layout = 'grid', 
  activeSpeakerId 
}: VideoGridProps) {
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

  const videoParticipants = useMemo(() => {
    return participants.map(p => {
      const isLocal = p.id === localParticipantId;
      const stream = isLocal ? localStream : remoteStreams?.get(p.id);

      console.log('[VideoGrid] Participant stream:', {
        participantId: p.id,
        displayName: p.displayName,
        isLocal,
        hasStream: !!stream,
        streamId: stream?.id,
      });

      return {
        ...p,
        isLocal,
        stream,
      };
    });
  }, [
    participants,
    localParticipantId,
    localStream,
    remoteStreams,
  ]);

  // Grid Layout - default responsive grid
  if (layout === 'grid') {
    return (
      <>
        {audioElements}
        <div
          className="grid gap-4 h-full"
          style={{
            gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
          }}
        >
          {videoParticipants.map((participant) => (
            <VideoTile
              key={participant.id}
              participant={participant}
              stream={participant.stream}
              isLocal={participant.isLocal}
              isSpeaking={participant.id === activeSpeakerId}
              isLarge={false}
            />
          ))}
        </div>
      </>
    );
  }

  // Speaker Layout - large active speaker with small thumbnails
  if (layout === 'speaker') {
    const activeSpeaker = videoParticipants.find(p => p.id === activeSpeakerId) || videoParticipants[0];
    const otherParticipants = videoParticipants.filter(p => p.id !== activeSpeaker?.id);

    return (
      <>
        {audioElements}
        <div className="flex flex-col h-full gap-4">
          {activeSpeaker && (
            <div className="flex-1">
              <VideoTile
                key={activeSpeaker.id}
                participant={activeSpeaker}
                stream={activeSpeaker.stream}
                isLocal={activeSpeaker.isLocal}
                isSpeaking={true}
                isLarge={true}
              />
            </div>
          )}
          {otherParticipants.length > 0 && (
            <div className="flex gap-2 h-24 overflow-x-auto">
              {otherParticipants.map((participant) => (
                <div key={participant.id} className="flex-shrink-0 w-32">
                  <VideoTile
                    participant={participant}
                    stream={participant.stream}
                    isLocal={participant.isLocal}
                    isSpeaking={participant.id === activeSpeakerId}
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
  if (layout === 'sidebar') {
    const mainParticipant = videoParticipants.find(p => p.id === activeSpeakerId) || videoParticipants[0];
    const sidebarParticipants = videoParticipants.filter(p => p.id !== mainParticipant?.id);

    return (
      <>
        {audioElements}
        <div className="flex h-full gap-4">
          <div className="flex-1">
            {mainParticipant && (
              <VideoTile
                key={mainParticipant.id}
                participant={mainParticipant}
                stream={mainParticipant.stream}
                isLocal={mainParticipant.isLocal}
                isSpeaking={mainParticipant.id === activeSpeakerId}
                isLarge={true}
              />
            )}
          </div>
          {sidebarParticipants.length > 0 && (
            <div className="w-72 flex flex-col gap-2 overflow-y-auto bg-gray-900/50 rounded-lg p-2">
              <div className="text-white text-xs font-semibold px-2 py-1 sticky top-0 bg-gray-800 rounded">
                Participants ({sidebarParticipants.length})
              </div>
              {sidebarParticipants.map((participant) => (
                <div key={participant.id} className="flex-shrink-0 h-40">
                  <VideoTile
                    participant={participant}
                    stream={participant.stream}
                    isLocal={participant.isLocal}
                    isSpeaking={participant.id === activeSpeakerId}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </>
    );
  }

  // Presentation Layout - screen share prominent with cameras in sidebar
  if (layout === 'presentation') {
    const mainParticipant = videoParticipants[0];
    const sidebarParticipants = videoParticipants.slice(1);

    return (
      <>
        {audioElements}
        <div className="flex h-full gap-4">
          <div className="flex-1 flex flex-col">
            {mainParticipant && (
              <>
                <div className="flex-1 mb-2">
                  <VideoTile
                    key={mainParticipant.id}
                    participant={mainParticipant}
                    stream={mainParticipant.stream}
                    isLocal={mainParticipant.isLocal}
                    isSpeaking={mainParticipant.id === activeSpeakerId}
                    isLarge={true}
                  />
                </div>
                <div className="text-white text-sm bg-blue-600/80 px-3 py-1 rounded text-center">
                  📺 {mainParticipant.displayName} is presenting
                </div>
              </>
            )}
          </div>
          {sidebarParticipants.length > 0 && (
            <div className="w-72 flex flex-col gap-2 overflow-y-auto bg-gray-900/50 rounded-lg p-2">
              <div className="text-white text-xs font-semibold px-2 py-1 sticky top-0 bg-gray-800 rounded">
                Participants ({sidebarParticipants.length})
              </div>
              {sidebarParticipants.map((participant) => {
                const isSpeaking = participant.id === activeSpeakerId;
                const borderClass = isSpeaking ? 'border-4 border-green-500' : 'border-2 border-transparent';
                return (
                  <div key={participant.id} className={`flex-shrink-0 h-40 rounded-lg overflow-hidden ${borderClass} transition-all duration-200`}>
                    <VideoTile
                      participant={participant}
                      stream={participant.stream}
                      isLocal={participant.isLocal}
                      isSpeaking={isSpeaking}
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

  return null;
}
