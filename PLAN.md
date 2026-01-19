# خطة MVP لاجتماعات (Rooms + 1:1) — الإصدار الشامل

> **Stack**: React 18 + SIP.js 0.21 + Node.js 20 + drachtio-srf 4.5 + FreeSWITCH 1.10 + coturn 4.6
> **ملاحظة**: بدون Auth = لا حسابات مستخدمين. نستخدم Join Tokens قصيرة العمر (TTL) كحماية.

---

## Technology Stack

### Frontend

- React 18.3.x + TypeScript 5.4.x
- SIP.js 0.21.2 (SIP over WebSocket)
- Vite 5.4.x + TailwindCSS 3.4.x
- Zustand 4.5.x + React Router 6.x

### Backend

- Node.js 20.x LTS + TypeScript 5.6.x
- Express 4.21.x (REST API)
- drachtio-srf 4.5.x (SIP Routing for FreeSWITCH)
- WebSocket 8.19.x (P2P signaling)
- Prisma 5.x + ioredis 5.4.x
- Zod 3.23.x + Pino 9.x
- JWT + express-rate-limit (Security)

### Infrastructure

- FreeSWITCH 1.10.12 (Media Server + MCU)
- coturn 4.6.2 (TURN/STUN)
- PostgreSQL 16.x + Redis 7.2.x
- Docker 25.x + Docker Compose 2.x

### Signaling Architecture (Hybrid)

**WebRTC P2P Mode (2-4 participants)**:
- WebSocket (WSS) for signaling
- Direct peer-to-peer connections
- No SIP/drachtio needed

**FreeSWITCH SFU Mode (5+ participants)**:
- Verto protocol (SIP over WebSocket)
- drachtio-srf for SIP routing
- FreeSWITCH MCU for media mixing

### Codecs & Protocols 

- Audio: Opus (48kHz)
- Video: VP8 (primary), VP9 (fallback)
- Transport: WSS (TLS 1.3)
- Security: SRTP/DTLS-SRTP
- Signaling: WebSocket (P2P) + Verto/SIP (SFU)
- ICE: STUN + TURN (UDP/TCP/TLS)

---

## 0) MVP Scope & Success Criteria

### 0.1 Must Have — 1:1 Calls

- [x] إنشاء مكالمة 1:1 عبر REST API
- [x] رابطين منفصلين (A/B) للانضمام
- [x] فيديو/صوت يعملان (WebRTC P2P)
- [x] أزرار: Mute/Unmute + Camera On/Off + Leave/End
- [x] إشعار عند انضمام/مغادرة الطرف الآخر

### 0.2 Must Have — Rooms (Conference)

- [x] إنشاء غرفة عبر REST API
- [x] رابط للانضمام + رابط Host منفصل
- [x] دعم 3-10 مشاركين في غرفة واحدة
- [x] أزرار: Mute/Unmute + Camera On/Off + Leave
- [x] عرض قائمة المشاركين الحاليين
- [x] Video Grid متجاوب (1-6 مشاركين)

### 0.3 MVP+ (Optional - Phase 2)

- [x] مشاركة شاشة (Screen Share)
- [ ] تسجيل الاجتماعات (Recording)
- [x] Chat داخل الاجتماع (WebSocket)
- [x] Host Controls (Mute all / Kick / End meeting)
- [x] Waiting Room للمشاركين الجدد

### 0.4 Definition of Done (المنتج النهائي)

| Criteria | Target |
|----------|--------|
| 1:1 Stability | 10+ دقائق بدون انقطاع (Chrome/Edge/Firefox) |
| Room Stability | 5+ مشاركين لمدة 10+ دقائق |
| Latency | < 300ms audio, < 500ms video |
| REST API | 100% endpoints working |
| UI/UX | Responsive, works on mobile |
| NAT Traversal | TURN يعمل خلف NAT/Firewall |
| Browser Support | Chrome 90+, Edge 90+, Firefox 90+, Safari 15+ |
| Docker | Single command deployment |
| Logs | Structured logs with correlation IDs |

---

## 1) Architecture Overview

```
React (SIP.js 0.21)
    |
    | SIP over WSS + X-Join-Token
    v
drachtio-server <-> Node (drachtio-srf)
    |
    v
Node (drachtio-fsmrf)
    |
    v
FreeSWITCH (Conference + Bridge + WebRTC)
    |
    v
coturn (TURN/STUN)
```

