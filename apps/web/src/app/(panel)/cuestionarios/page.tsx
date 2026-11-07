'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, GitBranch, Lightbulb, Plus, Rocket, Save, Trash2, Undo2, X,
} from 'lucide-react';
import { api, ApiError, errorMessage } from '@/lib/api';
import type {
  ChoiceOption, EditableQuestion, QuestionCondition, QuestionnaireDetail, QuestionnaireListItem, QuestionnaireVersion, QuestionType,
} from '@/lib/types';
import { EDITABLE_QUESTION_TYPES, QUESTION_TYPE_LABEL } from '@/lib/labels';
import { cn, formatDateTime } from '@/lib/utils';
import {
  Badge, Button, Card, EmptyState, ErrorState, Field, Input, LoadingState, PageHeader, Select,
} from '@/components/ui';
import { SectionCard } from '@/components/commercial';

const VERSION_STYLE = {
  PUBLISHED: 'bg-petrol-50 text-petrol-700 ring-petrol-300',
  DRAFT: 'bg-amber-50 text-amber-800 ring-amber-300',
  ARCHIVED: 'bg-slate-100 text-slate-600 ring-slate-300',
};
const VERSION_LABEL = { PUBLISHED: 'Publicada', DRAFT: 'Borrador', ARCHIVED: 'Archivada' };

const TYPE_HELP: Record<QuestionType, string> = {
  text: 'El interesado escribe libremente.',
  single_choice: 'El interesado elige un botón entre varias opciones.',
  number: 'Sólo acepta números (por ejemplo, cantidad de personas).',
  yes_no: 'Dos botones: Sí y No. Útil para mostrar preguntas extra.',
  date: 'Fecha (acepta DD/MM/AAAA).',
  multi_choice: 'El interesado puede elegir varias opciones.',
  dni: 'Número de DNI (7 u 8 dígitos).',
  phone: 'Teléfono de Argentina con código de área.',
  email: 'Correo electrónico (sugiere correcciones de dominio).',
  locality: 'Localidad del catálogo oficial de Argentina, con búsqueda tolerante a errores.',
};

/** Pregunta configurada por una plantilla: su estructura no se edita (sí los textos). */
const isTemplateQuestion = (q: EditableQuestion) => Boolean(q.meta);
const hasChoices = (t: QuestionType) => t === 'single_choice' || t === 'multi_choice';
/** Condición que el editor visual no sabe editar (la define la plantilla). */
const isAdvancedCondition = (c: QuestionCondition | null | undefined) =>
  Boolean(c && (c.includes !== undefined || c.excludes !== undefined || c.answered !== undefined));

// ---------- utilidades de claves internas (el administrador no las escribe) ----------

/** Convierte un texto en una clave interna estable: "¿En qué ciudad?" → "en_que_ciudad". */
function slugify(text: string, fallback: string): string {
  const s = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 36)
    .replace(/_+$/g, '');
  if (!s) return fallback;
  return /^[a-z]/.test(s) ? s : `p_${s}`;
}

function uniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

// ---------- modelo local del editor ----------

let uidCounter = 0;
const nextUid = () => `u${++uidCounter}`;

/** Opción en edición: `auto` = el valor interno se deriva del texto (opciones nuevas). */
type DraftOption = ChoiceOption & { uid: string; auto: boolean };
/** Pregunta en edición: `autoKey` = la clave se deriva del texto (preguntas nuevas). */
type DraftItem = { uid: string; autoKey: boolean; q: EditableQuestion; options: DraftOption[] };

function toItem(q: EditableQuestion): DraftItem {
  return {
    uid: nextUid(),
    autoKey: false,
    q: {
      key: q.key,
      label: q.label,
      shortLabel: q.shortLabel ?? null,
      type: q.type,
      required: q.required,
      condition: q.condition ?? null,
      validation: q.validation ?? null,
      meta: q.meta ?? null,
    },
    options: (q.options ?? []).map((o) => ({ ...o, uid: nextUid(), auto: false })),
  };
}

function toPayload(items: DraftItem[]): EditableQuestion[] {
  return items.map(({ q, options }) => ({
    ...q,
    shortLabel: q.shortLabel?.trim() || null,
    options: hasChoices(q.type)
      ? options.map(({ value, label, exclusive }) => ({ value, label: label.trim(), ...(exclusive ? { exclusive } : {}) }))
      : null,
  }));
}

