import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import Controls from '../components/Controls';

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
  displayName: string;
  role: string;
  joinedAt: string;
}

export default function Call() {
  const { callId } = useParams<{ callId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const role = searchParams.get('role') || 'A';
  const displayName = searchParams.get('name') || 'Guest';

  const [joinData, setJoinData] = useState<JoinData | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);

  const fetchParticipants = useCallback(async () => {
    try {
      const res = await fetch(`/api/calls/${callId}/participants`);
      if (res.ok) {
        const data = await res.json();
        setParticipants(data.participants);
      }
    } catch (err) {
      console.error('Failed to fetch participants:', err);
    }
  }, [callId]);

  useEffect(() => {
    if (!searchParams.get('name')) {
      navigate(`/?redirect=call&id=${callId}&role=${role}`);
      return;
    }

    const joinCall = async () => {
      try {
        const res = await fetch(`/api/calls/${callId}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role, displayName }),
        });

        if (!res.ok) {
          throw new Error('Failed to join call');
        }

        const data = await res.json();
        setJoinData(data);
        setConnected(true);
        fetchParticipants();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    };

    joinCall();
  }, [callId, role, displayName, navigate, searchParams, fetchParticipants]);

  useEffect(() => {
    if (!connected) return;

    const interval = setInterval(fetchParticipants, 3000);
    return () => clearInterval(interval);
  }, [connected, fetchParticipants]);

  const handleLeave = async () => {
    if (joinData?.participantId) {
      await fetch(`/api/calls/${callId}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId: joinData.participantId }),
      });
    }
    window.location.href = '/';
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-red-500 text-xl">{error}</div>
      </div>
    );
  }

  const localParticipant = participants.find(p => p.id === joinData?.participantId);
  const remoteParticipant = participants.find(p => p.id !== joinData?.participantId);

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      <div className="flex-1 flex items-center justify-center">
        <div className="grid grid-cols-2 gap-4 p-4 w-full max-w-4xl">
          <div className="bg-gray-800 rounded-lg aspect-video flex flex-col items-center justify-center relative">
            <span className="text-gray-400">Local Video</span>
            <span className="absolute bottom-2 left-2 bg-black bg-opacity-50 px-2 py-1 rounded text-white text-sm">
              {localParticipant?.displayName || displayName} (You)
            </span>
          </div>
          <div className="bg-gray-800 rounded-lg aspect-video flex flex-col items-center justify-center relative">
            <span className="text-gray-400">{remoteParticipant ? 'Remote Video' : 'Waiting for other participant...'}</span>
            <span className="absolute bottom-2 left-2 bg-black bg-opacity-50 px-2 py-1 rounded text-white text-sm">
              {remoteParticipant?.displayName || 'Waiting...'}
            </span>
          </div>
        </div>
      </div>

      <div className="p-4 bg-gray-800">
        <div className="text-center text-gray-400 text-sm mb-2">
          {displayName} | Call ID: {callId?.slice(0, 8)}... | {connected ? 'Connected' : 'Connecting...'} | {participants.length}/2 participant(s)
        </div>
        <Controls onLeave={handleLeave} />
      </div>
    </div>
  );
}