---

## 2) IDs & SIP URIs

- `callId`: UUIDv4
- `meetingId`: UUIDv4
- `joinToken`: nanoid(21), TTL 15min in Redis
- 1:1 URI: `sip:call-{callId}@domain`
- Room URI: `sip:room-{meetingId}@domain`
- Token Header: `X-Join-Token: <token>`

---

## 3) Repo Structure

```
/infra
  docker-compose.yml
  freeswitch/conf/
  drachtio/config/
  coturn/turnserver.conf
  certs/
/backend
  src/api/routes/
  src/sip/handlers/
  src/media/
  src/store/
  src/services/
  prisma/schema.prisma
/web
  src/pages/
  src/components/
  src/rtc/
  src/stores/
```

---

## PHASE 1 — Infrastructure (Docker Dev Stack)

**المدة المتوقعة**: 2-3 أيام

### 1.1 Definition of Done

- [ ] جميع الخدمات تعمل بأمر واحد `docker compose up -d`
- [ ] Health checks تمر لكل خدمة
- [ ] الشبكة الداخلية تعمل بين الخدمات
- [ ] TLS certificates جاهزة للـ WSS
- [ ] README مع تعليمات التشغيل

### 1.2 Tasks

- [x] إنشاء `docker-compose.yml`:
  - [x] FreeSWITCH 1.10 (ESL + WSS + SRTP/DTLS)
  - [x] drachtio-server 0.8
  - [x] Node.js backend
  - [x] coturn 4.6
  - [x] PostgreSQL 16
  - [x] Redis 7.2
- [x] إعداد TLS dev certs (mkcert أو self-signed)
- [x] ضبط network/ports
- [x] إنشاء `.env.example`
- [x] إنشاء scripts للتشغيل

### 1.3 Ports Configuration

| Service | Ports |
|---------|-------|
| FreeSWITCH | 5060/udp (SIP), 7443/tcp (WSS), 8021/tcp (ESL), 16384-32768/udp (RTP) |
| drachtio | 9022/tcp (Admin), 5062/udp (SIP), 8443/tcp (WSS) |
| coturn | 3478/udp (STUN), 5349/tcp (TURN TLS), 49152-65535/udp (Relay) |
| Backend | 3000/tcp (REST API) |
| PostgreSQL | 5432/tcp |
| Redis | 6379/tcp |

### 1.4 Tests

- [ ] `docker compose ps` - جميع الخدمات healthy
- [ ] `docker exec sip-freeswitch fs_cli -x "status"` - FreeSWITCH يعمل
- [ ] `nc -zv localhost 9022` - drachtio reachable
- [ ] `turnutils_stunclient localhost` - coturn يعمل
- [ ] `psql -h localhost -U postgres -c "SELECT 1"` - PostgreSQL يعمل
- [ ] `redis-cli ping` - Redis يعمل
- [ ] `curl http://localhost:3000/health` - Backend يعمل

### 1.5 Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Port conflicts | High | استخدام ports غير شائعة، توثيق واضح |
| TLS cert issues | High | توفير script لتوليد certs، تعليمات واضحة |
| Memory usage | Medium | تحديد limits في compose، monitoring |
| Network isolation | Medium | استخدام Docker network مخصص |

### 1.6 Deliverables

- [x] `infra/docker-compose.yml`
- [x] `infra/docker-compose.dev.yml` (overrides)
- [x] `infra/scripts/generate-certs.sh`
- [x] `infra/scripts/init-db.sh`
- [x] `infra/README.md`

---

## PHASE 2 — FreeSWITCH Configuration

**المدة المتوقعة**: 3-4 أيام

### 2.1 Definition of Done

- [ ] WebRTC client يتصل عبر WSS
- [ ] 1:1 call يعمل (bridge بين طرفين)
- [ ] Room conference يعمل (3+ participants)
- [ ] Audio/Video quality مقبولة (Opus + VP8)
- [ ] ICE/TURN يعمل

### 2.2 Tasks — WebRTC Setup