function conditionValues(c: QuestionCondition | null | undefined): Array<string | number | boolean> {
  if (!c) return [];
  if (c.in) return c.in;
  if (c.equals !== undefined) return [c.equals];
  return [];
}

/** Validación en vivo con mensajes para un administrador no técnico. */
function friendlyErrors(items: DraftItem[]): string[] {
  const errors: string[] = [];
  if (items.length === 0) errors.push('Agregá al menos una pregunta.');
  items.forEach((it, i) => {
    const n = `Pregunta ${i + 1}`;
    if (!it.q.label.trim()) errors.push(`${n}: escribí el texto de la pregunta.`);
    if (hasChoices(it.q.type)) {
      const labels = it.options.map((o) => o.label.trim().toLowerCase());
      if (labels.filter(Boolean).length < 2) errors.push(`${n}: agregá al menos 2 opciones con texto.`);
      if (labels.some((l) => !l)) errors.push(`${n}: hay una opción vacía.`);
      if (new Set(labels).size !== labels.length) errors.push(`${n}: hay opciones repetidas.`);
    }
    const v = it.q.validation ?? {};
    if (it.q.type === 'number' && typeof v.min === 'number' && typeof v.max === 'number' && v.min > v.max) {
      errors.push(`${n}: el mínimo no puede ser mayor que el máximo.`);
    }
    const c = it.q.condition;
    if (c && isAdvancedCondition(c)) {
      if (!items.slice(0, i).some((o) => o.q.key === c.questionKey)) {
        errors.push(`${n}: depende de una pregunta que fue eliminada o quedó después.`);
      }
    } else if (c) {
      const refIndex = items.findIndex((o) => o.q.key === c.questionKey);
      if (refIndex === -1 || refIndex >= i) {
        errors.push(`${n}: depende de una pregunta que fue eliminada o quedó después. Revisá «Mostrar esta pregunta».`);
      } else {
        const ref = items[refIndex]!;
        const values = conditionValues(c);
        if (values.length === 0) errors.push(`${n}: elegí al menos una respuesta en «Mostrar esta pregunta».`);
        if (ref.q.type === 'single_choice' && values.some((val) => !ref.options.some((o) => o.value === val))) {
          errors.push(`${n}: la condición usa una opción que ya no existe en la pregunta ${refIndex + 1}.`);
        }
      }
    }
  });
  return errors;
}

// ---------- página ----------

export default function QuestionnairesPage() {
  const list = useQuery({ queryKey: ['questionnaires'], queryFn: () => api<QuestionnaireListItem[]>('/questionnaires') });
  const id = list.data?.[0]?.id;
  const detail = useQuery({
    queryKey: ['questionnaire', id],
    queryFn: () => api<QuestionnaireDetail>(`/questionnaires/${id}`),
    enabled: Boolean(id),
  });
  const [selected, setSelected] = useState<string | null>(null);

  if (list.isError || detail.isError) {
    return (
      <ErrorState
        message={errorMessage(list.error ?? detail.error)}
        onRetry={() => {
          void list.refetch();
          void detail.refetch();
        }}
      />
    );
  }
  if (list.data && list.data.length === 0) {
    return <EmptyState title="No hay cuestionarios" description="Ejecutá el seed para crear el cuestionario demo." />;
  }
  if (!detail.data) return <LoadingState rows={6} />;

  const q = detail.data;
  const draft = q.versions.find((v) => v.status === 'DRAFT');
  const published = q.versions.find((v) => v.status === 'PUBLISHED');
  const current = q.versions.find((v) => v.id === selected) ?? draft ?? published ?? q.versions[0];

  return (
    <>
      <PageHeader
        title="Cuestionarios"
        description="Definí las preguntas del asistente. Los cambios se preparan en un borrador y se aplican al publicarlo."
      />
      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <div className="flex flex-col gap-4">
          <SectionCard title={q.name} description="Versiones" bodyClassName="flex flex-col gap-1.5">
            {q.versions.map((v) => (
              <button
                key={v.id}
                onClick={() => setSelected(v.id)}
                className={cn(
                  'flex items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
                  current?.id === v.id ? 'bg-brand-50 ring-1 ring-brand-200' : 'hover:bg-slate-50',
                )}
              >
                <span>
                  <span className="font-medium text-slate-900">Versión {v.version}</span>
                  <span className="block text-xs text-slate-600">
                    {v.questions.length} preguntas · {v.sessionCount} conversaciones
                  </span>
                </span>
                <Badge className={VERSION_STYLE[v.status]}>{VERSION_LABEL[v.status]}</Badge>
              </button>
            ))}
            {!draft && published && <CreateDraftButton questionnaireId={q.id} from={published} onCreated={() => setSelected(null)} />}
          </SectionCard>
          <TemplateActions questionnaireId={q.id} versions={q.versions} hasDraft={Boolean(draft)} onImported={() => setSelected(null)} />
          <Card className="p-4 text-sm text-slate-600">
            <p className="flex items-center gap-1.5 font-medium text-slate-800">
              <Lightbulb className="size-4 text-slate-500" aria-hidden /> Cómo funciona
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Creá un borrador a partir de la versión publicada.</li>
              <li>Editá textos, opciones y condiciones. Guardá cuando quieras.</li>
              <li>Publicá: las conversaciones nuevas usan la nueva versión y las ya iniciadas conservan la suya.</li>
            </ol>
          </Card>
        </div>
        {current &&
          (current.status === 'DRAFT' ? (
            <DraftEditor key={current.id} questionnaireId={q.id} version={current} onDone={() => setSelected(null)} />
          ) : (
            <ReadOnlyVersion version={current} />
          ))}
      </div>
    </>
  );
}

