import { Injectable } from '@nestjs/common';
import { dirname, resolve } from 'path';
import type { Content, ContentTable, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { Dossier, DossierItem, DossierSection, ReviewFlag } from './dossier';

// pdfmake 0.3 (servidor): API de instancia única. Sólo fuentes locales; sin acceso a URLs externas.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfmake = require('pdfmake') as {
  setFonts(fonts: unknown): void;
  setUrlAccessPolicy(cb: (url: string) => boolean): void;
  createPdf(doc: TDocumentDefinitions): { getBuffer(): Promise<Buffer> };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ROBOTO = require('pdfmake/fonts/Roboto') as { Roboto: Record<string, string> };
const FONT_DIR = resolve(dirname(ROBOTO.Roboto.normal!));
pdfmake.setFonts(ROBOTO);
pdfmake.setUrlAccessPolicy(() => false);
// Sólo puede leer sus propias fuentes del disco.
(pdfmake as unknown as { setLocalAccessPolicy(cb: (path: string) => boolean): void }).setLocalAccessPolicy((path) =>
  resolve(path).startsWith(FONT_DIR),
);

const STATUS_LABEL: Record<string, string> = {
  IN_PROGRESS: 'En curso',
  PENDING_REVIEW: 'Pendiente de revisión',
  CONTACTED: 'Contactada',
  INTERVIEW_SCHEDULED: 'Entrevista programada',
  CLOSED: 'Cerrada',
};
const ITEM_STATUS: Partial<Record<DossierItem['status'], string>> = {
  unknown: 'No sé',
  prefer_not: 'Prefirió no responder',
  to_verify: 'A verificar',
  skipped: 'Omitida',
};

const PETROL = '#1a4e5e';
const MUTED = '#64748b';
const LINE = '#cbd5e1';

const fmtDate = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' }) : '—';
const fmtDni = (dni: string) => (/^\d+$/.test(dni) ? dni.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : dni);

export interface PdfInput {
  id: string;
  displayName: string;
  status: string;
  createdAt: Date;
  completedAt: Date | null;
  assignedUser: { displayName: string } | null;
  session: {
    questionnaire: { version: number; title?: string | null };
    consentAt?: Date | null;
    reviewConfirmedAt?: Date | null;
  } | null;
  dossier: Dossier | null;
  answers: { questionKey: string; label: string; display: string }[];
}

/** Renglones vacíos para escribir a mano durante la entrevista. */
function ruledBox(title: string, lines: number): Content {
  return {
    unbreakable: true,
    margin: [0, 6, 0, 10],
    stack: [
      { text: title, style: 'boxTitle' },
      {
        table: { widths: ['*'], heights: 20, body: Array.from({ length: lines }, () => [{ text: ' ' }]) },
        layout: {
          hLineWidth: (i: number) => (i === 0 ? 0 : 0.5),
          vLineWidth: () => 0,
          hLineColor: () => LINE,
        },
      },
    ],
  };
}

function itemNotes(item: DossierItem): Content[] {
  const notes: Content[] = [];
  if (item.original) notes.push({ text: `Escribió: «${item.original}»`, style: 'note' });
  if (item.confirmed) notes.push({ text: `Confirmado por el interesado: ${item.confirmed.chosen}`, style: 'note' });
  for (const c of item.corrections) notes.push({ text: `Corregido en la revisión. Antes: ${c.previous}`, style: 'note' });
  for (const o of item.observations) {
    const kind = o.kind === 'CLARIFICATION' ? (o.resolvedAt ? 'Aclaración resuelta' : 'Aclaración pendiente') : 'Observación';
    notes.push({ text: `${kind} (${o.author.displayName}): ${o.content}`, style: 'observation' });
  }
  return notes;
}

function sectionTable(section: DossierSection): ContentTable {
  return {
    table: {
      widths: ['36%', '*'],
      headerRows: 0,
      dontBreakRows: true,
      body: section.items.map((it) => [
        { text: it.label, style: 'label' },
        {
          stack: [
            {
              text: [
                { text: it.answer, bold: it.status === 'answered' },
                ...(ITEM_STATUS[it.status] ? [{ text: `  [${ITEM_STATUS[it.status]}]`, color: '#b45309', fontSize: 8 }] : []),
              ],
            },
            ...itemNotes(it),
          ],
        },
      ]),
    },
    layout: {
      hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === node.table.body.length ? 0 : 0.4),
      vLineWidth: () => 0,
      hLineColor: () => '#e2e8f0',
      paddingTop: () => 4,
      paddingBottom: () => 4,
    },
  };
}

