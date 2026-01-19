import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { ConnectionMode } from '../services/mediaService';

export default function JoinMeeting() {
  const { meetingId } = useParams<{ meetingId: string }>();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('webrtc');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoin = async () => {
    if (!displayName.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/meetings/${meetingId}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError('Meeting not found. Please check the link and try again.');
        } else {
          setError('Failed to join meeting. Please try again.');
        }
        return;
      }

      const meetingData = await res.json();
      if (meetingData.status === 'ENDED') {
        setError('This meeting has ended.');
        return;
      }

      // Join the meeting to get participant status
      const joinRes = await fetch(`/api/meetings/${meetingId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, role: 'participant', connectionMode }),
      });

      if (!joinRes.ok) {
        const joinError = await joinRes.json();
        setError(joinError.error || 'Failed to join meeting');
        return;
      }

      const joinData = await joinRes.json();
      
      // Check if user needs to wait in waiting room
      if (joinData.status === 'waiting') {
        navigate(`/waiting/${meetingId}?participantId=${joinData.participantId}&name=${encodeURIComponent(displayName)}&mode=${connectionMode}`);
      } else {
        navigate(`/meeting/${meetingId}?name=${encodeURIComponent(displayName)}&participantId=${joinData.participantId}&mode=${connectionMode}`);
      }
    } catch (err) {
      setError('Failed to connect. Please check your internet connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleJoin();
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="bg-gray-800 rounded-lg p-8 w-full max-w-md shadow-xl">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white mb-2">Join Meeting</h1>
          <p className="text-gray-400">You've been invited to join a meeting</p>
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <div className="mb-4">
          <label className="block text-gray-400 text-sm mb-2">Your Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter your name"
            className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
            autoFocus
          />
        </div>

        <div className="mb-6">
          <label className="block text-gray-400 text-sm mb-2">Connection Mode</label>
          <div className="grid grid-cols-1 gap-3">
            <button
              type="button"
              onClick={() => setConnectionMode('webrtc')}
              className={`p-3 rounded-lg border-2 transition-all ${
                connectionMode === 'webrtc'
                  ? 'border-blue-500 bg-blue-500/20 text-white'
                  : 'border-gray-600 bg-gray-700 text-gray-400 hover:border-gray-500'
              }`}
            >
              <div className="font-semibold">WebRTC P2P</div>
              <div className="text-xs mt-1 opacity-75">Direct peer-to-peer • Recommended</div>
            </button>
            <button
              type="button"
              onClick={() => setConnectionMode('verto')}
              className={`p-3 rounded-lg border-2 transition-all ${
                connectionMode === 'verto'
                  ? 'border-purple-500 bg-purple-500/20 text-white'
                  : 'border-gray-600 bg-gray-700 text-gray-400 hover:border-gray-500'
              }`}
            >
              <div className="font-semibold">Verto (Experimental)</div>
              <div className="text-xs mt-1 opacity-75">FreeSWITCH WebSocket • Limited support</div>
            </button>
          </div>
        </div>

        <div className="mb-4">
          <p className="text-gray-500 text-sm">
            Meeting ID: <span className="text-gray-300">{meetingId?.slice(0, 8)}...</span>
          </p>
        </div>

        <button
          onClick={handleJoin}
          disabled={!displayName.trim() || loading}
          className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
        >
          {loading ? 'Joining...' : 'Join Meeting'}
        </button>

        <div className="mt-4 text-center">
          <button
            onClick={() => navigate('/')}
            className="text-gray-400 hover:text-white text-sm"
          >
            Go back to home
          </button>
        </div>
      </div>
    </div>
  );
}
