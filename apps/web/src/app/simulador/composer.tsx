'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, MapPin, Send, SkipForward, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { AnswerInput, PublicQuestion } from '@/lib/types';
import { cn, newRequestId } from '@/lib/utils';
import { Button } from '@/components/ui';

export type Pending = {
  questionKey: string;
  value: AnswerInput;
  display: string;
  requestId: string;
  confirm?: number | 'reject';
  correction?: boolean;
};

/** Botón de opción: alto mínimo de 44 px para tocar con el dedo. */
const choice =
  'min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 text-left text-[15px] font-medium text-slate-900 transition-colors hover:border-petrol-500 hover:bg-petrol-50 disabled:opacity-50';
const inputCls =
  'h-12 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-petrol-600 focus:outline-none focus:ring-2 focus:ring-petrol-200 aria-[invalid=true]:border-rose-600';
const secondary =
  'min-h-9 rounded-md px-3 py-1.5 text-[13px] font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-50';

function SendButton({ disabled }: { disabled: boolean }) {
  return (
    <button
      type="submit"
      aria-label="Enviar respuesta"
      disabled={disabled}
      className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-petrol-600 text-white transition-colors hover:bg-petrol-700 disabled:bg-slate-200 disabled:text-slate-500"
    >
      <Send className="size-5" aria-hidden />
    </button>
  );
}

/**
 * Controles de respuesta según el tipo de pregunta: botones, selección múltiple, lista larga,
 * autocompletado de localidades y texto. "No sé", "Prefiero no responder" y "Otro" cuando la pregunta los admite.
 */
export function Composer({
  question, disabled, onSubmit, correction = false, onCancel, error,
}: {
  question: PublicQuestion;
  disabled: boolean;
  onSubmit: (p: Pending) => void;
  correction?: boolean;
  onCancel?: () => void;
  /** Mensaje de validación de la última respuesta (se muestra junto al campo). */
  error?: string | null;
}) {
  const send = (value: AnswerInput, display: string) =>
    onSubmit({ questionKey: question.key, value, display, requestId: newRequestId(), ...(correction ? { correction: true } : {}) });
  const errorId = error ? `composer-error-${question.key}` : undefined;

  const skip = !question.required && (
    <Button variant="ghost" size="sm" className="min-h-11 text-slate-700" onClick={() => send(null, 'Omitida')} disabled={disabled}>
      <SkipForward aria-hidden /> Omitir
    </Button>
  );
  const specials = (question.allowUnknown || question.allowPreferNot) && (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Otras respuestas">
      {question.allowUnknown && (
        <button type="button" className={secondary} disabled={disabled} onClick={() => send({ special: 'unknown' }, 'No sé')}>
          No sé
        </button>
      )}
      {question.allowPreferNot && (
        <button type="button" className={secondary} disabled={disabled} onClick={() => send({ special: 'prefer_not' }, 'Prefiero no responder')}>
          Prefiero no responder
        </button>
      )}
    </div>
  );

  let body: React.ReactNode;
  if (question.type === 'multi_choice') body = <MultiChoice question={question} disabled={disabled} send={send} />;
  else if (question.type === 'single_choice' || question.type === 'yes_no') body = <SingleChoice question={question} disabled={disabled} send={send} skip={skip} />;
  else if (question.type === 'locality') body = <LocalityInput question={question} disabled={disabled} send={send} errorId={errorId} />;
  else body = <TextInput question={question} disabled={disabled} send={send} skip={skip} errorId={errorId} />;

  return (
    <div
      className={cn('flex flex-col gap-2.5 border-t border-slate-200 bg-white px-3 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]', correction && 'bg-brand-50/60')}
      data-testid="composer"
    >
      {correction && (
        <div className="flex items-center justify-between gap-2 text-[13px] text-brand-900">
          <span className="min-w-0">
            Corrigiendo: <strong className="font-semibold">{question.label}</strong>
          </span>
          {onCancel && (
            <button type="button" onClick={onCancel} className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md px-2 hover:bg-brand-100">
              <X className="size-4" aria-hidden /> Cancelar
            </button>
          )}
        </div>
      )}
      {error && (
        <p id={errorId} role="alert" className="flex items-start gap-1.5 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-900">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-700" aria-hidden /> {error}
        </p>
      )}
      {body}
      {specials}
    </div>
  );
}

type SendFn = (value: AnswerInput, display: string) => void;