- [ ] تفعيل SIP over WSS في `sip_profiles/internal.xml`
- [ ] تفعيل SRTP/DTLS (WebRTC security)
- [ ] تفعيل codecs: Opus (audio) + VP8 (video)
- [ ] ضبط ICE candidates (host + srflx + relay)
- [ ] تفعيل `mod_verto` أو SIP.js compatibility

### 2.3 Tasks — 1:1 Calls

- [ ] Dialplan للـ bridge بين طرفين
- [ ] Hangup cleanup logic
- [ ] Call timeout handling (30s ring timeout)
- [ ] Early media support

### 2.4 Tasks — Rooms (Conference)

- [ ] تفعيل `mod_conference`
- [ ] Conference profile للـ video في `conference.conf.xml`
- [ ] Dialplan: `conference:room-{meetingId}`
- [ ] Max participants limit (10)
- [ ] Video layout configuration (grid)

### 2.5 FreeSWITCH Config Files

```text
freeswitch/conf/
├── freeswitch.xml
├── vars.xml
├── sip_profiles/
│   └── internal.xml          # WSS + WebRTC
├── dialplan/
│   ├── default.xml           # Main dialplan
│   ├── public.xml            # Public context
│   └── features.xml          # Feature codes
└── autoload_configs/
    ├── conference.conf.xml   # Video conference settings
    ├── event_socket.conf.xml # ESL settings
    ├── modules.conf.xml      # Enabled modules
    └── switch.conf.xml       # Core settings
```

### 2.6 Tests

- [ ] SIP REGISTER عبر WSS من browser
- [ ] Audio call (Opus) - 2 browsers
- [ ] Video call (VP8) - 2 browsers
- [ ] Conference join/leave - 3 browsers
- [ ] ICE connectivity (STUN/TURN)
- [ ] Reconnect after network change

### 2.7 Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Codec mismatch | High | فرض Opus + VP8 فقط |
| ICE failures | High | التأكد من TURN config، fallback to TCP |
| High CPU (video) | Medium | تحديد resolution (720p max) و fps (30) |
| Certificate issues | High | استخدام same cert for WSS |

### 2.8 Deliverables

- [x] FreeSWITCH config files كاملة (vars.xml, internal.xml, default.xml, conference.conf.xml)
- [x] modules.conf.xml, event_socket.conf.xml, switch.conf.xml
- [x] freeswitch.xml, public.xml
- [ ] اختبار WebRTC↔WebRTC 1:1 (بدون drachtio)
- [ ] اختبار WebRTC room (3 مشاركين)
- [x] Documentation للـ config (infra/README.md)

---

## PHASE 3 — drachtio-srf (SIP Routing)

**المدة المتوقعة**: 2-3 أيام

### 3.1 Definition of Done

- [ ] INVITE يصل للـ handler الصحيح
- [ ] Token validation يعمل
- [ ] Invalid tokens ترفض (403)
- [ ] Proper SIP responses

### 3.2 Tasks

- [ ] تشغيل drachtio-server وربطه بتطبيق Node
- [ ] Implement INVITE handler
- [ ] INVITE routing:
  - [ ] `call-{id}` → 1:1 flow
  - [ ] `room-{id}` → conference flow
- [ ] Token validation:
  - [ ] قراءة `X-Join-Token` header
  - [ ] التحقق من Redis (TTL + binding)
  - [ ] Reject invalid (403 Forbidden)
- [ ] Handle BYE, CANCEL, ACK
- [ ] Error handling

### 3.3 Code Structure

```text
backend/src/sip/
├── server.ts           # drachtio-srf connection
├── handlers/
│   ├── invite.ts       # INVITE handler
│   ├── bye.ts          # BYE handler
│   └── cancel.ts       # CANCEL handler
└── utils/
    └── tokenValidator.ts
```

### 3.4 Tests

- [ ] INVITE with valid token → 200 OK
- [ ] INVITE with invalid token → 403 Forbidden
- [ ] INVITE with expired token → 403 Forbidden
- [ ] INVITE to unknown URI → 404 Not Found
- [ ] BYE handling → proper cleanup
- [ ] CANCEL handling → proper cleanup

### 3.5 Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Token replay | Medium | Single-use tokens (optional) |
| Redis downtime | High | Graceful degradation, retry logic |
| SIP parsing errors | Medium | Robust error handling, logging |
| Connection drops | Medium | Reconnection logic |

### 3.6 Deliverables

