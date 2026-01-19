# Stream Logic Review

## Overview
Complete analysis of stream selection, routing, and display logic across backend and frontend.

---

## 1. Backend Stream Selection Logic

### StreamSelectionService
**File**: `backend/src/services/streamSelectionService.ts`

**Purpose**: Determine which stream (camera or screen) to send to frontend per participant

**Rules**:
```typescript
selectStream(participantId, isScreenSharing, hasCameraStream):
  1. If isScreenSharing → return 'screen'
  2. Else if hasCameraStream → return 'camera'
  3. Else → return 'none'
```

**Decision Tree**:
```
Participant Stream State
├─ Screen Sharing Active?
│  ├─ YES → Send SCREEN stream
│  └─ NO → Check Camera
│     ├─ Camera Available?
│     │  ├─ YES → Send CAMERA stream
│     │  └─ NO → Send NONE
```

**Current Implementation**:
```typescript
selectStream(participantId, isScreenSharing, hasCameraStream) {
  if (isScreenSharing) {
    return { streamType: 'screen', reason: 'participant-sharing-screen' };
  } else if (hasCameraStream) {
    return { streamType: 'camera', reason: 'camera-available' };
  } else {
    return { streamType: 'none', reason: 'no-streams-available' };
  }
}
```

**Issues**:
- ✅ Logic is simple and clear
- ✅ Handles all cases (screen, camera, none)
- ⚠️ Not integrated with WebSocket signaling yet
- ⚠️ Not called during stream updates

---

## 2. WebSocket Signaling Stream Type Detection

### Stream Type Detection in Offer/Answer
**File**: `backend/src/websocket/signaling.ts:233, 255`

**Logic**:
```typescript
// Offer message
const streamType = message.streamType || 
  (message.offer?.sdp?.includes('screen') ? 'screen' : 'camera');

// Answer message
const answerStreamType = message.streamType || 
  (message.answer?.sdp?.includes('screen') ? 'screen' : 'camera');
```

**Detection Method**:
1. Check if `streamType` is explicitly provided in message
2. If not, check SDP content for 'screen' keyword
3. Default to 'camera' if no screen indicator found

**Issues**:
- ✅ Fallback detection from SDP
- ⚠️ SDP parsing is fragile (string matching)
- ⚠️ Doesn't use StreamSelectionService
- ⚠️ Stream type not persisted in meeting state

**Example SDP Detection**:
```
Screen share SDP might contain:
- m=video ... (screen)
- a=label:screen
- a=content:screen

Camera SDP might contain:
- m=video ... (camera)
- a=label:camera
- a=content:camera
```

---

## 3. Frontend WebRTC Stream Handling

### WebRTC Service Stream Callbacks
**File**: `web/src/services/webrtc.ts:310-410`

**ontrack Event Handler**:
```typescript
pc.ontrack = (event) => {
  // Determine track type
  let trackType: 'camera' | 'screen' | 'audio' = 'camera';
  
  if (event.track.kind === 'audio') {
    trackType = 'audio';
  } else if (event.track.kind === 'video') {
    // Use MID to determine type
    if (event.transceiver.mid === '0') {
      trackType = 'camera';
    } else if (event.transceiver.mid === '2') {
      trackType = 'screen';
    }
  }
  
  // Route to appropriate callback
  if (trackType === 'audio') {
    this.onRemoteStream?.(remoteId, stream);
  } else if (trackType === 'camera') {
    this.onRemoteCameraStream?.(remoteId, stream);
  } else if (trackType === 'screen') {
    this.onRemoteScreenStream?.(remoteId, stream);
  }
};
```

**Track Type Detection**:
1. **Audio**: `event.track.kind === 'audio'`
2. **Camera**: `event.transceiver.mid === '0'` (first video transceiver)
3. **Screen**: `event.transceiver.mid === '2'` (third transceiver)

**Issues**:
- ✅ Uses MID (media identifier) for reliable detection
- ⚠️ Assumes fixed MID positions (0=camera, 2=screen)
- ⚠️ Still calls separate callbacks (camera/screen)
- ⚠️ Doesn't use streamType from signaling message

---

## 4. Frontend Meeting Component Stream Mapping

### Stream Storage
**File**: `web/src/pages/Meeting.tsx:310-360`

**State Management**:
```typescript
const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>();
const [remoteCameraStreams, setRemoteCameraStreams] = useState<Map<string, MediaStream>>();
const [remoteScreenStreams, setRemoteScreenStreams] = useState<Map<string, MediaStream>>();
```

