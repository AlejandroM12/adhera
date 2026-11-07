import { Body, Controller, Get, Header, Param, Patch, Post, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { PdfService } from './pdf.service';
import { parse } from '../common/zod';
import { AdvisorGuard, CurrentAdvisor } from '../auth/advisor.guard';
import { AdvisorPrincipal } from '../auth/auth.service';
import { ApplicationsService, ListQuerySchema, NoteSchema, UpdateSchema } from './applications.service';

@Controller('applications')
@UseGuards(AdvisorGuard)
export class ApplicationsController {
  constructor(
    private readonly service: ApplicationsService,
    private readonly pdf: PdfService,
  ) {}

  @Get()
  list(@Query() query: unknown) {
    return this.service.list(parse(ListQuerySchema, query));
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.service.detail(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: unknown, @CurrentAdvisor() advisor: AdvisorPrincipal) {
    return this.service.update(id, parse(UpdateSchema, body), advisor);
  }

  @Post(':id/notes')
  addNote(@Param('id') id: string, @Body() body: unknown, @CurrentAdvisor() advisor: AdvisorPrincipal) {
    return this.service.addNote(id, parse(NoteSchema, body), advisor);
  }

  @Patch(':id/notes/:noteId/resolve')
  resolveNote(@Param('id') id: string, @Param('noteId') noteId: string, @CurrentAdvisor() advisor: AdvisorPrincipal) {
    return this.service.resolveNote(id, noteId, advisor);
  }

  /** Ficha de preentrevista en PDF A4 (sólo asesores). Se registra en la actividad; no se guarda en caché. */
  @Get(':id/pdf')
  @Header('Content-Type', 'application/pdf')
  @Header('Cache-Control', 'no-store')
  async exportPdf(@Param('id') id: string, @CurrentAdvisor() advisor: AdvisorPrincipal) {
    const detail = await this.service.detail(id);
    const buffer = await this.pdf.render(detail);
    await this.service.logExport(id, advisor);
    // Nombre de archivo sin datos personales.
    return new StreamableFile(buffer, { disposition: `inline; filename="preentrevista-${id}.pdf"`, length: buffer.length });
  }

  @Get(':id/activity')
  activity(@Param('id') id: string) {
    return this.service.activityFor(id);
  }
}
