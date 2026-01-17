import { useState, useEffect } from 'react';

interface QualityStats {
  bitrate: number;
  packetLoss: number;
  jitter: number;
  latency: number;
  fps: number;
  resolution: string;
}

interface MeetingQualityProps {
  peerConnection?: RTCPeerConnection | null;
  localStream?: MediaStream | null;
}

export default function MeetingQuality({ peerConnection, localStream }: MeetingQualityProps) {
  const [stats, setStats] = useState<QualityStats>({
    bitrate: 0,
    packetLoss: 0,
    jitter: 0,
    latency: 0,
    fps: 0,
    resolution: 'N/A',
  });
  const [quality, setQuality] = useState<'excellent' | 'good' | 'fair' | 'poor'>('good');
  const [isOpen, setIsOpen] = useState(false);
  const [previousBytes, setPreviousBytes] = useState<{ timestamp: number; bytes: number } | null>(null);

  useEffect(() => {
    if (!peerConnection) {
      console.log('[Quality] No peer connection available');
      return;
    }

    console.log('[Quality] Starting stats collection');

    const interval = setInterval(async () => {
      try {
        const statsReport = await peerConnection.getStats();
        let currentBytes = 0;
        let currentTimestamp = Date.now();
        let totalPacketLoss = 0;
        let totalJitter = 0;
        let currentFps = 0;
        let currentResolution = 'N/A';
        let statsCount = 0;
        let hasVideoStats = false;
        let foundReports: string[] = [];

        statsReport.forEach((report: any) => {
          foundReports.push(report.type);
          
          // Check both inbound and outbound RTP for video
          if ((report.type === 'inbound-rtp' || report.type === 'outbound-rtp') && report.mediaType === 'video') {
            hasVideoStats = true;
            console.log('[Quality] Found video RTP stats:', {
              type: report.type,
              bytesReceived: report.bytesReceived,
              bytesSent: report.bytesSent,
              packetsLost: report.packetsLost,
              packetsReceived: report.packetsReceived,
              jitter: report.jitter,
              fps: report.framesPerSecond,
              resolution: `${report.frameWidth}x${report.frameHeight}`
            });
            
            // Track bytes for bitrate calculation
            if (report.bytesReceived) {
              currentBytes += report.bytesReceived;
            }
            if (report.bytesSent) {
              currentBytes += report.bytesSent;
            }
            
            // Packet loss
            if (report.packetsLost !== undefined && report.packetsReceived) {
              const lossRate = (report.packetsLost / (report.packetsLost + report.packetsReceived)) * 100;
              totalPacketLoss += lossRate;
              statsCount++;
            }
            
            // Jitter
            if (report.jitter !== undefined) {
              totalJitter += report.jitter * 1000; // Convert to ms
            }
            
            // FPS
            if (report.framesPerSecond) {
              currentFps = report.framesPerSecond;
            }
            
            // Resolution
            if (report.frameWidth && report.frameHeight) {
              currentResolution = `${report.frameWidth}x${report.frameHeight}`;
            }
          }
        });

        // Calculate bitrate from byte delta
        let calculatedBitrate = 0;
        if (previousBytes && currentBytes > 0) {
          const timeDelta = (currentTimestamp - previousBytes.timestamp) / 1000; // seconds
          const bytesDelta = currentBytes - previousBytes.bytes;
          if (timeDelta > 0) {
            calculatedBitrate = Math.round((bytesDelta * 8) / timeDelta / 1000); // kbps
          }
          console.log('[Quality] Bitrate calculation:', {
            previousBytes: previousBytes.bytes,
            currentBytes,
            bytesDelta,
            timeDelta,
            calculatedBitrate
          });
        } else {
          console.log('[Quality] Bitrate calculation skipped:', {
            hasPrevious: !!previousBytes,
            currentBytes,
            hasVideoStats
          });
        }
        
        setPreviousBytes({ timestamp: currentTimestamp, bytes: currentBytes });
        
        console.log('[Quality] Report types found:', [...new Set(foundReports)].join(', '));
        console.log('[Quality] Final stats:', {
          bitrate: calculatedBitrate,
          packetLoss: Math.round((statsCount > 0 ? totalPacketLoss / statsCount : 0) * 10) / 10,
          jitter: Math.round((statsCount > 0 ? totalJitter / statsCount : 0) * 10) / 10,
          fps: Math.round(currentFps),
          resolution: currentResolution,
          hasVideoStats
        });

        const avgPacketLoss = statsCount > 0 ? totalPacketLoss / statsCount : 0;
        const avgJitter = statsCount > 0 ? totalJitter / statsCount : 0;

        const newStats: QualityStats = {
          bitrate: calculatedBitrate,
          packetLoss: Math.round(avgPacketLoss * 10) / 10,
          jitter: Math.round(avgJitter * 10) / 10,
          latency: Math.round(avgJitter * 2), // Approximate latency
          fps: Math.round(currentFps),
          resolution: currentResolution,
        };

        setStats(newStats);

        // Determine quality based on metrics
        if (avgPacketLoss < 1 && avgJitter < 30 && calculatedBitrate > 500) {
          setQuality('excellent');
        } else if (avgPacketLoss < 3 && avgJitter < 50 && calculatedBitrate > 300) {
          setQuality('good');
        } else if (avgPacketLoss < 5 && avgJitter < 100) {
          setQuality('fair');
        } else {
          setQuality('poor');
        }
      } catch (error) {
        console.error('Error getting stats:', error);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [peerConnection]);

  const getQualityColor = () => {
    switch (quality) {
      case 'excellent':
        return 'text-green-400';
      case 'good':
        return 'text-blue-400';
      case 'fair':
        return 'text-yellow-400';
      case 'poor':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  const getQualityBars = () => {
    switch (quality) {
      case 'excellent':
        return 4;
      case 'good':
        return 3;
      case 'fair':
        return 2;
      case 'poor':
        return 1;
      default:
        return 0;
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-3 rounded-full bg-gray-600 text-white hover:bg-gray-500 relative"
        title="Connection quality"
      >
        <div className="flex items-center space-x-1">
          {[1, 2, 3, 4].map((bar) => (
            <div
              key={bar}
              className={`w-1 ${bar === 1 ? 'h-2' : bar === 2 ? 'h-3' : bar === 3 ? 'h-4' : 'h-5'} rounded ${
                bar <= getQualityBars() ? getQualityColor() : 'bg-gray-700'
              }`}
            />
          ))}
        </div>
      </button>

      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 bg-gray-800 rounded-lg shadow-xl border border-gray-700 p-4 w-72 z-50">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-white font-semibold">Connection Quality</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="mb-3">
            <div className={`text-lg font-semibold ${getQualityColor()} capitalize`}>
              {quality}
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Bitrate:</span>
              <span className="text-white font-mono">{stats.bitrate} kbps</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Packet Loss:</span>
              <span className={`font-mono ${stats.packetLoss > 3 ? 'text-red-400' : 'text-white'}`}>
                {stats.packetLoss}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Jitter:</span>
              <span className={`font-mono ${stats.jitter > 50 ? 'text-yellow-400' : 'text-white'}`}>
                {stats.jitter} ms
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Latency:</span>
              <span className="text-white font-mono">{stats.latency} ms</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">FPS:</span>
              <span className="text-white font-mono">{stats.fps}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Resolution:</span>
              <span className="text-white font-mono">{stats.resolution}</span>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-gray-700">
            <div className="text-xs text-gray-500">
              Stats updated every 2 seconds
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