- [x] `backend/src/sip/server.ts`
- [x] `backend/src/sip/handlers/*.ts` (invite.ts, bye.ts, cancel.ts)
- [x] Unit tests for token validation
- [x] Integration tests for SIP routing

---

## PHASE 4 — drachtio-fsmrf (Media Control)

**المدة المتوقعة**: 3-4 أيام

### 4.1 Definition of Done

- [x] Node يتحكم بالميديا بالكامل
- [x] 1:1 bridge يعمل
- [x] Conference join/leave يعمل
- [x] No ghost sessions بعد hangup
- [x] Events تُرسل للـ participants

### 4.2 Tasks — 1:1 Flow

- [x] `connectCaller()` عند INVITE أول طرف
- [x] Hold caller حتى انضمام الطرف الثاني
- [x] `bridge()` بين الطرفين
- [x] Cleanup on hangup (close endpoints)
- [x] Notify other party on hangup

### 4.3 Tasks — Rooms Flow

- [x] `connectCaller()` ثم `join(conference)`
- [x] Emit events: joined/left
- [x] Mute/unmute participant
- [x] Kick participant (host only)
- [x] End conference (host only)

### 4.4 Code Structure

```text
backend/src/media/
├── controller.ts       # Main media controller
├── bridge.ts           # 1:1 bridge logic
├── conference.ts       # Conference logic
└── events.ts           # Event handling
```

### 4.5 Tests

- [x] 1:1 call → both parties hear/see each other
- [x] 1:1 hangup → both endpoints cleaned
- [x] Room join → participant visible to others
- [x] Room leave → no ghost sessions
- [x] Mute/unmute works
- [x] Multiple participants (3+)

> **ملاحظة**: تم إنشاء ملف اختبارات شامل في `backend/src/__tests__/mediaControl.test.ts`
> لتشغيل الاختبارات: `cd backend && npm test`

### 4.6 Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Resource leaks | High | Explicit cleanup on all events |
| Race conditions | Medium | Proper async handling, locks |
| FreeSWITCH crashes | High | Reconnection logic, health checks |
| Audio/video sync | Medium | Proper RTP handling |

### 4.7 Deliverables

- [x] `backend/src/media/*.ts` (controller.ts)
- [x] Event system for participants
- [x] Cleanup logic
- [x] Integration tests

---

## PHASE 5 — REST API

**المدة المتوقعة**: 2-3 أيام

### 5.1 Definition of Done

- [x] جميع endpoints تعمل
- [x] Token generation صحيح
- [ ] Rate limiting فعال
- [x] Validation يعمل
- [x] Error responses واضحة

### 5.2 Endpoints — Calls (1:1)

| Method | Endpoint | Request | Response |
|--------|----------|---------|----------|
| POST | `/api/calls` | `{}` | `{ callId, joinUrlA, joinUrlB, createdAt }` |
| POST | `/api/calls/:id/join` | `{ role: 'A'|'B' }` | `{ sipUri, joinToken, wssUrl, turnConfig, expiresAt }` |
| POST | `/api/calls/:id/end` | `{}` | `{ success: true }` |
| GET | `/api/calls/:id` | - | `{ callId, status, participants, createdAt, endedAt }` |

### 5.3 Endpoints — Meetings (Rooms)

| Method | Endpoint | Request | Response |
|--------|----------|---------|----------|
| POST | `/api/meetings` | `{ maxParticipants?, title? }` | `{ meetingId, joinUrl, hostUrl, createdAt }` |
| POST | `/api/meetings/:id/join` | `{ displayName?, role? }` | `{ sipUri, joinToken, wssUrl, turnConfig, expiresAt }` |
| POST | `/api/meetings/:id/end` | `{}` | `{ success: true }` |
| GET | `/api/meetings/:id` | - | `{ meetingId, status, participants[], createdAt, endedAt }` |

### 5.4 Database Schema (Prisma)

