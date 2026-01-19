import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, Users, X } from 'lucide-react';

export default function Home() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [connectionMode, setConnectionMode] = useState<'webrtc' | 'verto'>('webrtc');
  const [pendingAction, setPendingAction] = useState<'call' | 'meeting' | null>(null);

  const handleStartCall = () => {
    setPendingAction('call');
    setShowNameModal(true);
  };

  const handleCreateMeeting = () => {
    setPendingAction('meeting');
    setShowNameModal(true);
  };

  const handleSubmitName = async () => {
    if (!displayName.trim()) return;

    setLoading(true);
    setShowNameModal(false);

    try {
      if (pendingAction === 'call') {
        const res = await fetch('/api/calls', { method: 'POST' });
        const data = await res.json();
        navigate(`/call/${data.callId}?role=A&name=${encodeURIComponent(displayName)}&mode=${connectionMode}`);
      } else if (pendingAction === 'meeting') {
        const res = await fetch('/api/meetings', { method: 'POST' });
        const data = await res.json();
        navigate(`/meeting/${data.meetingId}?name=${encodeURIComponent(displayName)}&role=host&mode=${connectionMode}`);
      }
    } catch (error) {
      console.error('Failed to create:', error);
    } finally {
      setLoading(false);
      setPendingAction(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmitName();
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="text-center w-full max-w-md">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">SIP Meetings</h1>
        <p className="text-gray-400 mb-8">Video conferencing made simple</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={handleStartCall}
            disabled={loading}
            className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium flex items-center gap-2 justify-center"
          >
            <Video size={24} /> Start 1-on-1 Call
          </button>
          <button
            onClick={handleCreateMeeting}
            disabled={loading}
            className="px-8 py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 text-lg font-semibold disabled:opacity-50 flex items-center gap-2 justify-center"
          >
            <Users size={24} /> Create Meeting Room
          </button>
        </div>
        <div className="mt-8 pt-8 border-t border-gray-700">
          <p className="text-gray-500 text-sm">Features: Video/Audio • Screen Share • Host Controls • Mobile Support</p>
        </div>
      </div>

      {showNameModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-96 shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-white">
                {pendingAction === 'call' ? 'Join Call' : 'Join Meeting'}
              </h2>
              <button onClick={() => setShowNameModal(false)} className="text-gray-400 hover:text-white"><X size={24} /></button>
            </div>
            <p className="text-gray-400 mb-4">Please enter your name to continue</p>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Your name"
              className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none mb-4"
              autoFocus
            />
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">Connection Mode</label>
              <div className="space-y-2">
                <label className="flex items-center p-3 bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-600 transition">
                  <input
                    type="radio"
                    name="connectionMode"
                    value="webrtc"
                    checked={connectionMode === 'webrtc'}
                    onChange={(e) => setConnectionMode(e.target.value as 'webrtc' | 'verto')}
                    className="mr-3"
                  />
                  <div className="flex-1">
                    <div className="text-white font-medium">WebRTC P2P</div>
                    <div className="text-gray-400 text-xs">Direct peer-to-peer • Recommended</div>
                  </div>
                </label>
                <label className="flex items-center p-3 bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-600 transition">
                  <input
                    type="radio"
                    name="connectionMode"
                    value="verto"
                    checked={connectionMode === 'verto'}
                    onChange={(e) => setConnectionMode(e.target.value as 'webrtc' | 'verto')}
                    className="mr-3"
                  />
                  <div className="flex-1">
                    <div className="text-white font-medium">Verto (Experimental)</div>
                    <div className="text-gray-400 text-xs">FreeSWITCH WebSocket • Limited support</div>
                  </div>
                </label>
              </div>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={() => {
                  setShowNameModal(false);
                  setPendingAction(null);
                  setDisplayName('');
                }}
                className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitName}
                disabled={!displayName.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Join
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
