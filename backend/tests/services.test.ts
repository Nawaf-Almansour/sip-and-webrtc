/**
 * Unit tests for backend services
 * Tests StreamSelectionService, LayoutService, and MeetingStateService
 */

import { streamSelectionService } from '../src/services/streamSelectionService';
import { layoutService } from '../src/services/layoutService';
import { meetingStateService } from '../src/services/meetingStateService';

// Test utilities
const assert = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
};

const assertEqual = (actual: any, expected: any, message: string) => {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}. Expected ${expected}, got ${actual}`);
  }
};

const test = (name: string, fn: () => void) => {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(`  ${error}`);
  }
};

// StreamSelectionService Tests
console.log('\n=== StreamSelectionService Tests ===');

test('should select screen stream when participant is screen sharing', () => {
  const result = streamSelectionService.selectStream('p1', true, true);
  assertEqual(result.streamType, 'screen', 'Stream type should be screen');
  assertEqual(result.reason, 'participant-sharing-screen', 'Reason should be participant-sharing-screen');
});

test('should select camera stream when not screen sharing but has camera', () => {
  const result = streamSelectionService.selectStream('p2', false, true);
  assertEqual(result.streamType, 'camera', 'Stream type should be camera');
  assertEqual(result.reason, 'camera-available', 'Reason should be camera-available');
});

test('should select none when no streams available', () => {
  const result = streamSelectionService.selectStream('p3', false, false);
  assertEqual(result.streamType, 'none', 'Stream type should be none');
  assertEqual(result.reason, 'no-streams-available', 'Reason should be no-streams-available');
});

test('should prioritize screen share over camera', () => {
  const result = streamSelectionService.selectStream('p4', true, true);
  assertEqual(result.streamType, 'screen', 'Should prioritize screen over camera');
});

test('should select streams for multiple participants', () => {
  const participants = [
    { id: 'p1', isScreenSharing: true, hasCameraStream: true },
    { id: 'p2', isScreenSharing: false, hasCameraStream: true },
    { id: 'p3', isScreenSharing: false, hasCameraStream: false },
  ];
  const results = streamSelectionService.selectStreamsForMeeting(participants);
  assert(results.length === 3, 'Should have 3 results');
  assertEqual(results[0].streamType, 'screen', 'First should be screen');
  assertEqual(results[1].streamType, 'camera', 'Second should be camera');
  assertEqual(results[2].streamType, 'none', 'Third should be none');
});

test('should detect stream selection changes', () => {
  const old = { participantId: 'p1', streamType: 'camera' as const, reason: 'camera-available' };
  const newSel = { participantId: 'p1', streamType: 'screen' as const, reason: 'participant-sharing-screen' };
  const changed = streamSelectionService.hasStreamSelectionChanged(old, newSel);
  assert(changed === true, 'Should detect change from camera to screen');
});

test('should detect no change when stream type is same', () => {
  const old = { participantId: 'p1', streamType: 'camera' as const, reason: 'camera-available' };
  const newSel = { participantId: 'p1', streamType: 'camera' as const, reason: 'camera-available' };
  const changed = streamSelectionService.hasStreamSelectionChanged(old, newSel);
  assert(changed === false, 'Should detect no change when stream type is same');
});

// LayoutService Tests
console.log('\n=== LayoutService Tests ===');

test('should determine presentation layout when screen share is active', () => {
  const state = {
    meetingId: 'meeting-1',
    participants: [
      { id: 'p1', displayName: 'User 1' },
      { id: 'p2', displayName: 'User 2' },
    ],
    participantCount: 2,
    screenShareActive: true,
    screenSharerId: 'p1',
    activeSpeakerId: 'p1',
    connectionMode: 'webrtc' as const,
  };
  const decision = layoutService.determineLayout(state);
  assertEqual(decision.layout, 'presentation', 'Layout should be presentation');
  assertEqual(decision.reason, 'screen-share-active', 'Reason should be screen-share-active');
});

test('should determine speaker layout for single participant', () => {
  const state = {
    meetingId: 'meeting-2',
    participants: [{ id: 'p1', displayName: 'User 1' }],
    participantCount: 1,
    screenShareActive: false,
    screenSharerId: null,
    activeSpeakerId: 'p1',
    connectionMode: 'webrtc' as const,
  };
  const decision = layoutService.determineLayout(state);
  assertEqual(decision.layout, 'speaker', 'Layout should be speaker');
  assertEqual(decision.reason, 'single-participant', 'Reason should be single-participant');
});

test('should determine grid layout for 2-4 participants', () => {
  const state = {
    meetingId: 'meeting-3',
    participants: [
      { id: 'p1', displayName: 'User 1' },
      { id: 'p2', displayName: 'User 2' },
      { id: 'p3', displayName: 'User 3' },
    ],
    participantCount: 3,
    screenShareActive: false,
    screenSharerId: null,
    activeSpeakerId: 'p1',
    connectionMode: 'webrtc' as const,
  };
  const decision = layoutService.determineLayout(state);
  assertEqual(decision.layout, 'grid', 'Layout should be grid');
  assertEqual(decision.reason, 'small-group', 'Reason should be small-group');
});

test('should determine sidebar layout for 5+ participants', () => {
  const state = {
    meetingId: 'meeting-4',
    participants: Array.from({ length: 6 }, (_, i) => ({
      id: `p${i + 1}`,
      displayName: `User ${i + 1}`,
    })),
    participantCount: 6,
    screenShareActive: false,
    screenSharerId: null,
    activeSpeakerId: 'p1',
    connectionMode: 'webrtc' as const,
  };
  const decision = layoutService.determineLayout(state);
  assertEqual(decision.layout, 'sidebar', 'Layout should be sidebar');
  assertEqual(decision.reason, 'large-group', 'Reason should be large-group');
});

test('should cache layout decisions', () => {
  const state = {
    meetingId: 'meeting-5',
    participants: [{ id: 'p1', displayName: 'User 1' }],
    participantCount: 1,
    screenShareActive: false,
    screenSharerId: null,
    activeSpeakerId: 'p1',
    connectionMode: 'webrtc' as const,
  };
  const decision1 = layoutService.determineLayout(state);
  const decision2 = layoutService.determineLayout(state);
  assertEqual(decision1.layout, decision2.layout, 'Cached layout should match');
  assertEqual(decision1.timestamp, decision2.timestamp, 'Cached timestamp should match');
});

// MeetingStateService Tests
console.log('\n=== MeetingStateService Tests ===');

test('should initialize meeting state', () => {
  const state = meetingStateService.initializeMeeting('meeting-test-1');
  assertEqual(state.meetingId, 'meeting-test-1', 'Meeting ID should match');
  assertEqual(state.participantCount, 0, 'Initial participant count should be 0');
  assert(state.screenShareActive === false, 'Screen share should be inactive initially');
});

test('should add participant to meeting', () => {
  const meetingId = 'meeting-test-2';
  meetingStateService.initializeMeeting(meetingId);
  const state = meetingStateService.addParticipant(meetingId, 'p1', 'User 1');
  assertEqual(state.participantCount, 1, 'Participant count should be 1');
  assert(state.participants.length === 1, 'Participants array should have 1 item');
});

test('should remove participant from meeting', () => {
  const meetingId = 'meeting-test-3';
  meetingStateService.initializeMeeting(meetingId);
  meetingStateService.addParticipant(meetingId, 'p1', 'User 1');
  const state = meetingStateService.removeParticipant(meetingId, 'p1');
  assertEqual(state.participantCount, 0, 'Participant count should be 0');
});

test('should set screen share status', () => {
  const meetingId = 'meeting-test-4';
  meetingStateService.initializeMeeting(meetingId);
  meetingStateService.addParticipant(meetingId, 'p1', 'User 1');
  const state = meetingStateService.setScreenShareStatus(meetingId, true, 'p1');
  assert(state.screenShareActive === true, 'Screen share should be active');
  assertEqual(state.screenSharerId, 'p1', 'Screen sharer ID should be p1');
});

test('should set active speaker', () => {
  const meetingId = 'meeting-test-5';
  meetingStateService.initializeMeeting(meetingId);
  meetingStateService.addParticipant(meetingId, 'p1', 'User 1');
  const state = meetingStateService.setActiveSpeaker(meetingId, 'p1');
  assertEqual(state.activeSpeakerId, 'p1', 'Active speaker ID should be p1');
});

console.log('\n=== All Tests Completed ===\n');
