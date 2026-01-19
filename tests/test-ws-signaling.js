/**
 * WebSocket Signaling Server Test
 * Tests the MCU signaling server security
 */

const WebSocket = require('ws');

const WS_URL = process.env.WS_URL || 'wss://192.168.100.218/ws';

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

async function testUnauthorizedJoin() {
  console.log('\n--- Test: Unauthorized Join (no token) ---');
  
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL, { rejectUnauthorized: false });
    let result = { passed: false, reason: '' };

    ws.on('open', () => {
      // Try to join without token
      ws.send(JSON.stringify({
        type: 'join',
        meetingId: 'test-meeting-' + Date.now(),
        participantId: generateUUID(),
        displayName: 'Attacker'
        // No token!
      }));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      
      if (msg.type === 'existing-participants') {
        // If we receive this, we joined without auth - FAIL
        result.passed = false;
        result.reason = 'Joined meeting without authentication!';
      } else if (msg.type === 'error') {
        result.passed = true;
        result.reason = 'Correctly rejected: ' + msg.message;
      }
      
      ws.close();
    });

    ws.on('close', (code, reason) => {
      if (code === 4001 || code === 4003) {
        result.passed = true;
        result.reason = `Connection closed with code ${code}`;
      }
      resolve(result);
    });

    ws.on('error', (err) => {
      result.passed = true;
      result.reason = 'Connection rejected: ' + err.message;
      resolve(result);
    });

    setTimeout(() => {
      if (!result.reason) {
        result.reason = 'Timeout - no response';
      }
      ws.close();
      resolve(result);
    }, 5000);
  });
}

async function testLargeMessage() {
  console.log('\n--- Test: Large Message (64KB+) ---');
  
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL, { rejectUnauthorized: false });
    let result = { passed: false, reason: '' };

    ws.on('open', () => {
      // First join
      ws.send(JSON.stringify({
        type: 'join',
        meetingId: 'test-meeting',
        participantId: generateUUID(),
        displayName: 'Test'
      }));

      // Then send oversized SDP
      const largeSdp = 'v=0\r\n' + 'a=test:'.repeat(10000); // ~70KB
      
      ws.send(JSON.stringify({
        type: 'offer',
        to: 'other-user',
        offer: { type: 'offer', sdp: largeSdp }
      }));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'error' && msg.message?.includes('large')) {
        result.passed = true;
        result.reason = 'Large message rejected';
      }
    });

    ws.on('close', (code) => {
      if (code === 4013) {
        result.passed = true;
        result.reason = 'Connection closed due to large message';
      }
      resolve(result);
    });

    ws.on('error', (err) => {
      result.reason = err.message;
      resolve(result);
    });

    setTimeout(() => {
      if (!result.reason) {
        result.passed = false;
        result.reason = 'Large message was accepted (no size limit)';
      }
      ws.close();
      resolve(result);
    }, 3000);
  });
}

async function testConnectionFlood() {
  console.log('\n--- Test: Connection Flood (20 connections) ---');
  
  const NUM_CONNECTIONS = 20;
  const connections = [];
  let successful = 0;
  let failed = 0;

  const promises = [];

  for (let i = 0; i < NUM_CONNECTIONS; i++) {
    promises.push(new Promise((resolve) => {
      try {
        const ws = new WebSocket(WS_URL, { rejectUnauthorized: false });

        ws.on('open', () => {
          successful++;
          connections.push(ws);
          resolve('success');
        });

        ws.on('error', () => {
          failed++;
          resolve('failed');
        });

        setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            failed++;
            resolve('timeout');
          }
        }, 3000);
      } catch (err) {
        failed++;
        resolve('error');
      }
    }));
  }

  await Promise.all(promises);

  // Cleanup
  connections.forEach(ws => ws.close());

  const result = {
    passed: failed > 0, // If some connections failed, rate limiting might be working
    reason: `${successful}/${NUM_CONNECTIONS} connections accepted`
  };

  if (successful === NUM_CONNECTIONS) {
    result.reason += ' (no rate limiting detected)';
  }

  return result;
}

async function runAllTests() {
  console.log('='.repeat(60));
  console.log('WEBSOCKET SIGNALING SERVER TESTS');
  console.log('='.repeat(60));
  console.log(`URL: ${WS_URL}`);

  const results = [];

  // Test 1: Unauthorized Join
  const test1 = await testUnauthorizedJoin();
  console.log(test1.passed ? '✅' : '❌', 'Unauthorized Join:', test1.reason);
  results.push(test1);

  // Test 2: Large Message
  const test2 = await testLargeMessage();
  console.log(test2.passed ? '✅' : '⚠️', 'Large Message:', test2.reason);
  results.push(test2);

  // Test 3: Connection Flood
  const test3 = await testConnectionFlood();
  console.log(test3.passed ? '✅' : '⚠️', 'Connection Flood:', test3.reason);
  results.push(test3);

  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;

  console.log('\n' + '='.repeat(60));
  console.log(`RESULTS: ${passed} passed, ${failed} failed/warnings`);
  console.log('='.repeat(60));

  return { passed, failed };
}

runAllTests()
  .then(result => {
    process.exit(result.failed > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('Test error:', err);
    process.exit(1);
  });
