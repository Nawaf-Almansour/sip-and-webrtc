import { useRef, useEffect } from 'react';

interface Participant {
  id: string;
  displayName: string;
  stream?: MediaStream;
  isLocal?: boolean;
}

interface VideoGridProps {
  participants: Participant[];
  localStream?: MediaStream | null;
  remoteStreams?: Map<string, MediaStream>;
}

function VideoTile({ participant, stream, isLocal }: { participant: Participant; stream?: MediaStream | null; isLocal?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="bg-gray-800 rounded-lg aspect-video flex items-center justify-center relative overflow-hidden">
      {stream ? (
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
      {!stream && !isLocal && (
        <div className="absolute top-2 right-2 text-yellow-400 text-xs bg-black/50 px-2 py-1 rounded">
          Connecting...
        </div>
      )}
    </div>
  );
}

export default function VideoGrid({ participants, localStream, remoteStreams }: VideoGridProps) {
  const gridCols = participants.length <= 1 ? 1 : participants.length <= 4 ? 2 : 3;

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
        
        return (
          <VideoTile
            key={participant.id}
            participant={participant}
            stream={stream}
            isLocal={participant.isLocal}
          />
        );
      })}
    </div>
  );
}