/** Plantilla "Preentrevista de salud" (v2) y sus casos ficticios de ejemplo. Nada se sobrescribe. */
function TemplateActions({
  questionnaireId, versions, hasDraft, onImported,
}: { questionnaireId: string; versions: QuestionnaireVersion[]; hasDraft: boolean; onImported: () => void }) {
  const qc = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const imported = versions.some((v) => v.templateKey === 'health-v2');
  const publishedV2 = versions.some((v) => v.templateKey === 'health-v2' && v.status !== 'DRAFT');
  const importIt = useMutation({
    mutationFn: () => api<{ version: number; questionCount: number }>(`/questionnaires/${questionnaireId}/templates/health-v2`, { method: 'POST' }),
    onSuccess: (r) => {
      setMessage(`Se creó el borrador v${r.version} con ${r.questionCount} preguntas. Revisalo y publicalo cuando esté listo.`);
      void qc.invalidateQueries({ queryKey: ['questionnaire'] });
      onImported();
    },
    onError: (e) => setMessage(errorMessage(e)),
  });
  const examples = useMutation({
    mutationFn: () => api<{ created: number; total: number }>('/questionnaires/templates/health-v2/examples', { method: 'POST' }),
    onSuccess: (r) => {
      setMessage(r.created ? `Se crearon ${r.created} casos ficticios de ejemplo.` : 'Los casos de ejemplo ya existían: no se modificó nada.');
      void qc.invalidateQueries({ queryKey: ['applications'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e) => setMessage(errorMessage(e)),
  });
  return (
    <Card className="p-4 text-sm text-slate-600" data-testid="template-actions">
      <p className="font-medium text-slate-800">Preentrevista de salud</p>
      <p className="mt-1 text-xs">
        Cuestionario por secciones con datos de cada integrante, validaciones y revisión final. No es una declaración jurada.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {!imported && (
          <Button size="sm" variant="outline" disabled={hasDraft} loading={importIt.isPending} onClick={() => importIt.mutate()}>
            <Plus /> Importar como borrador
          </Button>
        )}
        {!imported && hasDraft && <p className="text-xs text-slate-500">Publicá o descartá el borrador actual para importarla.</p>}
        {publishedV2 && (
          <Button size="sm" variant="outline" loading={examples.isPending} onClick={() => examples.mutate()}>
            <Plus /> Crear 4 casos ficticios de ejemplo
          </Button>
        )}
      </div>
      {message && <p role="status" className="mt-2 text-xs text-brand-700">{message}</p>}
    </Card>
  );
}

function CreateDraftButton({ questionnaireId, from, onCreated }: { questionnaireId: string; from: QuestionnaireVersion; onCreated: () => void }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () =>
      api(`/questionnaires/${questionnaireId}/draft`, {
        method: 'PATCH',
        body: { title: from.title ?? null, templateKey: from.templateKey ?? null, questions: toPayload(from.questions.map(toItem)) },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['questionnaire'] });
      onCreated();
    },
  });
  return (
    <Button variant="outline" size="sm" className="mt-2" loading={m.isPending} onClick={() => m.mutate()}>
      <Plus /> Nuevo borrador desde v{from.version}
    </Button>
  );
}

