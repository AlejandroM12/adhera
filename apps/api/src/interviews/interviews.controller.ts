import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { parse } from '../common/zod';
import { AdvisorGuard, CurrentAdvisor } from '../auth/advisor.guard';
import { AdvisorPrincipal } from '../auth/auth.service';
import {
  CreateInterviewSchema,
  InterviewListSchema,
  InterviewsService,
  UpdateInterviewSchema,
} from './interviews.service';

@Controller('interviews')
@UseGuards(AdvisorGuard)
export class InterviewsController {
  constructor(private readonly service: InterviewsService) {}

  @Get()
  list(@Query() query: unknown) {
    return this.service.list(parse(InterviewListSchema, query));
  }

  @Post()
  create(@Body() body: unknown, @CurrentAdvisor() advisor: AdvisorPrincipal) {
    return this.service.create(parse(CreateInterviewSchema, body), advisor);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: unknown, @CurrentAdvisor() advisor: AdvisorPrincipal) {
    return this.service.update(id, parse(UpdateInterviewSchema, body), advisor);
  }
}