function OtherInput({ label, disabled, onSend }: { label: string; disabled: boolean; onSend: (text: string) => void }) {
  const [text, setText] = useState('');
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim().length >= 2) onSend(text.trim());
      }}
    >
      <input autoFocus aria-label={`Especificá: ${label}`} className={inputCls} value={text} maxLength={200}
        onChange={(e) => setText(e.target.value)} placeholder="Escribí cuál" disabled={disabled} />
      <SendButton disabled={disabled || text.trim().length < 2} />
    </form>
  );
}

function SingleChoice({ question, disabled, send, skip }: { question: PublicQuestion; disabled: boolean; send: SendFn; skip: React.ReactNode }) {
  const [otherOpen, setOtherOpen] = useState(false);
  const [selected, setSelected] = useState('');
  const yesNo = question.type === 'yes_no';
  const options = yesNo ? [{ value: 'true', label: 'Sí' }, { value: 'false', label: 'No' }] : (question.options ?? []);
  const pick = (value: string, label: string) => send(yesNo ? value === 'true' : value, label);

  // Listas largas (ej. provincias): selector nativo, cómodo en celulares.
  if (options.length > 8) {
    return (
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const o = options.find((x) => x.value === selected);
          if (o) pick(o.value, o.label);
        }}
      >
        <select aria-label="Tu respuesta" className={cn(inputCls, 'pr-8')} value={selected} disabled={disabled} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Elegí una opción…</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <SendButton disabled={disabled || !selected} />
      </form>
    );
  }
  return (
    <>
      <div className={cn('gap-2', yesNo ? 'grid grid-cols-2' : 'flex flex-wrap')} role="group" aria-label="Opciones de respuesta">
        {options.map((o) => (
          <button key={o.value} type="button" disabled={disabled} onClick={() => pick(o.value, o.label)} className={cn(choice, yesNo && 'text-center')}>
            {o.label}
          </button>
        ))}
        {question.otherLabel && (
          <button type="button" disabled={disabled} onClick={() => setOtherOpen((v) => !v)} className={cn(choice, otherOpen && 'border-petrol-500 bg-petrol-50')} aria-expanded={otherOpen}>
            {question.otherLabel}
          </button>
        )}
        {skip}
      </div>
      {otherOpen && question.otherLabel && (
        <OtherInput label={question.otherLabel} disabled={disabled} onSend={(t) => send({ other: t }, `${question.otherLabel}: ${t}`)} />
      )}
    </>
  );
}

function MultiChoice({ question, disabled, send }: { question: PublicQuestion; disabled: boolean; send: SendFn }) {
  const [values, setValues] = useState<string[]>([]);
  const [other, setOther] = useState('');
  const options = question.options ?? [];
  const toggle = (value: string) => {
    const opt = options.find((o) => o.value === value);
    setValues((cur) => {
      if (cur.includes(value)) return cur.filter((v) => v !== value);
      // Una opción excluyente ("Ninguno") reemplaza a las demás y viceversa.
      if (opt?.exclusive) return [value];
      return [...cur.filter((v) => !options.find((o) => o.value === v)?.exclusive), value];
    });
  };
  const needsOther = values.includes('other');
  const ready = values.length > 0 && (!needsOther || other.trim().length >= 2);
  const display = values
    .map((v) => (v === 'other' ? `Otro: ${other.trim()}` : (options.find((o) => o.value === v)?.label ?? v)))
    .join(', ');
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) send({ values, ...(needsOther ? { other: other.trim() } : {}) }, display);
      }}
    >
      <p className="text-xs text-slate-600">Podés elegir más de una opción.</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Opciones de respuesta">
        {options.map((o) => {
          const on = values.includes(o.value);
          return (
            <button key={o.value} type="button" aria-pressed={on} disabled={disabled} onClick={() => toggle(o.value)}
              className={cn(choice, 'inline-flex items-center gap-1.5', on && 'border-petrol-600 bg-petrol-50 text-petrol-900')}>
              {on && <Check className="size-4" aria-hidden />} {o.label}
            </button>
          );
        })}
      </div>
      {needsOther && (
        <input aria-label="Especificá: Otro" className={inputCls} value={other} maxLength={200} placeholder="¿Cuál?"
          onChange={(e) => setOther(e.target.value)} disabled={disabled} />
      )}
      <Button type="submit" variant="accent" size="lg" className="w-full sm:w-auto sm:self-end" disabled={disabled || !ready}>
        Continuar
      </Button>
    </form>
  );
}

