# Stream Logic Fixes Implementation Guide

## Completed Fixes

### Fix 1 & 2: Backend Stream Type Management ✅
**Files Modified**:
- `backend/src/websocket/stream-handler.ts` (NEW)
- `backend/src/websocket/signaling.ts`

**What Was Done**:
- Created StreamHandler class to manage stream type detection
- Integrated StreamSelectionService with WebSocket handlers
- Pass streamMetadata in offer/answer messages
- Track participant stream state

**Result**: Backend now properly determines and passes stream type metadata

---

## Remaining Fixes

### Fix 3: Consolidate Frontend Stream Maps

**Current State**:
```typescript
// Meeting.tsx has 3 separate maps
const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>();
const [remoteCameraStreams, setRemoteCameraStreams] = useState<Map<string, MediaStream>>();
const [remoteScreenStreams, setRemoteScreenStreams] = useState<Map<string, MediaStream>>();
```

**Target State**:
```typescript
// Single consolidated map with metadata
interface RemoteStreamData {
  stream: MediaStream;
  streamType: 'camera' | 'screen' | 'none';
  timestamp: number;
}

const [remoteStreams, setRemoteStreams] = useState<Map<string, RemoteStreamData>>();
```

**Implementation Steps**:

1. **Update Meeting.tsx State** (Lines 46-48):
   - Replace 3 separate maps with single consolidated map
   - Define RemoteStreamData interface

2. **Update Stream Callbacks** (Lines 310-360):
   - Modify `onRemoteStream` to store with streamType
   - Modify `onRemoteCameraStream` to store with streamType='camera'
   - Modify `onRemoteScreenStream` to store with streamType='screen'

3. **Update VideoGrid Props** (Line 642-649):
   - Pass single remoteStreams map
   - Remove remoteCameraStreams and remoteScreenStreams

4. **Update VideoGrid Component** (VideoGrid.tsx):
   - Extract stream and streamType from consolidated map
   - Pass both to VideoTile

**Code Example**:
```typescript
// In Meeting.tsx
onRemoteStream: (participantId, stream, streamType) => {
  const normalizedId = normalizeParticipantId(participantId);
  setRemoteStreams(prev => new Map(prev).set(normalizedId, {
    stream,
    streamType: streamType || 'camera',
    timestamp: Date.now(),
  }));
},
```

---

### Fix 4: Preserve Stream Type Metadata

**Current Problem**: streamType from signaling not passed to VideoGrid

**Solution**: Pass streamType through entire pipeline

**Implementation Steps**:

1. **WebRTC Service** (web/src/services/webrtc.ts):
   - Extract streamType from signaling message
   - Pass streamType to onRemoteStream callback
   
   ```typescript
   // In ontrack handler
   const streamType = message.streamType || 'camera';
   this.onRemoteStream?.(remoteId, stream, streamType);
   ```

2. **Meeting Component** (web/src/pages/Meeting.tsx):
   - Receive streamType in callback
   - Store streamType with stream in consolidated map
   
   ```typescript
   onRemoteStream: (participantId, stream, streamType) => {
     // Store with streamType
   }
   ```

3. **VideoGrid Component** (web/src/components/VideoGrid.tsx):
   - Extract streamType from remoteStreams map
   - Pass to Participant object
   - Display in VideoTile

---

### Fix 5: Implement Fallback Logic

**Current Problem**: No recovery if wrong stream sent

**Solution**: Validate and fallback to camera if needed

**Implementation Steps**:

1. **Add Fallback in VideoTile** (VideoGrid.tsx):
   ```typescript
   // If screen stream unavailable, fallback to camera
   const displayStream = useMemo(() => {
     if (streamType === 'screen' && !stream) {
       // Try to get camera stream as fallback
       return getCameraStreamFallback(participantId);
     }
     return stream;
   }, [stream, streamType, participantId]);
   ```

2. **Add Stream Validation**:
   ```typescript
   // Verify stream type matches expected
   if (stream && streamType === 'screen') {
     const videoTracks = stream.getVideoTracks();
     if (videoTracks.length === 0) {
       console.warn('Screen stream has no video tracks, using fallback');
       // Use fallback
     }
   }
   ```

3. **Add Logging**:
   ```typescript
   console.log('[VideoTile] Stream validation:', {
     participantId,
     streamType,
     hasStream: !!stream,
     videoTracks: stream?.getVideoTracks().length || 0,
     fallbackUsed: displayStream !== stream,
   });
   ```

---

## Implementation Order

1. **Fix 3 First** (Consolidate Maps)
   - Simplest change
   - Reduces complexity
   - Enables other fixes

2. **Fix 4 Second** (Preserve Metadata)
   - Builds on Fix 3
   - Ensures streamType flows through pipeline
   - Enables proper display

3. **Fix 5 Third** (Fallback Logic)
   - Builds on Fixes 3 & 4
   - Adds robustness
   - Improves user experience

---

## Testing After Each Fix

### After Fix 3:
```
- Verify remoteStreams map has correct structure
- Check browser console for stream map logs
- Verify no errors in VideoGrid
```

### After Fix 4:
```
- Verify streamType is passed through callbacks
- Check that VideoGrid receives streamType
- Verify stream type badges display correctly
```

### After Fix 5:
```
- Test screen share switching
- Verify fallback works when stream unavailable
- Check console logs for fallback usage
```

---

## Files to Modify

1. **web/src/pages/Meeting.tsx**
   - Lines 46-48: Update state declarations
   - Lines 310-360: Update stream callbacks
   - Lines 642-649: Update VideoGrid props

2. **web/src/services/webrtc.ts**
   - ontrack handler: Extract and pass streamType

3. **web/src/components/VideoGrid.tsx**
   - Update to extract streamType from consolidated map
   - Pass streamType to VideoTile
   - Implement fallback logic

---

## Debugging Commands

```javascript
// Check consolidated stream map
const status = webrtcMappingLogger.getMappingStatus();
console.log(status);

// Verify stream type metadata
remoteStreams.forEach((data, id) => {
  console.log(`${id}: ${data.streamType} - ${data.stream.id}`);
});

// Check for fallback usage
console.log('[Debug] Fallback streams used:', fallbackCount);
```

---

## Summary

**Current State**:
- Backend properly determines and passes stream type
- Stream metadata in signaling messages
- Frontend still has 3 separate maps

**After All Fixes**:
- Single consolidated stream map
- Stream type metadata preserved through pipeline
- Fallback logic for robustness
- Cleaner, more maintainable code

**Benefits**:
- Reduced complexity
- Better stream management
- Improved reliability
- Easier debugging

---

## Next Steps

1. Implement Fix 3: Consolidate maps
2. Implement Fix 4: Preserve metadata
3. Implement Fix 5: Fallback logic
4. Test all scenarios
5. Rebuild Docker and deploy
6. Verify in production

