// Prepara un entorno E2E aislado: base `adhera_test` recreada desde cero, API compilada
// y web compilada en `.next-e2e` apuntando a la API de pruebas (puerto 4100).
// No toca la base `adhera` de la demo.
import { execSync } from 'node:child_process';

export const E2E = {
  dbUrl: 'postgresql://adhera:adhera_local_only@localhost:5433/adhera_test?schema=public',
  apiPort: '4100',
  webPort: '3100',
  graphPort: '4199',
  // Clave ficticia compartida entre panel y API sólo para pruebas.
  proxySecret: 'e2e-proxy-secret-only-for-local-tests',
  // Credenciales ficticias sólo para pruebas (el Graph API es un servidor falso local).
  whatsapp: {
    WHATSAPP_ENABLED: 'true',
    WHATSAPP_VERIFY_TOKEN: 'test-verify-token',
    WHATSAPP_APP_SECRET: 'test-app-secret',
    WHATSAPP_ACCESS_TOKEN: 'test-access-token',
    WHATSAPP_PHONE_NUMBER_ID: '100200300',
    WHATSAPP_GRAPH_BASE_URL: 'http://localhost:4199',
  },
};

// DATABASE_URL y DIRECT_URL siempre apuntan a la base de pruebas (nunca a la de desarrollo).
const dbEnv = { DATABASE_URL: E2E.dbUrl, DIRECT_URL: E2E.dbUrl, APP_ENV: 'test' };

const run = (cmd, env = {}) => execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } });

if (process.argv[1]?.endsWith('e2e-prepare.mjs')) {
  run('docker exec adhera-db dropdb -U adhera --if-exists --force adhera_test');
  run('docker exec adhera-db createdb -U adhera adhera_test');
  run('pnpm --filter @adhera/api exec prisma migrate deploy', dbEnv);
  run('pnpm --filter @adhera/api exec tsx prisma/seed.ts', dbEnv);
  run('pnpm --filter @adhera/api build');
  run('pnpm --filter @adhera/web exec next build', { NEXT_DIST_DIR: '.next-e2e', API_URL: `http://localhost:${E2E.apiPort}` });
}
