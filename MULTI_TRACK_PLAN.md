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
await audioTransceiver.sender.replaceTrack(audioTrack);
await cameraTransceiver.sender.replaceTrack(cameraTrack);
await screenTransceiver.sender.replaceTrack(screenTrack);
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

### Option 2: SIP/Verto with FreeSWITCH (Production Mode) ⭐ RECOMMENDED

#### **Reality Check**: FreeSWITCH Limitations

FreeSWITCH conference module has important limitations:
- ❌ Cannot reliably separate multiple video streams from same participant
- ❌ `mod_conference` doesn't track individual video stream ownership
- ❌ Verto doesn't manage multiple video m-lines reliably
- ❌ Unified Plan SDP support is incomplete for multi-video scenarios

#### **The Correct Approach: Separate SIP Calls (Like Zoom)**

**This is exactly what Zoom uses internally** - and it's the most stable, production-ready approach.

**Architecture:**
```
Participant A creates 2 separate SIP calls:
├── Call 1: Audio + Camera → conference:room-{id}-main
└── Call 2: Screen Share → conference:room-{id}-screen

FreeSWITCH manages 2 separate conferences:
├── Conference "main-room"
│   ├── UserA-Camera
│   ├── UserB-Camera
│   └── UserC-Camera
│
└── Conference "screen-room"
    ├── UserA-Screen (when sharing)
    └── UserB-Screen (when sharing)
```

**Frontend Rendering:**
```typescript
// Main view: Screen share (if anyone is sharing)
<MainView stream={screenRoomStream} />

// Picture-in-Picture: All camera feeds
<PiPGrid streams={mainRoomCameraStreams} />
```

#### **Implementation Approach:**

**When User Starts Screen Share:**
```typescript
// 1. Create second Verto session
const screenSession = await vertoService.createSession({
  destination: `conference:room-${meetingId}-screen`,
  displayName: `${userName}-screen`,
  videoOnly: true  // No audio on screen call
});

// 2. Add screen track
const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
screenSession.addTrack(screenStream.getVideoTracks()[0]);

// 3. Frontend subscribes to both conferences
subscribeToConference(`room-${meetingId}-main`);      // Cameras
subscribeToConference(`room-${meetingId}-screen`);    // Screens
```

**Conference Routing:**
```
SIP Destination Pattern:
- conference:room-{id}-main   → Audio + Camera
- conference:room-{id}-screen → Screen share only (no audio)
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

#### **Why Separate Calls > Unified Plan?**

| Aspect | Separate SIP Calls ✅ | Unified Plan ❌ |
|--------|---------------------|-----------------|
| **FreeSWITCH Support** | Native, stable | Incomplete, unreliable |
| **Stream Separation** | Clear ownership | Cannot distinguish tracks |
| **Conference Management** | 2 simple conferences | Complex single conference |
| **Debugging** | Easy (separate calls) | Hard (mixed streams) |
| **Scalability** | Proven at scale | Theoretical |
| **Production Stability** | Battle-tested (Zoom) | Experimental |
| **Verto Compatibility** | Full support | Partial, buggy |
| **Track Ownership** | Explicit (by call) | Implicit (unreliable) |

**Real-World Evidence:**
- ✅ Zoom uses separate calls for screen share
- ✅ Microsoft Teams uses similar approach
- ✅ Proven to scale to 100+ participants
- ✅ Simpler to implement and debug
- ✅ Works with FreeSWITCH 1.10 without patches

#### **Pros & Cons:**

**Pros:**
- ✅ Scales to 50+ participants (proven)
- ✅ Server handles routing efficiently
- ✅ 2 connections per participant (main + screen)
- ✅ Production-ready and stable
- ✅ Easy debugging (separate call logs)
- ✅ Clear stream ownership
- ✅ Works with existing FreeSWITCH
- ✅ Industry-standard approach (Zoom, Teams)

**Cons:**
- ⚠️ 2 SIP calls per participant (when sharing)
- ⚠️ Slightly more complex frontend logic
- ⚠️ Need to manage 2 conference subscriptions

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
      await audioTransceiver.sender.replaceTrack(this.localTracks.audio);
    }
    if (this.localTracks.camera) {
      await cameraTransceiver.sender.replaceTrack(this.localTracks.camera);
    }
    if (this.localTracks.screen) {
      await screenTransceiver.sender.replaceTrack(this.localTracks.screen);
    }
    
    // Handle incoming tracks
    pc.ontrack = (event) => {
      this.handleIncomingTrack(remoteId, event.track, event.transceiver);
    };
  }
  
  async setCameraTrack(track: MediaStreamTrack | null) {
    this.localTracks.camera = track;
    // Update all peer connections
    const promises = Array.from(this.peerConnections.values()).map(async (pc) => {
      const sender = this.getCameraTransceiver(pc.pc)?.sender;
      if (sender) {
        await sender.replaceTrack(track);
      }
    });
    await Promise.all(promises);
  }
  
  async setScreenTrack(track: MediaStreamTrack | null) {
    this.localTracks.screen = track;
    // Update all peer connections
    const promises = Array.from(this.peerConnections.values()).map(async (pc) => {
      const sender = this.getScreenTransceiver(pc.pc)?.sender;
      if (sender) {
        await sender.replaceTrack(track);
      }
    });
    await Promise.all(promises);
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

### Phase 2: SIP/Verto Separate Calls (5+ participants) ⭐ PRODUCTION APPROACH

#### **2.1 FreeSWITCH Configuration**

**File:** `infra/freeswitch/conf/autoload_configs/conference.conf.xml`

```xml
<!-- Two conference profiles: main (cameras) and screen (screen shares) -->
<profile name="video-main">
  <param name="video-mode" value="mux"/>
  <param name="video-layout-name" value="group:grid"/>
  <param name="video-fps" value="30"/>
  <param name="video-bandwidth" value="1mb"/>
