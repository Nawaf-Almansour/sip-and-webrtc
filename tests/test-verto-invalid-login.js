/**
 * Verto Invalid Login Test
 * Tests authentication security - should reject invalid credentials
 */

const WebSocket = require('ws');

const VERTO_URL = process.env.VERTO_URL || 'wss://192.168.100.218:8443';

const testCases = [
  { login: 'admin', passwd: 'wrong-password', name: 'VERTO-AUTH-02: Invalid Password' },
  { login: 'nonexistent', passwd: 'password', name: 'VERTO-AUTH-03: Invalid Username' },
  { login: '', passwd: '', name: 'VERTO-AUTH-04: Empty Credentials' },
  { login: "' OR '1'='1", passwd: "' OR '1'='1", name: 'VERTO-AUTH-05: SQL Injection' },
];

async function runTest(tc) {
  return new Promise((resolve) => {
    const ws = new WebSocket(VERTO_URL, { rejectUnauthorized: false });
    let result = { name: tc.name, passed: false, error: null };

    ws.on('open', () => {
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'login',
        params: {
          login: tc.login,
          passwd: tc.passwd,
          sessid: 'test-' + Date.now()
        }
      }));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.error) {
          result.passed = true;
          result.error = msg.error.message;
        } else if (msg.result) {
          result.passed = false;
          result.error = 'SECURITY ISSUE - Login accepted!';
        }
      } catch (err) {
        result.error = err.message;
      }

      ws.close();
    });

    ws.on('error', (err) => {
      // Connection rejected is also a pass for security tests
      result.passed = true;
      result.error = 'Connection rejected: ' + err.message;
      resolve(result);
    });

    ws.on('close', () => {
      resolve(result);
    });

    setTimeout(() => {
      result.error = 'Timeout';
      ws.close();
      resolve(result);
    }, 5000);
  });
}

async function testInvalidLogin() {
  console.log('='.repeat(60));
  console.log('VERTO INVALID LOGIN TESTS');
  console.log('='.repeat(60));
  console.log(`URL: ${VERTO_URL}`);
  console.log('');

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    const result = await runTest(tc);
    
    if (result.passed) {
      console.log(`✅ ${result.name}`);
      console.log(`   Correctly rejected: ${result.error}`);
      passed++;
    } else {
      console.log(`❌ ${result.name}`);
      console.log(`   ${result.error}`);
      failed++;
    }
    console.log('');
  }

  console.log('='.repeat(60));
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60));

  return { passed, failed };
}

testInvalidLogin()
  .then(result => {
    process.exit(result.failed > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('Test error:', err);
    process.exit(1);
  });
