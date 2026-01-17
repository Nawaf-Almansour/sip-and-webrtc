# End-to-End Testing Guide

## Test Environment Status

**Date**: January 17, 2026
**Application URL**: https://192.168.100.218

### Services Status
- ✅ Backend (Port 3000)
- ✅ Frontend (Ports 80/443)
- ✅ PostgreSQL (healthy)
- ✅ Redis (healthy)
- ✅ FreeSWITCH (Port 5060, 7443, 8021)
- ✅ drachtio (Port 9022, 5062)
- ✅ coturn (Port 3478, 5349)

---

## Test Plan Overview

### Priority 1: Core Functionality
1. ✅ Infrastructure verification
2. ⏳ 1:1 Call testing
3. ⏳ Meeting room testing (3+ participants)
4. ⏳ Feature verification
5. ⏳ Host controls testing
6. ⏳ Layout templates testing

---

## TEST 1: 1:1 Call End-to-End

### Prerequisites
- 2 browsers (or 2 devices)
- Camera and microphone permissions

### Test Steps

#### Step 1: Create Call
1. Open Browser A: `https://192.168.100.218`
2. Click **"Start 1-on-1 Call"**
3. Enter name: "User A"
4. Select connection mode: **WebRTC P2P**
5. Click **"Join"**
6. ✅ **Expected**: Redirected to `/call/{callId}?role=A&name=User%20A&mode=webrtc`
7. ✅ **Expected**: Camera/mic permissions requested
8. ✅ **Expected**: Local video appears

#### Step 2: Join Call (Second Participant)
1. Copy the call URL from Browser A
2. Open Browser B with the same URL
3. Change role parameter: `role=B` and name: `name=User%20B`
4. ✅ **Expected**: Both participants see each other's video
5. ✅ **Expected**: Audio works bidirectionally

#### Step 3: Test Controls
| Action | Browser | Expected Result |
|--------|---------|-----------------|
| Click Mute | A | Mic icon turns red, User B hears silence |
| Click Unmute | A | Mic icon normal, User B hears audio |
| Click Video Off | A | Camera icon red, User B sees avatar/placeholder |
| Click Video On | A | Camera icon normal, User B sees video |
| Click Screen Share | A | Monitor icon green, User B sees shared screen |
| Stop Screen Share | A | Returns to camera view |
| Click Leave | A | Call ends, User B notified |

### Success Criteria
- [ ] Both participants connect successfully
- [ ] Audio works both ways
- [ ] Video works both ways
- [ ] All controls function correctly
- [ ] Clean disconnect when leaving

---

## TEST 2: Meeting Room (3+ Participants)

### Test Steps

#### Step 1: Create Meeting
1. Open Browser/Tab 1: `https://192.168.100.218`
2. Click **"Create Meeting Room"**
3. Enter name: "Host"
4. Select mode: **WebRTC P2P**
5. Click **"Join"**
6. ✅ **Expected**: Redirected to `/meeting/{meetingId}?name=Host&role=host&mode=webrtc`
7. ✅ **Expected**: Local video appears
8. ✅ **Expected**: Participant count shows "1 participant(s)"

#### Step 2: Share Meeting Link
1. Click **Share Link** button (🔗)
2. Copy the meeting URL
3. ✅ **Expected**: URL format: `https://192.168.100.218/join/{meetingId}`

#### Step 3: Join as Participant 2
1. Open Browser/Tab 2
2. Paste the meeting URL
3. Enter name: "Participant 2"
4. Select mode: **WebRTC P2P**
5. Click **"Join Meeting"**
6. ✅ **Expected**: Both participants visible in grid
7. ✅ **Expected**: Participant count shows "2 participant(s)"
8. ✅ **Expected**: Notification: "Participant 2 joined the meeting"

#### Step 4: Join as Participant 3
1. Open Browser/Tab 3
2. Paste the meeting URL
3. Enter name: "Participant 3"
4. Select mode: **WebRTC P2P**
5. Click **"Join Meeting"**
6. ✅ **Expected**: All 3 participants visible
7. ✅ **Expected**: Grid layout adjusts (2 columns)
8. ✅ **Expected**: Participant count shows "3 participant(s)"

### Success Criteria
- [ ] All participants connect successfully
- [ ] Video grid displays all participants
- [ ] Audio works for all participants
- [ ] Join/leave notifications appear
- [ ] Participant list updates in real-time

---

## TEST 3: Meeting Features

### Test 3.1: Audio/Video Controls
| Feature | Test | Expected Result |
|---------|------|-----------------|
| Mute | Host clicks mute | Mic icon red, others hear silence |
| Unmute | Host clicks unmute | Mic icon normal, others hear audio |
| Video Off | Participant 2 turns off camera | Avatar shown, others see placeholder |
| Video On | Participant 2 turns on camera | Video resumes |

