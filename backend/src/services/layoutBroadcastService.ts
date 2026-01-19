import { WebSocket } from 'ws';
import { layoutService, MeetingState } from './layoutService';
import { meetingStateService } from './meetingStateService';
import { LayoutUpdateMessage, LayoutChangeReason } from '../types/signaling';

/**
 * Manages WebSocket connections and broadcasts layout updates to clients
 */
export class LayoutBroadcastService {
  private clientConnections = new Map<string, Set<WebSocket>>();
  private meetingConnections = new Map<string, Set<string>>();
  private lastLayoutUpdate = new Map<string, LayoutUpdateMessage>();

  /**
   * Register a client connection for a meeting
   */
  registerClient(meetingId: string, clientId: string, ws: WebSocket): void {
    // Add to client connections
    if (!this.clientConnections.has(clientId)) {
      this.clientConnections.set(clientId, new Set());
    }
    this.clientConnections.get(clientId)!.add(ws);

    // Add to meeting connections
    if (!this.meetingConnections.has(meetingId)) {
      this.meetingConnections.set(meetingId, new Set());
    }
    this.meetingConnections.get(meetingId)!.add(clientId);

    console.log('[LayoutBroadcast] Client registered:', {
      meetingId,
      clientId,
      totalClientsInMeeting: this.meetingConnections.get(meetingId)?.size,
    });

    // Send current layout to newly connected client
    const lastUpdate = this.lastLayoutUpdate.get(meetingId);
    if (lastUpdate) {
      this.sendToClient(ws, lastUpdate);
    }
  }

  /**
   * Unregister a client connection
   */
  unregisterClient(meetingId: string, clientId: string, ws: WebSocket): void {
    // Remove from client connections
    const clientWs = this.clientConnections.get(clientId);
    if (clientWs) {
      clientWs.delete(ws);
      if (clientWs.size === 0) {
        this.clientConnections.delete(clientId);
      }
    }

    // Remove from meeting connections
    const meetingClients = this.meetingConnections.get(meetingId);
    if (meetingClients) {
      meetingClients.delete(clientId);
      if (meetingClients.size === 0) {
        this.meetingConnections.delete(meetingId);
      }
    }

    console.log('[LayoutBroadcast] Client unregistered:', {
      meetingId,
      clientId,
      totalClientsInMeeting: this.meetingConnections.get(meetingId)?.size,
    });
  }

  /**
   * Broadcast layout update to all clients in a meeting
   */
  broadcastLayoutUpdate(
    meetingId: string,
    reason: LayoutChangeReason
  ): LayoutUpdateMessage | null {
    const state = meetingStateService.getMeetingState(meetingId);
    const decision = layoutService.determineLayout(state);

    const message: LayoutUpdateMessage = {
      type: 'layout-update',
      layout: decision.layout,
      reason,
      timestamp: decision.timestamp,
      meetingId,
      screenSharerId: state.screenSharerId,
      activeSpeakerId: state.activeSpeakerId,
      participantCount: state.participantCount,
    };

    // Cache the last update
    this.lastLayoutUpdate.set(meetingId, message);

    // Broadcast to all clients in the meeting
    const clientIds = this.meetingConnections.get(meetingId);
    if (!clientIds || clientIds.size === 0) {
      console.log('[LayoutBroadcast] No clients to broadcast to:', meetingId);
      return message;
    }

    let sentCount = 0;
    clientIds.forEach(clientId => {
      const wsSet = this.clientConnections.get(clientId);
      if (wsSet) {
        wsSet.forEach(ws => {
          if (ws.readyState === WebSocket.OPEN) {
            this.sendToClient(ws, message);
            sentCount++;
          }
        });
      }
    });

    console.log('[LayoutBroadcast] Layout update broadcast:', {
      meetingId,
      layout: decision.layout,
      reason,
      clientsSent: sentCount,
      totalClients: clientIds.size,
      timestamp: message.timestamp,
    });

    return message;
  }

  /**
   * Notify about participant joined
   */
  notifyParticipantJoined(
    meetingId: string,
    participantId: string,
    displayName: string
  ): void {
    // Update meeting state
    meetingStateService.addParticipant(meetingId, { id: participantId, displayName });

    // Broadcast layout update if needed
    this.broadcastLayoutUpdate(meetingId, 'participant-joined');
  }

