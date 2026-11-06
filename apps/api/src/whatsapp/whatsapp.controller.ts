import {
  Controller, ForbiddenException, Get, Headers, HttpCode, NotFoundException, Post, Query, Req, Res, UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';
import { config } from '../config/env';
import { verifyMetaSignature } from './signature';
import { WhatsAppService } from './whatsapp.service';

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Webhook de WhatsApp Cloud API.
 * GET: verificación de suscripción (hub.challenge). POST: eventos firmados por Meta.
 */
@Controller('webhooks/whatsapp')
export class WhatsAppController {
  constructor(private readonly service: WhatsAppService) {}

  private ensureEnabled() {
    if (!config().WHATSAPP_ENABLED) throw new NotFoundException();
  }

  @Get()
  verify(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() res: Response,
  ) {
    this.ensureEnabled();
    const expected = config().WHATSAPP_VERIFY_TOKEN ?? '';
    if (mode !== 'subscribe' || !token || !challenge || !safeEqual(token, expected)) {
      throw new ForbiddenException('Verificación de webhook inválida.');
    }
    res.status(200).type('text/plain').send(challenge.slice(0, 200));
  }

  @Post()
  @HttpCode(200)
  async receive(@Req() req: RawBodyRequest<Request>, @Headers('x-hub-signature-256') signature?: string) {
    this.ensureEnabled();
    if (!verifyMetaSignature(config().WHATSAPP_APP_SECRET ?? '', req.rawBody, signature)) {
      throw new UnauthorizedException('Firma inválida.');
    }
    // Si algo falla se responde 500 y Meta reintenta; los mensajes ya procesados se descartan por id.
    const result = await this.service.handleWebhook(req.body);
    return { ok: true, ...result };
  }
}
