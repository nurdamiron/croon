const http = require('http');

const PORT = 3001;
const BASE_URL = `http://localhost:${PORT}`;

const testCases = [
  { path: '/', expectedStatus: 307, expectedRedirect: '/admin' },
  { path: '/client_account/login', expectedStatus: 200 },
  { path: '/forgot-password', expectedStatus: 200 },
  { path: '/reset-password', expectedStatus: 200 },
  { path: '/admin', expectedStatus: 307, expectedRedirect: '/client_account/login' },
  { path: '/admin/products', expectedStatus: 307, expectedRedirect: '/client_account/login' },
  { path: '/admin/orders', expectedStatus: 307, expectedRedirect: '/client_account/login' },
  { path: '/admin/categories', expectedStatus: 307, expectedRedirect: '/client_account/login' },
  { path: '/admin/kaspi', expectedStatus: 307, expectedRedirect: '/client_account/login' },
  { path: '/admin/settings', expectedStatus: 307, expectedRedirect: '/client_account/login' },
  { path: '/collection/arduino', expectedStatus: 307, expectedRedirect: '/admin' },
  { path: '/product/arduino-uno-r3', expectedStatus: 307, expectedRedirect: '/admin' },
  { path: '/cart', expectedStatus: 307, expectedRedirect: '/admin' },
];

function checkRoute(path) {
  return new Promise((resolve) => {
    http.get(`${BASE_URL}${path}`, (res) => {
      resolve({
        statusCode: res.statusCode,
        location: res.headers.location || null
      });
    }).on('error', (err) => {
      resolve({
        error: err.message
      });
    });
  });
}

async function runTests() {
  console.log(`=== Testing Endpoints on ${BASE_URL} ===\n`);
  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    const res = await checkRoute(tc.path);
    if (res.error) {
      console.log(`❌ FAIL: ${tc.path}`);
      console.log(`   Error: ${res.error}`);
      failed++;
      continue;
    }

    let ok = true;
    let detail = `status: ${res.statusCode}`;
    
    if (res.statusCode !== tc.expectedStatus) {
      ok = false;
      detail += ` (expected ${tc.expectedStatus})`;
    }

    if (tc.expectedRedirect) {
      if (!res.location || !res.location.endsWith(tc.expectedRedirect)) {
        ok = false;
        detail += `, redirect: ${res.location || 'none'} (expected ${tc.expectedRedirect})`;
      } else {
        detail += `, redirect: ${res.location}`;
      }
    }

    if (ok) {
      console.log(`✅ PASS: ${tc.path} (${detail})`);
      passed++;
    } else {
      console.log(`❌ FAIL: ${tc.path} (${detail})`);
      failed++;
    }
  }

  console.log(`\n=== Summary: Passed ${passed}/${testCases.length} ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
