import { MeetingState } from './layoutService';

export class MeetingStateService {
  private states = new Map<string, MeetingState>();

  /**
   * Create or update meeting state
   */
  updateMeetingState(meetingId: string, updates: Partial<MeetingState>): MeetingState {
    const current = this.states.get(meetingId) || this.createDefaultState(meetingId);
    const updated: MeetingState = {
      ...current,
      ...updates,
      meetingId, // Ensure meetingId is always set
    };
    this.states.set(meetingId, updated);
    return updated;
  }

  /**
   * Get current meeting state
   */
  getMeetingState(meetingId: string): MeetingState {
    return this.states.get(meetingId) || this.createDefaultState(meetingId);
  }

  /**
   * Update participant count
   */
  setParticipantCount(meetingId: string, count: number): MeetingState {
    return this.updateMeetingState(meetingId, { participantCount: count });
  }

  /**
   * Update screen share status
   */
  setScreenShareStatus(
    meetingId: string,
    active: boolean,
    sharerId?: string
  ): MeetingState {
    return this.updateMeetingState(meetingId, {
      screenShareActive: active,
      screenSharerId: active ? sharerId : undefined,
    });
  }

  /**
   * Update active speaker
   */
  setActiveSpeaker(meetingId: string, speakerId?: string): MeetingState {
    return this.updateMeetingState(meetingId, { activeSpeakerId: speakerId });
  }

  /**
   * Update connection mode
   */
  setConnectionMode(meetingId: string, mode: 'p2p' | 'mcu'): MeetingState {
    return this.updateMeetingState(meetingId, { connectionMode: mode });
  }

  /**
   * Update participants list
   */
  setParticipants(
    meetingId: string,
    participants: Array<{ id: string; displayName: string }>
  ): MeetingState {
    return this.updateMeetingState(meetingId, { participants });
  }

  /**
   * Add participant
   */
  addParticipant(
    meetingId: string,
    participant: { id: string; displayName: string }
  ): MeetingState {
    const state = this.getMeetingState(meetingId);
    const participants = [
      ...state.participants.filter(p => p.id !== participant.id),
      participant,
    ];
    return this.updateMeetingState(meetingId, {
      participants,
      participantCount: participants.length,
    });
  }

  /**
   * Remove participant
   */
  removeParticipant(meetingId: string, participantId: string): MeetingState {
    const state = this.getMeetingState(meetingId);
    const participants = state.participants.filter(p => p.id !== participantId);
    
    // If the removed participant was the screen sharer, clear screen share
    let updates: Partial<MeetingState> = {
      participants,
      participantCount: participants.length,
    };
    
    if (state.screenSharerId === participantId) {
      updates.screenShareActive = false;
      updates.screenSharerId = undefined;
    }
    
    // If the removed participant was the active speaker, clear it
    if (state.activeSpeakerId === participantId) {
      updates.activeSpeakerId = undefined;
    }

    return this.updateMeetingState(meetingId, updates);
  }

  /**
   * Clear state for a meeting (when meeting ends)
   */
  clearMeetingState(meetingId: string): void {
    this.states.delete(meetingId);
  }

  /**
   * Get all active meetings
   */
  getActiveMeetings(): string[] {
    return Array.from(this.states.keys());
  }

  /**
   * Get metrics for all meetings
   */
  getMetrics() {
    const meetings = Array.from(this.states.entries()).map(([id, state]) => ({
      meetingId: id,
      participantCount: state.participantCount,
      screenShareActive: state.screenShareActive,
      connectionMode: state.connectionMode,
    }));

    return {
      activeMeetings: meetings.length,
      totalParticipants: meetings.reduce((sum, m) => sum + m.participantCount, 0),
      screensharingMeetings: meetings.filter(m => m.screenShareActive).length,
      meetings,
      timestamp: Date.now(),
    };
  }

  /**
   * Create default state for a new meeting
   */
  private createDefaultState(meetingId: string): MeetingState {
    return {
      meetingId,
      participantCount: 0,
      screenShareActive: false,
      connectionMode: 'p2p',
      participants: [],
    };
  }
}

// Export singleton instance
export const meetingStateService = new MeetingStateService();
