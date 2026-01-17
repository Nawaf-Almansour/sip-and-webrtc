# Phase 2: FreeSWITCH SFU Multi-Track Testing Checklist

**Status:** ✅ Implementation Complete - Ready for Testing  
**Date:** 2026-01-18  
**Build Status:** ✅ Successful (no compilation errors)

---

## 🎯 What Was Implemented

### Phase 2.1: FreeSWITCH Configuration ✅
- `video-main` profile for camera streams (1280x720@30fps, 1mb)
- `video-screen` profile for screen share (1920x1080@15fps, 2mb)
- Jitter buffer (50ms) for smooth screen share
- Dialplan routing for `room-{id}-main` and `room-{id}-screen`
- Supports up to 50 participants in main, 10 in screen

### Phase 2.2: Dialplan Routing ✅
- Separate conference routing
- Regex pattern matching
- Backward compatible with legacy routing

### Phase 2.3: Verto Service Dual Sessions ✅
- `joinMainConference()` - Audio + camera
- `startScreenShare()` - Separate screen call
- `stopScreenShare()` - Cleanup
- `subscribeToScreenRoom()` - See others' screens
- Video-only screen share (no audio)

### Phase 2.4: MediaService Integration ✅
- Verto mode screen track support
- Automatic mode detection
- Wrapper methods for Verto operations

---

## 🧪 Testing Checklist

### Test 1: FreeSWITCH Configuration Verification

**Prerequisites:**
- FreeSWITCH must be restarted after configuration changes
- Access to FreeSWITCH CLI

**Test Steps:**

- [ ] **1.1 Restart FreeSWITCH**
  ```bash
  docker-compose restart freeswitch
  # OR
  systemctl restart freeswitch
  ```

- [ ] **1.2 Verify Conference Profiles**
  ```bash
  fs_cli -x "conference list"
  # Should show video-main and video-screen profiles
  ```

- [ ] **1.3 Check Dialplan**
  ```bash
  fs_cli -x "reloadxml"
  fs_cli -x "show dialplan"
  # Should show conference-main and conference-screen extensions
  ```

**Expected Results:**
- ✅ FreeSWITCH restarts without errors
- ✅ New conference profiles loaded
- ✅ Dialplan extensions active

---

### Test 2: Verto Mode 5+ Participants

**Setup:**
1. Open 5 browser windows (different users)
2. All join the same meeting in **Verto/SIP mode**
3. Ensure FreeSWITCH is running

**Test Steps:**

- [ ] **2.1 All Join Main Conference**
  - [ ] All 5 participants join successfully
  - [ ] All see each other's cameras
  - [ ] Audio works for all
  - [ ] Video quality acceptable

- [ ] **2.2 One User Shares Screen (Verto)**
  - [ ] User A clicks "Share Screen"
  - [ ] User A sees: Screen (main) + Camera (PiP)
  - [ ] Other 4 users see: User A's screen + camera PiP
  - [ ] 📺 indicator appears
  - [ ] No audio echo or feedback

- [ ] **2.3 Stop Screen Share (Verto)**
  - [ ] User A clicks "Stop Sharing"
  - [ ] All users see cameras only
  - [ ] 📺 indicator disappears
  - [ ] No stuck state

- [ ] **2.4 Different User Shares Screen**
  - [ ] User B starts screen share
  - [ ] All users see User B's screen
  - [ ] User A's previous share fully cleaned up

**Expected Results:**
- ✅ 5+ participants work smoothly
- ✅ Screen share via separate SIP call
- ✅ No audio on screen call
- ✅ Clean transitions

---

### Test 3: Mixed Mode (WebRTC + Verto)

**Setup:**
1. 2 users in WebRTC P2P mode
2. 3 users in Verto/SIP mode
3. All in same meeting

**Test Steps:**

- [ ] **3.1 Cross-Mode Communication**
  - [ ] WebRTC users see Verto users
  - [ ] Verto users see WebRTC users
  - [ ] Audio works across modes
  - [ ] Video works across modes

- [ ] **3.2 WebRTC User Shares Screen**
  - [ ] WebRTC user shares (P2P multi-track)
  - [ ] Other WebRTC user sees screen + camera
  - [ ] Verto users see the share
  - [ ] No conflicts

- [ ] **3.3 Verto User Shares Screen**
  - [ ] Verto user shares (separate call)
  - [ ] Other Verto users see screen + camera
  - [ ] WebRTC users see the share
  - [ ] No conflicts

**Expected Results:**
- ✅ Mixed mode works
- ✅ Both multi-track approaches compatible
- ✅ No mode-specific issues

---

### Test 4: Screen Share Enforcement (Future)

> **Note:** Phase 2 implements separate calls but not yet backend enforcement

- [ ] **4.1 Multiple Simultaneous Shares**
  - [ ] User A shares screen (Verto)
  - [ ] User B tries to share (Verto)
  - [ ] Expected: Both can share (no enforcement yet)
  - [ ] Note: Backend enforcement is Phase 2.2 (not implemented)

**Expected Results:**
- ⚠️ Multiple shares allowed (enforcement pending)
- ✅ No crashes or errors
- ✅ Both shares work independently

---

