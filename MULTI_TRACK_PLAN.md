# خطة نظام Multi-Track للمشاركين
# Multi-Track System Plan (Audio + Camera + Screen Share)

> **الهدف**: كل مشارك يمكنه إرسال 3 tracks منفصلة: Audio, Camera, Screen Share
> **Goal**: Each participant can send 3 independent tracks: Audio, Camera, Screen Share

---

## 📊 Current Implementation Analysis

### ✅ What We Have Now (Single Video Track)

```
Participant Stream:
├── Audio Track (1)
└── Video Track (1) → switches between Camera OR Screen Share
```

**Current Behavior:**
- When screen sharing starts: Camera track is **replaced** with screen track
- Remote participants see **either** camera **or** screen, never both
- Only 1 video track active at a time

**Limitations:**
- ❌ Cannot show camera + screen simultaneously
- ❌ Cannot have picture-in-picture (PiP) view
- ❌ Screen share replaces camera completely
- ❌ No flexibility in UI layout

---

## 🎯 Target Implementation (Multi-Track)

### ✨ What We Want

```
Participant Stream:
├── Audio Track (1) → always active
├── Camera Track (1) → can be on/off independently
└── Screen Track (1) → can be on/off independently
```

**New Behavior:**
- Camera and screen share are **independent**
- Remote participants receive **both** tracks
- UI can display camera + screen simultaneously
- Picture-in-Picture (PiP) possible
- More flexible layouts

**Benefits:**
- ✅ Show camera in corner while sharing screen
- ✅ Better presenter experience
- ✅ More professional meetings
- ✅ Flexible UI options

---

## 🏗️ Architecture Design

### Option 1: WebRTC P2P (Current Mode)

#### **Challenge**: Multiple Peer Connections Per Participant

In P2P mode, each participant has N-1 peer connections (where N = total participants).

**Current Structure:**
```
Participant A ←→ Participant B (1 peer connection)
              ↘
                Participant C (1 peer connection)
```

**With Multi-Track:**
```
Participant A sends to B:
├── Audio track
├── Camera track
└── Screen track (optional)

Participant A sends to C:
├── Audio track
├── Camera track
└── Screen track (optional)
```

#### **Implementation Approach:**

**1. Use Multiple Transceivers**
```typescript
// Create separate transceivers for each track type
const audioTransceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
const cameraTransceiver = pc.addTransceiver('video', { direction: 'sendrecv' });
const screenTransceiver = pc.addTransceiver('video', { direction: 'sendrecv' });

// Assign tracks
audioTransceiver.sender.replaceTrack(audioTrack);
cameraTransceiver.sender.replaceTrack(cameraTrack);
screenTransceiver.sender.replaceTrack(screenTrack);
```

**2. Track Identification**
```typescript
// Add metadata to identify track type
cameraTrack.id = `camera-${participantId}`;
screenTrack.id = `screen-${participantId}`;

// Or use track.label
cameraTrack.label = 'camera';
screenTrack.label = 'screen';
```

**3. Receiving Multiple Tracks**
```typescript
pc.ontrack = (event) => {
  const track = event.track;
  const trackType = identifyTrackType(track); // 'audio' | 'camera' | 'screen'
  
  if (trackType === 'camera') {
    setCameraStream(new MediaStream([track]));
  } else if (trackType === 'screen') {
    setScreenStream(new MediaStream([track]));
  }
};
```

#### **Pros & Cons:**

**Pros:**
- ✅ True P2P, no server processing
- ✅ Low latency
- ✅ No bandwidth cost on server

**Cons:**
- ❌ Scales poorly (N² connections)
- ❌ High bandwidth for sender (sends to each peer)
- ❌ Complex negotiation for 3 tracks × N peers
- ❌ Not suitable for 5+ participants

---

### Option 2: SIP/Verto with FreeSWITCH (SFU Mode)

#### **Challenge**: FreeSWITCH Conference Mixing

FreeSWITCH conference module traditionally mixes all streams into one.

**Current Structure:**
```
Participant A → FreeSWITCH Conference → Mixed Stream → Participant B
Participant B → FreeSWITCH Conference → Mixed Stream → Participant A
```

**With Multi-Track (SFU Mode):**
```
Participant A:
├── Audio → FreeSWITCH → Participant B (audio)
├── Camera → FreeSWITCH → Participant B (camera)
└── Screen → FreeSWITCH → Participant B (screen)
```

#### **Implementation Approach:**

**Option 2A: Multiple SIP Sessions (Complex)**
```
Participant creates 3 separate SIP sessions:
1. Audio + Camera session → conference:room-{id}-main
2. Screen share session → conference:room-{id}-screen
3. FreeSWITCH routes both to same conference but different streams
```