function describeCondition(q: EditableQuestion, all: EditableQuestion[]): string | null {
  const c = q.condition;
  if (!c) return null;
  const ref = all.find((o) => o.key === c.questionKey);
  const fmt = (v: unknown) =>
    v === true ? 'Sí' : v === false ? 'No' : (ref?.options?.find((o) => o.value === v)?.label ?? String(v));
  const name = ref?.label ? `«${ref.label}»` : 'otra pregunta';
  const values = conditionValues(c);
  if (c.includes !== undefined) return `si ${name} incluye ${fmt(c.includes)}`;
  if (c.excludes !== undefined) return `si ${name} tiene una respuesta distinta de ${fmt(c.excludes)}`;
  if (c.notEquals !== undefined) return `si ${name} no es ${fmt(c.notEquals)}`;
  return `si ${name} es ${values.map(fmt).join(' o ')}`;
}

/** Agrupa preguntas consecutivas por sección (las plantillas definen `meta.section`). */
function groupBySection(questions: EditableQuestion[]) {
  const groups: { section: string | null; items: { q: EditableQuestion; n: number }[] }[] = [];
  questions.forEach((q, i) => {
    const section = typeof q.meta?.section === 'string' ? q.meta.section : null;
    const last = groups[groups.length - 1];
    if (last && last.section === section) last.items.push({ q, n: i + 1 });
    else groups.push({ section, items: [{ q, n: i + 1 }] });
  });
  return groups;
}

