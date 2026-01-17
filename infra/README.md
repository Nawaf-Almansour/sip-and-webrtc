# Infrastructure Setup

## Overview

This directory contains all infrastructure configuration for the SIP Meetings application.

## Components

| Component | Port | Description |
|-----------|------|-------------|
| PostgreSQL | 5432 | Database |
| FreeSWITCH | 5060, 7443 | SIP/WebRTC media server |
| drachtio | 9022 | SIP routing server |
| CoTURN | 3478, 5349 | TURN/STUN server |

## Quick Start

### Development Mode

```bash
# Start all services
cd infra
docker-compose -f docker-compose.dev.yml up -d

# Generate SSL certificates
./scripts/generate-certs.sh

# Initialize database
./scripts/init-db.sh
```

### Production Mode

```bash
# From project root
docker-compose -f docker-compose.prod.yml up -d
```

## Directory Structure

```
infra/
├── docker-compose.yml          # Base compose file
├── docker-compose.dev.yml      # Development overrides
├── freeswitch/
│   └── conf/
│       ├── freeswitch.xml      # Main config
│       ├── vars.xml            # Variables
│       ├── sip_profiles/
│       │   └── internal.xml    # WebRTC SIP profile
│       ├── dialplan/
│       │   ├── default.xml     # Main dialplan
│       │   └── public.xml      # Public context
│       └── autoload_configs/
│           ├── conference.conf.xml
│           ├── event_socket.conf.xml
│           ├── modules.conf.xml
│           └── switch.conf.xml
├── certs/                      # SSL certificates
└── scripts/
    ├── generate-certs.sh       # Certificate generation
    └── init-db.sh              # Database initialization
```

## FreeSWITCH Configuration

### WebRTC Support

- **WSS Port**: 7443 (Secure WebSocket)
- **Codecs**: Opus (audio), VP8 (video)
- **DTLS/SRTP**: Enabled for WebRTC security

### Conference Settings

- **Max Participants**: 10
- **Video Resolution**: 1920x1080 canvas
- **Video FPS**: 30
- **Video Layout**: Grid

## TURN Server

CoTURN is configured for NAT traversal:

- **STUN**: UDP/TCP 3478
- **TURN**: UDP/TCP 3478, TLS 5349
- **Credentials**: turnuser / turnpassword

## Troubleshooting

### FreeSWITCH Logs

```bash
docker logs -f sip-freeswitch
```

### Check WebSocket Connection

```bash
# Test WSS endpoint
wscat -c wss://localhost:7443
```

### Database Connection

```bash
docker exec -it sip-postgres psql -U postgres -d sip_meetings
```