### Test 3.2: Screen Share
1. Host clicks **Screen Share** button
2. Select screen/window to share
3. ✅ **Expected**: Monitor icon turns green
4. ✅ **Expected**: Other participants see shared screen
5. Host clicks **Stop Sharing**
6. ✅ **Expected**: Returns to camera view

### Test 3.3: Chat
1. Host clicks **Chat** button (💬)
2. Chat panel opens on right side
3. Type message: "Hello everyone"
4. Click **Send**
5. ✅ **Expected**: Message appears in host's chat
6. ✅ **Expected**: Message appears in all participants' chats
7. Participant 2 sends reply
8. ✅ **Expected**: All participants see the reply

### Test 3.4: Participant List
1. Click **Participants** button (👥)
2. ✅ **Expected**: Sidebar shows all participants
3. ✅ **Expected**: Each participant shows:
   - Display name
   - Role (host/participant)
   - Connection mode badge (WebRTC/SIP)
   - Mic status icon
   - Video status icon
   - Short ID

### Success Criteria
- [ ] All controls work correctly
- [ ] Screen share works
- [ ] Chat messages sync across all participants
- [ ] Participant list accurate

---

## TEST 4: Host Controls

### Prerequisites
- Meeting with host and 2+ participants

### Test 4.1: Mute All
1. Host clicks **Settings** button (⚙️)
2. Click **"Mute All Participants"**
3. ✅ **Expected**: All participants muted
4. ✅ **Expected**: Participant list shows all mics as muted

### Test 4.2: Kick Participant
1. Host opens **Host Controls**
2. Find participant in kick list
3. Click **"Kick"** button
4. ✅ **Expected**: Participant removed from meeting
5. ✅ **Expected**: Kicked participant sees disconnection
6. ✅ **Expected**: Other participants notified

### Test 4.3: End Meeting
1. Host clicks **"End Meeting for All"**
2. ✅ **Expected**: All participants disconnected
3. ✅ **Expected**: Meeting marked as ended in database

### Test 4.4: Waiting Room
1. Create new meeting with waiting room enabled
2. Participant joins via shared link
3. ✅ **Expected**: Participant enters waiting room
4. ✅ **Expected**: Host sees waiting room notification
5. Host clicks **"Admit"**
6. ✅ **Expected**: Participant joins meeting
7. Test **"Deny"** with another participant
8. ✅ **Expected**: Denied participant cannot join

### Success Criteria
- [ ] Mute all works
- [ ] Kick removes participant
- [ ] End meeting disconnects everyone
- [ ] Waiting room admit/deny works

---

## TEST 5: Layout Templates & Speaker Detection

### Test 5.1: Grid Layout (Default)
1. Join meeting with 3 participants
2. ✅ **Expected**: Grid layout with equal-sized tiles
3. ✅ **Expected**: 2-column grid for 3 participants

### Test 5.2: Speaker View
1. Click **Speaker View** button (maximize icon)
2. ✅ **Expected**: Active speaker in large view
3. ✅ **Expected**: Other participants in thumbnail strip at bottom
4. Participant 2 starts speaking
5. ✅ **Expected**: Layout switches to show Participant 2 large

### Test 5.3: Sidebar View
1. Click **Sidebar View** button (panel icon)
2. ✅ **Expected**: Main view shows active speaker
3. ✅ **Expected**: Sidebar shows other participants vertically

### Test 5.4: Speaker Detection
1. In any layout, start speaking
2. ✅ **Expected**: Green border appears around your video
3. Another participant speaks
4. ✅ **Expected**: Green border moves to active speaker
5. ✅ **Expected**: Border updates within 200ms

### Success Criteria
- [ ] All 3 layouts work correctly
- [ ] Layout switching is smooth
- [ ] Speaker detection highlights correctly
- [ ] Green border visible to all participants

---

## TEST 6: Connection Quality Monitoring

### Test Steps
1. Join a meeting
2. Click **Signal** icon (connection quality)
3. ✅ **Expected**: Quality panel opens
4. ✅ **Expected**: Shows quality indicator (Excellent/Good/Fair/Poor)
5. ✅ **Expected**: Shows metrics:
   - Bitrate (kbps)
   - Packet Loss (%)
   - Jitter (ms)
   - Latency (ms)
   - FPS
   - Resolution
6. Wait 2 seconds
7. ✅ **Expected**: Stats update automatically

### Success Criteria
- [ ] Quality panel opens
- [ ] Metrics display real values (not all zeros)
- [ ] Stats update every 2 seconds
- [ ] Quality indicator reflects actual connection

---

## TEST 7: Browser Refresh & Reconnection

