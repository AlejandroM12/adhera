import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { parse } from '../common/zod';
import { AdvisorGuard, CurrentAdvisor } from '../auth/advisor.guard';
import { AdvisorPrincipal } from '../auth/auth.service';
import { ApplicationsService, ListQuerySchema, UpdateSchema } from './applications.service';

const NoteSchema = z.object({ content: z.string().trim().min(1, 'La nota no puede estar vacía.').max(2000) });

@Controller('applications')
@UseGuards(AdvisorGuard)
export class ApplicationsController {
  constructor(private readonly service: ApplicationsService) {}

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
    return this.service.addNote(id, parse(NoteSchema, body).content, advisor);
  }

  @Get(':id/activity')
  activity(@Param('id') id: string) {
    return this.service.activityFor(id);
  }
}