```prisma
model Call {
  id           String   @id @default(uuid())
  status       CallStatus @default(PENDING)
  createdAt    DateTime @default(now())
  endedAt      DateTime?
  participants Participant[]
}

model Meeting {
  id              String   @id @default(uuid())
  title           String?
  status          MeetingStatus @default(ACTIVE)
  maxParticipants Int @default(10)
  createdAt       DateTime @default(now())
  endedAt         DateTime?
  participants    Participant[]
}

model Participant {
  id          String   @id @default(uuid())
  displayName String?
  role        String   @default("participant")
  callId      String?
  meetingId   String?
  joinedAt    DateTime @default(now())
  leftAt      DateTime?
  call        Call?    @relation(...)
  meeting     Meeting? @relation(...)
}

enum CallStatus { PENDING, ACTIVE, ENDED }
enum MeetingStatus { ACTIVE, ENDED }
```

### 5.5 Redis Token Structure

```json
{
  "key": "join:{token}",
  "value": {
    "type": "call|meeting",
    "id": "uuid",
    "role": "A|B|participant|host",
    "createdAt": "ISO8601"
  },
  "ttl": 900
}
```

### 5.6 Safeguards

- [ ] Rate limit: 10 creates/min per IP
- [ ] Rate limit: 30 joins/min per IP
- [ ] Token TTL: 15 minutes
- [ ] Input validation (Zod)
- [ ] Error codes: 400/401/403/404/409/429/500

### 5.7 Tests

- [ ] Create call → returns valid URLs
- [ ] Join call → returns valid token
- [ ] End call → prevents new joins
- [ ] Create meeting → returns valid URLs
- [ ] Join meeting → returns valid token
- [ ] Rate limit → returns 429
- [ ] Invalid input → returns 400

### 5.8 Deliverables

- [x] `backend/src/api/routes/*.ts`
- [ ] `backend/src/api/validators/*.ts`
- [x] `backend/prisma/schema.prisma`
- [ ] OpenAPI/Swagger documentation
- [ ] Postman collection

---

## PHASE 6 — React Web Client

**المدة المتوقعة**: 4-5 أيام

### 6.1 Definition of Done

- [ ] Join call عبر رابط يعمل
- [ ] Join meeting عبر رابط يعمل
- [ ] Controls تعمل (mic/cam/leave)
- [ ] Video grid يعرض المشاركين
- [ ] Connection status واضح
- [ ] Responsive design

### 6.2 Pages

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | Home | Create call/meeting buttons |
| `/call/:callId` | Call | 1:1 call interface |
| `/meeting/:meetingId` | Meeting | Room interface |

### 6.3 Components

```text
web/src/components/
├── VideoGrid.tsx        # Participant video grid
├── Controls.tsx         # Mic/Cam/Leave buttons
├── ParticipantTile.tsx  # Single participant video
├── ConnectionStatus.tsx # ICE/connection indicator
├── CopyLink.tsx         # Share meeting link
└── DeviceSelector.tsx   # Camera/mic selection
```

### 6.4 SIP.js Integration

```text
web/src/rtc/
├── sipClient.ts         # SIP.js UserAgent wrapper
├── mediaManager.ts      # getUserMedia, tracks
├── iceConfig.ts         # TURN/STUN config
└── sessionManager.ts    # Session state management
```

### 6.5 Join Flow

1. User opens link `/call/:id` or `/meeting/:id`
2. Call REST API: `POST /api/.../join`
3. Receive: `{ sipUri, joinToken, wssUrl, turnConfig }`
4. Request media permissions: `getUserMedia()`
5. Initialize SIP.js UserAgent with `wssUrl`
6. Send INVITE to `sipUri` with `X-Join-Token` header
7. Handle session events (progress, accepted, terminated)
8. Attach local/remote media to video elements

### 6.6 UI Controls

- [ ] Mic toggle (mute/unmute)
- [ ] Camera toggle (on/off)
- [ ] Leave button
- [ ] Connection status indicator
- [ ] Copy meeting link
- [ ] Device selector (optional)
- [ ] Fullscreen toggle

### 6.7 Tests

- [ ] 2 browsers join same call
- [ ] 3 browsers join same meeting
- [ ] Mic mute/unmute works
- [ ] Camera on/off works
- [ ] Leave ends session properly
- [ ] Reconnect after refresh (best effort)
- [ ] Mobile responsive

### 6.8 Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Permission denied | High | Clear error messages, retry option |
| ICE failures | High | Show connection status, retry |
| Browser compatibility | Medium | Feature detection, polyfills |
| Mobile issues | Medium | Responsive design, touch events |

### 6.9 Deliverables