### Test Steps
1. Join meeting as participant
2. Refresh browser (F5)
3. ✅ **Expected**: Participant count doesn't increase
4. ✅ **Expected**: Same participant ID reused
5. ✅ **Expected**: Video reconnects automatically

### Success Criteria
- [ ] No duplicate participants on refresh
- [ ] Reconnection works smoothly
- [ ] Participant count accurate

---

## TEST 8: Connection Modes

### Test 8.1: WebRTC P2P Mode
1. Create meeting with WebRTC mode
2. Join with 2+ participants
3. ✅ **Expected**: Blue badge shows "WebRTC"
4. ✅ **Expected**: Direct peer-to-peer connection

### Test 8.2: SIP/Verto Mode
1. Create meeting with Verto mode
2. Join with 2+ participants
3. ✅ **Expected**: Purple badge shows "SIP"
4. ✅ **Expected**: Server-based connection

### Test 8.3: Mixed Mode
1. Host joins with WebRTC
2. Participant joins with Verto
3. ✅ **Expected**: Both modes work together
4. ✅ **Expected**: Correct badges displayed

### Success Criteria
- [ ] Both connection modes work
- [ ] Mode badges display correctly
- [ ] Mixed mode participants can communicate

---

## TEST 9: Mobile Responsiveness

### Test Steps
1. Open meeting on mobile device (or resize browser to mobile width)
2. ✅ **Expected**: UI adapts to small screen
3. ✅ **Expected**: Controls remain accessible
4. ✅ **Expected**: Video grid adjusts
5. ✅ **Expected**: Touch events work

### Success Criteria
- [ ] Mobile layout works
- [ ] All features accessible on mobile
- [ ] Touch controls responsive

---

## TEST 10: Error Handling

### Test 10.1: Camera/Mic Permissions Denied
1. Join meeting
2. Deny camera/mic permissions
3. ✅ **Expected**: Clear error message displayed
4. ✅ **Expected**: Instructions to enable permissions

### Test 10.2: Network Interruption
1. Join meeting
2. Disconnect network briefly
3. Reconnect network
4. ✅ **Expected**: Connection recovers (or clear error)

### Test 10.3: Invalid Meeting ID
1. Navigate to `/meeting/invalid-id`
2. ✅ **Expected**: Error message or redirect

### Success Criteria
- [ ] Error messages are clear
- [ ] Recovery mechanisms work
- [ ] No crashes or blank screens

---

## Test Results Summary

### Date: _____________
### Tester: _____________

| Test Category | Status | Notes |
|---------------|--------|-------|
| 1:1 Calls | ⏳ | |
| Meeting Rooms (3+) | ⏳ | |
| Audio/Video Controls | ⏳ | |
| Screen Share | ⏳ | |
| Chat | ⏳ | |
| Host Controls | ⏳ | |
| Waiting Room | ⏳ | |
| Layout Templates | ⏳ | |
| Speaker Detection | ⏳ | |
| Quality Monitoring | ⏳ | |
| Browser Refresh | ⏳ | |
| Connection Modes | ⏳ | |
| Mobile Responsive | ⏳ | |
| Error Handling | ⏳ | |

### Issues Found
1. 
2. 
3. 

### Overall Assessment
- [ ] All core features working
- [ ] Ready for production
- [ ] Needs fixes before production

---

## Quick Test Commands

### Check Service Health
```bash
# All services status
docker compose -f docker-compose.prod.yml ps

# Backend logs
docker compose -f docker-compose.prod.yml logs -f backend

# FreeSWITCH status
docker exec sip-and-webrtc-freeswitch-1 fs_cli -x "status"

# Database check
docker exec sip-and-webrtc-postgres-1 psql -U postgres -d sip_meetings -c "SELECT COUNT(*) FROM meetings WHERE status = 'ACTIVE';"
```

### Test URLs
- **Home**: https://192.168.100.218
- **Create Call**: Click button on home page
- **Create Meeting**: Click button on home page
- **Join Meeting**: Use shared link from meeting

---

## Notes for Tester

1. **Use HTTPS**: Application requires HTTPS for camera/mic access
2. **Multiple Browsers**: Use Chrome, Firefox, Edge for cross-browser testing
3. **Incognito Mode**: Use for multiple participants on same machine
4. **Console Logs**: Check browser console (F12) for errors
5. **Network Tab**: Monitor WebSocket connections
6. **Quality Logs**: Look for `[Quality]` logs in console

---

## Post-Testing Checklist

After completing all tests:
- [ ] Document all issues found
- [ ] Verify database cleanup (no ghost participants)
- [ ] Check for memory leaks (long-running test)
- [ ] Review logs for errors
- [ ] Test on different browsers
- [ ] Test on mobile devices
- [ ] Verify TURN/STUN fallback works