**Option 2B: Unified Plan SDP (Recommended)**
```typescript
// Use Unified Plan SDP with multiple m= lines
SDP Structure:
m=audio ...
m=video ... (camera)
m=video ... (screen)

// FreeSWITCH 1.10+ supports Unified Plan
// Configure mod_conference to handle multiple video streams
```

**Option 2C: Separate Conferences**
```
Main Conference: room-{id}
├── Audio + Camera streams

Screen Conference: room-{id}-screen
└── Screen share streams only

Client subscribes to both conferences
```

#### **FreeSWITCH Configuration Changes:**

**1. Enable Multiple Video Streams**
```xml
<!-- conference.conf.xml -->
<profile name="video-mcu">
  <param name="video-mode" value="mux"/>
  <param name="video-layout-name" value="3x3"/>
  <param name="video-canvas-count" value="2"/> <!-- Support 2 video streams -->
  <param name="video-super-canvas-show-all-layers" value="true"/>
</profile>
```

**2. SIP Profile for Multiple Streams**
```xml
<!-- sip_profiles/internal.xml -->
<param name="enable-3pcc" value="true"/>
<param name="inbound-codec-negotiation" value="generous"/>
<param name="rtp-timeout-sec" value="300"/>
```

#### **Pros & Cons:**

**Pros:**
- ✅ Scales to 10+ participants
- ✅ Server handles routing
- ✅ Single connection per participant
- ✅ Better for production

**Cons:**
- ❌ Requires FreeSWITCH configuration
- ❌ Server bandwidth cost
- ❌ Slightly higher latency
- ❌ More complex backend logic

---

## 🔄 Hybrid Approach (Recommended)

### **Strategy: Mode-Based Implementation**

```typescript
if (participants <= 4) {
  // Use WebRTC P2P with multi-track
  mode = 'webrtc-multitrack';
} else {
  // Use SIP/Verto SFU mode
  mode = 'verto-sfu';
}
```

**Benefits:**
- Best of both worlds
- P2P for small meetings (low latency)
- SFU for large meetings (scalability)
- Automatic switching based on participant count

---

## 📋 Implementation Plan

### Phase 1: WebRTC P2P Multi-Track (2-4 participants)

#### **1.1 Update WebRTC Service**

**File:** `web/src/services/webrtc.ts`

```typescript
interface ParticipantTracks {
  audio: MediaStreamTrack | null;
  camera: MediaStreamTrack | null;
  screen: MediaStreamTrack | null;
}

class WebRTCService {
  private localTracks: ParticipantTracks = {
    audio: null,
    camera: null,
    screen: null,
  };

  async createPeerConnection(remoteId: string, createOffer: boolean) {
    const pc = new RTCPeerConnection(config);
    
    // Add transceivers for each track type
    const audioTransceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
    const cameraTransceiver = pc.addTransceiver('video', { direction: 'sendrecv' });
    const screenTransceiver = pc.addTransceiver('video', { direction: 'sendrecv' });
    
    // Assign local tracks
    if (this.localTracks.audio) {
      audioTransceiver.sender.replaceTrack(this.localTracks.audio);
    }
    if (this.localTracks.camera) {
      cameraTransceiver.sender.replaceTrack(this.localTracks.camera);
    }
    if (this.localTracks.screen) {
      screenTransceiver.sender.replaceTrack(this.localTracks.screen);
    }
    
    // Handle incoming tracks
    pc.ontrack = (event) => {
      this.handleIncomingTrack(remoteId, event.track, event.transceiver);
    };
  }
  
  async setCameraTrack(track: MediaStreamTrack | null) {
    this.localTracks.camera = track;
    // Update all peer connections
    this.peerConnections.forEach((pc) => {
      const sender = this.getCameraTransceiver(pc.pc)?.sender;
      sender?.replaceTrack(track);
    });
  }
  
  async setScreenTrack(track: MediaStreamTrack | null) {
    this.localTracks.screen = track;
    // Update all peer connections
    this.peerConnections.forEach((pc) => {
      const sender = this.getScreenTransceiver(pc.pc)?.sender;
      sender?.replaceTrack(track);
    });
  }
}
```

#### **1.2 Update Meeting Component**

**File:** `web/src/pages/Meeting.tsx`

