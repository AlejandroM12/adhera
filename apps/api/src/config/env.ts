import { z } from 'zod';

/**
 * Configuración validada al arrancar. En producción falla rápido si falta algo crítico,
 * en lugar de arrancar con valores inseguros.
 */
const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    /** Entorno lógico: separa desarrollo local, pruebas automatizadas y entorno público. */
    APP_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
    PORT: z.coerce.number().int().optional(),
    API_PORT: z.coerce.number().int().optional(),
    WEB_ORIGIN: z.string().default('http://localhost:3000'),
    SESSION_SECRET: z.string().min(16, 'SESSION_SECRET debe tener al menos 16 caracteres'),
    /** Conversaciones nuevas del simulador por IP y por hora (anti-abuso). */
    SIMULATOR_STARTS_PER_HOUR: z.coerce.number().int().min(1).default(30),
    /** Habilita POST /sessions (simulador web público). */
    SIMULATOR_ENABLED: z
      .string()
      .optional()
      .transform((v) => v !== 'false'),

    WHATSAPP_ENABLED: bool,
    WHATSAPP_VERIFY_TOKEN: z.string().optional(),
    WHATSAPP_APP_SECRET: z.string().optional(),
    WHATSAPP_ACCESS_TOKEN: z.string().optional(),
    WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
    WHATSAPP_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/).default('v23.0'),
    WHATSAPP_GRAPH_BASE_URL: z.string().url().default('https://graph.facebook.com'),
  })
  .superRefine((env, ctx) => {
    if (env.APP_ENV === 'production') {
      if (env.SESSION_SECRET.length < 32) {
        ctx.addIssue({ code: 'custom', path: ['SESSION_SECRET'], message: 'en producción debe tener al menos 32 caracteres' });
      }
      if (!env.WEB_ORIGIN.startsWith('https://')) {
        ctx.addIssue({ code: 'custom', path: ['WEB_ORIGIN'], message: 'en producción debe ser https://' });
      }
      if (env.WHATSAPP_GRAPH_BASE_URL !== 'https://graph.facebook.com') {
        ctx.addIssue({ code: 'custom', path: ['WHATSAPP_GRAPH_BASE_URL'], message: 'en producción debe ser https://graph.facebook.com' });
      }
    }
    if (env.WHATSAPP_ENABLED) {
      for (const key of ['WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_APP_SECRET', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'] as const) {
        if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'obligatoria si WHATSAPP_ENABLED=true' });
      }
    }
  });

export type AppConfig = z.infer<typeof EnvSchema>;

let cached: AppConfig | null = null;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  // En Render, WEB_HOST llega como hostname (sin esquema) desde el servicio web.
  const input = { ...source };
  if (!input.WEB_ORIGIN && input.WEB_HOST) input.WEB_ORIGIN = `https://${input.WEB_HOST}`;
  const result = EnvSchema.safeParse(input);
  if (!result.success) {
    const detail = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuración inválida → ${detail}`);
  }
  return result.data;
}

export function config(): AppConfig {
  cached ??= loadConfig();
  return cached;
}
