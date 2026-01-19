export type LayoutType = 'grid' | 'speaker' | 'sidebar' | 'presentation';

export interface MeetingState {
  meetingId: string;
  participantCount: number;
  screenShareActive: boolean;
  screenSharerId?: string;
  activeSpeakerId?: string;
  connectionMode: 'p2p' | 'mcu';
  participants: Array<{ id: string; displayName: string }>;
}

export interface LayoutDecision {
  layout: LayoutType;
  reason: string;
  timestamp: number;
}

export class LayoutService {
  private layoutCache = new Map<string, LayoutDecision>();
  private layoutHistory = new Map<string, LayoutDecision[]>();
  private stateCache = new Map<string, MeetingState>();

  /**
   * Determine the optimal layout based on meeting state
   * Uses caching to avoid unnecessary recalculations
   */
  determineLayout(state: MeetingState): LayoutDecision {
    const cached = this.layoutCache.get(state.meetingId);
    const previousState = this.stateCache.get(state.meetingId);

    // Check if state has changed
    if (cached && previousState && !this.hasStateChanged(state, previousState)) {
      return cached;
    }

    let layout: LayoutType;
    let reason: string;

    // Rule 1: Screen share takes priority
    if (state.screenShareActive) {
      layout = 'presentation';
      reason = 'screen-share-active';
    }
    // Rule 2: Single participant
    else if (state.participantCount <= 1) {
      layout = 'speaker';
      reason = 'single-participant';
    }
    // Rule 3: Small group (2-4 participants)
    else if (state.participantCount <= 4) {
      layout = 'grid';
      reason = 'small-group';
    }
    // Rule 4: Large group (5+ participants)
    else {
      layout = 'sidebar';
      reason = 'large-group';
    }

    const decision: LayoutDecision = {
      layout,
      reason,
      timestamp: Date.now(),
    };

    // Cache the decision and state
    this.layoutCache.set(state.meetingId, decision);
    this.stateCache.set(state.meetingId, state);

    // Track history
    if (!this.layoutHistory.has(state.meetingId)) {
      this.layoutHistory.set(state.meetingId, []);
    }
    const history = this.layoutHistory.get(state.meetingId)!;
    
    // Only add to history if layout changed
    if (!cached || cached.layout !== layout) {
      history.push(decision);
      
      // Keep history size manageable (last 100 entries)
      if (history.length > 100) {
        history.shift();
      }
    }

    return decision;
  }

  /**
   * Check if meeting state has changed in ways that affect layout
   */
  private hasStateChanged(current: MeetingState, previous: MeetingState): boolean {
    return (
      current.participantCount !== previous.participantCount ||
      current.screenShareActive !== previous.screenShareActive ||
      current.screenSharerId !== previous.screenSharerId ||
      current.activeSpeakerId !== previous.activeSpeakerId ||
      current.connectionMode !== previous.connectionMode
    );
  }

  /**
   * Get layout history for a meeting
   */
  getLayoutHistory(meetingId: string): LayoutDecision[] {
    return this.layoutHistory.get(meetingId) || [];
  }

  /**
   * Get current cached layout for a meeting
   */
  getCurrentLayout(meetingId: string): LayoutDecision | undefined {
    return this.layoutCache.get(meetingId);
  }

  /**
   * Clear cache for a meeting (when meeting ends)
   */
  clearCache(meetingId: string): void {
    this.layoutCache.delete(meetingId);
    this.stateCache.delete(meetingId);
    this.layoutHistory.delete(meetingId);
  }

  /**
   * Get metrics for monitoring
   */
  getMetrics(meetingId: string) {
    const history = this.layoutHistory.get(meetingId) || [];
    const current = this.layoutCache.get(meetingId);

    return {
      meetingId,
      currentLayout: current?.layout,
      layoutChangeCount: history.length,
      layoutHistory: history.slice(-10), // Last 10 changes
      timestamp: Date.now(),
    };
  }
}

// Export singleton instance
export const layoutService = new LayoutService();