```typescript
interface ParticipantStreams {
  id: string;
  displayName: string;
  audioStream?: MediaStream;
  cameraStream?: MediaStream;
  screenStream?: MediaStream;
}

const [participants, setParticipants] = useState<ParticipantStreams[]>([]);

// Separate handlers for each track type
const handleCameraTrack = (participantId: string, track: MediaStreamTrack) => {
  setParticipants(prev => prev.map(p => 
    p.id === participantId 
      ? { ...p, cameraStream: new MediaStream([track]) }
      : p
  ));
};

const handleScreenTrack = (participantId: string, track: MediaStreamTrack) => {
  setParticipants(prev => prev.map(p => 
    p.id === participantId 
      ? { ...p, screenStream: new MediaStream([track]) }
      : p
  ));
};

// Screen share toggle (no longer replaces camera)
const toggleScreenShare = async () => {
  if (isScreenSharing) {
    // Stop screen track
    await mediaService.setScreenTrack(null);
    setIsScreenSharing(false);
  } else {
    // Start screen track (camera stays active)
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const screenTrack = screenStream.getVideoTracks()[0];
    await mediaService.setScreenTrack(screenTrack);
    setIsScreenSharing(true);
  }
};
```

#### **1.3 Update VideoGrid Component**

**File:** `web/src/components/VideoGrid.tsx`

```typescript
interface Participant {
  id: string;
  displayName: string;
  cameraStream?: MediaStream;
  screenStream?: MediaStream;
  isLocal?: boolean;
}

// New layout: Show screen + camera PiP
function ParticipantTile({ participant }: { participant: Participant }) {
  return (
    <div className="relative">
      {/* Main view: Screen if sharing, otherwise camera */}
      <video 
        srcObject={participant.screenStream || participant.cameraStream}
        autoPlay 
        playsInline 
      />
      
      {/* Picture-in-Picture: Camera when sharing screen */}
      {participant.screenStream && participant.cameraStream && (
        <div className="absolute bottom-2 right-2 w-32 h-24 border-2 border-white rounded">
          <video 
            srcObject={participant.cameraStream}
            autoPlay 
            playsInline 
            muted={participant.isLocal}
          />
        </div>
      )}
    </div>
  );
}
```

---

### Phase 2: SIP/Verto Multi-Track (5+ participants)

#### **2.1 FreeSWITCH Configuration**

**File:** `infra/freeswitch/conf/autoload_configs/conference.conf.xml`

```xml
<profile name="video-multitrack">
  <param name="video-mode" value="mux"/>
  <param name="video-canvas-count" value="2"/>
  <param name="video-layout-name" value="group:grid"/>
  <param name="video-layout-conf" value="conference-layouts.conf.xml"/>
  
  <!-- Enable multiple video streams per participant -->
  <param name="video-super-canvas-show-all-layers" value="true"/>
  <param name="video-super-canvas-label-layers" value="true"/>
</profile>
```

#### **2.2 Backend SIP Handling**

**File:** `backend/src/sip/handlers/invite.ts`

```typescript
// Handle INVITE with multiple video streams
async function handleInvite(req: any, res: any) {
  const sdp = req.body;
  
  // Parse SDP to identify track types
  const tracks = parseSDP(sdp);
  // tracks = [{ type: 'audio' }, { type: 'video', label: 'camera' }, { type: 'video', label: 'screen' }]
  
  if (tracks.filter(t => t.type === 'video').length > 1) {
    // Multi-track mode
    await routeToMultiTrackConference(req, res);
  } else {
    // Single track mode (backward compatible)
    await routeToSingleTrackConference(req, res);
  }
}
```

#### **2.3 Verto Service Updates**

**File:** `web/src/services/vertoService.ts`

```typescript
class VertoService {
  async call(destination: string, tracks: ParticipantTracks) {
    const pc = new RTCPeerConnection(config);
    
    // Add all tracks to peer connection
    if (tracks.audio) pc.addTrack(tracks.audio);
    if (tracks.camera) pc.addTrack(tracks.camera);
    if (tracks.screen) pc.addTrack(tracks.screen);
    
    const offer = await pc.createOffer();
    
    // Modify SDP to label tracks
    offer.sdp = this.labelTracksInSDP(offer.sdp, {
      camera: tracks.camera?.id,
      screen: tracks.screen?.id,
    });
    
    await this.sendVertoInvite(destination, offer);
  }
  
  private labelTracksInSDP(sdp: string, trackIds: any): string {
    // Add a=label: attributes to identify track types
    // This helps FreeSWITCH route tracks correctly
    return sdp; // Modified SDP
  }
}
```

---

## 🎨 UI/UX Considerations

### Layout Options with Multi-Track

#### **1. Grid View (All Cameras)**
```
┌─────────┬─────────┬─────────┐
│ User A  │ User B  │ User C  │
│ Camera  │ Camera  │ Camera  │
└─────────┴─────────┴─────────┘
```

