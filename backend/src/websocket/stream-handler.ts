/**
 * Stream Handler for WebSocket Signaling
 * Manages stream type detection and routing with StreamSelectionService
 */

import { streamSelectionService } from '../services/streamSelectionService.js';

export interface StreamMetadata {
  participantId: string;
  streamType: 'camera' | 'screen' | 'none';
  reason: string;
  timestamp: number;
}

export interface StreamMessage {
  type: 'offer' | 'answer' | 'ice-candidate';
  from: string;
  to: string;
  streamType?: 'camera' | 'screen' | 'none';
  streamMetadata?: StreamMetadata;
  offer?: any;
  answer?: any;
  candidate?: any;
}

export class StreamHandler {
  private participantStreamState = new Map<string, {
    isScreenSharing: boolean;
    hasCameraStream: boolean;
    lastStreamType?: 'camera' | 'screen' | 'none';
  }>();

  /**
   * Detect stream type from SDP content
   */
  private detectStreamTypeFromSDP(sdp?: string): 'camera' | 'screen' | 'none' {
    if (!sdp) return 'camera';
    
    // Check for screen share indicators in SDP
    const screenIndicators = [
      'screen',
      'Screen',
      'SCREEN',
      'displayport',
      'presentation',
    ];
    
    for (const indicator of screenIndicators) {
      if (sdp.includes(indicator)) {
        return 'screen';
      }
    }
    
    // Check for video content
    if (sdp.includes('m=video')) {
      return 'camera';
    }
    
    return 'camera';
  }

  /**
   * Determine stream type for participant
   */
  determineStreamType(
    participantId: string,
    message: any,
    isScreenSharing: boolean = false,
    hasCameraStream: boolean = true
  ): StreamMetadata {
    // Update participant stream state
    this.participantStreamState.set(participantId, {
      isScreenSharing,
      hasCameraStream,
    });

    // Use StreamSelectionService to determine stream type
    const selection = streamSelectionService.selectStream(
      participantId,
      isScreenSharing,
      hasCameraStream
    );

    const metadata: StreamMetadata = {
      participantId,
      streamType: selection.streamType,
      reason: selection.reason,
      timestamp: Date.now(),
    };

    // Log stream type determination
    console.log('[StreamHandler] Stream type determined:', {
      participantId,
      streamType: metadata.streamType,
      reason: metadata.reason,
      isScreenSharing,
      hasCameraStream,
      timestamp: new Date(metadata.timestamp).toLocaleTimeString(),
    });

    return metadata;
  }

  /**
   * Enhance signaling message with stream metadata
   */
  enhanceMessage(message: StreamMessage, streamMetadata: StreamMetadata): StreamMessage {
    return {
      ...message,
      streamType: streamMetadata.streamType,
      streamMetadata,
    };
  }

  /**
   * Get participant stream state
   */
  getParticipantStreamState(participantId: string) {
    return this.participantStreamState.get(participantId);
  }

  /**
   * Update participant stream state
   */
  updateParticipantStreamState(
    participantId: string,
    isScreenSharing: boolean,
    hasCameraStream: boolean
  ): void {
    this.participantStreamState.set(participantId, {
      isScreenSharing,
      hasCameraStream,
    });

    console.log('[StreamHandler] Updated participant stream state:', {
      participantId,
      isScreenSharing,
      hasCameraStream,
      timestamp: new Date().toLocaleTimeString(),
    });
  }

  /**
   * Clear participant stream state
   */
  clearParticipantStreamState(participantId: string): void {
    this.participantStreamState.delete(participantId);
    console.log('[StreamHandler] Cleared participant stream state:', {
      participantId,
      timestamp: new Date().toLocaleTimeString(),
    });
  }

  /**
   * Get all participant stream states
   */
  getAllParticipantStreamStates() {
    return Array.from(this.participantStreamState.entries()).map(([id, state]) => ({
      participantId: id,
      ...state,
    }));
  }
}

export const streamHandler = new StreamHandler();