</profile>

<profile name="video-screen">
  <param name="video-mode" value="mux"/>
  <param name="video-layout-name" value="presenter"/>
  <param name="video-fps" value="15"/>
  <param name="video-bandwidth" value="2mb"/>
  <!-- Higher bandwidth for screen share -->
</profile>
```

**⚠️ Important Note:**
- `video-canvas-count` does NOT provide true multi-track support
- It only enables multi-layer rendering, not stream separation
- Separate SIP calls are the ONLY way to achieve true multi-track with FreeSWITCH

**Dialplan Routing:**
```xml
<!-- Route to appropriate conference based on destination -->
<extension name="conference-main">
  <condition field="destination_number" expression="^conference:room-(.+)-main$">
    <action application="answer"/>
    <action application="conference" data="$1-main@video-main"/>
  </condition>
</extension>

<extension name="conference-screen">
  <condition field="destination_number" expression="^conference:room-(.+)-screen$">
    <action application="answer"/>
    <action application="conference" data="$1-screen@video-screen"/>
  </condition>
</extension>
```

#### **2.2 Backend SIP Handling**

**File:** `backend/src/sip/handlers/invite.ts`

```typescript
// Handle INVITE - route to appropriate conference
async function handleInvite(req: any, res: any) {
  const destination = req.uri.user; // e.g., "conference:room-abc123-main"
  
  // Parse destination to determine conference type
  const match = destination.match(/^conference:room-(.+)-(main|screen)$/);
  
  if (!match) {
    return res.send(404, 'Not Found');
  }
  
  const [, roomId, conferenceType] = match;
  
  // Validate room exists
  const meeting = await prisma.meeting.findUnique({ where: { id: roomId } });
  if (!meeting || meeting.status !== 'ACTIVE') {
    return res.send(404, 'Meeting not found');
  }
  
  // Route to FreeSWITCH conference
  await routeToConference(req, res, {
    roomId,
    conferenceType, // 'main' or 'screen'
    profile: conferenceType === 'main' ? 'video-main' : 'video-screen'
  });
}
```

#### **2.3 Verto Service Updates**

**File:** `web/src/services/vertoService.ts`

```typescript
class VertoService {
  private mainSession: VertoSession | null = null;
  private screenSession: VertoSession | null = null;
  
  // Join main conference (audio + camera)
  async joinMainConference(roomId: string, localStream: MediaStream) {
    this.mainSession = await this.createSession({
      destination: `conference:room-${roomId}-main`,
      localStream,
      onRemoteStream: (stream) => {
        this.callbacks.onMainRoomStream?.(stream);
      }
    });
  }
  
