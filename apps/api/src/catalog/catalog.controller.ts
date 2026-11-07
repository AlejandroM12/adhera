import { BadRequestException, Controller, Get, HttpException, HttpStatus, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { clientIp } from '../common/client-ip';
import { RateLimiter } from '../common/rate-limiter';
import { config } from '../config/env';
import { provinceById, provinces, searchLocalities } from './localities';

const SearchSchema = z.object({
  province: z.string().regex(/^\d{2}$/),
  q: z.string().trim().min(2).max(80),
});

// Público (lo usa el autocompletado del simulador): limitado por visitante.
const searches = new RateLimiter(120, 60 * 1000);

/** Catálogo de provincias y localidades de Argentina (Georef AR, INDEC). Sin datos personales. */
@Controller('catalog')
export class CatalogController {
  @Get('provinces')
  provinces() {
    return provinces();
  }

  @Get('localities')
  localities(@Query() query: unknown, @Req() req: Request) {
    if (!searches.allow(clientIp(req, config().PROXY_SECRET))) {
      throw new HttpException('Demasiadas búsquedas. Esperá un momento.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const parsed = SearchSchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException('Indicá la provincia y al menos 2 letras.');
    if (!provinceById(parsed.data.province)) throw new BadRequestException('Provincia inexistente.');
    return searchLocalities(parsed.data.province, parsed.data.q, 8).map(({ id, name, department }) => ({ id, name, department }));
  }
}