function ReadOnlyVersion({ version }: { version: QuestionnaireVersion }) {
  const groups = groupBySection(version.questions);
  return (
    <SectionCard
      title={
        <span className="flex flex-wrap items-center gap-2">
          Versión {version.version} {version.title && <span className="font-normal text-slate-600">· {version.title}</span>}
          <Badge className={VERSION_STYLE[version.status]}>{VERSION_LABEL[version.status]}</Badge>
        </span>
      }
      description={`${version.publishedAt ? `Publicada ${formatDateTime(version.publishedAt)} · ` : ''}${version.questions.length} preguntas · Sólo lectura: para cambiarla, creá un borrador.`}
    >
      <div className="flex flex-col gap-5">
        {groups.map((g, gi) => (
          <section key={gi}>
            {g.section && (
              <h3 className="mb-1 border-b border-slate-200 pb-1.5 text-xs font-semibold uppercase tracking-wide text-petrol-800">{g.section}</h3>
            )}
            <ol className="flex flex-col divide-y divide-slate-100">
              {g.items.map(({ q, n }) => (
                <li key={q.key} className="grid grid-cols-[1.75rem_1fr] py-2.5" title={`Clave interna: ${q.key}`}>
                  <span className="pt-px text-xs tabular-nums text-slate-500">{n}.</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium text-slate-900">{q.label}</span>
                      <Badge className="bg-slate-50 text-slate-600 ring-slate-200">{QUESTION_TYPE_LABEL[q.type]}</Badge>
                      {!q.required && <Badge className="bg-slate-50 text-slate-600 ring-slate-200">Opcional</Badge>}
                      {q.meta?.repeat ? <Badge className="bg-brand-50 text-brand-800 ring-brand-200">Por integrante</Badge> : null}
                    </div>
                    <div className="mt-1 flex flex-col gap-0.5 text-xs text-slate-600">
                      {q.options && <span>Opciones: {q.options.map((o) => o.label).join(' · ')}</span>}
                      {q.shortLabel && <span>En la ficha: {q.shortLabel}</span>}
                      {describeCondition(q, version.questions) && (
                        <span className="inline-flex items-start gap-1 text-brand-700">
                          <GitBranch className="mt-0.5 size-3 shrink-0" aria-hidden /> Se muestra {describeCondition(q, version.questions)}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </SectionCard>
  );
}

function DraftEditor({ questionnaireId, version, onDone }: { questionnaireId: string; version: QuestionnaireVersion; onDone: () => void }) {
  const qc = useQueryClient();
  const [items, setItems] = useState<DraftItem[]>(() => version.questions.map(toItem));
  const [dirty, setDirty] = useState(false);
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const errors = useMemo(() => friendlyErrors(items), [items]);

  // Avisar antes de salir con cambios sin guardar.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const touch = () => {
    setDirty(true);
    setMessage(null);
    setServerErrors([]);
  };

  /** Actualiza una pregunta; si su clave cambia, actualiza las condiciones que la referencian. */
  const update = (i: number, change: (it: DraftItem) => DraftItem) => {
    setItems((its) => {
      const before = its[i]!;
      let after = change(before);
      if (after.autoKey && after.q.label !== before.q.label) {
        const taken = new Set(its.filter((_, j) => j !== i).map((o) => o.q.key));
        after = { ...after, q: { ...after.q, key: uniqueSlug(slugify(after.q.label, `pregunta_${i + 1}`), taken) } };
      }
      const oldKey = before.q.key;
      const newKey = after.q.key;
      return its.map((it, j) => {
        if (j === i) return after;
        if (oldKey !== newKey && it.q.condition?.questionKey === oldKey) {
          return { ...it, q: { ...it.q, condition: { ...it.q.condition, questionKey: newKey } } };
        }
        return it;
      });
    });
    touch();
  };

  const move = (i: number, d: -1 | 1) => {
    setItems((its) => {
      const next = [...its];
      [next[i], next[i + d]] = [next[i + d]!, next[i]!];
      return next;
    });
    touch();
  };

  const save = useMutation({
    mutationFn: () =>
      api<{ errors: string[] }>(`/questionnaires/${questionnaireId}/draft`, { method: 'PATCH', body: { questions: toPayload(items) } }),
    onSuccess: (r) => {
      setDirty(false);
      setServerErrors(r.errors);
      setMessage(r.errors.length ? 'Borrador guardado con observaciones.' : 'Borrador guardado.');
      void qc.invalidateQueries({ queryKey: ['questionnaire'] });
    },
    onError: (e) => setMessage(errorMessage(e)),
  });
  const publish = useMutation({
    mutationFn: () => api(`/questionnaires/${questionnaireId}/publish`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['questionnaire'] });
      void qc.invalidateQueries({ queryKey: ['questionnaires'] });
      onDone();
    },
    onError: (e) => {
      const details = e instanceof ApiError ? (e.details as { errors?: string[] } | null)?.errors : null;
      if (details) setServerErrors(details);
      setMessage(errorMessage(e));
    },
  });
  const discard = useMutation({
    mutationFn: () => api(`/questionnaires/${questionnaireId}/draft`, { method: 'DELETE' }),
    onSuccess: () => {
      setDirty(false);
      void qc.invalidateQueries({ queryKey: ['questionnaire'] });
      onDone();
    },
    onError: (e) => setMessage(errorMessage(e)),
  });

  const allErrors = [...errors, ...serverErrors.filter((e) => !errors.includes(e))];
  const ready = !dirty && allErrors.length === 0;

  return (
    <Card>
      <div className="sticky top-[53px] z-10 rounded-t-lg border-b border-slate-200 bg-white px-5 py-4 lg:top-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900">Borrador · versión {version.version}</h2>
            <Badge className={VERSION_STYLE.DRAFT}>Borrador</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-rose-700"
              loading={discard.isPending}
              onClick={() => {
                if (window.confirm('¿Descartar el borrador? Se perderán los cambios no publicados.')) discard.mutate();
              }}
            >
              <Undo2 /> Descartar
            </Button>
            <Button variant="outline" size="sm" onClick={() => save.mutate()} loading={save.isPending} disabled={!dirty}>
              <Save /> Guardar borrador
            </Button>
            <Button
              variant="accent"
              size="sm"
              onClick={() => {
                if (window.confirm(`¿Publicar la versión ${version.version}? Las conversaciones nuevas la usarán; las ya iniciadas conservan su versión.`)) publish.mutate();
              }}
              loading={publish.isPending}
              disabled={!ready}
              title={dirty ? 'Guardá antes de publicar' : allErrors.length ? 'Corregí los puntos marcados' : undefined}
            >
              <Rocket /> Publicar versión
            </Button>
          </div>
        </div>
        <div className="mt-2 text-sm">
          {message && <p className="text-slate-600" role="status">{message}</p>}
          {allErrors.length > 0 ? (
            <div role="alert" data-testid="draft-errors" className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-amber-200">
              <p className="flex items-center gap-1.5 font-medium">
                <AlertTriangle className="size-4" /> Antes de publicar, revisá:
              </p>
              <ul className="mt-1 list-disc pl-6">
                {allErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          ) : dirty ? (
            <p className="text-xs text-slate-500">Hay cambios sin guardar.</p>
          ) : (
            <p className="flex items-center gap-1 text-xs text-petrol-700">
              <CheckCircle2 className="size-3.5" /> Listo para publicar.
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 p-5">
        {items.map((it, i) => (
          <QuestionEditor
            key={it.uid}
            index={i}
            item={it}
            previous={items.slice(0, i)}
            onChange={(change) => update(i, change)}
            onMove={(d) => move(i, d)}
            canUp={i > 0}
            canDown={i < items.length - 1}
            onRemove={() => {
              if (!it.q.label.trim() || window.confirm(`¿Eliminar la pregunta ${i + 1}?`)) {
                setItems((its) => its.filter((_, j) => j !== i));
                touch();
              }
            }}
          />
        ))}
        <Button
          variant="outline"
          onClick={() => {
            setItems((its) => {
              const taken = new Set(its.map((o) => o.q.key));
              const key = uniqueSlug(`pregunta_${its.length + 1}`, taken);
              return [...its, { uid: nextUid(), autoKey: true, q: { key, label: '', type: 'text', required: true }, options: [] }];
            });
            touch();
          }}
        >
          <Plus /> Agregar pregunta
        </Button>
      </div>
    </Card>
  );
}

function QuestionEditor({
  index, item, previous, onChange, onMove, onRemove, canUp, canDown,
}: {
  index: number;
  item: DraftItem;
  previous: DraftItem[];
  onChange: (change: (it: DraftItem) => DraftItem) => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
  canUp: boolean;
  canDown: boolean;
}) {
  const { q, options } = item;
  const locked = isTemplateQuestion(q);
  const setQ = (patch: Partial<EditableQuestion>) => onChange((it) => ({ ...it, q: { ...it.q, ...patch } }));
  const branchable = previous.filter((p) => p.q.type === 'single_choice' || p.q.type === 'yes_no');
  const dependsOn = previous.find((p) => p.q.key === q.condition?.questionKey);
  const selectedValues = conditionValues(q.condition);
  const id = `q-${item.uid}`;

  const setOptions = (next: DraftOption[]) => onChange((it) => ({ ...it, options: next }));
  const setOptionLabel = (uid: string, label: string) => {
    const taken = new Set(options.filter((o) => o.uid !== uid).map((o) => o.value));
    setOptions(
      options.map((o, j) =>
        o.uid === uid ? { ...o, label, value: o.auto ? uniqueSlug(slugify(label, `opcion_${j + 1}`), taken) : o.value } : o,
      ),
    );
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4" data-testid="question-editor">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Pregunta {index + 1}</span>
        <div className="flex gap-1">
          {locked && (
            <Badge className="mr-1 self-center bg-brand-50 text-brand-700 ring-brand-200" title="La estructura la define la plantilla; podés editar los textos.">
              Plantilla{q.meta?.repeat ? ' · por integrante' : ''}
            </Badge>
          )}
          <Button size="icon" variant="ghost" aria-label={`Subir pregunta ${index + 1}`} disabled={!canUp || locked} onClick={() => onMove(-1)}>
            <ArrowUp />
          </Button>
          <Button size="icon" variant="ghost" aria-label={`Bajar pregunta ${index + 1}`} disabled={!canDown || locked} onClick={() => onMove(1)}>
            <ArrowDown />
          </Button>
          <Button size="icon" variant="ghost" aria-label={`Eliminar pregunta ${index + 1}`} className="text-rose-700" disabled={locked} onClick={onRemove}>
            <Trash2 />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="flex flex-col gap-3">
          <Field label="Texto que verá el interesado" htmlFor={`${id}-label`}>
            <Input
              id={`${id}-label`}
              aria-label={`Texto pregunta ${index + 1}`}
              value={q.label}
              onChange={(e) => setQ({ label: e.target.value })}
              maxLength={300}
              placeholder="Ej.: ¿En qué ciudad vivís?"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tipo de respuesta" htmlFor={`${id}-type`} hint={TYPE_HELP[q.type]}>
              <Select
                id={`${id}-type`}
                value={q.type}
                disabled={locked}
                onChange={(e) => {
                  const type = e.target.value as QuestionType;
                  onChange((it) => ({
                    ...it,
                    q: { ...it.q, type, validation: null },
                    options:
                      type === 'single_choice' && it.options.length === 0
                        ? [
                            { uid: nextUid(), auto: true, value: 'opcion_1', label: '' },
                            { uid: nextUid(), auto: true, value: 'opcion_2', label: '' },
                          ]
                        : it.options,
                  }));
                }}
              >
                {[...new Set<QuestionType>([...EDITABLE_QUESTION_TYPES, q.type])].map((t) => (
                  <option key={t} value={t}>
                    {QUESTION_TYPE_LABEL[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Etiqueta en la ficha (opcional)" htmlFor={`${id}-short`} hint="Cómo se verá en el perfil del asesor.">
              <Input
                id={`${id}-short`}
                value={q.shortLabel ?? ''}
                onChange={(e) => setQ({ shortLabel: e.target.value })}
                maxLength={60}
                placeholder="Ej.: Ciudad"
              />
            </Field>
          </div>

          {hasChoices(q.type) && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-slate-700">Opciones</legend>
              {options.map((o, j) => (
                <div key={o.uid} className="flex items-center gap-2">
                  <span className="w-5 text-right text-xs tabular-nums text-slate-400">{j + 1}.</span>
                  <Input
                    aria-label={`Opción ${j + 1} de la pregunta ${index + 1}`}
                    value={o.label}
                    onChange={(e) => setOptionLabel(o.uid, e.target.value)}
                    maxLength={120}
                    placeholder={`Opción ${j + 1}`}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Quitar opción ${j + 1}`}
                    disabled={options.length <= 2 || locked}
                    onClick={() => setOptions(options.filter((x) => x.uid !== o.uid))}
                  >
                    <X />
                  </Button>
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="self-start"
                disabled={locked}
                onClick={() => {
                  const taken = new Set(options.map((x) => x.value));
                  setOptions([...options, { uid: nextUid(), auto: true, value: uniqueSlug(`opcion_${options.length + 1}`, taken), label: '' }]);
                }}
              >
                <Plus /> Agregar opción
              </Button>
            </fieldset>
          )}

          {q.type === 'number' && (
            <div className="grid grid-cols-2 gap-3 sm:max-w-xs">
              <Field label="Mínimo" htmlFor={`${id}-min`}>
                <Input
                  id={`${id}-min`}
                  type="number"
                  value={typeof q.validation?.min === 'number' ? q.validation.min : ''}
                  onChange={(e) =>
                    setQ({ validation: { ...(q.validation ?? {}), integer: true, min: e.target.value === '' ? undefined : Number(e.target.value) } as Record<string, number | boolean> })
                  }
                />
              </Field>
              <Field label="Máximo" htmlFor={`${id}-max`}>
                <Input
                  id={`${id}-max`}
                  type="number"
                  value={typeof q.validation?.max === 'number' ? q.validation.max : ''}
                  onChange={(e) =>
                    setQ({ validation: { ...(q.validation ?? {}), integer: true, max: e.target.value === '' ? undefined : Number(e.target.value) } as Record<string, number | boolean> })
                  }
                />
              </Field>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="size-4 accent-petrol-600" checked={q.required} onChange={(e) => setQ({ required: e.target.checked })} />
            Respuesta obligatoria
          </label>

          {locked ? (
            <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              <GitBranch className="mr-1 inline size-3" />
              {q.condition ? `Se muestra ${describeCondition(q, previous.map((p) => ({ ...p.q, options: p.options })))}.` : 'Se muestra siempre.'}
              {q.meta?.repeat ? ' Se pregunta por cada integrante.' : ''} La plantilla define cuándo se muestra.
            </p>
          ) : (
          <div className="rounded-lg bg-slate-50 p-3">
            <Field label="Mostrar esta pregunta" htmlFor={`${id}-cond`}>
              <Select
                id={`${id}-cond`}
                value={q.condition?.questionKey ?? ''}
                onChange={(e) => {
                  const ref = previous.find((p) => p.q.key === e.target.value);
                  if (!ref) return setQ({ condition: null });
                  setQ({ condition: { questionKey: ref.q.key, ...(ref.q.type === 'yes_no' ? { equals: true } : { in: [] }) } });
                }}
              >
                <option value="">Siempre</option>
                {branchable.map((p) => (
                  <option key={p.uid} value={p.q.key}>
                    Sólo según la respuesta a «{p.q.label || 'pregunta sin texto'}»
                  </option>
                ))}
                {q.condition && !dependsOn && <option value={q.condition.questionKey}>(pregunta no disponible)</option>}
              </Select>
            </Field>
            {dependsOn && dependsOn.q.type === 'yes_no' && (
              <div className="mt-2 flex gap-4 text-sm" role="radiogroup" aria-label="Respuesta que muestra la pregunta">
                {[true, false].map((v) => (
                  <label key={String(v)} className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      className="accent-petrol-600"
                      checked={q.condition?.equals === v}
                      onChange={() => setQ({ condition: { questionKey: dependsOn.q.key, equals: v } })}
                    />
                    si responde {v ? 'Sí' : 'No'}
                  </label>
                ))}
              </div>
            )}
            {dependsOn && dependsOn.q.type === 'single_choice' && (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm" role="group" aria-label="Respuestas que muestran la pregunta">
                <span className="w-full text-xs text-slate-500">si elige alguna de estas opciones:</span>
                {dependsOn.options.map((o) => {
                  const checked = selectedValues.includes(o.value);
                  return (
                    <label key={o.uid} className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        className="accent-petrol-600"
                        checked={checked}
                        onChange={() => {
                          const next = checked ? selectedValues.filter((v) => v !== o.value) : [...selectedValues, o.value];
                          setQ({ condition: { questionKey: dependsOn.q.key, in: next } });
                        }}
                      />
                      {o.label || 'opción sin texto'}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          )}

          <details className="text-xs text-slate-500">
            <summary className="cursor-pointer select-none">Avanzado</summary>
            <p className="mt-1">
              Clave interna: <code className="rounded bg-slate-100 px-1">{q.key}</code>
              {item.autoKey ? ' (se genera a partir del texto).' : ' (se conserva entre versiones para comparar respuestas).'}
            </p>
          </details>
        </div>

        <Preview q={q} options={options} />
      </div>
    </div>
  );
}

/** Vista previa de cómo verá la pregunta el interesado en el chat. */
function Preview({ q, options }: { q: EditableQuestion; options: DraftOption[] }) {
  const choices = q.type === 'yes_no' ? ['Sí', 'No'] : hasChoices(q.type) ? options.map((o) => o.label || '…') : [];
  return (
    <div className="chat-bg hidden rounded-lg p-3 lg:block" aria-hidden="true">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Vista previa</p>
      <div className="max-w-[95%] rounded-2xl rounded-bl-md bg-white px-3 py-2 text-sm text-slate-900 shadow-sm">
        {q.label || <span className="text-slate-400">Texto de la pregunta</span>}
        {!q.required && <span className="block text-[11px] text-slate-500">(opcional)</span>}
      </div>
      {choices.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {choices.map((c, i) => (
            <span key={i} className="rounded-full border border-petrol-300 bg-white px-2.5 py-1 text-xs font-medium text-brand-800">
              {c}
            </span>
          ))}
        </div>
      ) : (
        <div className="mt-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-400">
          {q.type === 'number' ? 'Escribí un número' : q.type === 'date' ? 'dd/mm/aaaa' : 'Escribí tu respuesta'}
        </div>
      )}
    </div>
  );
}
