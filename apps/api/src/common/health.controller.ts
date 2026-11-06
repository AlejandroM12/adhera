import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { config } from '../config/env';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async health() {
    let db = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'error';
    }
    const cfg = config();
    // Sin datos sensibles: sólo estado, entorno y canales habilitados.
    return {
      status: db === 'ok' ? 'ok' : 'degraded',
      db,
      env: cfg.APP_ENV,
      channels: { simulator: cfg.SIMULATOR_ENABLED, whatsapp: cfg.WHATSAPP_ENABLED },
      time: new Date().toISOString(),
    };
  }
}
