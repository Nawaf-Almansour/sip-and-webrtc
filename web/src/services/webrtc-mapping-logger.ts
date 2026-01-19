/**
 * WebRTC Participant ID to Stream Mapping Logger
 * Tracks and verifies participant ID to stream mapping throughout the pipeline
 */

export interface StreamMapping {
  participantId: string;
  streamId: string;
  streamType: 'camera' | 'screen' | 'audio' | 'unknown';
  videoTracks: number;
  audioTracks: number;
  timestamp: number;
}

export interface ParticipantMapping {
  participantId: string;
  displayName?: string;
  streams: StreamMapping[];
  peerConnectionStatus?: string;
  timestamp: number;
}

class WebRTCMappingLogger {
  private mappings = new Map<string, ParticipantMapping>();
  private streamHistory = new Map<string, StreamMapping[]>();

  /**
   * Log when a remote stream is received
   */
  logRemoteStreamReceived(
    participantId: string,
    stream: MediaStream,
    streamType: 'camera' | 'screen' | 'audio' | 'unknown' = 'unknown',
    displayName?: string
  ): void {
    const mapping: StreamMapping = {
      participantId,
      streamId: stream.id,
      streamType: (streamType as any),
      videoTracks: stream.getVideoTracks().length,
      audioTracks: stream.getAudioTracks().length,
      timestamp: Date.now(),
    };

    // Update current mapping
    if (!this.mappings.has(participantId)) {
      this.mappings.set(participantId, {
        participantId,
        displayName,
        streams: [],
        timestamp: Date.now(),
      });
    }

    const participant = this.mappings.get(participantId)!;
    participant.streams.push(mapping);
    participant.displayName = displayName || participant.displayName;
    participant.timestamp = Date.now();

    // Track history
    if (!this.streamHistory.has(participantId)) {
      this.streamHistory.set(participantId, []);
    }
    this.streamHistory.get(participantId)!.push(mapping);

    console.log('[StreamMapping] Remote stream received:', {
      participantId,
      displayName,
      streamId: stream.id,
      streamType,
      videoTracks: mapping.videoTracks,
      audioTracks: mapping.audioTracks,
      totalStreamsForParticipant: participant.streams.length,
      timestamp: new Date(mapping.timestamp).toLocaleTimeString(),
    });
  }

  /**
   * Log when a remote stream is removed
   */
  logRemoteStreamRemoved(participantId: string, streamId: string): void {
    const participant = this.mappings.get(participantId);
    if (participant) {
      const streamIndex = participant.streams.findIndex(s => s.streamId === streamId);
      if (streamIndex !== -1) {
        const removed = participant.streams.splice(streamIndex, 1)[0];
        console.log('[StreamMapping] Remote stream removed:', {
          participantId,
          streamId,
          streamType: removed.streamType,
          remainingStreamsForParticipant: participant.streams.length,
          timestamp: new Date().toLocaleTimeString(),
        });
      }
    }
  }

  /**
   * Log when a participant leaves
   */
  logParticipantLeft(participantId: string): void {
    const participant = this.mappings.get(participantId);
    if (participant) {
      console.log('[StreamMapping] Participant left:', {
        participantId,
        displayName: participant.displayName,
        streamsCount: participant.streams.length,
        streamIds: participant.streams.map(s => s.streamId),
        timestamp: new Date().toLocaleTimeString(),
      });
      this.mappings.delete(participantId);
    }
  }

  /**
   * Get current mapping status
   */
  getMappingStatus(): {
    totalParticipants: number;
    participants: ParticipantMapping[];
    totalStreams: number;
  } {
    const participants = Array.from(this.mappings.values());
    const totalStreams = participants.reduce((sum, p) => sum + p.streams.length, 0);

    return {
      totalParticipants: participants.length,
      participants,
      totalStreams,
    };
  }

  /**
   * Verify mapping consistency
   */
  verifyMapping(): {
    isValid: boolean;
    issues: string[];
    summary: string;
  } {
    const issues: string[] = [];
    const status = this.getMappingStatus();

    // Check for duplicate streams
    const streamIds = new Set<string>();
    status.participants.forEach(participant => {
      participant.streams.forEach(stream => {
        if (streamIds.has(stream.streamId)) {
          issues.push(`Duplicate stream ID: ${stream.streamId}`);
        }
        streamIds.add(stream.streamId);
      });
    });

    // Check for participants with no streams
    status.participants.forEach(participant => {
      if (participant.streams.length === 0) {
        issues.push(`Participant ${participant.participantId} has no streams`);
      }
    });

    // Check for multiple screen streams per participant
    status.participants.forEach(participant => {
      const screenStreams = participant.streams.filter(s => s.streamType === 'screen');
      if (screenStreams.length > 1) {
        issues.push(`Participant ${participant.participantId} has ${screenStreams.length} screen streams`);
      }
    });

    const isValid = issues.length === 0;
    const summary = isValid
      ? `✓ Mapping valid: ${status.totalParticipants} participants, ${status.totalStreams} streams`
      : `✗ Mapping issues: ${issues.length} problems found`;

    console.log('[StreamMapping] Verification:', {
      isValid,
      issues,
      summary,
      status,
    });

    return { isValid, issues, summary };
  }

  /**
   * Log mapping summary
   */
  logMappingSummary(): void {
    const status = this.getMappingStatus();
    console.log('[StreamMapping] Current Mapping Summary:', {
      totalParticipants: status.totalParticipants,
      totalStreams: status.totalStreams,
      participants: status.participants.map(p => ({
        id: p.participantId,
        displayName: p.displayName,
        streams: p.streams.map(s => ({
          streamId: s.streamId,
          type: s.streamType,
          videoTracks: s.videoTracks,
          audioTracks: s.audioTracks,
        })),
      })),
      timestamp: new Date().toLocaleTimeString(),
    });
  }

  /**
   * Get stream history for a participant
   */
  getStreamHistory(participantId: string): StreamMapping[] {
    return this.streamHistory.get(participantId) || [];
  }

  /**
   * Clear all mappings
   */
  clear(): void {
    this.mappings.clear();
    this.streamHistory.clear();
    console.log('[StreamMapping] Cleared all mappings');
  }
}

export const webrtcMappingLogger = new WebRTCMappingLogger();
