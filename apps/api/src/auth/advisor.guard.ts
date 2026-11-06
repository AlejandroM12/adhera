import { CanActivate, createParamDecorator, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AdvisorPrincipal, AuthService, SESSION_COOKIE } from './auth.service';

type AuthedRequest = Request & { advisor?: AdvisorPrincipal };

/** Exige sesión de asesor válida (cookie HttpOnly). */
@Injectable()
export class AdvisorGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const principal = await this.auth.principalFromToken(req.cookies?.[SESSION_COOKIE]);
    if (!principal) throw new UnauthorizedException('Iniciá sesión como asesor.');
    req.advisor = principal;
    return true;
  }
}

export const CurrentAdvisor = createParamDecorator((_: unknown, ctx: ExecutionContext): AdvisorPrincipal => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().advisor!;
});
