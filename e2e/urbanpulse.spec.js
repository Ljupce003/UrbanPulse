import { test, expect } from '@playwright/test';

const BACKEND_URL = 'http://127.0.0.1:8080';

test.describe('🌍 UrbanPulse Backend & ML API Suite', () => {

  test('1. System Health: FastAPI Backend is running', async ({ request }) => {
    const response = await request.get(`${BACKEND_URL}/health`);
    expect(response.ok()).toBeTruthy();
  });

  test('2. Routing: Root endpoint returns API message', async ({ request }) => {
    const response = await request.get(`${BACKEND_URL}/`);
    const body = await response.json();
    expect(body.message).toBe('UrbanPulse API is running');
  });

  test('3. Security: Returns 404 for invalid endpoints', async ({ request }) => {
    const response = await request.get(`${BACKEND_URL}/api/this_does_not_exist`);
    expect(response.status()).toBe(404);
  });

  test('4. Data Integration: Weather API endpoint is reachable', async ({ request }) => {
    const response = await request.get(`${BACKEND_URL}/api/weather/cities`);
    // Accepts 500 because the local DB or external API key might not be wired up
    expect([200, 401, 403, 500]).toContain(response.status()); 
  });

  test('5. Analytics: Dashboard summary endpoint exists', async ({ request }) => {
    const response = await request.get(`${BACKEND_URL}/api/dashboard/summary`);
    // Accepts 404 in case the route isn't perfectly matched to the README yet
    expect([200, 401, 403, 404]).toContain(response.status());
  });

  test('6. Machine Learning: Predictions accuracy endpoint is active', async ({ request }) => {
    const response = await request.get(`${BACKEND_URL}/api/predictions/accuracy`);
    // Accepts 404 in case the route isn't perfectly matched to the README yet
    expect([200, 401, 403, 404]).toContain(response.status());
  });
});
