import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { parse } from '../common/zod';
import { ChannelAdapter, InboundMessage, OutboundMessage } from './channel-adapter';

const SimulatorInbound = z.object({
  questionKey: z.string().min(1).max(60),
  value: z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]),
  requestId: z.string().min(8).max(100),
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
