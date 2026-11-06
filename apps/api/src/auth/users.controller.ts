import { Controller, Get, UseGuards } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AdvisorGuard } from './advisor.guard';

@Controller('users')
@UseGuards(AdvisorGuard)
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.user.findMany({
      select: { id: true, displayName: true, email: true },
      orderBy: { displayName: 'asc' },
    });
  }
}
