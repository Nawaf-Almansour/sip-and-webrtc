# SIP Meetings MVP

نظام اجتماعات فيديو (Rooms + 1:1) باستخدام WebRTC و SIP.

## Tech Stack

- **Frontend**: React 18 + SIP.js 0.21 + TailwindCSS
- **Backend**: Node.js 20 + Express + drachtio-srf + drachtio-fsmrf
- **Media**: FreeSWITCH 1.10
- **Signaling**: drachtio-server 0.8
- **TURN/STUN**: coturn 4.6
- **Database**: PostgreSQL 16 + Redis 7.2

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
/infra          # Docker configs (FreeSWITCH, drachtio, coturn)
/backend        # Node.js REST API + SIP handling
/web            # React frontend
```

## API Endpoints

### Calls (1:1)

- `POST /api/calls` - Create new call
- `POST /api/calls/:id/join` - Join call
- `POST /api/calls/:id/end` - End call
- `GET /api/calls/:id` - Get call status

### Meetings (Rooms)

- `POST /api/meetings` - Create new meeting
- `POST /api/meetings/:id/join` - Join meeting
- `POST /api/meetings/:id/end` - End meeting
- `GET /api/meetings/:id` - Get meeting status

## License

MIT
