const BASE_URL = process.argv[2] || 'https://croon-bgms08v8i-nurdaulet-akhmatovs-projects.vercel.app';

async function testLogin() {
  console.log(`Testing NextAuth login flow on ${BASE_URL}...\n`);

  try {
    // 1. Get CSRF token and cookies
    console.log('Step 1: Fetching CSRF token...');
    const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`);
    if (!csrfRes.ok) {
      throw new Error(`Failed to fetch CSRF: ${csrfRes.status} ${csrfRes.statusText}`);
    }
    
    const csrfData = await csrfRes.json();
    const csrfToken = csrfData.csrfToken;
    console.log(`CSRF Token retrieved: ${csrfToken ? 'OK' : 'FAIL'}`);
    
    // Extract cookies
    const setCookieHeaders = csrfRes.headers.getSetCookie 
      ? csrfRes.headers.getSetCookie() 
      : (csrfRes.headers.get('set-cookie') ? [csrfRes.headers.get('set-cookie')] : []);
    
    console.log(`Set-Cookie headers from CSRF step:`, setCookieHeaders);

    // 2. Perform Login POST
    console.log('\nStep 2: Submitting login credentials...');
    
    const body = new URLSearchParams();
    body.append('csrfToken', csrfToken);
    body.append('email', 'admin@croon.kz');
    body.append('password', 'admin123');
    body.append('json', 'true'); // next-auth option to return JSON instead of redirecting

    const loginRes = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': setCookieHeaders.map(c => c.split(';')[0]).join('; ')
      },
      body: body.toString()
    });

    console.log(`Response status: ${loginRes.status}`);
    const resHeaders = loginRes.headers.getSetCookie 
      ? loginRes.headers.getSetCookie() 
      : (loginRes.headers.get('set-cookie') ? [loginRes.headers.get('set-cookie')] : []);
    
    console.log('Set-Cookie headers from Login step:', resHeaders);

    const loginData = await loginRes.json();
    console.log('\nResponse Data:', JSON.stringify(loginData, null, 2));

    if (loginData.url && !loginData.error) {
      console.log('\n✅ LOGIN SUCCESSFUL!');
    } else {
      console.log('\n❌ LOGIN FAILED:', loginData.error || 'Unknown error');
    }

  } catch (error) {
    console.error('\n❌ ERROR during login test:', error.message);
  }
}

testLogin();
