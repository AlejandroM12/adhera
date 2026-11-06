import { Injectable } from '@nestjs/common';
import { ActorType, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';

type Tx = Prisma.TransactionClient | PrismaService;

/** Registro append-only de eventos. Nunca se actualizan ni borran. */
@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  log(
    applicationId: string,
    kind: string,
    actor: { type: ActorType; id?: string | null },
    payload?: Prisma.InputJsonValue,
    tx: Tx = this.prisma,
  ) {
    return tx.activityEvent.create({
      data: { applicationId, kind, actorType: actor.type, actorId: actor.id ?? null, payloadJson: payload },
    });
  }
}
