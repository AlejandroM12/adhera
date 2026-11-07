import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { parse } from '../common/zod';
import { ChannelAdapter, InboundMessage, OutboundMessage } from './channel-adapter';

const Choice = z.string().max(60);
const AnswerInput = z.union([
  z.string().max(2000),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(Choice).max(20),
  z.object({ special: z.enum(['unknown', 'prefer_not']) }).strict(),
  z.object({ other: z.string().max(200) }).strict(),
  z.object({ values: z.array(Choice).max(20), other: z.string().max(200).optional() }).strict(),
  z.object({ localityId: z.string().max(20) }).strict(),
]);

const SimulatorInbound = z.object({
  questionKey: z.string().min(1).max(80),
  value: AnswerInput.optional().default(null),
  requestId: z.string().min(8).max(100),
  confirm: z.union([z.number().int().min(0).max(10), z.literal('reject')]).optional(),
  correction: z.boolean().optional(),
});

/**
 * Canal del simulador web: la respuesta HTTP es la entrega del mensaje,
 * por eso send/receive/acknowledge no necesitan transporte adicional.
 */
@Injectable()
export class SimulatorAdapter implements ChannelAdapter {
  readonly channel = 'SIMULATOR';

  normalizeInbound(sessionId: string, raw: unknown): InboundMessage {
    const body = parse(SimulatorInbound, raw);
    return { sessionId, ...body };
  }

  async receiveMessage(_message: InboundMessage): Promise<void> {}

  async sendMessage(_message: OutboundMessage): Promise<void> {}

  async acknowledge(_requestId: string): Promise<void> {}
}
