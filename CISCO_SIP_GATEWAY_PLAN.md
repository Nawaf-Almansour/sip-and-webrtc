# Cisco SIP Gateway Integration Plan

## Overview

Integrate Cisco SIP endpoints (phones, soft clients, MCU) with your WebRTC/FreeSWITCH system using FreeSWITCH as a SIP gateway bridge.

```
┌─────────────────────────────────────────────────────────────────┐
│                    CISCO SIP GATEWAY ARCHITECTURE               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  CISCO ENDPOINTS          FREESWITCH SIP GATEWAY    WEBRTC      │
│  ┌──────────────┐         ┌──────────────────┐    ┌──────────┐ │
│  │ Cisco Phone  │         │                  │    │ Browser  │ │
│  │ (SIP)        │◄───────►│ FreeSWITCH       │◄──►│ WebRTC   │ │
│  └──────────────┘         │ SIP B2BUA        │    └──────────┘ │
│                           │                  │                  │
│  ┌──────────────┐         │ ┌──────────────┐ │    ┌──────────┐ │
│  │ Cisco MCU    │         │ │ SIP Gateway  │ │    │ Mobile   │ │
│  │ (SIP)        │◄───────►│ │ Config       │ │◄──►│ App      │ │
│  └──────────────┘         │ └──────────────┘ │    └──────────┘ │
│                           │                  │                  │
│  ┌──────────────┐         │ ┌──────────────┐ │    ┌──────────┐ │
│  │ Cisco Soft   │         │ │ Screen Share │ │    │ Desktop  │ │
│  │ Client       │◄───────►│ │ Handler      │ │◄──►│ App      │ │
│  └──────────────┘         │ └──────────────┘ │    └──────────┘ │
│                           │                  │                  │
│                           └──────────────────┘                  │
│                                   │                             │
│                                   ▼                             │
│                           ┌──────────────────┐                 │
│                           │  FreeSWITCH MCU  │                 │
│                           │  (Media Mixing)  │                 │
│                           └──────────────────┘                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: FreeSWITCH SIP Gateway Configuration

### 1.1 SIP Gateway Setup

**File**: `freeswitch/conf/sip_profiles/external/cisco.xml`

```xml
<profile name="cisco">
  <settings>
    <!-- Cisco SIP Server Settings -->
    <param name="sip-ip" value="0.0.0.0"/>
    <param name="sip-port" value="5060"/>
    <param name="sip-transport" value="udp,tcp"/>
    <param name="rtp-ip" value="0.0.0.0"/>
    <param name="rtp-port" value="16384"/>
    <param name="rtp-range-start" value="16384"/>
    <param name="rtp-range-stop" value="32768"/>
    
    <!-- Cisco Codec Support -->
    <param name="inbound-codec-prefs" value="PCMU,PCMA,G729,G722,OPUS"/>
    <param name="outbound-codec-prefs" value="OPUS,G722,PCMU"/>
    
    <!-- NAT Handling -->
    <param name="rtp-timeout-sec" value="300"/>
    <param name="rtp-hold-timeout-sec" value="1800"/>
    
    <!-- Cisco Specific -->
    <param name="enable-100rel" value="true"/>
    <param name="enable-timer" value="true"/>
    <param name="session-timeout" value="1800"/>
  </settings>
</profile>
```

### 1.2 Cisco Endpoint Registration

**File**: `freeswitch/conf/directory/cisco.xml`

```xml
<domain name="cisco.local">
  <user id="cisco-phone-001">
    <params>
      <param name="password" value="cisco-password-001"/>
      <param name="vm-password" value="1234"/>
    </params>
    <variables>
      <variable name="user_context" value="default"/>
      <variable name="endpoint_type" value="cisco_phone"/>
      <variable name="device_model" value="IP Phone 8841"/>
    </variables>
  </user>
  
  <user id="cisco-mcu-001">
    <params>
      <param name="password" value="cisco-mcu-password"/>
    </params>
    <variables>
      <variable name="user_context" value="default"/>
      <variable name="endpoint_type" value="cisco_mcu"/>
      <variable name="device_model" value="Cisco MCU 5.3"/>
    </variables>
  </user>
</domain>
```

### 1.3 Dialplan for Cisco Routing

**File**: `freeswitch/conf/dialplan/cisco.xml`

```xml
<context name="cisco">
  <!-- Route Cisco calls to meeting rooms -->
  <extension name="cisco-to-meeting">
    <condition field="destination_number" expression="^(\d+)$">
      <action application="set" data="meeting_id=$1"/>
      <action application="set" data="endpoint_type=cisco"/>
      <action application="bridge" data="verto/default/room-${meeting_id}"/>
    </condition>
  </extension>
  
  <!-- Screen share handling -->
  <extension name="cisco-screen-share">
    <condition field="destination_number" expression="^screen-(\d+)$">
      <action application="set" data="meeting_id=$1"/>
      <action application="set" data="screen_share=true"/>
      <action application="bridge" data="verto/default/room-${meeting_id}-screen"/>
    </condition>
  </extension>
