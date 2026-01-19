#!/usr/bin/env node

/**
 * Simple test runner for backend services
 * Runs compiled tests from dist directory
 */

const path = require('path');

// Import compiled services
const { streamSelectionService } = require('./dist/services/streamSelectionService');
const { layoutService } = require('./dist/services/layoutService');
const { meetingStateService } = require('./dist/services/meetingStateService');

// Test utilities
let passCount = 0;
let failCount = 0;

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
};

const assertEqual = (actual, expected, message) => {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}. Expected ${expected}, got ${actual}`);
  }
};

const test = (name, fn) => {
  try {
    fn();
    console.log(`✓ ${name}`);
    passCount++;
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(`  ${error.message}`);
    failCount++;
  }
};

// StreamSelectionService Tests
console.log('\n=== StreamSelectionService Tests ===\n');

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
  const old = { participantId: 'p1', streamType: 'camera', reason: 'camera-available' };
  const newSel = { participantId: 'p1', streamType: 'screen', reason: 'participant-sharing-screen' };
  const changed = streamSelectionService.hasStreamSelectionChanged(old, newSel);
  assert(changed === true, 'Should detect change from camera to screen');
});

test('should detect no change when stream type is same', () => {
  const old = { participantId: 'p1', streamType: 'camera', reason: 'camera-available' };
  const newSel = { participantId: 'p1', streamType: 'camera', reason: 'camera-available' };
  const changed = streamSelectionService.hasStreamSelectionChanged(old, newSel);
  assert(changed === false, 'Should detect no change when stream type is same');
});

// LayoutService Tests
console.log('\n=== LayoutService Tests ===\n');

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
    connectionMode: 'p2p',
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
    screenSharerId: undefined,
    activeSpeakerId: 'p1',
    connectionMode: 'p2p',
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
    screenSharerId: undefined,
    activeSpeakerId: 'p1',
    connectionMode: 'p2p',
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
    screenSharerId: undefined,
    activeSpeakerId: 'p1',
    connectionMode: 'p2p',
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
    screenSharerId: undefined,
    activeSpeakerId: 'p1',
    connectionMode: 'p2p',
  };
  const decision1 = layoutService.determineLayout(state);
  const decision2 = layoutService.determineLayout(state);
  assertEqual(decision1.layout, decision2.layout, 'Cached layout should match');
  assertEqual(decision1.timestamp, decision2.timestamp, 'Cached timestamp should match');
});

// Summary
console.log('\n=== Test Summary ===\n');
console.log(`✓ Passed: ${passCount}`);
console.log(`✗ Failed: ${failCount}`);
console.log(`Total: ${passCount + failCount}\n`);

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('All tests passed! ✓\n');
  process.exit(0);
}
