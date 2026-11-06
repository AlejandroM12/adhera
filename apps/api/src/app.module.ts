import { Module } from '@nestjs/common';
import { PrismaService } from './common/prisma.service';
import { AuthService } from './auth/auth.service';
import { AuthController } from './auth/auth.controller';
import { HealthController } from './common/health.controller';
import { ActivityService } from './activity/activity.service';
import { QuestionnairesService } from './questionnaires/questionnaires.service';
import { QuestionnairesController } from './questionnaires/questionnaires.controller';
import { SessionsService } from './sessions/sessions.service';
import { SessionsController } from './sessions/sessions.controller';
import { SimulatorAdapter } from './channels/simulator.adapter';
import { ApplicationsService } from './applications/applications.service';
import { ApplicationsController } from './applications/applications.controller';
import { InterviewsService } from './interviews/interviews.service';
import { InterviewsController } from './interviews/interviews.controller';
import { DashboardController } from './dashboard/dashboard.controller';
import { UsersController } from './auth/users.controller';
import { WhatsAppController } from './whatsapp/whatsapp.controller';
import { WhatsAppService } from './whatsapp/whatsapp.service';
import { WhatsAppCloudAdapter } from './whatsapp/whatsapp.adapter';

@Module({
  controllers: [
    HealthController,
    AuthController,
    UsersController,
    QuestionnairesController,
    SessionsController,
    ApplicationsController,
    InterviewsController,
    DashboardController,
    WhatsAppController,
  ],
  providers: [
    PrismaService,
    AuthService,
    ActivityService,
    QuestionnairesService,
    SessionsService,
    SimulatorAdapter,
    ApplicationsService,
    InterviewsService,
    WhatsAppCloudAdapter,
    WhatsAppService,
  ],
})
export class AppModule {}
