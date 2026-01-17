# SIP & WebRTC Video Meetings Platform

نظام اجتماعات فيديو متقدم مع دعم Multi-Track (Camera + Screen Share) باستخدام WebRTC و SIP/FreeSWITCH.

## ✨ Features

### Core Features
- 🎥 **1:1 Video Calls** - Direct peer-to-peer calls
- 👥 **Meeting Rooms** - Multi-participant conferences
- 🔄 **Dual Connection Modes** - WebRTC P2P or SIP/Verto (FreeSWITCH)
- 💬 **Real-time Chat** - In-meeting messaging
- 🎛️ **Host Controls** - Mute, kick, waiting room management
- 📊 **Connection Quality** - Real-time quality monitoring

### Multi-Track System (Phase 1 & 2) ✅
- 📹 **Simultaneous Camera + Screen Share** - Both streams active at once
- 🖼️ **Picture-in-Picture Layout** - Camera in PiP when sharing screen
- 🎯 **MID-Based Track Identification** - Reliable across all browsers
- 🔀 **Dual Architecture**:
  - **WebRTC P2P** (2-4 participants): Multiple transceivers per connection
  - **FreeSWITCH SFU** (5+ participants): Separate SIP calls (Zoom approach)
- 📺 **Screen Share Indicator** - Visual feedback for active shares
- 🛡️ **Error Handling** - Permission denied, browser UI stop, network issues

### Layout Options
- 📐 **Grid Layout** - Equal tiles for all participants
- 🎤 **Speaker Layout** - Large active speaker with thumbnails
- 📌 **Sidebar Layout** - Main view with participant sidebar
- 🔊 **Active Speaker Detection** - Automatic speaker highlighting

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + TailwindCSS + Lucide Icons
- **Backend**: Node.js 20 + Express + Prisma ORM
- **Media**: FreeSWITCH 1.10 (Verto protocol)
- **Signaling**: WebSocket (WebRTC P2P) + Verto (SIP/FreeSWITCH)
- **TURN/STUN**: coturn 4.6
- **Database**: PostgreSQL 16
- **Reverse Proxy**: nginx (SSL termination)

## Quick Start

```bash
# 1. Copy environment file
cp .env.example .env

# 2. Start infrastructure
docker compose up -d

# 3. Install backend dependencies
cd backend && npm install

# 4. Run database migrations
npx prisma migrate dev

# 5. Start backend
npm run dev

# 6. Install frontend dependencies
cd ../web && npm install

# 7. Start frontend
npm run dev
```

## Project Structure

```
/infra                    # Infrastructure configurations
  /freeswitch/conf        # FreeSWITCH conference profiles & dialplan
  /coturn                 # TURN/STUN server config
  /certs                  # SSL certificates
/backend                  # Node.js backend
  /src/api                # REST API routes
  /src/websocket          # WebRTC P2P signaling
  /prisma                 # Database schema & migrations
/web                      # React frontend
  /src/pages              # Meeting, Home, JoinMeeting
  /src/components         # VideoGrid, MeetingQuality
  /src/services           # webrtc, verto, mediaService
  /src/hooks              # useSpeakerDetection
/docs                     # Documentation
  IMPLEMENTATION_PHASES.md  # Phase-by-phase implementation guide
  MULTI_TRACK_PLAN.md       # Technical architecture details
  ADR-001-MULTI-TRACK.md    # Architecture decision record
  PHASE1_TESTING.md         # WebRTC P2P testing checklist
  PHASE2_TESTING.md         # FreeSWITCH SFU testing checklist
  TESTING.md                # End-to-end testing guide
```

## Multi-Track Architecture

### WebRTC P2P Mode (2-4 participants)

**Approach:** Multiple transceivers per peer connection

```typescript
// 3 transceivers per connection
- Audio transceiver (sendrecv)
- Camera transceiver (sendrecv)  
- Screen transceiver (sendrecv)

// MID-based track identification
transceiverMap.set(audioTransceiver.mid!, 'audio');
transceiverMap.set(cameraTransceiver.mid!, 'camera');
transceiverMap.set(screenTransceiver.mid!, 'screen');
```

**Features:**
- Camera and screen share simultaneously
- Picture-in-Picture layout
- Safari/Firefox compatible (await replaceTrack)
- Fallback to label-based identification

### FreeSWITCH SFU Mode (5+ participants)

**Approach:** Separate SIP calls (Zoom approach)

```
Participant creates 2 calls:
├── Call 1: room-{id}-main   → video-main profile (camera)
└── Call 2: room-{id}-screen → video-screen profile (screen)

FreeSWITCH manages 2 conferences:
├── Conference "room-{id}-main"   (1280x720@30fps, 1mb)
└── Conference "room-{id}-screen" (1920x1080@15fps, 2mb, jitter 50ms)
```

**Features:**
- Scales to 50+ participants
- Separate conferences for main and screen
- No audio on screen call (prevents echo)
- Jitter buffer for smooth screen share
- Optimized bandwidth per stream type

## API Endpoints

### Meetings

- `POST /api/meetings` - Create new meeting
- `POST /api/meetings/:id/join` - Join meeting (returns participantId)
- `POST /api/meetings/:id/leave` - Leave meeting
- `GET /api/meetings/:id/participants` - Get active participants
- `PATCH /api/meetings/:id/participants/:participantId/status` - Update mute/video status
- `GET /api/meetings/:id/waiting-room` - Get waiting participants (host only)
- `POST /api/meetings/:id/end` - End meeting (host only)