### Test 5: Performance & Scalability

- [ ] **5.1 Large Meeting (10 participants)**
  - [ ] 10 users join Verto conference
  - [ ] All cameras visible
  - [ ] 1 user shares screen
  - [ ] Check CPU usage on server
  - [ ] Check bandwidth usage
  - [ ] Verify acceptable performance

- [ ] **5.2 Long Session**
  - [ ] Run meeting for 15+ minutes
  - [ ] Toggle screen share multiple times
  - [ ] Check for memory leaks
  - [ ] Verify stability

- [ ] **5.3 Network Conditions**
  - [ ] Test with slow network
  - [ ] Verify jitter buffer helps
  - [ ] Check reconnection logic

**Expected Results:**
- ✅ Scales to 10+ participants
- ✅ Stable over time
- ✅ Handles network issues

---

### Test 6: FreeSWITCH Logs Verification

- [ ] **6.1 Check Conference Logs**
  ```bash
  fs_cli
  > console loglevel debug
  # Join meeting and check logs
  ```

- [ ] **6.2 Verify Separate Conferences**
  - [ ] See "Joining main conference: {id}-main"
  - [ ] See "Joining screen conference: {id}-screen"
  - [ ] Confirm separate conference instances

- [ ] **6.3 Check for Errors**
  - [ ] No SDP negotiation errors
  - [ ] No codec errors
  - [ ] No conference errors

**Expected Results:**
- ✅ Clean logs
- ✅ Separate conferences visible
- ✅ No errors or warnings

---

## ⚠️ Known Limitations (Phase 2)

1. **No Backend Enforcement Yet**:
   - Multiple users can share screens simultaneously
   - Backend enforcement (409 Conflict) not implemented
   - Will be added in Phase 2.2 completion

2. **Verto Mode Only**:
   - Multi-track via separate calls only works in Verto mode
   - WebRTC P2P uses Phase 1 implementation
   - This is by design (different architectures)

3. **FreeSWITCH Required**:
   - Phase 2 requires FreeSWITCH running
   - Must restart FreeSWITCH after config changes
   - Dialplan must be reloaded

---

## 📊 Test Results Template

### Test Session: [Date/Time]

**Mode:** Verto/SIP  
**Participants:** [5/10/more]  
**FreeSWITCH Version:** [version]

| Test | Status | Notes |
|------|--------|-------|
| 1.1 FreeSWITCH Restart | ⏳ | |
| 1.2 Verify Profiles | ⏳ | |
| 1.3 Check Dialplan | ⏳ | |
| 2.1 All Join Main | ⏳ | |
| 2.2 One Shares Screen | ⏳ | |
| 2.3 Stop Sharing | ⏳ | |
| 2.4 Different User Shares | ⏳ | |
| 3.x Mixed Mode | ⏳ | |
| 5.x Performance | ⏳ | |
| 6.x Logs Verification | ⏳ | |

**Overall Status:** ⏳ Not Tested / ✅ Pass / ❌ Fail

**Issues Found:**
1. [Issue description]
2. [Issue description]

**Notes:**
- [Any additional observations]

---

## 🚀 How to Test

### Quick Start

1. **Restart FreeSWITCH:**
   ```bash
   docker-compose restart freeswitch
   ```

2. **Verify Configuration:**
   ```bash
   fs_cli -x "conference list"
   fs_cli -x "reloadxml"
   ```

3. **Start Backend:**
   ```bash
   cd backend
   npm run dev
   ```

4. **Access Application:**
   - Open: `https://192.168.100.218`
   - Create meeting
   - Select **Verto/SIP mode** when joining
   - Join from 5+ browser windows

5. **Test Screen Share:**
   - Click "Share Screen" button
   - Verify separate SIP call created
   - Check FreeSWITCH logs for "screen conference"

### Testing Tips

- **Use fs_cli**: Monitor FreeSWITCH in real-time
- **Check Logs**: `docker logs -f freeswitch`
- **Verify Separate Calls**: Should see 2 calls per sharing user
- **Monitor Resources**: Check CPU/memory usage
- **Test Cleanup**: Ensure screen call ends properly

---

## 📝 Next Steps After Testing

### If Tests Pass ✅
1. Mark Phase 2 as complete in `IMPLEMENTATION_PHASES.md`
2. Implement Phase 2.2 (Backend enforcement) if needed
3. Proceed to Phase 3 (Production Polish)

### If Tests Fail ❌
1. Document issues in this file
2. Check FreeSWITCH logs for errors
3. Verify dialplan routing
4. Test with fewer participants first
5. Fix critical issues before proceeding

---

## 🎯 Success Criteria

Phase 2 is considered successful if:

- [x] Build completes without errors ✅
- [ ] FreeSWITCH configuration loads correctly
- [ ] 5+ participants work in Verto mode
- [ ] Screen share via separate SIP call works
- [ ] No audio echo on screen call
- [ ] Separate conferences visible in logs
- [ ] Performance acceptable for 10+ participants
- [ ] No critical bugs or crashes

**Status:** 🔄 Ready for Testing

---

**Last Updated:** 2026-01-18  
**Implemented By:** Phase 2.1-2.3  
**Commit:** 137ab35