function flags(title: string, list: ReviewFlag[]): Content {
  return {
    stack: [
      { text: `${title} (${list.length})`, style: 'flagTitle' },
      list.length
        ? { ul: list.map((f) => ({ text: [{ text: `${f.label}: `, bold: true }, f.detail] })), fontSize: 8 }
        : { text: 'Nada para revisar.', fontSize: 8, color: MUTED },
    ],
  };
}

/** Ficha de preentrevista en PDF A4, imprimible, con espacios para observaciones durante la reunión. */
@Injectable()
export class PdfService {
  async render(app: PdfInput, generatedAt = new Date()): Promise<Buffer> {
    const d = app.dossier;
    const content: Content[] = [
      { text: 'Ficha de preentrevista', style: 'h1' },
      { text: app.displayName, style: 'name' },
      {
        columns: [
          { text: [{ text: 'Estado: ', bold: true }, STATUS_LABEL[app.status] ?? app.status] },
          { text: [{ text: 'Enviada: ', bold: true }, fmtDate(app.completedAt)] },
          { text: [{ text: 'Asesor: ', bold: true }, app.assignedUser?.displayName ?? 'Sin asignar'] },
        ],
        fontSize: 9,
        margin: [0, 2, 0, 2],
      },
      {
        text: [
          { text: 'Cuestionario: ', bold: true },
          `v${app.session?.questionnaire.version ?? '?'}${app.session?.questionnaire.title ? ` · ${app.session.questionnaire.title}` : ''}`,
          { text: '   Consentimiento: ', bold: true },
          app.session?.consentAt ? fmtDate(app.session.consentAt) : 'No registrado',
        ],
        fontSize: 9,
      },
      {
        margin: [0, 10, 0, 10],
        table: {
          widths: ['*'],
          body: [[{
            text: [
              { text: 'PREENTREVISTA — NO ES UNA DECLARACIÓN JURADA. ', bold: true },
              'Información declarada por el interesado para preparar la entrevista con un asesor. No constituye una evaluación ',
              'médica ni un diagnóstico y no define la afiliación. La declaración jurada de salud formal se completa por separado. ',
              { text: 'Demostración: todos los datos son ficticios.', bold: true },
            ],
            fontSize: 8.5,
            color: PETROL,
            fillColor: '#eef6f7',
            margin: [6, 5, 6, 5],
          }]],
        },
        layout: 'noBorders',
      },
    ];

    if (d) {
      content.push(
        { text: 'Para revisar en la entrevista', style: 'h2' },
        { columns: [flags('Datos faltantes', d.review.missing), flags('Contradicciones', d.review.contradictions), flags('Aclaraciones pendientes', d.review.clarifications)], columnGap: 10 },
      );
      for (const s of d.general) {
        content.push({ text: s.title, style: 'h2' }, sectionTable(s), ruledBox('Observaciones durante la entrevista', 2));
      }
      for (const m of d.members) {
        content.push(
          { text: `Declaración de salud · ${m.name}`, style: 'h2', pageBreak: 'before' },
          {
            text: [
              m.relation ?? 'Integrante',
              m.dni ? ` · DNI ${fmtDni(m.dni)}` : '',
              m.birthDate ? ` · Nac. ${m.birthDate}` : '',
              m.age !== null ? ` · ${m.age} años` : '',
            ].join(''),
            style: 'memberMeta',
          },
        );
        if (m.data.length) content.push(sectionTable({ title: 'Datos', items: m.data }));
        for (const s of m.health) {
          content.push({ text: s.title, style: 'h3' }, sectionTable(s), ruledBox(`Observaciones · ${s.title}`, 2));
        }
      }
    } else {
      content.push(
        { text: 'Respuestas', style: 'h2' },
        sectionTable({
          title: 'Respuestas',
          items: app.answers.map((a) => ({
            stepId: a.questionKey, key: a.questionKey, label: a.label, question: a.label, answer: a.display, original: null,
            status: 'answered', confirmed: null, corrections: [], observations: [], answeredAt: new Date(0),
          }) as DossierItem),
        }),
      );
    }

    content.push(
      { text: 'Notas de la entrevista', style: 'h2', pageBreak: 'before' },
      ruledBox('Temas conversados y aclaraciones', 12),
      ruledBox('Próximos pasos', 5),
      {
        margin: [0, 16, 0, 0],
        columns: [
          { text: 'Fecha de la entrevista: ____ / ____ / ________', fontSize: 9 },
          { text: 'Asesor/a: ______________________________', fontSize: 9 },
        ],
      },
      {
        margin: [0, 18, 0, 0],
        text: 'Esta ficha no reemplaza la declaración jurada de salud ni la documentación formal de afiliación. No incluye puntajes, clasificaciones ni decisiones automáticas.',
        fontSize: 8,
        color: MUTED,
      },
    );

    const doc: TDocumentDefinitions = {
      pageSize: 'A4',
      pageMargins: [40, 56, 40, 52],
      info: { title: 'Ficha de preentrevista', author: 'Adhera', subject: 'Preentrevista (demo, datos ficticios)' },
      watermark: { text: 'DEMO · DATOS FICTICIOS', color: '#94a3b8', opacity: 0.08, bold: true, fontSize: 48 },
      header: {
        margin: [40, 22, 40, 0],
        columns: [
          { text: 'Adhera · Ficha de preentrevista', fontSize: 8, color: PETROL, bold: true },
          { text: 'DATOS FICTICIOS · DEMO', alignment: 'right', fontSize: 8, color: '#b45309', bold: true },
        ],
      },
      footer: (current: number, total: number) => ({
        margin: [40, 16, 40, 0],
        columns: [
          { text: `Preentrevista · no es declaración jurada · ID ${app.id} · ${fmtDate(generatedAt)}`, fontSize: 7, color: MUTED, width: '*' },
          { text: `Página ${current} de ${total}`, alignment: 'right', fontSize: 7, color: MUTED, width: 70 },
        ],
      }),
      content,
      defaultStyle: { font: 'Roboto', fontSize: 9, color: '#0f172a', lineHeight: 1.15 },
      styles: {
        h1: { fontSize: 9, bold: true, color: PETROL, characterSpacing: 1 },
        name: { fontSize: 18, bold: true, margin: [0, 2, 0, 4] },
        h2: { fontSize: 12, bold: true, color: PETROL, margin: [0, 10, 0, 4] },
        h3: { fontSize: 10, bold: true, color: PETROL, margin: [0, 8, 0, 2] },
        label: { color: MUTED, fontSize: 8.5 },
        note: { fontSize: 7.5, color: MUTED, italics: true },
        observation: { fontSize: 7.5, color: '#6d28d9' },
        boxTitle: { fontSize: 7.5, color: MUTED, bold: true },
        flagTitle: { fontSize: 9, bold: true, margin: [0, 0, 0, 2] },
        memberMeta: { fontSize: 9, color: MUTED, margin: [0, 0, 0, 6] },
      },
    };
    return pdfmake.createPdf(doc).getBuffer();
  }
}