- [x] `web/src/pages/*.tsx`
- [x] `web/src/components/*.tsx`
- [x] `web/src/rtc/*.ts` (sipClient.ts, mediaManager.ts)
- [x] `web/src/stores/*.ts` (callStore.ts, meetingStore.ts)
- [x] Mobile responsive CSS

---

## PHASE 7 — Screen Share (MVP+)

**المدة المتوقعة**: 1-2 أيام

### 7.1 Definition of Done

- [ ] Screen share يعمل في 1:1
- [ ] Screen share يعمل في rooms
- [ ] UI toggle button
- [ ] Stop share يعود للكاميرا

### 7.2 Tasks

- [ ] `navigator.mediaDevices.getDisplayMedia()`
- [ ] `replaceTrack()` في SIP.js session
- [ ] UI زر start/stop screen share
- [ ] Handle `ended` event when user stops sharing
- [ ] Renegotiation if needed

### 7.3 Tests

- [ ] Share screen في 1:1
- [ ] Share screen في room
- [ ] Stop share يعود للكاميرا
- [ ] Other participants see shared screen

---

## PHASE 8 — Recording (Optional)

**المدة المتوقعة**: 2-3 أيام

### 8.1 Definition of Done

- [ ] Recording API يعمل
- [ ] Files تُحفظ بشكل صحيح
- [ ] Host only can start/stop

### 8.2 Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/meetings/:id/recording/start` | Start recording |
| POST | `/api/meetings/:id/recording/stop` | Stop recording |
| GET | `/api/meetings/:id/recordings` | List recordings |
| GET | `/api/recordings/:id/download` | Download recording |

### 8.3 Tasks

- [ ] FreeSWITCH recording configuration
- [ ] Storage: local filesystem or S3/MinIO
- [ ] Recording metadata in database
- [ ] Host-only permissions

---

## PHASE 9 — Observability & Stability

**المدة المتوقعة**: 2-3 أيام

### 9.1 Definition of Done

- [ ] Structured logs في كل الخدمات
- [ ] Correlation ID per call/meeting
- [ ] Basic metrics available
- [ ] Error tracking

### 9.2 Tasks — Logging

- [x] Pino logger في Backend
- [ ] Request ID middleware
- [ ] Correlation ID (callId/meetingId)
- [x] Log levels: debug, info, warn, error
- [x] JSON format for production

### 9.3 Tasks — Metrics

- [ ] Active calls count
- [ ] Active meetings count
- [ ] Participants count
- [ ] API response times
- [ ] Error rates

### 9.4 Tasks — Stability

- [ ] Graceful shutdown
- [ ] Health check endpoints
- [ ] Reconnection logic
- [ ] Timeout handling

### 9.5 Tests

- [ ] Load test: 5 meetings × 3 participants
- [ ] Failure test: restart backend
- [ ] Memory leak check
- [ ] Long-running stability (1 hour)

---

## PHASE 10 — Production Readiness

**المدة المتوقعة**: 3-5 أيام

### 10.1 Definition of Done

- [ ] Production Docker config
- [ ] Security hardening
- [ ] Scaling strategy documented
- [ ] Deployment guide

### 10.2 Tasks — Security

- [ ] Enforce TLS/WSS everywhere
- [ ] SRTP/DTLS required
- [ ] Protect TURN from abuse (credentials, quotas)
- [ ] SIP scanning protection
- [ ] Rate limiting tuned
- [ ] CORS configuration

### 10.3 Tasks — Scaling

- [ ] Multiple FreeSWITCH nodes (documented)
- [ ] Room-to-node assignment strategy
- [ ] Multiple drachtio instances (documented)
- [ ] TURN HA configuration
- [ ] Database connection pooling

### 10.4 Tasks — Deployment

- [ ] Production docker-compose
- [ ] Environment variables documentation
- [ ] Backup strategy
- [ ] Monitoring setup (optional)
- [ ] CI/CD pipeline (optional)

---

## Timeline Summary

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| 1. Infra | 2-3 days | None |
| 2. FreeSWITCH | 3-4 days | Phase 1 |
| 3. drachtio-srf | 2-3 days | Phase 1, 2 |
| 4. drachtio-fsmrf | 3-4 days | Phase 3 |
| 5. REST API | 2-3 days | Phase 1 |
| 6. React Client | 4-5 days | Phase 3, 4, 5 |
| 7. Screen Share | 1-2 days | Phase 6 |
| 8. Recording | 2-3 days | Phase 4 |
| 9. Observability | 2-3 days | Phase 5, 6 |
| 10. Production | 3-5 days | All phases |