### Calls (1:1)

- `POST /api/calls` - Create new call
- `POST /api/calls/:id/join` - Join call
- `POST /api/calls/:id/end` - End call
- `GET /api/calls/:id` - Get call status

## Testing

### Phase 1: WebRTC P2P Multi-Track

See `PHASE1_TESTING.md` for comprehensive checklist.

**Quick Test:**
```bash
# Start backend
cd backend && npm run dev

# Open 2-4 browser windows
# Create meeting, select "WebRTC P2P" mode
# Test screen share with camera active
```

**Expected:**
- ✅ Camera and screen share simultaneously
- ✅ PiP displays correctly
- ✅ Works on Chrome, Firefox, Edge, Safari

### Phase 2: FreeSWITCH SFU Multi-Track

See `PHASE2_TESTING.md` for comprehensive checklist.

**Quick Test:**
```bash
# Restart FreeSWITCH to load new config
docker-compose restart freeswitch

# Verify configuration
fs_cli -x "conference list"
fs_cli -x "reloadxml"

# Start backend
cd backend && npm run dev

# Open 5+ browser windows
# Create meeting, select "Verto/SIP" mode
# Test screen share via separate call
```

**Expected:**
- ✅ 5+ participants work smoothly
- ✅ Screen share via separate SIP call
- ✅ No audio echo on screen call
- ✅ Separate conferences in FreeSWITCH logs

## Configuration

### FreeSWITCH Conference Profiles

**video-main** (Audio + Camera):
- Resolution: 1280x720
- FPS: 30
- Bandwidth: 1mb
- Max participants: 50

**video-screen** (Screen Share):
- Resolution: 1920x1080
- FPS: 15
- Bandwidth: 2mb
- Jitter buffer: 50ms
- Max participants: 10

### Environment Variables

```bash
# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/meetings"

# FreeSWITCH
WSS_URL="wss://your-domain.com:8443"
VERTO_PASSWORD="your-secure-password"

# TURN/STUN
TURN_URLS="turn:your-domain.com:3478"
TURN_USERNAME="your-username"
TURN_CREDENTIAL="your-credential"
```

## Deployment

### Production Checklist

- [ ] SSL certificates configured
- [ ] FreeSWITCH restarted with new config
- [ ] Database migrations applied
- [ ] Environment variables set
- [ ] TURN/STUN server accessible
- [ ] nginx reverse proxy configured
- [ ] Frontend built (`npm run build`)
- [ ] Backend running (`npm start`)

### Docker Deployment

```bash
# Production mode
docker-compose -f docker-compose.prod.yml up -d

# Check logs
docker-compose logs -f freeswitch
docker-compose logs -f backend
```

## Performance

### Bandwidth Requirements

**Per Participant:**
- Audio: ~50 kbps
- Camera (720p@30fps): ~500 kbps
- Screen (1080p@15fps): ~2 mbps

**Total (5 participants, 1 sharing screen):**
- Uplink: ~2.5 mbps (camera + screen)
- Downlink: ~4.5 mbps (4 cameras + 1 screen)

### Scalability

- **WebRTC P2P**: 2-4 participants (N² connections)
- **FreeSWITCH SFU**: 5-50+ participants (centralized)

## Browser Compatibility

| Browser | WebRTC P2P | FreeSWITCH SFU | Notes |
|---------|------------|----------------|-------|
| Chrome | ✅ | ✅ | Full support |
| Firefox | ✅ | ✅ | Full support |
| Edge | ✅ | ✅ | Full support |
| Safari | ✅ | ✅ | MID fallback to label |

## Documentation

- **IMPLEMENTATION_PHASES.md** - Phase-by-phase implementation guide with checklists
- **MULTI_TRACK_PLAN.md** - Technical architecture and design decisions
- **ADR-001-MULTI-TRACK.md** - Architecture decision record
- **PHASE1_TESTING.md** - WebRTC P2P testing checklist
- **PHASE2_TESTING.md** - FreeSWITCH SFU testing checklist
- **TESTING.md** - End-to-end testing guide

## Troubleshooting

### FreeSWITCH Issues

```bash
# Check if FreeSWITCH is running
docker ps | grep freeswitch

# View logs
docker logs -f freeswitch

# Access CLI
fs_cli

# List conferences
fs_cli -x "conference list"

# Reload configuration
fs_cli -x "reloadxml"
```

### WebRTC Connection Issues

1. Check TURN/STUN server accessibility
2. Verify SSL certificates (required for getUserMedia)
3. Check browser console for errors
4. Use `chrome://webrtc-internals` for debugging

### Screen Share Not Working

1. Verify browser permissions granted
2. Check if HTTPS enabled (required)
3. Ensure `setScreenTrack()` called correctly
4. Check for `NotAllowedError` or `NotFoundError`

## Project Status

### Phase 1: WebRTC P2P Multi-Track ✅
- Status: Complete
- Duration: 1 day
- Features: Camera + screen share, PiP layout, MID-based tracking
- Testing: Ready for manual testing

### Phase 2: FreeSWITCH SFU Multi-Track ✅
- Status: 75% Complete (backend enforcement pending)
- Duration: 1 day
- Features: Separate SIP calls, dual conferences, jitter buffer
- Testing: Ready for manual testing

### Phase 3: Production Polish 🔄
- Status: In Progress
- Focus: Documentation, optimization, final testing

## Contributing

See `IMPLEMENTATION_PHASES.md` for detailed implementation guide.

## License

MIT
