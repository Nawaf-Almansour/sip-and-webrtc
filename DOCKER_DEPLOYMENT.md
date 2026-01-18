# Docker Deployment Guide

Complete guide for deploying the multi-track video meetings platform using Docker.

---

## 🚀 Quick Start (Full Stack)

### **Single Command Deployment**

```bash
# Clone repository
git clone https://github.com/Nawaf-Almansour/sip-and-webrtc.git
cd sip-and-webrtc

# Start all services
docker-compose -f docker-compose.prod.yml up -d

# Check status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f
```

**Access Application:**
- HTTP: `http://192.168.100.218`
- HTTPS: `https://192.168.100.218`

---

## 📦 Services Included

| Service | Image | Ports | Purpose |
|---------|-------|-------|---------|
| **postgres** | postgres:16-alpine | 5432 | Database |
| **redis** | redis:7-alpine | 6379 | Cache |
| **freeswitch** | drachtio/drachtio-freeswitch-mrf | 5060, 8021, 8443, 16384-16484 | Media server |
| **drachtio** | drachtio/drachtio-server | 9022, 5062 | SIP server |
| **coturn** | coturn/coturn:4.6.2-alpine | 3478, 5349, 49152-49252 | TURN/STUN |
| **backend** | Custom (Node.js) | 3000 | REST API + WebSocket |
| **frontend** | Custom (nginx) | 80, 443 | React SPA |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Internet                             │
└────────────────────────┬────────────────────────────────────┘
                         │
                    ┌────▼────┐
                    │  nginx  │ (Frontend - Port 80/443)
                    │  (SSL)  │
                    └────┬────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
   ┌────▼────┐     ┌────▼────┐     ┌────▼────┐
   │ Backend │     │  Free   │     │ coturn  │
   │ (API +  │────▶│ SWITCH  │     │ (TURN)  │
   │   WS)   │     │  (SFU)  │     └─────────┘
   └────┬────┘     └─────────┘
        │
   ┌────┼────┐
   │    │    │
┌──▼──┐ │ ┌──▼──┐
│ PG  │ │ │Redis│
└─────┘ │ └─────┘
        │
   ┌────▼────┐
   │drachtio │
   └─────────┘
```

---

## 📋 Prerequisites

### **Required:**
- Docker Engine 20.10+
- Docker Compose 2.0+
- 4GB RAM minimum
- 20GB disk space

### **Optional:**
- SSL certificates (for HTTPS)
- Domain name (for production)

---

## 🔧 Configuration

### **1. Environment Variables**

The `docker-compose.prod.yml` includes all necessary environment variables:

```yaml
# Backend Configuration
NODE_ENV: production
DATABASE_URL: postgresql://postgres:postgres@postgres:5432/sip_meetings
REDIS_URL: redis://redis:6379
SIP_DOMAIN: 192.168.100.218
WSS_URL: wss://192.168.100.218/ws
TURN_URL: turn:localhost:3478
TURN_USERNAME: turnuser
TURN_PASSWORD: turnpassword
```

### **2. FreeSWITCH Configuration**

Multi-track profiles are automatically loaded from:
- `./infra/freeswitch/conf/autoload_configs/conference.conf.xml`
- `./infra/freeswitch/conf/dialplan/default.xml`

**Profiles:**
- `video-main`: Camera + audio (1280x720@30fps, 1mb)
- `video-screen`: Screen share (1920x1080@15fps, 2mb, jitter 50ms)

### **3. SSL Certificates**

**For HTTPS, place certificates in project root:**
```bash
# Self-signed (development)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ssl.key -out ssl.crt \
  -subj "/CN=192.168.100.218"

# Production (Let's Encrypt)
certbot certonly --standalone -d your-domain.com
cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ssl.crt
cp /etc/letsencrypt/live/your-domain.com/privkey.pem ssl.key
```

---

## 🚀 Deployment Steps

### **Step 1: Build Images**

```bash
# Build backend and frontend
docker-compose -f docker-compose.prod.yml build