#### **2. Screen Share Focus (Camera PiP)**
```
┌─────────────────────────────┐
│                             │
│     User A Screen Share     │
│                             │
│  ┌─────┐                    │
│  │ A   │                    │
│  │Cam  │                    │
│  └─────┘                    │
└─────────────────────────────┘
```

#### **3. Dual View (Screen + All Cameras)**
```
┌──────────────────┬──────────┐
│                  │  User A  │
│  User A Screen   │  Camera  │
│                  ├──────────┤
│                  │  User B  │
│                  │  Camera  │
└──────────────────┴──────────┘
```

#### **4. Presenter Mode (Large Screen + Thumbnails)**
```
┌─────────────────────────────┐
│                             │
│     Active Screen Share     │
│                             │
└─────────────────────────────┘
┌───┬───┬───┬───┬───┬───┬───┐
│ A │ B │ C │ D │ E │ F │ G │
└───┴───┴───┴───┴───┴───┴───┘
```

---

## 📊 Data Flow Diagrams

### Current (Single Track)
```
User Action: Start Screen Share
    ↓
Replace camera track with screen track
    ↓
Send to all peers
    ↓
Remote sees: Screen (no camera)
```

### New (Multi-Track)
```
User Action: Start Screen Share
    ↓
Add screen track (camera stays active)
    ↓
Send both tracks to all peers
    ↓
Remote sees: Screen + Camera (PiP)
```

---

## 🔧 Technical Challenges & Solutions

### Challenge 1: Track Identification

**Problem:** How to distinguish camera vs screen tracks?

**Solutions:**
1. **Track Labels**
   ```typescript
   track.label = 'camera' | 'screen';
   ```

2. **Transceiver Order**
   ```typescript
   // Always add in same order
   transceivers[0] = audio
   transceivers[1] = camera
   transceivers[2] = screen
   ```

3. **SDP Attributes**
   ```sdp
   a=label:camera
   a=label:screen
   ```

### Challenge 2: Bandwidth Management

**Problem:** 3 tracks × N participants = high bandwidth

**Solutions:**
1. **Adaptive Bitrate**
   ```typescript
   // Lower bitrate for screen when camera active
   if (cameraActive && screenActive) {
     screenTrack.applyConstraints({
       video: { width: 1920, height: 1080, frameRate: 15 }
     });
   }
   ```

2. **Simulcast** (Advanced)
   ```typescript
   // Send multiple qualities, let receiver choose
   sender.setParameters({
     encodings: [
       { rid: 'h', maxBitrate: 1500000 },
       { rid: 'm', maxBitrate: 600000, scaleResolutionDownBy: 2 },
       { rid: 'l', maxBitrate: 300000, scaleResolutionDownBy: 4 }
     ]
   });
   ```

3. **Selective Forwarding**
   ```typescript
   // Only send screen track to participants viewing it
   if (!participantViewingScreen) {
     screenTransceiver.direction = 'inactive';
   }
   ```

### Challenge 3: SDP Negotiation Complexity

**Problem:** More tracks = more complex SDP negotiation

**Solutions:**
1. **Use Unified Plan** (modern standard)
2. **Pre-negotiate transceivers** (add all 3 upfront)
3. **Handle renegotiation gracefully**

---

## 📈 Performance Considerations

### Bandwidth Estimates (Per Participant)

| Scenario | Audio | Camera | Screen | Total |
|----------|-------|--------|--------|-------|
| Camera only | 50 kbps | 500 kbps | - | 550 kbps |
| Screen only | 50 kbps | - | 1500 kbps | 1550 kbps |
| **Both (Multi-track)** | 50 kbps | 500 kbps | 1500 kbps | **2050 kbps** |

**For 5 participants (P2P):**
- Upload: 2050 kbps × 4 = **8.2 Mbps** (high!)
- Download: 2050 kbps × 4 = **8.2 Mbps**

**For 5 participants (SFU):**
- Upload: 2050 kbps × 1 = **2.05 Mbps** (reasonable)
- Download: 2050 kbps × 4 = **8.2 Mbps**

**Conclusion:** Multi-track works best with SFU for 5+ participants.

---

## 🗓️ Implementation Timeline

### Phase 1: WebRTC P2P Multi-Track (5-7 days)
- [ ] Day 1-2: Update WebRTC service with transceiver management
- [ ] Day 3-4: Update Meeting component for multi-stream handling
- [ ] Day 5: Update VideoGrid with PiP support
- [ ] Day 6-7: Testing and bug fixes