</context>
```

---

## Phase 2: Participant Mapping

### 2.1 Cisco Participant Structure

```typescript
interface CiscoParticipant {
  // SIP identifiers
  sipUri: string;              // sip:user@cisco.local
  sipCallId: string;           // SIP Call-ID
  
  // Participant identifiers
  participantId: string;       // UUID for internal use
  displayName: string;         // Cisco phone display name
  
  // Endpoint info
  endpointType: 'phone' | 'mcu' | 'soft_client';
  deviceModel: string;         // IP Phone 8841, etc.
  
  // Connection info
  connectionMode: 'p2p' | 'mcu';
  isScreenSharing: boolean;
  screenShareCallId?: string;  // Separate SIP call for screen
  
  // Codec info
  audioCodec: string;          // OPUS, G729, etc.
  videoCodec: string;          // VP8, H264, etc.
  
  // Metadata
  joinedAt: number;
  lastActivity: number;
}
```

### 2.2 Backend Mapping Service

**File**: `backend/src/services/ciscoParticipantMapper.ts`

```typescript
import { ParticipantIdMapRef } from './types';

export class CiscoParticipantMapper {
  private sipToParticipantMap = new Map<string, string>();  // SIP URI -> participantId
  private participantToSipMap = new Map<string, string>();  // participantId -> SIP URI
  
  mapCiscoParticipant(sipUri: string, participantId: string): void {
    this.sipToParticipantMap.set(sipUri, participantId);
    this.participantToSipMap.set(participantId, sipUri);
  }
  
  getParticipantIdFromSip(sipUri: string): string | undefined {
    return this.sipToParticipantMap.get(sipUri);
  }
  
  getSipFromParticipantId(participantId: string): string | undefined {
    return this.participantToSipMap.get(participantId);
  }
  
  removeCiscoParticipant(sipUri: string): void {
    const participantId = this.sipToParticipantMap.get(sipUri);
    if (participantId) {
      this.sipToParticipantMap.delete(sipUri);
      this.participantToSipMap.delete(participantId);
    }
  }
}
```

---

## Phase 3: Screen Share Handling

### 3.1 Cisco Screen Share Flow

```
Cisco Phone User Initiates Screen Share
        ↓
Cisco Phone sends SIP INVITE to screen conference
        ↓
FreeSWITCH routes to room-{id}-screen
        ↓
MCU receives screen stream
        ↓
MCU sends mixed screen to all participants
        ↓
WebRTC clients receive screen via remoteScreenStreams
        ↓
VideoGrid displays in Picture-in-Picture
```

### 3.2 Screen Share Configuration

**File**: `backend/src/services/ciscoScreenShareHandler.ts`

```typescript
export class CiscoScreenShareHandler {
  async handleScreenShareStart(
    participantId: string,
    meetingId: string,
    sipUri: string
  ): Promise<void> {
    // Create separate SIP call for screen
    const screenCallId = `screen-${participantId}-${Date.now()}`;
    
    // Send SIP INVITE to screen conference
    await this.sendScreenShareInvite(
      sipUri,
      `sip:room-${meetingId}-screen@freeswitch.local`,
      screenCallId
    );
    
    // Store screen call mapping
    this.screenCallMap.set(participantId, screenCallId);
  }
  
  async handleScreenShareStop(
    participantId: string,
    meetingId: string
  ): Promise<void> {
    const screenCallId = this.screenCallMap.get(participantId);
    if (screenCallId) {
      // Send SIP BYE to end screen call
      await this.sendScreenShareBye(screenCallId);
      this.screenCallMap.delete(participantId);
    }
  }
}
```

---

## Phase 4: Backend Integration

### 4.1 Meeting.tsx Updates

```typescript
// Add Cisco endpoint detection
const isCiscoEndpoint = (participant: Participant) => {
  return participant.endpointType === 'cisco_phone' || 
         participant.endpointType === 'cisco_mcu';
};