# Or build individually
docker-compose -f docker-compose.prod.yml build backend
docker-compose -f docker-compose.prod.yml build frontend
```

### **Step 2: Start Services**

```bash
# Start all services
docker-compose -f docker-compose.prod.yml up -d

# Start specific services
docker-compose -f docker-compose.prod.yml up -d postgres redis
docker-compose -f docker-compose.prod.yml up -d freeswitch
docker-compose -f docker-compose.prod.yml up -d backend frontend
```

### **Step 3: Verify Services**

```bash
# Check all services running
docker-compose -f docker-compose.prod.yml ps

# Expected output:
# NAME                IMAGE                              STATUS
# sip-backend         sip-and-webrtc-backend            Up (healthy)
# sip-coturn          coturn/coturn:4.6.2-alpine        Up
# sip-drachtio        drachtio/drachtio-server:latest   Up
# sip-freeswitch      drachtio/drachtio-freeswitch-mrf  Up (healthy)
# sip-frontend        sip-and-webrtc-frontend           Up (healthy)
# sip-postgres        postgres:16-alpine                Up (healthy)
# sip-redis           redis:7-alpine                    Up (healthy)
```

### **Step 4: Initialize Database**

Database migrations run automatically on backend startup via:
```bash
npx prisma db push --skip-generate
```

### **Step 5: Test Application**

```bash
# Open browser
open https://192.168.100.218

# Or curl
curl -k https://192.168.100.218/health
```

---

## 🔍 Monitoring & Logs

### **View Logs**

```bash
# All services
docker-compose -f docker-compose.prod.yml logs -f

# Specific service
docker-compose -f docker-compose.prod.yml logs -f backend
docker-compose -f docker-compose.prod.yml logs -f freeswitch
docker-compose -f docker-compose.prod.yml logs -f frontend

# Last 100 lines
docker-compose -f docker-compose.prod.yml logs --tail=100 backend
```

### **Check Health**

```bash
# Backend health
curl http://localhost:3000/health

# Frontend health
curl http://localhost/health

# FreeSWITCH status
docker exec sip-freeswitch fs_cli -x "status"

# Database connection
docker exec sip-postgres pg_isready -U postgres
```

### **Resource Usage**

```bash
# All containers
docker stats

# Specific container
docker stats sip-backend sip-freeswitch
```

---

## 🧪 Testing Multi-Track

### **WebRTC P2P (2-4 participants)**

```bash
# 1. Open application
open https://192.168.100.218

# 2. Create meeting, select "WebRTC P2P"
# 3. Join from 2-4 browser windows
# 4. Click "Share Screen" in one window
# 5. Verify: Screen + Camera PiP visible
```

### **FreeSWITCH SFU (5+ participants)**

```bash
# 1. Verify FreeSWITCH running
docker exec sip-freeswitch fs_cli -x "conference list"

# 2. Open application
open https://192.168.100.218

# 3. Create meeting, select "Verto/SIP"
# 4. Join from 5+ browser windows
# 5. Click "Share Screen" in one window
# 6. Verify: Separate conferences in FreeSWITCH
docker exec sip-freeswitch fs_cli -x "conference list"
# Should show: room-{id}-main, room-{id}-screen
```

---

## 🛠️ Troubleshooting

### **Services Not Starting**

```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs

# Restart specific service
docker-compose -f docker-compose.prod.yml restart backend

# Rebuild and restart
docker-compose -f docker-compose.prod.yml up -d --build backend
```

### **FreeSWITCH Issues**

```bash
# Check FreeSWITCH logs
docker logs -f sip-freeswitch

# Access FreeSWITCH CLI
docker exec -it sip-freeswitch fs_cli

# Reload configuration
docker exec sip-freeswitch fs_cli -x "reloadxml"

# Check conferences
docker exec sip-freeswitch fs_cli -x "conference list"
```

### **Database Issues**

```bash
# Check database
docker exec sip-postgres psql -U postgres -d sip_meetings -c "\dt"