  // Start screen share (separate call)
  async startScreenShare(roomId: string, screenStream: MediaStream) {
    if (this.screenSession) {
      console.warn('Screen share already active');
      return;
    }
    
    this.screenSession = await this.createSession({
      destination: `conference:room-${roomId}-screen`,
      localStream: screenStream,
      videoOnly: true, // No audio on screen call
      onRemoteStream: (stream) => {
        this.callbacks.onScreenRoomStream?.(stream);
      }
    });
  }
  
  // Stop screen share
  async stopScreenShare() {
    if (this.screenSession) {
      await this.screenSession.hangup();
      this.screenSession = null;
    }
  }
  
  // Subscribe to screen room (to see others' screens)
  async subscribeToScreenRoom(roomId: string) {
    // Listen for screen shares from other participants
    // FreeSWITCH will send screen room stream
  }
}
```

#### **2.4 Meeting Component Updates**

**File:** `web/src/pages/Meeting.tsx`

```typescript
const Meeting = () => {
  const [mainRoomStream, setMainRoomStream] = useState<MediaStream | null>(null);
  const [screenRoomStream, setScreenRoomStream] = useState<MediaStream | null>(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  
  // Join main conference on mount
  useEffect(() => {
    const joinConference = async () => {
      const localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      
      await vertoService.joinMainConference(meetingId, localStream);
      await vertoService.subscribeToScreenRoom(meetingId);
    };
    
    joinConference();
  }, [meetingId]);
  
  // Toggle screen share
  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      await vertoService.stopScreenShare();
      setIsScreenSharing(false);
    } else {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ 
        video: true 
      });
      
      await vertoService.startScreenShare(meetingId, screenStream);
      setIsScreenSharing(true);
      
      // Handle when user stops via browser UI
      screenStream.getVideoTracks()[0].onended = () => {
        vertoService.stopScreenShare();
        setIsScreenSharing(false);
      };
    }
  };
  
  return (
    <div>
      {/* Main view: Screen share if available, otherwise cameras */}
      {screenRoomStream ? (
        <MainView stream={screenRoomStream} />
      ) : (
        <VideoGrid stream={mainRoomStream} />
      )}
      
      {/* Picture-in-Picture: Cameras when screen sharing */}
      {screenRoomStream && mainRoomStream && (
        <PiPView stream={mainRoomStream} />
      )}
    </div>
  );
};
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

## � Final Architecture Recommendation

### **The Correct Production Approach**

Based on real-world constraints and industry best practices:

```
Phase 1: WebRTC P2P Multi-Track (2-4 participants)
├── Use RTCRtpTransceiver for 3 independent tracks
├── Audio, Camera, Screen all sent simultaneously
└── Works great for small meetings

Phase 2: FreeSWITCH Separate Calls (5+ participants) ⭐ PRODUCTION
├── Main Call: Audio + Camera → conference:room-{id}-main
├── Screen Call: Screen Share → conference:room-{id}-screen
├── Frontend subscribes to both conferences
└── Render screen as main, cameras as PiP
```

### **Why This is the ONLY Realistic Option**

**FreeSWITCH Reality:**
- ❌ Cannot reliably separate multiple video streams from same participant
- ❌ `mod_conference` doesn't track individual video stream ownership
- ❌ Verto doesn't manage multiple video m-lines reliably
- ❌ Unified Plan SDP support is incomplete for multi-video

**Industry Validation:**
- ✅ **Zoom uses separate SIP calls for screen share**
- ✅ **Microsoft Teams uses similar approach**
- ✅ Proven to scale to 100+ participants
- ✅ Battle-tested in production
- ✅ Easier to debug and maintain

### **Implementation Path**

```
Week 1-2: WebRTC P2P Multi-Track
├── Update WebRTC service with transceivers
├── Update Meeting component for multi-stream
├── Add PiP support to VideoGrid
└── Test with 2-4 participants

Week 3-4: FreeSWITCH Separate Calls
├── Configure 2 conference profiles (main + screen)
├── Add dialplan routing for -main and -screen
├── Update Verto service for dual sessions
├── Update Meeting component for dual streams
└── Test with 5+ participants

Week 5: Polish & Production
├── Optimize bandwidth and quality
├── Add advanced layouts
├── Performance testing
└── Deploy to production
```

### **Next Steps**