### Phase 2: SIP/Verto Multi-Track (7-10 days)
- [ ] Day 1-2: FreeSWITCH configuration for multiple video streams
- [ ] Day 3-4: Backend SIP handler updates
- [ ] Day 5-6: Verto service multi-track support
- [ ] Day 7-8: Integration testing
- [ ] Day 9-10: Performance optimization

### Phase 3: UI/UX Enhancements (3-5 days)
- [ ] Day 1-2: New layout modes (dual view, presenter mode)
- [ ] Day 3: Layout switcher UI
- [ ] Day 4-5: Polish and testing

**Total Estimated Time:** 15-22 days

---

## 🎯 Success Criteria

### Must Have
- [ ] Participant can share screen while camera stays on
- [ ] Remote participants see both camera and screen
- [ ] Works in WebRTC P2P mode (2-4 participants)
- [ ] Works in Verto SFU mode (5+ participants)
- [ ] Picture-in-Picture view available

### Should Have
- [ ] Multiple layout options
- [ ] Smooth track switching (no renegotiation)
- [ ] Bandwidth optimization
- [ ] Mobile support

### Nice to Have
- [ ] Simulcast support
- [ ] Selective forwarding
- [ ] Advanced layouts (spotlight, gallery)
- [ ] Virtual backgrounds

---

## 🚨 Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| High bandwidth usage | High | High | Use SFU for 5+, implement adaptive bitrate |
| Browser compatibility | Medium | Medium | Test on Chrome/Firefox/Safari, fallback to single track |
| FreeSWITCH complexity | High | Medium | Start with WebRTC P2P, add Verto later |
| SDP negotiation bugs | Medium | High | Extensive testing, use Unified Plan |
| Performance on mobile | High | Medium | Lower resolution/framerate on mobile |

---

## 📚 References & Resources

### WebRTC Standards
- [WebRTC 1.0 Specification](https://www.w3.org/TR/webrtc/)
- [Unified Plan SDP](https://datatracker.ietf.org/doc/html/draft-ietf-rtcweb-jsep)
- [RTCRtpTransceiver API](https://developer.mozilla.org/en-US/docs/Web/API/RTCRtpTransceiver)

### FreeSWITCH Documentation
- [mod_conference](https://freeswitch.org/confluence/display/FREESWITCH/mod_conference)
- [Video Conferencing](https://freeswitch.org/confluence/display/FREESWITCH/Video+Conferencing)
- [Verto Protocol](https://freeswitch.org/confluence/display/FREESWITCH/mod_verto)

### Similar Implementations
- Jitsi Meet (uses Simulcast + SFU)
- Zoom (proprietary SFU)
- Google Meet (uses multiple peer connections)

---

## 🎬 Next Steps

### Immediate Actions
1. **Decide on approach**: WebRTC P2P first or SIP/Verto first?
2. **Prototype**: Build simple proof-of-concept with 2 participants
3. **Test**: Verify track identification and PiP display
4. **Iterate**: Add more participants and test scalability

### Recommended Path
```
Start → WebRTC P2P (2-4 participants) → Test thoroughly → 
Add Verto SFU (5+ participants) → Optimize → Production
```

---

## 💡 Alternative: Simpler Approach

If full multi-track is too complex, consider:

### **Option: Screen Share as Separate Participant**
```typescript
// When user shares screen, create a "virtual participant"
const screenParticipant = {
  id: `${userId}-screen`,
  displayName: `${userName}'s Screen`,
  stream: screenStream,
  isScreenShare: true
};

// Display in grid like a regular participant
// Simpler to implement, works with existing code
```

**Pros:**
- ✅ Much simpler implementation
- ✅ Works with current architecture
- ✅ No SDP complexity

**Cons:**
- ❌ Takes up a "participant slot"
- ❌ Less elegant UX
- ❌ Harder to do PiP

---

## 📝 Conclusion

Multi-track implementation is **feasible but complex**. The recommended approach is:

1. **Phase 1**: Implement WebRTC P2P multi-track for small meetings (2-4 participants)
2. **Phase 2**: Add SIP/Verto SFU support for larger meetings (5+ participants)
3. **Phase 3**: Optimize and add advanced features

**Estimated Effort:** 3-4 weeks of development + testing

**Alternative:** If timeline is tight, use the "screen share as virtual participant" approach for quick implementation (3-5 days).

---

**Decision Point:** Which approach do you want to pursue?
- [ ] Full multi-track (3-4 weeks, more features)
- [ ] Virtual participant approach (3-5 days, simpler)
- [ ] Hybrid (start simple, upgrade later)