# Reset database
docker-compose -f docker-compose.prod.yml down -v
docker-compose -f docker-compose.prod.yml up -d postgres
docker-compose -f docker-compose.prod.yml up -d backend
```

### **Network Issues**

```bash
# Check network
docker network ls
docker network inspect sip-and-webrtc_default

# Test connectivity
docker exec sip-backend ping postgres
docker exec sip-backend ping freeswitch
```

---

## 🔄 Updates & Maintenance

### **Update Application**

```bash
# Pull latest code
git pull origin main

# Rebuild and restart
docker-compose -f docker-compose.prod.yml up -d --build
```

### **Update Single Service**

```bash
# Rebuild backend
docker-compose -f docker-compose.prod.yml build backend
docker-compose -f docker-compose.prod.yml up -d backend

# Rebuild frontend
docker-compose -f docker-compose.prod.yml build frontend
docker-compose -f docker-compose.prod.yml up -d frontend
```

### **Backup Database**

```bash
# Backup
docker exec sip-postgres pg_dump -U postgres sip_meetings > backup.sql

# Restore
cat backup.sql | docker exec -i sip-postgres psql -U postgres sip_meetings
```

---

## 🛑 Stopping & Cleanup

### **Stop Services**

```bash
# Stop all
docker-compose -f docker-compose.prod.yml stop

# Stop specific service
docker-compose -f docker-compose.prod.yml stop backend
```

### **Remove Services**

```bash
# Stop and remove containers
docker-compose -f docker-compose.prod.yml down

# Remove containers + volumes (⚠️ deletes data)
docker-compose -f docker-compose.prod.yml down -v

# Remove containers + images
docker-compose -f docker-compose.prod.yml down --rmi all
```

---

## 📊 Performance Tuning

### **Resource Limits**

Add to `docker-compose.prod.yml`:

```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
  
  freeswitch:
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 4G
        reservations:
          cpus: '2'
          memory: 2G
```

### **Scaling**

```bash
# Scale backend (multiple instances)
docker-compose -f docker-compose.prod.yml up -d --scale backend=3

# Note: Requires load balancer configuration
```

---

## 🔒 Security

### **Production Checklist**

- [ ] Change default passwords in `docker-compose.prod.yml`
- [ ] Use valid SSL certificates (not self-signed)
- [ ] Set strong `TOKEN_SECRET` in backend environment
- [ ] Configure firewall rules
- [ ] Enable Docker security features
- [ ] Regular security updates
- [ ] Monitor logs for suspicious activity

### **Firewall Rules**

```bash
# Allow HTTP/HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Allow FreeSWITCH
ufw allow 5060/udp
ufw allow 5060/tcp
ufw allow 8443/tcp
ufw allow 16384:16484/udp

# Allow TURN
ufw allow 3478/udp
ufw allow 3478/tcp
ufw allow 49152:49252/udp
```

---

## 📚 Additional Resources

- **PHASE1_TESTING.md** - WebRTC P2P testing guide
- **PHASE2_TESTING.md** - FreeSWITCH SFU testing guide
- **README.md** - Project overview
- **PROJECT_SUMMARY.md** - Implementation summary

---

## ✅ Deployment Checklist

- [ ] Docker and Docker Compose installed
- [ ] SSL certificates generated
- [ ] Environment variables configured
- [ ] Build images: `docker-compose -f docker-compose.prod.yml build`
- [ ] Start services: `docker-compose -f docker-compose.prod.yml up -d`
- [ ] Verify health: `docker-compose -f docker-compose.prod.yml ps`
- [ ] Check logs: `docker-compose -f docker-compose.prod.yml logs`
- [ ] Test WebRTC P2P mode (2-4 users)
- [ ] Test FreeSWITCH SFU mode (5+ users)
- [ ] Test screen sharing in both modes
- [ ] Configure firewall rules
- [ ] Set up monitoring
- [ ] Create backup strategy

---

**Status:** 🚀 Production Ready

**Last Updated:** 2026-01-18