1. **Start with Phase 1** (WebRTC P2P) for immediate multi-track support
2. **Implement Phase 2** (Separate Calls) for production scalability
3. **Do NOT attempt** Unified Plan with FreeSWITCH (will fail)
4. **Follow Zoom's approach** - it's proven and stable

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

---

## 🔧 Practical Implementation Recommendations

### A) Naming Convention (MUST FOLLOW)

```typescript
// Main conference (audio + camera)
const mainDestination = `conference:room-${meetingId}-main`;

// Screen conference (screen share only)
const screenDestination = `conference:room-${meetingId}-screen`;
```

**Why this pattern:**
- Clear separation of concerns
- Easy to parse in backend
- Consistent with industry standards
- Simple regex matching in dialplan

### B) Disable Audio on Screen Call (CRITICAL)

```typescript
// When creating screen share session
const screenSession = await vertoService.createSession({
  destination: `conference:room-${meetingId}-screen`,
  localStream: screenStream,
  videoOnly: true,  // ⚠️ CRITICAL: No audio on screen call
  displayName: `${userName}-screen`
});
```

**Why videoOnly is critical:**
- Prevents audio echo/feedback
- Reduces bandwidth usage
- Cleaner audio mixing in main conference
- Follows Zoom/Teams pattern

### C) Always Join Screen Room (Even If Empty)

```typescript
// Join both conferences immediately
useEffect(() => {
  const init = async () => {
    // 1. Join main conference
    await vertoService.joinMainConference(meetingId, localStream);
    
    // 2. Subscribe to screen room (even if no one is sharing yet)
    await vertoService.subscribeToScreenRoom(meetingId);
  };
  
  init();
}, [meetingId]);
```

**Why subscribe to empty screen room:**
- ✅ Instant notification when anyone starts sharing
- ✅ No delay in receiving screen stream
- ✅ Simpler state management
- ✅ Better UX (immediate screen share display)

### D) Browser Compatibility - Always Await replaceTrack()

```typescript
// ❌ WRONG - Race condition in Safari/Firefox
sender.replaceTrack(newTrack);

// ✅ CORRECT - Safe across all browsers
await sender.replaceTrack(newTrack);

// ✅ CORRECT - For multiple peer connections
const promises = peerConnections.map(async (pc) => {
  const sender = pc.getSenders().find(s => s.track?.kind === 'video');
  if (sender) {
    await sender.replaceTrack(newTrack);
  }
});
await Promise.all(promises);
```

**Why await is critical:**
- Safari has race conditions without await
- Firefox can drop tracks if not awaited
- Chrome works either way but await is safer
- Prevents "track not found" errors

### E) Error Handling for Screen Share

```typescript
const toggleScreenShare = async () => {
  try {
    if (isScreenSharing) {
      await vertoService.stopScreenShare();
      setIsScreenSharing(false);
    } else {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ 
        video: true 
      });
      
      // Handle user canceling via browser UI
      screenStream.getVideoTracks()[0].onended = () => {
        console.log('Screen share stopped by user');
        vertoService.stopScreenShare();
        setIsScreenSharing(false);
      };
      
      await vertoService.startScreenShare(meetingId, screenStream);
      setIsScreenSharing(true);
    }
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      console.log('User denied screen share permission');
    } else if (err.name === 'NotFoundError') {
      console.log('No screen share source available');
    } else {
      console.error('Screen share error:', err);
    }
    setIsScreenSharing(false);
  }
};
```

### F) Bandwidth Optimization

```typescript
// Configure different quality for camera vs screen
const cameraConstraints = {
  video: {
    width: { ideal: 640 },
    height: { ideal: 480 },
    frameRate: { ideal: 30 }
  }
};

const screenConstraints = {
  video: {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 15 }  // Lower FPS for screen share
  }
};
```

**Rationale:**
- Screen share needs higher resolution but lower FPS
- Camera needs lower resolution but higher FPS (smoother)
- Saves bandwidth while maintaining quality

---

## ⚠️ Common Pitfalls to Avoid

### 1. Don't Use `video-canvas-count` for Multi-Track
```xml
<!-- ❌ WRONG - This doesn't give you multi-track -->
<param name="video-canvas-count" value="2"/>

<!-- This only enables multi-layer rendering, NOT stream separation -->
```

### 2. Don't Forget to Await replaceTrack()
```typescript
// ❌ WRONG - Race condition
sender.replaceTrack(track);

// ✅ CORRECT
await sender.replaceTrack(track);
```

