# Participant ID to Stream Mapping Verification

## Current Flow

### 1. Backend WebSocket Signaling
**File**: `backend/src/websocket/signaling.ts`

**Participant ID Assignment**:
```typescript
// Line 120: Guest token
clientId = `guest-${Math.random().toString(36).substring(7)}`;

// Line 140: JWT token
clientId = decoded.participantId;
```

**Stream Type Detection**:
```typescript
// Line 233: Offer message
const streamType = message.streamType || (message.offer?.sdp?.includes('screen') ? 'screen' : 'camera');
sendToClient(message.to, {
  type: 'offer',
  from: clientId,
  offer: message.offer,
  streamType,
});

// Line 255: Answer message
const answerStreamType = message.streamType || (message.answer?.sdp?.includes('screen') ? 'screen' : 'camera');
sendToClient(message.to, {
  type: 'answer',
  from: clientId,
  answer: message.answer,
  streamType: answerStreamType,
});
```

### 2. Frontend WebRTC Service
**File**: `web/src/services/webrtc.ts`

**Participant Stream Storage**:
```typescript
// Line 44-46: Callback handlers
private onRemoteStream: ((participantId: string, stream: MediaStream) => void) | null = null;
private onRemoteCameraStream: ((participantId: string, stream: MediaStream) => void) | null = null;
private onRemoteScreenStream: ((participantId: string, stream: MediaStream) => void) | null = null;

// Line 683-685: Get remote stream by participant ID
getRemoteStream(participantId: string): MediaStream | undefined {
  return this.peerConnections.get(participantId)?.stream;
}
```

### 3. Frontend Meeting Component
**File**: `web/src/pages/Meeting.tsx`

**Stream Mapping**:
```typescript
// Line 314-333: Camera stream handler
onRemoteCameraStream: (participantId: string, stream: MediaStream) => {
  const normalizedId = normalizeParticipantId(participantId);
  setRemoteCameraStreams(prev => new Map(prev).set(normalizedId, stream));
},

// Line 335-354: Screen stream handler
onRemoteScreenStream: (participantId: string, stream: MediaStream) => {
  const normalizedId = normalizeParticipantId(participantId);
  setRemoteScreenStreams(prev => new Map(prev).set(normalizedId, stream));
},
```

**Participant ID Normalization**:
```typescript
function normalizeParticipantId(id: string): string {
  // Converts guest-xxxx to UUID format if needed
  // Or returns UUID as-is
}
```

### 4. Frontend VideoGrid Component
**File**: `web/src/components/VideoGrid.tsx`

**Stream to Participant Mapping**:
```typescript
// Line 7-14: Participant interface
interface Participant {
  id: string;
  displayName: string;
  stream?: MediaStream | null;
  streamType?: StreamType;
  isLocal?: boolean;
  isSpeaking?: boolean;
}

// Line 120-132: Audio element mapping
Array.from(remoteStreams.entries()).map(([participantId, stream]) => {
  const audioTracks = stream.getAudioTracks();
  const streamKey = `${participantId}-${stream.id}`;
});
```

---

## Participant ID Types

### 1. Guest Tokens
**Format**: `guest-${random}`
**Example**: `guest-a1b2c3d4`
**Source**: WebSocket signaling when using guest token
**Location**: `backend/src/websocket/signaling.ts:120`

### 2. JWT Tokens
**Format**: UUID or custom ID from JWT payload
**Example**: `96130b8a-4ac0-4654-872b-fadbd69d60c4`
**Source**: JWT token decoded in WebSocket signaling
**Location**: `backend/src/websocket/signaling.ts:140`

### 3. Signaling IDs
**Format**: Same as participant ID from WebSocket
**Used in**: Offer/answer messages
**Mapping**: `from` field in signaling messages

---

## Stream Mapping Chain

```
Backend WebSocket
    ↓
    ├─ clientId (guest-xxxx or UUID)
    ├─ streamType (camera | screen | none)
    └─ Offer/Answer with streamType metadata
    
        ↓
Frontend WebRTC Service
    ↓
    ├─ participantId (from offer/answer)
    ├─ stream (MediaStream)
    └─ Callbacks: onRemoteStream, onRemoteCameraStream, onRemoteScreenStream
    
        ↓
Frontend Meeting Component
    ↓
    ├─ normalizeParticipantId(participantId)
    ├─ remoteStreams Map<participantId, stream>
    └─ remoteCameraStreams Map<participantId, stream>
    └─ remoteScreenStreams Map<participantId, stream>
    
        ↓
Frontend VideoGrid Component
    ↓
    ├─ participants array
    ├─ Participant.id → stream mapping
    └─ Participant.streamType display
```

---

## Verification Points

### Point 1: WebSocket Signaling
**Check**: Participant ID is correctly assigned and passed in offer/answer

