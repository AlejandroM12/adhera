import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentAdvisor } from '../auth/advisor.guard';
import { AdvisorPrincipal } from '../auth/auth.service';
import { TemplatesService } from './templates.service';
import { parse } from '../common/zod';
import { AdvisorGuard } from '../auth/advisor.guard';
import { toEngineQuestion, toPublicQuestion } from './question-mapper';
import { DraftSchema, QuestionnairesService } from './questionnaires.service';

@Controller('questionnaires')
export class QuestionnairesController {
  constructor(
    private readonly service: QuestionnairesService,
    private readonly templates: TemplatesService,
  ) {}

  /** Público: lo que necesita el simulador antes de iniciar (sin reglas internas). */
  @Get('active')
  async active() {
    const v = await this.service.getActiveVersion();
    return {
      name: v.questionnaire.name,
      version: v.version,
      questionCount: v.questions.length,
      questions: v.questions.map((q) => toPublicQuestion(toEngineQuestion(q))),
    };
  }

  @Get()
  @UseGuards(AdvisorGuard)
  list() {
    return this.service.list();
  }

  @Get(':id')
  @UseGuards(AdvisorGuard)
  detail(@Param('id') id: string) {
    return this.service.getDetail(id);
  }

  @Patch(':id/draft')
  @UseGuards(AdvisorGuard)
  saveDraft(@Param('id') id: string, @Body() body: unknown) {
    return this.service.saveDraft(id, parse(DraftSchema, body));
  }

  @Delete(':id/draft')
  @UseGuards(AdvisorGuard)
  discardDraft(@Param('id') id: string) {
    return this.service.discardDraft(id);
  }

  @Post(':id/publish')
  @UseGuards(AdvisorGuard)
  publish(@Param('id') id: string) {
    return this.service.publish(id);
  }

  /** Importa la plantilla "Preentrevista de salud" como borrador nuevo (no modifica versiones existentes). */
  @Post(':id/templates/health-v2')
  @UseGuards(AdvisorGuard)
  importHealthV2(@Param('id') id: string) {
    return this.templates.importHealthV2(id);
  }

  /** Crea 4 casos ficticios de ejemplo v2 (ids fijos: no duplica ni modifica). */
  @Post('templates/health-v2/examples')
  @UseGuards(AdvisorGuard)
  healthV2Examples(@CurrentAdvisor() advisor: AdvisorPrincipal) {
    return this.templates.createHealthV2Examples(advisor);
  }
}
