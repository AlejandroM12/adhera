import {
  BadRequestException, Body, Controller, Get, Headers, HttpCode, HttpException, HttpStatus, NotFoundException, Param, Post, Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { RateLimiter } from '../common/rate-limiter';
import { config } from '../config/env';
import { z } from 'zod';
import { SimulatorAdapter } from '../channels/simulator.adapter';
import { SessionsService } from './sessions.service';

const StartSchema = z.object({ acceptedNotice: z.literal(true) });

// Anti-abuso del simulador público: conversaciones nuevas por hora por IP (configurable).
let startLimiter: RateLimiter | null = null;
const limiter = () => (startLimiter ??= new RateLimiter(config().SIMULATOR_STARTS_PER_HOUR, 60 * 60 * 1000));

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
    if (!limiter().allow(req.ip ?? 'unknown')) {
      throw new HttpException('Demasiadas conversaciones nuevas. Probá más tarde.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const result = StartSchema.safeParse(body);
    if (!result.success) throw new BadRequestException('Debés aceptar el aviso de uso de datos ficticios.');
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
    const inbound = this.channel.normalizeInbound(id, body);
    const state = await this.sessions.answer(inbound);
    await this.channel.acknowledge(inbound.requestId);
    return state;
  }

  @Post(':id/complete')
  @HttpCode(200)
  async complete(@Param('id') id: string, @Headers('x-session-token') token?: string) {
    await this.sessions.authorize(id, token);
    return this.sessions.complete(id);
  }
}