// Handle Cisco-specific stream routing
const handleCiscoStream = (
  participantId: string,
  stream: MediaStream,
  trackType: 'camera' | 'screen'
) => {
  // Map Cisco SIP participant to internal ID
  const internalId = ciscoMapper.getParticipantIdFromSip(participantId);
  
  if (trackType === 'screen') {
    setRemoteScreenStreams(prev => 
      new Map(prev).set(internalId, stream)
    );
  } else {
    setRemoteCameraStreams(prev => 
      new Map(prev).set(internalId, stream)
    );
  }
};
```

### 4.2 Verto Callback Updates

```typescript
// In VertoService initialization
const vertoCallbacks = {
  onRemoteStream: (participantId: string, stream: MediaStream) => {
    // Check if Cisco participant
    const ciscoParticipant = ciscoMapper.getParticipantIdFromSip(participantId);
    if (ciscoParticipant) {
      // Handle as Cisco endpoint
      handleCiscoStream(ciscoParticipant, stream, 'camera');
    } else {
      // Handle as WebRTC endpoint
      handleWebRTCStream(participantId, stream);
    }
  },
  
  onScreenShareStart: (participantId: string) => {
    const ciscoParticipant = ciscoMapper.getParticipantIdFromSip(participantId);
    ciscoScreenShareHandler.handleScreenShareStart(
      ciscoParticipant,
      meetingId,
      participantId
    );
  }
};
```

---

## Phase 5: Docker Configuration

### 5.1 FreeSWITCH Cisco Gateway Setup

**File**: `docker-compose.prod.yml` (Update freeswitch service)

```yaml
freeswitch:
  image: safarov/freeswitch:latest
  ports:
    - "5060:5060/udp"
    - "5060:5060/tcp"
    - "5061:5061/tcp"
    - "16384-32768:16384-32768/udp"
  environment:
    - FREESWITCH_DOMAIN=freeswitch.local
    - CISCO_GATEWAY_ENABLED=true
    - CISCO_SIP_PORT=5060
  volumes:
    - ./freeswitch/conf/sip_profiles/external/cisco.xml:/etc/freeswitch/conf/sip_profiles/external/cisco.xml
    - ./freeswitch/conf/directory/cisco.xml:/etc/freeswitch/conf/directory/cisco.xml
    - ./freeswitch/conf/dialplan/cisco.xml:/etc/freeswitch/conf/dialplan/cisco.xml
  networks:
    - sip-network
```

---

## Phase 6: Testing Plan

### 6.1 Unit Tests

```typescript
describe('CiscoParticipantMapper', () => {
  it('should map Cisco SIP URI to participant ID', () => {
    const mapper = new CiscoParticipantMapper();
    mapper.mapCiscoParticipant('sip:phone001@cisco.local', 'participant-123');
    
    expect(mapper.getParticipantIdFromSip('sip:phone001@cisco.local'))
      .toBe('participant-123');
  });
  
  it('should handle screen share call mapping', async () => {
    const handler = new CiscoScreenShareHandler();
    await handler.handleScreenShareStart(
      'participant-123',
      'meeting-456',
      'sip:phone001@cisco.local'
    );
    
    expect(handler.isScreenSharing('participant-123')).toBe(true);
  });
});
```

### 6.2 Integration Tests

1. **Cisco Phone Registration**
   - Phone registers with FreeSWITCH
   - Verify SIP registration successful
   - Check participant appears in meeting

2. **Cisco Phone Call**
   - Phone dials meeting room
   - Verify audio/video streams received
   - Check participant visible in VideoGrid

3. **Screen Share from Cisco**
   - Phone initiates screen share
   - Verify separate SIP call created
   - Check screen stream routed to MCU
   - Verify WebRTC clients receive screen

4. **Mixed Participants**
   - WebRTC client joins
   - Cisco phone joins
   - Both can see each other
   - Screen share works from both sides

---

## Phase 7: Deployment Checklist

- [ ] FreeSWITCH SIP gateway configured
- [ ] Cisco endpoint credentials set up
- [ ] Dialplan routes configured
- [ ] Participant mapper implemented
- [ ] Screen share handler implemented
- [ ] Backend integration complete
- [ ] Unit tests passing
- [ ] Integration tests passing
- [ ] Cisco phone registration verified
- [ ] Audio/video streams working
- [ ] Screen share working
- [ ] Documentation updated

---

## Rollback Plan

If issues occur:

1. **Disable Cisco Gateway**: Set `CISCO_GATEWAY_ENABLED=false`
2. **Revert FreeSWITCH Config**: Remove cisco.xml files
3. **Revert Backend Code**: Remove CiscoParticipantMapper
4. **Restart Services**: Restart FreeSWITCH and backend
5. **Verify**: Test WebRTC-only mode works

---

## Success Criteria

✅ Cisco phones can join meetings
✅ Audio/video streams work correctly
✅ Screen sharing from Cisco works
✅ WebRTC and Cisco participants can interact
✅ No impact on existing WebRTC functionality
✅ Proper error handling for Cisco-specific issues
✅ Performance metrics maintained

---

## Timeline Estimate

- Phase 1 (FreeSWITCH Config): 2-3 days
- Phase 2 (Participant Mapping): 1-2 days
- Phase 3 (Screen Share): 2-3 days
- Phase 4 (Backend Integration): 2-3 days
- Phase 5 (Docker Setup): 1 day
- Phase 6 (Testing): 2-3 days
- Phase 7 (Deployment): 1 day

**Total**: 11-16 days

