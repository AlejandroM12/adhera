import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../common/prisma.service';
import { config } from '../config/env';

export const SESSION_COOKIE = 'adhera_session';
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export interface AdvisorPrincipal {
  id: string;
  displayName: string;
  email: string;
}

/** Auth demo mínima: cookie HttpOnly firmada con HMAC (sin estado en servidor). */
@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  private get secret(): string {
    return config().SESSION_SECRET;
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('base64url');
  }

  issueToken(userId: string): string {
    const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + SESSION_TTL_MS })).toString('base64url');
    return `${payload}.${this.sign(payload)}`;
  }

  verifyToken(token: string | undefined): string | null {
    if (!token) return null;
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return null;
    const expected = Buffer.from(this.sign(payload));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    try {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { uid: string; exp: number };
      if (typeof data.uid !== 'string' || data.exp < Date.now()) return null;
      return data.uid;
    } catch {
      return null;
    }
  }

  async login(email: string, password: string): Promise<AdvisorPrincipal> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !ok) throw new UnauthorizedException('Email o contraseña incorrectos.');
    return { id: user.id, displayName: user.displayName, email: user.email };
  }

  async principalFromToken(token: string | undefined): Promise<AdvisorPrincipal | null> {
    const uid = this.verifyToken(token);
    if (!uid) return null;
    const user = await this.prisma.user.findUnique({ where: { id: uid } });
    return user ? { id: user.id, displayName: user.displayName, email: user.email } : null;
  }
}