**Log Location**: `backend/src/websocket/signaling.ts:234-238`
```
[Signaling] Offer with stream type: {
  from: clientId,
  to: message.to,
  streamType,
}
```

### Point 2: WebRTC Service
**Check**: Participant ID is correctly extracted from signaling messages

**Log Location**: `web/src/services/webrtc.ts` (needs enhancement)
**Should Log**:
```
[WebRTC] Remote stream received: {
  participantId,
  streamType,
  streamId,
  videoTracks,
  audioTracks,
}
```

### Point 3: Meeting Component
**Check**: Participant ID is normalized and stored correctly

**Log Location**: `web/src/pages/Meeting.tsx:311-312`
```
[Meeting] Added camera stream for participant: normalizedId
```

### Point 4: VideoGrid Component
**Check**: Participant ID to stream mapping is correct

**Log Location**: `web/src/components/VideoGrid.tsx:44-50`
```
[VideoTile] Connected video stream: {
  participantId,
  streamType,
  streamId,
  videoTracks,
}
```

---

## Issues to Check

### Issue 1: ID Normalization
**Problem**: Guest IDs (guest-xxxx) vs UUID IDs might not map correctly

**Check**:
- Does `normalizeParticipantId()` handle both formats?
- Are guest IDs converted to UUID or kept as-is?
- Is the mapping consistent across all components?

### Issue 2: Stream Type Metadata Loss
**Problem**: Stream type might be lost between WebSocket and VideoGrid

**Check**:
- Is streamType passed through offer/answer?
- Is streamType stored in Meeting component?
- Is streamType passed to VideoGrid participants?

### Issue 3: Multiple Streams Per Participant
**Problem**: Both camera and screen streams might exist for same participant

**Check**:
- Which stream should be displayed (camera or screen)?
- How is stream selection determined?
- Is StreamSelectionService being used?

### Issue 4: Stream Cleanup
**Problem**: Old streams might not be cleaned up when switching

**Check**:
- Are old streams removed from maps?
- Are old peer connections closed?
- Are old audio elements removed?

---

## Required Enhancements

### 1. Add Logging to WebRTC Service
**File**: `web/src/services/webrtc.ts`

**Add**:
```typescript
// When stream is received
console.log('[WebRTC] Remote stream received:', {
  participantId,
  streamType: message.streamType,
  streamId: stream.id,
  videoTracks: stream.getVideoTracks().length,
  audioTracks: stream.getAudioTracks().length,
  timestamp: Date.now(),
});

// When stream is removed
console.log('[WebRTC] Remote stream removed:', {
  participantId,
  streamId: stream.id,
  timestamp: Date.now(),
});
```

### 2. Add Logging to Meeting Component
**File**: `web/src/pages/Meeting.tsx`

**Add**:
```typescript
// When stream is added
console.log('[Meeting] Stream added for participant:', {
  originalId: participantId,
  normalizedId,
  streamType,
  streamId: stream.id,
  remoteStreamsSize: remoteStreams.size,
});

// When participant is removed
console.log('[Meeting] Participant removed:', {
  participantId,
  remoteStreamsSize: remoteStreams.size,
});
```

### 3. Add Mapping Verification
**File**: `web/src/components/VideoGrid.tsx`

**Add**:
```typescript
// Log participant to stream mapping
console.log('[VideoGrid] Participant to stream mapping:', {
  participants: participants.map(p => ({
    id: p.id,
    displayName: p.displayName,
    hasStream: !!p.stream,
    streamId: p.stream?.id,
    streamType: p.streamType,
  })),
  remoteStreamsSize: remoteStreams?.size || 0,
  remoteStreamIds: Array.from(remoteStreams?.keys() || []),
});
```

---

## Testing Checklist

- [ ] Verify participant IDs are consistent (guest-xxxx or UUID)
- [ ] Verify stream type is correctly identified (camera/screen)
- [ ] Verify participant ID to stream mapping is correct
- [ ] Verify stream type is passed through entire pipeline
- [ ] Verify old streams are cleaned up when new ones arrive
- [ ] Verify participant removal cleans up all associated streams
- [ ] Verify screen share switching works correctly
- [ ] Verify no duplicate streams for same participant
- [ ] Verify audio tracks are correctly bound to audio elements
- [ ] Verify video tracks are correctly bound to video elements

---

## Summary

The participant ID to stream mapping flow is:
1. **Backend**: Assigns participant ID (guest-xxxx or UUID)
2. **WebSocket**: Passes participant ID in offer/answer with streamType
3. **WebRTC Service**: Receives stream with participantId
4. **Meeting Component**: Normalizes ID and stores stream
5. **VideoGrid**: Maps participant ID to stream for display

**Key Points**:
- Participant IDs must be consistent throughout the flow
- Stream type metadata must be preserved
- Old streams must be cleaned up
- Mapping must be verified at each step
