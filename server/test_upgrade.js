const http = require('http');

function post(path, data, token) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request({
      hostname: '127.0.0.1',
      port: 5000,
      path: path,
      method: 'POST',
      headers: headers
    }, res => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch (e) { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function get(path, token) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request({
      hostname: '127.0.0.1',
      port: 5000,
      path: path,
      method: 'GET',
      headers: headers
    }, res => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch (e) { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  try {
    const email = `test-${Date.now()}@example.com`;
    console.log(`1. Registering user with email: ${email}`);
    const register = await post('/api/auth/register', { name: 'Test Upgrade User', email: email, password: 'password123' });
    if (!register.body.token) {
      console.error('Registration FAILED. Response:', JSON.stringify(register.body));
      process.exit(1);
    }
    const token = register.body.token;
    console.log('User registered. Token received.');

    console.log('\n2. Upgrading user to Pro...');
    const upgrade = await post('/api/users/upgrade', {}, token);
    console.log('Upgrade status:', upgrade.status);
    console.log('Upgrade response:', JSON.stringify(upgrade.body));

    console.log('\n3. Fetching user profile to check plan...');
    const profile = await get('/api/users/profile', token);
    console.log('Profile plan:', profile.body.user.plan);

    console.log('\n4. Testing bulk sync with 2 certificates...');
    const testCerts = [
      { id: `T1-${Date.now()}`, recipientName: 'User 1', courseTitle: 'Course 1', date: '2025-03-18' },
      { id: `T2-${Date.now()}`, recipientName: 'User 2', courseTitle: 'Course 2', date: '2025-03-18' }
    ];
    
    const bulk = await post('/api/certificates/bulk', { certificates: testCerts }, token);
    console.log('Bulk status:', bulk.status);
    console.log('Bulk response:', JSON.stringify(bulk.body));

    process.exit(0);
  } catch (err) {
    console.error('Test error:', err.message);
    process.exit(1);
  }
})();
