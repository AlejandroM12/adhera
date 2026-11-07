import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';

// Carga apps/api/.env si existe (sólo desarrollo local). Las variables ya definidas tienen prioridad.
try {
  process.loadEnvFile('.env');
} catch {
  /* sin archivo .env: se usan variables del entorno (Render, CI, pruebas) */
}

async function bootstrap() {
  // La configuración se valida antes de levantar nada: en producción falla si falta algo crítico.
  const { config } = await import('./config/env');
  const cfg = config();
  const { AppModule } = await import('./app.module');

  // rawBody: necesario para verificar la firma de los webhooks de Meta.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    logger: ['error', 'warn', 'log'],
  });
  // Detrás del proxy de Render: respeta X-Forwarded-* para IP y HTTPS.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.useBodyParser('json', { limit: '256kb' });
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (cfg.APP_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });
  app.use(cookieParser());
  app.enableCors({ origin: cfg.WEB_ORIGIN.split(','), credentials: true });
  app.enableShutdownHooks();

  const port = cfg.API_PORT ?? cfg.PORT ?? 4000;
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(
    `Adhera API (${cfg.APP_ENV}) en puerto ${port} · WhatsApp ${cfg.WHATSAPP_ENABLED ? 'habilitado' : 'deshabilitado'}`,
  );
  if (cfg.APP_ENV === 'production' && !cfg.PROXY_SECRET) {
    new Logger('Bootstrap').warn(
      'PROXY_SECRET no está definida: los límites por IP del simulador se comparten entre todos los visitantes (sigue activo el tope global).',
    );
  }
}

bootstrap().catch((e: Error) => {
  console.error(`No se pudo iniciar la API: ${e.message}`);
  process.exit(1);
});
