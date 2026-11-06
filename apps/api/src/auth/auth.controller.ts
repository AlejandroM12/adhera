import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { RateLimiter } from '../common/rate-limiter';
import { config } from '../config/env';
import { z } from 'zod';
import { parse } from '../common/zod';
import { AdvisorPrincipal, AuthService, SESSION_COOKIE, SESSION_TTL_MS } from './auth.service';
import { AdvisorGuard, CurrentAdvisor } from './advisor.guard';

const LoginSchema = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });

// Anti fuerza bruta: hasta 10 intentos fallidos cada 15 minutos por email e IP.
const loginFailures = new RateLimiter(10, 15 * 60 * 1000);

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { email, password } = parse(LoginSchema, body);
    const key = `${email.toLowerCase()}|${req.ip}`;
    if (!loginFailures.peek(key)) {
      throw new HttpException('Demasiados intentos fallidos. Esperá unos minutos.', HttpStatus.TOO_MANY_REQUESTS);
    }
    let user;
    try {
      user = await this.auth.login(email, password);
    } catch (e) {
      loginFailures.record(key);
      throw e;
    }
    res.cookie(SESSION_COOKIE, this.auth.issueToken(user.id), {
      httpOnly: true,
      sameSite: 'lax',
      secure: config().APP_ENV === 'production',
      maxAge: SESSION_TTL_MS,
      path: '/',
    });
    return { user };
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AdvisorGuard)
  me(@CurrentAdvisor() advisor: AdvisorPrincipal) {
    return { user: advisor };
  }
}
