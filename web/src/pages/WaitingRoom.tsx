import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';

export default function WaitingRoom() {
  const { meetingId } = useParams<{ meetingId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const participantId = searchParams.get('participantId');
  const displayName = searchParams.get('name') || 'Guest';
  const [status, setStatus] = useState<'waiting' | 'approved' | 'denied'>('waiting');

  useEffect(() => {
    if (!participantId) {
      navigate('/');
      return;
    }

    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/meetings/${meetingId}/my-status/${participantId}`);
        if (res.ok) {
          const data = await res.json();
          setStatus(data.status);
          
          if (data.status === 'approved') {
            navigate(`/meeting/${meetingId}?name=${encodeURIComponent(displayName)}&participantId=${participantId}`);
          } else if (data.status === 'denied') {
            setTimeout(() => navigate('/'), 3000);
          }
        }
      } catch (err) {
        console.error('Failed to check status:', err);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 2000);
    return () => clearInterval(interval);
  }, [meetingId, participantId, displayName, navigate]);

  if (status === 'denied') {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🚫</div>
          <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
          <p className="text-gray-400">The host has denied your request to join.</p>
          <p className="text-gray-500 text-sm mt-4">Redirecting to home...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="text-center">
        <div className="mb-8">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Waiting Room</h1>
        <p className="text-gray-400 mb-4">Please wait for the host to let you in</p>
        <div className="bg-gray-800 rounded-lg p-4 inline-block">
          <p className="text-gray-300">
            <span className="text-gray-500">Your name:</span> {displayName}
          </p>
          <p className="text-gray-300 mt-2">
            <span className="text-gray-500">Meeting ID:</span> {meetingId?.slice(0, 8)}...
          </p>
        </div>
        <p className="text-gray-500 text-sm mt-6">
          The host will admit you shortly...
        </p>
      </div>
    </div>
  );
}