  /**
   * Notify about participant left
   */
  notifyParticipantLeft(
    meetingId: string,
    participantId: string
  ): void {
    // Update meeting state
    meetingStateService.removeParticipant(meetingId, participantId);

    // Broadcast layout update if needed
    this.broadcastLayoutUpdate(meetingId, 'participant-left');
  }

  /**
   * Notify about screen share started
   */
  notifyScreenShareStarted(
    meetingId: string,
    participantId: string
  ): void {
    console.log('[LayoutBroadcast] 📺 Screen share started:', {
      meetingId,
      participantId,
      timestamp: Date.now(),
    });

    // Update meeting state
    const state = meetingStateService.setScreenShareStatus(meetingId, true, participantId);

    console.log('[LayoutBroadcast] Meeting state after screen share start:', {
      meetingId,
      screenShareActive: state.screenShareActive,
      screenSharerId: state.screenSharerId,
      participantCount: state.participantCount,
    });

    // Broadcast layout update
    this.broadcastLayoutUpdate(meetingId, 'screen-share-started');
  }

  /**
   * Notify about screen share stopped
   */
  notifyScreenShareStopped(meetingId: string): void {
    console.log('[LayoutBroadcast] 📺 Screen share stopped:', {
      meetingId,
      timestamp: Date.now(),
    });

    // Update meeting state
    const state = meetingStateService.setScreenShareStatus(meetingId, false);

    console.log('[LayoutBroadcast] Meeting state after screen share stop:', {
      meetingId,
      screenShareActive: state.screenShareActive,
      screenSharerId: state.screenSharerId,
      participantCount: state.participantCount,
    });

    // Broadcast layout update
    this.broadcastLayoutUpdate(meetingId, 'screen-share-stopped');
  }

  /**
   * Notify about active speaker changed
   */
  notifyActiveSpeakerChanged(
    meetingId: string,
    speakerId?: string
  ): void {
    // Update meeting state
    meetingStateService.setActiveSpeaker(meetingId, speakerId);

    // Broadcast layout update if speaker change affects layout
    this.broadcastLayoutUpdate(meetingId, 'speaker-changed');
  }

  /**
   * Notify about connection mode changed
   */
  notifyConnectionModeChanged(
    meetingId: string,
    mode: 'p2p' | 'mcu'
  ): void {
    // Update meeting state
    meetingStateService.setConnectionMode(meetingId, mode);

    // Broadcast layout update
    this.broadcastLayoutUpdate(meetingId, 'connection-mode-changed');
  }

  /**
   * Send message to a specific client
   */
  private sendToClient(ws: WebSocket, message: any): void {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    } catch (error) {
      console.error('[LayoutBroadcast] Error sending message:', error);
    }
  }

  /**
   * Clear all connections for a meeting (when meeting ends)
   */
  clearMeeting(meetingId: string): void {
    const clientIds = this.meetingConnections.get(meetingId);
    if (clientIds) {
      clientIds.forEach(clientId => {
        const wsSet = this.clientConnections.get(clientId);
        if (wsSet) {
          wsSet.forEach(ws => {
            try {
              ws.close();
            } catch (error) {
              console.error('[LayoutBroadcast] Error closing connection:', error);
            }
          });
          this.clientConnections.delete(clientId);
        }
      });
      this.meetingConnections.delete(meetingId);
    }

    this.lastLayoutUpdate.delete(meetingId);
    layoutService.clearCache(meetingId);
    meetingStateService.clearMeetingState(meetingId);

    console.log('[LayoutBroadcast] Meeting cleared:', meetingId);
  }

  /**
   * Get metrics for monitoring
   */
  getMetrics() {
    const meetings = Array.from(this.meetingConnections.entries()).map(
      ([meetingId, clientIds]) => ({
        meetingId,
        connectedClients: clientIds.size,
        lastUpdate: this.lastLayoutUpdate.get(meetingId),
      })
    );

    return {
      totalMeetings: meetings.length,
      totalConnectedClients: this.clientConnections.size,
      meetings,
      timestamp: Date.now(),
    };
  }
}

// Export singleton instance
export const layoutBroadcastService = new LayoutBroadcastService();