**Stream Routing**:
```typescript
onRemoteStream: (participantId, stream) => {
  // Generic stream (audio)
  setRemoteStreams(prev => new Map(prev).set(normalizedId, stream));
},

onRemoteCameraStream: (participantId, stream) => {
  // Camera stream
  setRemoteCameraStreams(prev => new Map(prev).set(normalizedId, stream));
},

onRemoteScreenStream: (participantId, stream) => {
  // Screen stream
  setRemoteScreenStreams(prev => new Map(prev).set(normalizedId, stream));
},
```

**ID Normalization**:
```typescript
function normalizeParticipantId(id: string): string {
  // Convert guest-xxxx to UUID or keep UUID as-is
  // Ensures consistent mapping across components
}
```

**Issues**:
- ⚠️ Maintains 3 separate stream maps
- ⚠️ No automatic stream selection
- ⚠️ Both camera and screen streams stored simultaneously
- ⚠️ VideoGrid must choose which stream to display

---

## 5. Frontend VideoGrid Stream Selection

### VideoGrid Component
**File**: `web/src/components/VideoGrid.tsx:92-200`

**Current Logic**:
```typescript
const videoParticipants = useMemo(() => {
  return participants.map(p => {
    const stream = remoteStreams?.get(p.id);
    return {
      ...p,
      stream,
      streamType: p.streamType || 'camera',
    };
  });
}, [participants, remoteStreams]);
```

**Stream Display Decision**:
```typescript
// VideoTile receives single stream
<VideoTile 
  participant={participant}
  stream={stream}
  streamType={streamType}
/>
```

**Issues**:
- ✅ Uses single stream per participant
- ✅ Displays stream type indicator
- ⚠️ Doesn't select between camera/screen
- ⚠️ Relies on backend to send correct stream
- ⚠️ No fallback if stream is unavailable

---

## 6. Stream Selection Flow Analysis

### Current Flow (Problematic)
```
Backend:
  Offer/Answer → SDP string matching → streamType detection
  
Frontend WebRTC:
  ontrack event → MID-based detection → Separate callbacks
  
Frontend Meeting:
  Separate maps for camera/screen → No selection logic
  
Frontend VideoGrid:
  Receives single stream → Displays as-is
```

**Problems**:
1. **Duplicate Detection**: Both SDP and MID used for detection
2. **No Coordination**: Backend detection doesn't match frontend detection
3. **No Selection**: Frontend stores both streams, doesn't select
4. **No Fallback**: If wrong stream sent, no recovery

### Proposed Flow (Correct)
```
Backend:
  StreamSelectionService determines stream type
  → Passes streamType in signaling message
  → Only selected stream sent to frontend
  
Frontend WebRTC:
  Receives streamType from signaling
  → Uses streamType to route stream
  → Calls onRemoteStream with streamType metadata
  
Frontend Meeting:
  Single remoteStreams map
  → Stores stream with streamType
  → Passes to VideoGrid
  
Frontend VideoGrid:
  Receives stream with streamType
  → Displays with visual indicator
  → No selection needed (backend already selected)
```

---

## 7. Stream Type Metadata Flow

### Current Metadata Path
```
Backend Signaling:
  offer/answer message
  ├─ streamType (detected from SDP)
  └─ from/to (participant IDs)
  
Frontend WebRTC:
  ontrack event
  ├─ event.track (MediaStreamTrack)
  ├─ event.transceiver.mid (0, 1, or 2)
  └─ event.streams[0] (MediaStream)
  
Frontend Meeting:
  Callback parameters
  ├─ participantId
  └─ stream (MediaStream)
  
Frontend VideoGrid:
  Participant object
  ├─ id
  ├─ stream
  └─ streamType (from participant prop)
```

**Issues**:
- ⚠️ streamType from signaling not passed to frontend
- ⚠️ Frontend re-detects type from MID
- ⚠️ No metadata attached to MediaStream
- ⚠️ VideoGrid streamType comes from participant, not stream

---

## 8. Issues & Recommendations

### Issue 1: Duplicate Stream Type Detection
**Problem**: Both backend (SDP) and frontend (MID) detect stream type

**Recommendation**:
- Backend detects once using StreamSelectionService
- Pass streamType in signaling message
- Frontend uses streamType from message, not MID

### Issue 2: No Stream Selection in Frontend
**Problem**: Frontend stores both camera and screen, doesn't select

**Recommendation**:
- Backend sends only selected stream
- Frontend receives single stream per participant
- No selection logic needed in frontend

