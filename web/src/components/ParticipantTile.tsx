interface ParticipantTileProps {
  name: string;
  isLocal?: boolean;
  videoRef?: React.RefObject<HTMLVideoElement>;
}

export default function ParticipantTile({ name, isLocal = false }: ParticipantTileProps) {
  return (
    <div className="bg-gray-800 rounded-lg aspect-video flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-gray-400 text-4xl">{name.charAt(0).toUpperCase()}</span>
      </div>
      <div className="absolute bottom-2 left-2 text-white text-sm bg-black/50 px-2 py-1 rounded flex items-center gap-2">
        {name}
        {isLocal && <span className="text-xs text-gray-400">(You)</span>}
      </div>
    </div>
  );
}
