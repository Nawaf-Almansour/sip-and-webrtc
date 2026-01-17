import { useState } from 'react';

interface ControlsProps {
  onLeave: () => void;
}

export default function Controls({ onLeave }: ControlsProps) {
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);

  return (
    <div className="flex justify-center space-x-4">
      <button
        onClick={() => setMicOn(!micOn)}
        className={`px-4 py-2 rounded-lg ${
          micOn ? 'bg-gray-600 hover:bg-gray-700' : 'bg-red-600 hover:bg-red-700'
        } text-white`}
      >
        {micOn ? 'Mute' : 'Unmute'}
      </button>

      <button
        onClick={() => setCameraOn(!cameraOn)}
        className={`px-4 py-2 rounded-lg ${
          cameraOn ? 'bg-gray-600 hover:bg-gray-700' : 'bg-red-600 hover:bg-red-700'
        } text-white`}
      >
        {cameraOn ? 'Camera Off' : 'Camera On'}
      </button>

      <button
        onClick={onLeave}
        className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white"
      >
        Leave
      </button>
    </div>
  );
}