### Issue 3: Stream Type Metadata Loss
**Problem**: streamType not preserved through pipeline

**Recommendation**:
- Attach streamType to MediaStream as metadata
- Or pass streamType in callback parameters
- Or store streamType in Meeting component state

### Issue 4: Separate Stream Maps
**Problem**: Three maps (remoteStreams, remoteCameraStreams, remoteScreenStreams)

**Recommendation**:
- Use single remoteStreams map
- Store stream with streamType metadata
- Simplify Meeting component state

### Issue 5: No Fallback Logic
**Problem**: If wrong stream sent, no recovery

**Recommendation**:
- Validate stream type matches expected
- Log mismatches for debugging
- Implement fallback to camera if screen unavailable

---

## 9. Implementation Checklist

### Backend
- [ ] Integrate StreamSelectionService with WebSocket handlers
- [ ] Pass streamType in all signaling messages
- [ ] Only send selected stream to frontend
- [ ] Log stream selection decisions

### Frontend WebRTC
- [ ] Extract streamType from signaling message
- [ ] Pass streamType to callbacks
- [ ] Attach streamType metadata to MediaStream
- [ ] Log stream type for debugging

### Frontend Meeting
- [ ] Consolidate to single remoteStreams map
- [ ] Store streamType with stream metadata
- [ ] Pass streamType to VideoGrid
- [ ] Log stream updates

### Frontend VideoGrid
- [ ] Receive streamType from participant
- [ ] Display stream type indicator
- [ ] Implement fallback logic
- [ ] Log stream display decisions

---

## 10. Testing Scenarios

### Scenario 1: Camera Only
```
Participant A joins with camera only
→ Backend selects 'camera'
→ Frontend receives camera stream
→ VideoGrid displays 📷 Camera badge
✓ Expected: Single camera stream displayed
```

### Scenario 2: Screen Share
```
Participant B starts screen share
→ Backend selects 'screen'
→ Frontend receives screen stream
→ VideoGrid displays 📺 Screen badge
✓ Expected: Screen stream displayed, camera hidden
```

### Scenario 3: Screen Share Stop
```
Participant B stops screen share
→ Backend selects 'camera'
→ Frontend receives camera stream
→ VideoGrid displays 📷 Camera badge
✓ Expected: Switch from screen to camera
```

### Scenario 4: No Streams
```
Participant C joins with no streams
→ Backend selects 'none'
→ Frontend receives no stream
→ VideoGrid displays avatar
✓ Expected: Avatar displayed, no stream
```

### Scenario 5: Multiple Participants
```
Participants A (camera), B (screen), C (camera)
→ Backend selects for each: camera, screen, camera
→ Frontend receives 3 streams with types
→ VideoGrid displays all with correct badges
✓ Expected: All streams displayed with correct types
```

---

## 11. Debugging Commands

### Browser Console
```javascript
// Check stream mapping
webrtcMappingLogger.logMappingSummary();

// Verify mapping consistency
const verification = webrtcMappingLogger.verifyMapping();
console.log(verification);

// Get participant mapping status
const status = webrtcMappingLogger.getMappingStatus();
console.log(status);

// Get stream history for participant
const history = webrtcMappingLogger.getStreamHistory('participant-id');
console.log(history);
```

### Backend Logs
```
[StreamSelection] Selected stream for participant: {...}
[Signaling] Offer with stream type: {...}
[Signaling] Answer with stream type: {...}
[LayoutService] Determining layout for meeting: {...}
```

### Frontend Logs
```
[WebRTC] ontrack event: {...}
[WebRTC] Track type determined: {...}
[StreamMapping] Remote stream received: {...}
[VideoTile] Connected video stream: {...}
```

---

## Summary

**Current State**:
- ✅ StreamSelectionService created
- ✅ Stream type detection in WebSocket
- ✅ Stream type indicators in VideoGrid
- ⚠️ Stream type not fully integrated
- ⚠️ Frontend still maintains separate maps
- ⚠️ No automatic stream selection

**Next Steps**:
1. Integrate StreamSelectionService with WebSocket handlers
2. Pass streamType in all signaling messages
3. Consolidate frontend stream maps
4. Implement stream type metadata preservation
5. Add fallback logic for missing streams
6. Test all scenarios

**Key Insight**:
The stream logic works but is not fully optimized. Backend detects stream type, frontend re-detects it, and no automatic selection happens. Simplifying to backend-driven selection would reduce complexity and improve reliability.
