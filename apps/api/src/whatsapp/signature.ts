import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verifica la firma de Meta: header `X-Hub-Signature-256: sha256=<hex>` = HMAC-SHA256 del
 * cuerpo crudo con el App Secret. Comparación en tiempo constante.
 */
export function verifyMetaSignature(appSecret: string, rawBody: Buffer | undefined, header: string | undefined): boolean {
  if (!appSecret || !rawBody || !header || !header.startsWith('sha256=')) return false;
  const expected = Buffer.from(createHmac('sha256', appSecret).update(rawBody).digest('hex'), 'utf8');
  const given = Buffer.from(header.slice('sha256='.length), 'utf8');
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function signMetaPayload(appSecret: string, body: string | Buffer): string {
  return `sha256=${createHmac('sha256', appSecret).update(body).digest('hex')}`;
}