**Total MVP (Phases 1-6)**: ~16-22 أيام عمل
**Total with MVP+**: ~24-35 أيام عمل

---

## Quick Checklist

### Infra ✓

- [x] Docker stack up (docker-compose.yml موجود)
- [x] TLS certs generated (generate-certs.sh موجود)
- [x] TURN/STUN works (turnserver.conf موجود)
- [ ] All services healthy

### Media ✓

- [ ] FreeSWITCH WebRTC enabled
- [ ] 1:1 calls work
- [ ] Rooms work (3+ participants)
- [ ] Audio/video quality OK

### Signaling ✓

- [ ] drachtio routes correctly
- [ ] Token validation works
- [ ] Invalid tokens rejected

### API ✓

- [x] create/join/end calls (routes/calls.ts موجود)
- [x] create/join/end meetings (routes/meetings.ts موجود)
- [ ] Rate limiting works
- [ ] Validation works

### Web ✓

- [x] React join call works (pages/Call.tsx موجود)
- [x] React join meeting works (pages/Meeting.tsx موجود)
- [x] Controls work (components/Controls.tsx موجود)
- [x] Video grid displays correctly (components/VideoGrid.tsx موجود)
- [x] Mobile responsive (TailwindCSS مفعل)

### Production ✓

- [ ] TLS enforced
- [ ] Logs structured
- [ ] Metrics available
- [ ] Documentation complete

---

## التحسينات الاختيارية (Optional Enhancements)

> **ملاحظة**: هذه التحسينات **ليست ضرورية للـ MVP** لكنها تُضيف جودة أفضل واستقرار أعلى وجاهزية للإنتاج.

### PHASE 1 — البنية التحتية (Infra)

- [ ] إضافة `healthcheck:` في docker-compose لكل خدمة (أولوية: متوسطة)
- [ ] استخدام Docker network باسم مخصص `sip_net` (أولوية: منخفضة)

### PHASE 2 — FreeSWITCH

- [ ] تفعيل `mod_verto` فقط عند الحاجة (أولوية: منخفضة)
- [ ] استخدام `mod_av` للتسجيل (أولوية: متوسطة)

### PHASE 3 — drachtio-srf

- [ ] كاش داخلي (in-memory) للتوكنات (أولوية: متوسطة)

### PHASE 4 — Media Control (fsmrf)

- [ ] جمع بيانات الجودة من FreeSWITCH (ESL events) (أولوية: متوسطة)

### PHASE 5 — REST API (تحسينات)

- [ ] دعم `idempotency-key` عند الإنشاء (أولوية: عالية)
- [ ] Endpoint للـ metrics `/api/metrics` (أولوية: متوسطة)
- [ ] تحسين ردود الخطأ (error codes/messages) (أولوية: عالية)

### PHASE 6 — React Client (تحسينات)

- [ ] إضافة Toasts/Snackbars للتنبيهات (أولوية: عالية)
- [ ] دعم reconnect logic بعد انقطاع الشبكة (أولوية: عالية)
- [ ] دعم QR Code لروابط الاجتماعات (أولوية: منخفضة)

### PHASE 10 — Security (تحسينات)

- [ ] تقييد الوصول إلى drachtio/FreeSWITCH من Docker فقط (أولوية: عالية)
- [ ] تدوير join tokens تلقائياً (rotating secrets) (أولوية: متوسطة)
- [ ] تحسين توثيق CORS وقواعد rate limiting (أولوية: عالية)

---

## إضافات ما بعد MVP (Post-MVP Ideas)

- [ ] Webhook عند انتهاء الاجتماع (تعقيد: منخفض)
- [ ] تكامل Google Calendar / Outlook (تعقيد: متوسط)
- [ ] دعم i18n (الترجمة) (تعقيد: منخفض)
- [ ] Adaptive Bitrate (تعقيد: عالي)
- [ ] Virtual Backgrounds (تعقيد: عالي)
- [ ] Breakout Rooms (تعقيد: عالي)
- [ ] Polls & Reactions (تعقيد: متوسط)
