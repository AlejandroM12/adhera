import {
  BadRequestException, Body, Controller, Get, Headers, HttpCode, HttpException, HttpStatus, NotFoundException, Param, Post, Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { RateLimiter } from '../common/rate-limiter';
import { clientIp } from '../common/client-ip';
import { config } from '../config/env';
import { z } from 'zod';
import { SimulatorAdapter } from '../channels/simulator.adapter';
import { SessionsService } from './sessions.service';

const StartSchema = z.object({ acceptedNotice: z.literal(true) });
const HOUR = 60 * 60 * 1000;

// Anti-abuso del simulador público (/demo y /simulador), en memoria (una instancia):
// - conversaciones nuevas por IP del interesado y por hora (configurable);
// - tope global de conversaciones nuevas por hora (protege la base aunque cambien las IPs);
// - respuestas por conversación (evita martillar una sesión con su token).
let perIp: RateLimiter | null = null;
let globalLimiter: RateLimiter | null = null;
const startsPerIp = () => (perIp ??= new RateLimiter(config().SIMULATOR_STARTS_PER_HOUR, HOUR));
const startsGlobal = () => (globalLimiter ??= new RateLimiter(config().SIMULATOR_STARTS_PER_HOUR_GLOBAL, HOUR));
const writesPerSession = new RateLimiter(60, 10 * 60 * 1000);

const TOO_MANY = 'Demasiadas conversaciones nuevas. Probá más tarde.';

/**
 * Endpoints públicos del interesado. Cada operación exige el token de
 * su propia sesión (header `x-session-token`); no da acceso a otras.
 */
@Controller('sessions')
export class SessionsController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly channel: SimulatorAdapter,
  ) {}

  @Post()
  start(@Body() body: unknown, @Req() req: Request) {
    if (!config().SIMULATOR_ENABLED) throw new NotFoundException('El simulador está deshabilitado.');
    const result = StartSchema.safeParse(body);
    if (!result.success) throw new BadRequestException('Debés aceptar el aviso de uso de datos ficticios.');
    const ip = clientIp(req, config().PROXY_SECRET);
    if (!startsPerIp().peek(ip) || !startsGlobal().peek('all')) {
      throw new HttpException(TOO_MANY, HttpStatus.TOO_MANY_REQUESTS);
    }
    startsPerIp().record(ip);
    startsGlobal().record('all');
    return this.sessions.start();
  }

  @Get(':id')
  async get(@Param('id') id: string, @Headers('x-session-token') token?: string) {
    await this.sessions.authorize(id, token);
    return this.sessions.buildState(id);
  }

  @Post(':id/answers')
  @HttpCode(200)
  async answer(@Param('id') id: string, @Body() body: unknown, @Headers('x-session-token') token?: string) {
    await this.sessions.authorize(id, token);
    this.limitWrites(id);
    const inbound = this.channel.normalizeInbound(id, body);
    const state = await this.sessions.answer(inbound);
    await this.channel.acknowledge(inbound.requestId);
    return state;
  }

  @Post(':id/complete')
  @HttpCode(200)
  async complete(@Param('id') id: string, @Headers('x-session-token') token?: string) {
    await this.sessions.authorize(id, token);
    this.limitWrites(id);
    return this.sessions.complete(id);
  }

  private limitWrites(sessionId: string) {
    if (!writesPerSession.allow(sessionId)) {
      throw new HttpException('Demasiados envíos seguidos. Esperá unos minutos.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
