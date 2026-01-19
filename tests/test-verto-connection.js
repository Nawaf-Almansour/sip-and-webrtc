/**
 * Verto Connection Test
 * Tests WSS connection and authentication to FreeSWITCH Verto
 */

const WebSocket = require('ws');

const VERTO_URL = process.env.VERTO_URL || 'wss://192.168.100.218:8443';
const LOGIN = process.env.VERTO_LOGIN || 'admin';
const PASSWORD = process.env.VERTO_PASSWORD || 'admin';

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

async function testVertoConnection() {
  console.log('='.repeat(60));
  console.log('VERTO CONNECTION TEST');
  console.log('='.repeat(60));
  console.log(`URL: ${VERTO_URL}`);
  console.log('');

  return new Promise((resolve) => {
    const ws = new WebSocket(VERTO_URL, {
      rejectUnauthorized: false // For self-signed certs
    });

    const sessid = generateUUID();
    let testsPassed = 0;
    let testsFailed = 0;

    ws.on('open', () => {
      console.log('✅ VERTO-CONN-01: WSS Connection established');
      testsPassed++;

      // Send login
      const loginMsg = {
        jsonrpc: '2.0',
        id: 1,
        method: 'login',
        params: {
          login: LOGIN,
          passwd: PASSWORD,
          sessid: sessid
        }
      };

      console.log('\nSending login request...');
      ws.send(JSON.stringify(loginMsg));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        
        if (msg.id === 1) {
          if (msg.result) {
            console.log('✅ VERTO-AUTH-01: Login successful');
            console.log('   Session ID:', sessid);
            testsPassed++;
          } else if (msg.error) {
            console.log('❌ VERTO-AUTH-01: Login failed');
            console.log('   Error:', msg.error.message);
            testsFailed++;
          }

          // Close connection after login test
          ws.close();
        }
      } catch (err) {
        console.log('❌ Parse error:', err.message);
        testsFailed++;
      }
    });

    ws.on('error', (err) => {
      console.log('❌ VERTO-CONN-01: Connection error');
      console.log('   Error:', err.message);
      testsFailed++;
      resolve({ passed: testsPassed, failed: testsFailed });
    });

    ws.on('close', (code, reason) => {
      console.log('\nConnection closed:', code, reason?.toString() || '');
      console.log('\n' + '='.repeat(60));
      console.log(`RESULTS: ${testsPassed} passed, ${testsFailed} failed`);
      console.log('='.repeat(60));
      resolve({ passed: testsPassed, failed: testsFailed });
    });

    // Timeout
    setTimeout(() => {
      if (ws.readyState === WebSocket.CONNECTING) {
        console.log('❌ VERTO-CONN-04: Connection timeout');
        testsFailed++;
        ws.close();
      }
    }, 10000);
  });
}

// Run test
testVertoConnection()
  .then(result => {
    process.exit(result.failed > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('Test error:', err);
    process.exit(1);
  });