function TextInput({ question, disabled, send, skip, errorId }: { question: PublicQuestion; disabled: boolean; send: SendFn; skip: React.ReactNode; errorId?: string }) {
  const [text, setText] = useState('');
  const [otherOpen, setOtherOpen] = useState(false);
  // Fechas con formato sugerido se escriben (DD/MM/AAAA); sin formato, selector nativo (v1).
  const inputType =
    question.type === 'number' ? 'number' : question.type === 'date' && !question.placeholder ? 'date'
      : question.type === 'email' ? 'email' : question.type === 'phone' ? 'tel' : 'text';
  const inputMode = question.type === 'number' || question.type === 'dni' ? 'numeric' : question.type === 'phone' ? 'tel' : undefined;
  return (
    <>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = text.trim();
          if (!v) return;
          send(question.type === 'number' ? Number(v) : v, v);
        }}
      >
        <input
          autoFocus
          aria-label="Tu respuesta"
          aria-invalid={errorId ? true : undefined}
          aria-describedby={errorId}
          type={inputType}
          inputMode={inputMode}
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={disabled}
          maxLength={500}
          placeholder={question.placeholder ?? (question.type === 'number' ? 'Escribí un número' : 'Escribí tu respuesta')}
          className={inputCls}
        />
        {skip}
        <SendButton disabled={disabled || !text.trim()} />
      </form>
      {question.otherLabel && (
        <>
          <button type="button" className="min-h-9 self-start rounded-md px-1 text-sm font-medium text-brand-700 underline underline-offset-2 hover:no-underline" onClick={() => setOtherOpen((v) => !v)} aria-expanded={otherOpen}>
            {question.otherLabel}
          </button>
          {otherOpen && (
            <OtherInput label={question.otherLabel} disabled={disabled} onSend={(t) => send({ other: t }, `${question.otherLabel}: ${t}`)} />
          )}
        </>
      )}
    </>
  );
}

type LocalityOption = { id: string; name: string; department: string };

/** Localidad: sugerencias del catálogo oficial mientras se escribe (tolera errores de tipeo). */
function LocalityInput({ question, disabled, send, errorId }: { question: PublicQuestion; disabled: boolean; send: SendFn; errorId?: string }) {
  const [text, setText] = useState('');
  const [results, setResults] = useState<LocalityOption[]>([]);
  const query = text.trim();
  useEffect(() => {
    if (!question.provinceId || query.length < 2) {
      setResults([]);
      return;
    }
    let active = true;
    const t = setTimeout(() => {
      api<LocalityOption[]>(`/catalog/localities?province=${question.provinceId}&q=${encodeURIComponent(query)}`)
        .then((r) => active && setResults(r))
        .catch(() => active && setResults([]));
    }, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [query, question.provinceId]);
  const label = (l: LocalityOption) => (l.department && l.department !== l.name ? `${l.name} (${l.department})` : l.name);
  const list = useMemo(() => results.slice(0, 6), [results]);
  return (
    <>
      {/* Sugerencias arriba del campo: quedan visibles aunque el teclado del celular esté abierto. */}
      {list.length > 0 && (
        <ul className="flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white" aria-label="Localidades sugeridas">
          {list.map((l) => (
            <li key={l.id} className="border-b border-slate-100 last:border-0">
              <button type="button" disabled={disabled} onClick={() => send({ localityId: l.id }, label(l))}
                className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-[15px] text-slate-900 hover:bg-petrol-50">
                <MapPin className="size-4 shrink-0 text-petrol-600" aria-hidden /> {label(l)}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (query) send(query, query);
        }}
      >
        <input autoFocus aria-label="Tu respuesta" aria-invalid={errorId ? true : undefined} aria-describedby={errorId} className={inputCls} value={text} maxLength={120} autoComplete="off"
          placeholder={question.placeholder ?? 'Escribí tu localidad'} onChange={(e) => setText(e.target.value)} disabled={disabled} />
        <SendButton disabled={disabled || !query} />
      </form>
      {question.otherLabel && query.length >= 2 && (
        <button type="button" className="min-h-9 self-start rounded-md px-1 text-left text-sm font-medium text-brand-700 underline underline-offset-2 hover:no-underline" disabled={disabled}
          onClick={() => send({ other: query }, `${query} (a verificar)`)}>
          {question.otherLabel}: registrar «{query}» para verificar
        </button>
      )}
    </>
  );
}
