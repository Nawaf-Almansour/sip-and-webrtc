import { useEffect, useState, useRef } from 'react';

interface AudioLevelMap {
  [participantId: string]: number;
}

export function useSpeakerDetection(
  participants: Array<{ id: string; stream?: MediaStream; isLocal?: boolean }>,
  localStream?: MediaStream | null,
  threshold: number = 0.1
) {
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzersRef = useRef<Map<string, AnalyserNode>>(new Map());
  const audioLevelsRef = useRef<AudioLevelMap>({});

  useEffect(() => {
    // Create audio context
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    const audioContext = audioContextRef.current;
    const analyzers = analyzersRef.current;

    // Setup analyzers for each participant
    participants.forEach((participant) => {
      const stream = participant.isLocal ? localStream : participant.stream;
      
      if (stream && !analyzers.has(participant.id)) {
        try {
          const audioTracks = stream.getAudioTracks();
          if (audioTracks.length > 0) {
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            analyzers.set(participant.id, analyser);
          }
        } catch (err) {
          console.error('Error setting up audio analyzer:', err);
        }
      }
    });

    // Remove analyzers for participants who left
    const currentIds = new Set(participants.map(p => p.id));
    Array.from(analyzers.keys()).forEach(id => {
      if (!currentIds.has(id)) {
        analyzers.delete(id);
      }
    });

    // Monitor audio levels
    const interval = setInterval(() => {
      let maxLevel = 0;
      let loudestSpeaker: string | null = null;

      analyzers.forEach((analyser, participantId) => {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        
        // Calculate average volume
        const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
        const normalizedLevel = average / 255;
        
        audioLevelsRef.current[participantId] = normalizedLevel;

        if (normalizedLevel > threshold && normalizedLevel > maxLevel) {
          maxLevel = normalizedLevel;
          loudestSpeaker = participantId;
        }
      });

      setActiveSpeakerId(loudestSpeaker);
    }, 200); // Check every 200ms

    return () => {
      clearInterval(interval);
    };
  }, [participants, localStream, threshold]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return activeSpeakerId;
}
