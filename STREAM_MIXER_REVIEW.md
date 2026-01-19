# Stream Mixer Flow Review & Issues

## Current Architecture

### Backend Stream Selection
- **StreamSelectionService**: Determines which stream (camera or screen) to send per participant
- **Rules**: 
  1. If screen sharing → send screen stream
  2. Otherwise → send camera stream
  3. If no camera → send none

### Frontend Stream Handling
- **MediaService**: Manages WebRTC connections and stream callbacks
- **VideoGrid**: Renders video tiles with single stream per participant
- **Callbacks**: `onRemoteStream`, `onRemoteCameraStream`, `onRemoteScreenStream`

---

## Issues Identified

### 1. **Callback Mismatch** ⚠️
**Location**: `web/src/services/mediaService.ts:77-87`

**Problem**: 
- MediaService still has separate callbacks for camera and screen streams
- Frontend expects single `onRemoteStream` callback
- Backend stream selection not integrated with callback routing

**Current Code**:
```typescript
onRemoteStream: (participantId, stream) => {
  config.callbacks.onRemoteStream?.(participantId, stream);
},
onRemoteCameraStream: (participantId, stream) => {
  console.log('[MediaService] Remote camera stream received:', participantId);
  config.callbacks.onRemoteCameraStream?.(participantId, stream);
},
onRemoteScreenStream: (participantId, stream) => {
  console.log('[MediaService] Remote screen stream received:', participantId);
  config.callbacks.onRemoteScreenStream?.(participantId, stream);
},
```

**Issue**: Three separate callbacks but backend only sends one stream per participant

### 2. **WebRTC Service Not Updated** ⚠️
**Location**: `backend/src/websocket/signaling.ts`

**Problem**:
- WebSocket signaling doesn't integrate with StreamSelectionService
- No stream type information sent to frontend
- Frontend can't determine if stream is camera or screen

**Missing**:
- Stream selection logic in WebSocket handlers
- Stream type metadata in messages
- Integration with layoutBroadcastService

### 3. **Stream Metadata Missing** ⚠️
**Problem**:
- No stream type information in signaling messages
- Frontend can't distinguish between camera and screen streams
- Layout updates don't include stream selection info

**Should Include**:
```typescript
{
  type: 'stream-update',
  participantId: string,
  streamType: 'camera' | 'screen' | 'none',
  reason: string,
  timestamp: number,
}
```

### 4. **Layout Broadcast Not Connected to Stream Selection** ⚠️
**Location**: `backend/src/services/layoutBroadcastService.ts`

**Problem**:
- Layout updates don't include stream selection decisions
- Frontend doesn't know which stream to display
- No coordination between layout and stream selection

**Missing Integration**:
- StreamSelectionService not called in broadcastLayoutUpdate
- Stream selection not included in LayoutUpdateMessage
- No stream type in participant metadata

### 5. **Frontend VideoGrid Expects Single Stream** ⚠️
**Location**: `web/src/components/VideoGrid.tsx:24-35`

**Problem**:
- VideoTile expects single `stream` prop
- But mediaService still sends separate camera/screen callbacks
- Mismatch between component design and service implementation

---

## Fixes Required

### Fix 1: Update MediaService Callbacks
**File**: `web/src/services/mediaService.ts`

**Change**: Consolidate callbacks to use single stream per participant

```typescript
// OLD: Three separate callbacks
onRemoteStream?: (participantId: string, stream: MediaStream) => void;
onRemoteCameraStream?: (participantId: string, stream: MediaStream) => void;
onRemoteScreenStream?: (participantId: string, stream: MediaStream) => void;

// NEW: Single callback with stream type metadata
onRemoteStream?: (participantId: string, stream: MediaStream, streamType?: 'camera' | 'screen') => void;
```

### Fix 2: Integrate StreamSelectionService with WebSocket
**File**: `backend/src/websocket/signaling.ts`

**Add**: Stream selection logic when sending stream updates

```typescript
// When stream is added/updated
const streamSelection = streamSelectionService.selectStream(
  participantId,
  isScreenSharing,
  hasCameraStream
);

broadcastToMeeting(meetingId, {
  type: 'stream-update',
  participantId,
  streamType: streamSelection.streamType,
  reason: streamSelection.reason,
});
```

### Fix 3: Add Stream Type to Layout Updates
**File**: `backend/src/services/layoutBroadcastService.ts`

**Add**: Stream selection info to LayoutUpdateMessage

```typescript
interface LayoutUpdateMessage {
  type: 'layout-update';
  layout: LayoutType;
  reason: LayoutChangeReason;
  timestamp: number;
  meetingId: string;
  screenSharerId?: string;
  activeSpeakerId?: string;
  participantCount: number;
  streamSelections?: StreamSelection[]; // ADD THIS
}
```

### Fix 4: Update WebRTC Service
**File**: `backend/src/websocket/signaling.ts` or WebRTC handler

**Add**: Stream type metadata in offer/answer messages

```typescript
case 'offer':
  const streamSelection = streamSelectionService.selectStream(...);
  sendToClient(message.to, {
    type: 'offer',
    from: clientId,
    offer: message.offer,
    streamType: streamSelection.streamType, // ADD THIS
  });
  break;
```

### Fix 5: Update VideoGrid to Handle Stream Type
**File**: `web/src/components/VideoGrid.tsx`

**Add**: Stream type handling in VideoTile

```typescript
interface VideoTileProps {
  participant: Participant;
  stream?: MediaStream | null;
  streamType?: 'camera' | 'screen'; // ADD THIS
  isLocal?: boolean;
  isSpeaking?: boolean;
  isLarge?: boolean;
}
```

---

## Implementation Order

1. ✅ **StreamSelectionService** - Already created
2. ⚠️ **Update MediaService callbacks** - Consolidate to single stream
3. ⚠️ **Integrate with WebSocket signaling** - Add stream type metadata
4. ⚠️ **Update LayoutBroadcastService** - Include stream selections
5. ⚠️ **Update VideoGrid** - Handle stream type metadata
6. ⚠️ **Test end-to-end** - Verify stream selection works

---

## Testing Checklist

- [ ] Single stream per participant is sent to frontend
- [ ] Stream type (camera/screen) is correctly identified
- [ ] Layout updates include stream selection info
- [ ] VideoGrid displays correct stream based on type
- [ ] Screen share switching works correctly
- [ ] Camera fallback works when screen share stops
- [ ] No duplicate streams sent to frontend
- [ ] Stream metadata flows through entire pipeline

---

## Summary

**Root Cause**: Backend stream selection service created but not integrated with WebSocket signaling and frontend callbacks.

**Impact**: Frontend still expects separate camera/screen callbacks, but backend designed to send single stream.

**Solution**: Connect StreamSelectionService to WebSocket handlers and update frontend callbacks to use single stream with type metadata.
