/**
 * Backend stream selection service
 * Determines which stream (camera or screen) to send to frontend for each participant
 */

export type StreamType = 'camera' | 'screen' | 'none';

export interface StreamSelection {
  participantId: string;
  streamType: StreamType;
  reason: string;
}

export class StreamSelectionService {
  /**
   * Determine which stream to send for a participant
   * Rules:
   * 1. If participant is sharing screen → send screen stream
   * 2. Otherwise → send camera stream
   * 3. If no camera → send none
   */
  selectStream(
    participantId: string,
    isScreenSharing: boolean,
    hasCameraStream: boolean
  ): StreamSelection {
    let streamType: StreamType;
    let reason: string;

    if (isScreenSharing) {
      streamType = 'screen';
      reason = 'participant-sharing-screen';
    } else if (hasCameraStream) {
      streamType = 'camera';
      reason = 'camera-available';
    } else {
      streamType = 'none';
      reason = 'no-streams-available';
    }

    console.log('[StreamSelection] Selected stream for participant:', {
      participantId,
      streamType,
      reason,
      isScreenSharing,
      hasCameraStream,
    });

    return {
      participantId,
      streamType,
      reason,
    };
  }

  /**
   * Determine stream selections for all participants in a meeting
   */
  selectStreamsForMeeting(
    participants: Array<{
      id: string;
      isScreenSharing: boolean;
      hasCameraStream: boolean;
    }>
  ): StreamSelection[] {
    return participants.map(p =>
      this.selectStream(p.id, p.isScreenSharing, p.hasCameraStream)
    );
  }

  /**
   * Check if stream selection changed
   */
  hasStreamSelectionChanged(
    oldSelection: StreamSelection,
    newSelection: StreamSelection
  ): boolean {
    return oldSelection.streamType !== newSelection.streamType;
  }
}

export const streamSelectionService = new StreamSelectionService();