### 3. Don't Send Audio on Screen Call
```typescript
// ❌ WRONG - Creates echo
const screenStream = await getDisplayMedia({ video: true, audio: true });

// ✅ CORRECT - Video only
const screenStream = await getDisplayMedia({ video: true });
```

### 4. Don't Create Screen Session Before Needed
```typescript
// ❌ WRONG - Wastes resources
await vertoService.createScreenSession();  // Before user clicks share

// ✅ CORRECT - Create only when sharing
if (userClickedShare) {
  await vertoService.startScreenShare();
}
```

### 5. Don't Forget onended Handler
```typescript
// ❌ WRONG - Screen share state gets stuck
const track = screenStream.getVideoTracks()[0];

// ✅ CORRECT - Handle user stopping via browser
track.onended = () => {
  stopScreenShare();
  setIsScreenSharing(false);
};
```

---

## 📝 Summary: Production Checklist

Before deploying to production, verify:

- [ ] Using separate SIP calls for screen share (NOT Unified Plan)
- [ ] Naming: `room-{id}-main` and `room-{id}-screen`
- [ ] Screen call has `videoOnly: true`
- [ ] Always subscribing to screen room (even if empty)
- [ ] All `replaceTrack()` calls are awaited
- [ ] Screen track has `onended` handler
- [ ] Error handling for permission denied
- [ ] Bandwidth optimization (different constraints for camera/screen)
- [ ] NOT using `video-canvas-count` for multi-track
- [ ] Tested on Chrome, Firefox, Safari, Edge

---

## 🔬 Final Production Polish (Engineering Best Practices)

### 1. Use MID-Based Transceiver Binding (P2P)

**Problem:** Browser can reorder transceivers, breaking track identification by index.

**Solution:** Bind transceivers to MID (Media Stream ID) instead of relying on order.

```typescript
// ❌ WRONG - Relying on order
const transceivers = pc.getTransceivers();
const cameraTransceiver = transceivers[1];  // Fragile!

// ✅ CORRECT - Use MID
const AUDIO_MID = '0';
const CAMERA_MID = '1';
const SCREEN_MID = '2';

class WebRTCService {
  private transceiverMap = new Map<string, string>();  // MID -> type
  
  async createPeerConnection(remoteId: string) {
    const pc = new RTCPeerConnection(config);
    
    // Add transceivers and store MID mapping
    const audioTransceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
    const cameraTransceiver = pc.addTransceiver('video', { direction: 'sendrecv' });
    const screenTransceiver = pc.addTransceiver('video', { direction: 'sendrecv' });
    
    // After negotiation, MIDs are assigned
    pc.addEventListener('negotiationneeded', () => {
      this.transceiverMap.set(audioTransceiver.mid!, 'audio');
      this.transceiverMap.set(cameraTransceiver.mid!, 'camera');
      this.transceiverMap.set(screenTransceiver.mid!, 'screen');
    });
    
    // Handle incoming tracks using MID
    pc.ontrack = (event) => {
      const trackType = this.transceiverMap.get(event.transceiver.mid!);
      
      if (trackType === 'camera') {
        this.handleCameraTrack(remoteId, event.track);
      } else if (trackType === 'screen') {
        this.handleScreenTrack(remoteId, event.track);
      }
    };
  }
}
```

**Why this matters:**
- ✅ Protects against browser reordering
- ✅ More reliable than index-based lookup
- ✅ Works consistently across Chrome/Firefox/Safari

### 2. Don't Rely on `track.label` Alone

**Problem:** Safari sometimes changes `track.label` unpredictably.

**Solution:** Use `transceiver.mid` as primary identifier, `track.label` as fallback.

```typescript
// ❌ WRONG - Only using track.label
pc.ontrack = (event) => {
  if (event.track.label === 'camera') {  // Unreliable in Safari
    handleCameraTrack(event.track);
  }
};

// ✅ CORRECT - Use MID first, label as fallback
pc.ontrack = (event) => {
  const trackType = this.getTrackType(event.transceiver.mid, event.track.label);
  
  switch (trackType) {
    case 'camera':
      handleCameraTrack(event.track);
      break;
    case 'screen':
      handleScreenTrack(event.track);
      break;
  }
};

private getTrackType(mid: string | null, label: string): string {
  // Primary: Use MID mapping
  if (mid && this.transceiverMap.has(mid)) {
    return this.transceiverMap.get(mid)!;
  }
  
  // Fallback: Use label (less reliable)
  if (label.includes('camera')) return 'camera';
  if (label.includes('screen')) return 'screen';
  
  return 'unknown';
}
```

