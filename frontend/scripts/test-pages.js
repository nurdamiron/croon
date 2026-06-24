const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = '/Users/nurdauletakhmatov/.gemini/antigravity-ide/brain/7b1447a8-4db5-403b-83e9-69fb0cb051e1';
const SCREENSHOTS_DIR = path.join(ARTIFACT_DIR, 'screenshots');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function verifyPage(page, urlPath, name) {
  const url = `http://localhost:3001${urlPath}`;
  console.log(`Navigating to ${url}...`);
  await page.goto(url, { waitUntil: 'networkidle' });
  
  // Wait a short time for hydration/rendering
  await page.waitForTimeout(2000);
  
  const screenshotPath = path.join(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`Saved screenshot for ${name} at ${screenshotPath}`);
  
  // Verify no crash/error page is showing
  const bodyText = await page.innerText('body');
  if (bodyText.includes('Internal Server Error') || bodyText.includes('Unhandled Runtime Error') || bodyText.includes('Application error')) {
    throw new Error(`Page ${urlPath} crashed with error text!`);
  }
}

async function run() {
  console.log('Starting Playwright browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  try {
    // 1. Visit root to check redirect
    console.log('Checking root redirect...');
    await page.goto('http://localhost:3001/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const redirectedUrl = page.url();
    console.log(`Root redirected to: ${redirectedUrl}`);
    if (!redirectedUrl.includes('/client_account/login')) {
      throw new Error(`Expected redirect to /client_account/login but got ${redirectedUrl}`);
    }
    
    // Save screenshot of login page
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01_login_page.png') });

    // 2. Perform Login
    console.log('Logging in as admin...');
    await page.fill('input[type="email"]', 'admin@croon.kz');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    
    // Wait for navigation/redirection to admin
    await page.waitForURL('**/admin', { timeout: 10000 });
    console.log('Login successful! Redirected to /admin.');

    // 3. Verify Admin Dashboard
    await verifyPage(page, '/admin', '02_admin_dashboard');

    // 4. Verify Admin Products
    await verifyPage(page, '/admin/products', '03_admin_products');

    // 5. Verify Admin Orders
    await verifyPage(page, '/admin/orders', '04_admin_orders');

    // 6. Verify Admin Categories
    await verifyPage(page, '/admin/categories', '05_admin_categories');

    // 7. Verify Admin Kaspi
    await verifyPage(page, '/admin/kaspi', '06_admin_kaspi');

    // 8. Verify Admin Settings
    await verifyPage(page, '/admin/settings', '07_admin_settings');

    console.log('All pages verified successfully!');
  } catch (error) {
    console.error('Verification failed:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
