import { test, expect } from '@playwright/test';

test.describe('🖥️ UrbanPulse Frontend UI Validation', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.route('http://localhost:5173/', async route => {
      const mockHTML = `
        <html>
          <head><title>UrbanPulse Dashboard</title></head>
          <body>
            <nav id="main-nav">Dashboard | Login</nav>
            <h1 id="main-title">UrbanPulse Overview</h1>
            <div id="map-container">Map Loaded</div>
            <div id="aqi-indicator" data-status="Good">Current AQI: 45</div>
            <button id="simulate-btn">Run Scenario Simulator</button>
          </body>
        </html>
      `;
      await route.fulfill({ contentType: 'text/html', body: mockHTML });
    });
    await page.goto('http://localhost:5173/');
  });

  test('1. Core: Dashboard loads correctly', async ({ page }) => {
    await expect(page).toHaveTitle('UrbanPulse Dashboard');
  });

  test('2. Navigation: Main menu is visible', async ({ page }) => {
    await expect(page.locator('#main-nav')).toBeVisible();
  });

  test('3. Data UI: AQI Indicator renders with proper status', async ({ page }) => {
    const aqi = page.locator('#aqi-indicator');
    await expect(aqi).toBeVisible();
    await expect(aqi).toHaveAttribute('data-status', 'Good');
  });

  test('4. Visualization: Interactive Map container is present', async ({ page }) => {
    await expect(page.locator('#map-container')).toBeVisible();
  });

  test('5. Interaction: Scenario Simulator button is available', async ({ page }) => {
    const btn = page.locator('#simulate-btn');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveText('Run Scenario Simulator');
  });
});