### 3. Add Jitter Buffer for Screen Share (FreeSWITCH)

**Problem:** Screen share can have tearing/stuttering due to network jitter.

**Solution:** Configure RTP jitter buffer in FreeSWITCH screen profile.

```xml
<!-- conference.conf.xml -->
<profile name="video-screen">
  <param name="video-mode" value="mux"/>
  <param name="video-layout-name" value="presenter"/>
  <param name="video-fps" value="15"/>
  <param name="video-bandwidth" value="2mb"/>
  
  <!-- Add jitter buffer to reduce tearing -->
  <param name="video-rtp-jitter-msec" value="50"/>
</profile>
```

**Why 50ms:**
- Balances latency vs. smoothness
- Reduces visual tearing on screen share
- Acceptable delay for screen content (not real-time video)

### 4. Limit Screen Share Bitrate to 2mb

**Problem:** Higher bitrate wastes bandwidth without quality improvement.

**Solution:** Cap screen share at 2mb (sufficient for 1080p@15fps).

```typescript
// ❌ WRONG - Too high
const screenConstraints = {
  video: {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 15 }
    // No bitrate limit - can go to 5mb+
  }
};

// ✅ CORRECT - Capped at 2mb
const screenStream = await navigator.mediaDevices.getDisplayMedia({
  video: {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 15 }
  }
});

// Apply bitrate constraint via sender
const sender = pc.getSenders().find(s => s.track?.kind === 'video');
if (sender) {
  const params = sender.getParameters();
  if (!params.encodings) params.encodings = [{}];
  params.encodings[0].maxBitrate = 2000000;  // 2mb
  await sender.setParameters(params);
}
```

**Why 2mb is enough:**
- 1080p@15fps requires ~1.5-2mb for good quality
- Text remains readable
- Lower bandwidth usage
- Faster for participants with slow connections

### 5. Prevent Multiple Simultaneous Screen Shares (Backend)

**Problem:** Multiple users sharing screen simultaneously causes confusion.

**Solution:** Backend enforces single screen share (like Zoom).

```typescript
// backend/src/sip/handlers/invite.ts

interface ScreenShareState {
  roomId: string;
  participantId: string;
  startedAt: Date;
}

const activeScreenShares = new Map<string, ScreenShareState>();

async function handleScreenShareInvite(req: any, res: any, roomId: string) {
  const participantId = req.get('X-Participant-ID');
  
  // Check if someone is already sharing
  const existingShare = activeScreenShares.get(roomId);
  
  if (existingShare && existingShare.participantId !== participantId) {
    // Someone else is already sharing
    return res.send(409, {
      error: 'Screen share in progress',
      message: 'Another participant is currently sharing their screen',
      activeSharer: existingShare.participantId
    });
  }
  
  // Allow this screen share
  activeScreenShares.set(roomId, {
    roomId,
    participantId,
    startedAt: new Date()
  });
  
  // Route to screen conference
  await routeToConference(req, res, {
    roomId,
    conferenceType: 'screen',
    profile: 'video-screen'
  });
}

// Cleanup when screen share ends
async function handleScreenShareBye(roomId: string, participantId: string) {
  const existingShare = activeScreenShares.get(roomId);
  
  if (existingShare?.participantId === participantId) {
    activeScreenShares.delete(roomId);
  }
}
```

**Benefits:**
- ✅ Prevents confusion from multiple screens
- ✅ Clear UX (one screen at a time)
- ✅ Follows Zoom/Teams pattern
- ✅ Reduces bandwidth usage

### 6. Handle Concurrent Screen Share Attempts (Frontend)

**Problem:** Two users click "Share Screen" at the same time.

**Solution:** UI shows clear feedback and chooses newest share.

