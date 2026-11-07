import { defineConfig, devices } from '@playwright/test';
import { E2E } from './scripts/e2e-prepare.mjs';

// Entorno aislado (base adhera_test, puertos 3100/4100). Ejecutar con `pnpm test:e2e`,
// que antes recrea la base de pruebas y compila. No usa la base ni los servidores de la demo.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${E2E.webPort}`, trace: 'retain-on-failure', locale: 'es-AR' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /(mobile|v2-.*)\.spec\.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
    // Preentrevista v2: publica la nueva versión, por eso corre después de las pruebas de v1.
    { name: 'v2', use: { ...devices['Desktop Chrome'] }, testMatch: /v2-.*\.spec\.ts/, dependencies: ['desktop', 'mobile'] },
  ],
  webServer: [
    {
      command: 'node e2e/mock-graph.mjs',
      url: `http://localhost:${E2E.graphPort}/_health`,
      reuseExistingServer: false,
      timeout: 20_000,
      env: { MOCK_GRAPH_PORT: E2E.graphPort, MOCK_GRAPH_TOKEN: E2E.whatsapp.WHATSAPP_ACCESS_TOKEN },
    },
    {
      command: 'node dist/main.js',
      cwd: 'apps/api',
      url: `http://localhost:${E2E.apiPort}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        APP_ENV: 'test',
        API_PORT: E2E.apiPort,
        DATABASE_URL: E2E.dbUrl,
        DIRECT_URL: E2E.dbUrl,
        WEB_ORIGIN: `http://localhost:${E2E.webPort}`,
        SIMULATOR_STARTS_PER_HOUR: '1000',
        SIMULATOR_STARTS_PER_HOUR_GLOBAL: '1000',
        PROXY_SECRET: E2E.proxySecret,
        ...E2E.whatsapp,
      },
    },
    {
      command: `pnpm exec next start -p ${E2E.webPort}`,
      cwd: 'apps/web',
      url: `http://localhost:${E2E.webPort}/login`,
      reuseExistingServer: false,
      timeout: 90_000,
      env: { NEXT_DIST_DIR: '.next-e2e', API_URL: `http://localhost:${E2E.apiPort}`, PROXY_SECRET: E2E.proxySecret },
    },
  ],
});