```typescript
// web/src/pages/Meeting.tsx

const [screenShareState, setScreenShareState] = useState<{
  isSharing: boolean;
  activeSharer: string | null;
  sharerName: string | null;
}>({
  isSharing: false,
  activeSharer: null,
  sharerName: null
});

const toggleScreenShare = async () => {
  if (screenShareState.isSharing) {
    // Stop my screen share
    await vertoService.stopScreenShare();
    setScreenShareState({ isSharing: false, activeSharer: null, sharerName: null });
  } else {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ 
        video: true 
      });
      
      // Attempt to start screen share
      const result = await vertoService.startScreenShare(meetingId, screenStream);
      
      if (result.success) {
        setScreenShareState({ 
          isSharing: true, 
          activeSharer: participantId,
          sharerName: displayName 
        });
      } else if (result.error === 'SCREEN_SHARE_IN_PROGRESS') {
        // Someone else is already sharing
        showNotification({
          type: 'warning',
          message: `${result.activeSharerName} is currently sharing their screen`,
          action: 'Take over',
          onAction: async () => {
            // Force take over (newest wins)
            await vertoService.forceStartScreenShare(meetingId, screenStream);
            setScreenShareState({ 
              isSharing: true, 
              activeSharer: participantId,
              sharerName: displayName 
            });
          }
        });
        
        // Stop the stream we just created
        screenStream.getTracks().forEach(track => track.stop());
      }
    } catch (err) {
      console.error('Screen share error:', err);
    }
  }
};

// Listen for screen share events from other participants
useEffect(() => {
  const handleScreenShareStarted = (data: { participantId: string; displayName: string }) => {
    if (data.participantId !== participantId) {
      // Someone else started sharing
      setScreenShareState({
        isSharing: false,
        activeSharer: data.participantId,
        sharerName: data.displayName
      });
      
      // If I was sharing, stop my share
      if (screenShareState.isSharing) {
        vertoService.stopScreenShare();
        showNotification({
          type: 'info',
          message: `${data.displayName} started sharing their screen`
        });
      }
    }
  };
  
  const handleScreenShareStopped = (data: { participantId: string }) => {
    if (data.participantId === screenShareState.activeSharer) {
      setScreenShareState({
        isSharing: false,
        activeSharer: null,
        sharerName: null
      });
    }
  };
  
  vertoService.on('screen-share-started', handleScreenShareStarted);
  vertoService.on('screen-share-stopped', handleScreenShareStopped);
  
  return () => {
    vertoService.off('screen-share-started', handleScreenShareStarted);
    vertoService.off('screen-share-stopped', handleScreenShareStopped);
  };
}, [screenShareState, participantId]);
```

**UI Feedback:**
```typescript
// Show who is currently sharing
{screenShareState.activeSharer && !screenShareState.isSharing && (
  <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-2 rounded">
    📺 {screenShareState.sharerName} is sharing their screen
  </div>
)}

// Screen share button state
<button
  onClick={toggleScreenShare}
  disabled={screenShareState.activeSharer && !screenShareState.isSharing}
  className={`p-3 rounded-full ${
    screenShareState.isSharing 
      ? 'bg-green-600' 
      : screenShareState.activeSharer 
        ? 'bg-gray-400 cursor-not-allowed'
        : 'bg-gray-600'
  } text-white`}
  title={
    screenShareState.isSharing 
      ? 'Stop sharing' 
      : screenShareState.activeSharer 
        ? `${screenShareState.sharerName} is sharing`
        : 'Share screen'
  }
>
  <Monitor size={20} />
</button>
```

**Conflict Resolution Strategy:**
- If two users start sharing within same second → newest wins
- Backend timestamps each share attempt
- Frontend shows clear notification
- Option to "take over" (optional, can be disabled)

---

## 📊 Production Readiness Summary

With these 6 final polish items, your multi-track implementation is:

| Aspect | Status | Notes |
|--------|--------|-------|
| **Track Identification** | ✅ Production-ready | MID-based, browser-safe |
| **Screen Share Quality** | ✅ Optimized | 2mb cap, jitter buffer |
| **Concurrency Control** | ✅ Handled | Single share enforcement |
| **Browser Compatibility** | ✅ Cross-browser | Safari/Firefox safe |
| **UX Clarity** | ✅ Clear | Visual feedback, conflict resolution |
| **Bandwidth Efficiency** | ✅ Optimized | Capped bitrates, smart constraints |

---

**See Also:** `ADR-001-MULTI-TRACK.md` for the formal architecture decision record.
