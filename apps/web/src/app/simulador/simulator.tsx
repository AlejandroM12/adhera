'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, CheckCheck, Link2, RotateCcw, Send, ShieldCheck, SkipForward } from 'lucide-react';
import { api, ApiError, errorMessage } from '@/lib/api';
import type { PublicQuestion, SessionState } from '@/lib/types';
import { cn, newRequestId } from '@/lib/utils';
import { Button } from '@/components/ui';
import { Logo } from '@/components/logo';

const STORAGE_KEY = 'adhera.simulator.session';

type Stored = { sessionId: string; token: string };
type Pending = { questionKey: string; value: string | number | boolean | null; display: string; requestId: string };

function readStored(): Stored | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

export function Simulator() {
  const params = useSearchParams();
  const router = useRouter();
  const [creds, setCreds] = useState<Stored | null>(null);
  const [state, setState] = useState<SessionState | null>(null);
  const [phase, setPhase] = useState<'loading' | 'notice' | 'chat'>('loading');
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async (c: Stored) => {
    try {
      const s = await api<SessionState>(`/sessions/${c.sessionId}`, { sessionToken: c.token });
      setCreds(c);
      setState(s);
      setPhase('chat');
      localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
    } catch (e) {
      if (e instanceof ApiError && (e.status === 403 || e.status === 404)) {
        localStorage.removeItem(STORAGE_KEY);
        setPhase('notice');
      } else {
        setCreds(c);
        setPhase('chat');
        setError({ message: errorMessage(e), retryable: true });
      }
    }
  }, []);

  // Retomar: enlace (?s=&t=) o sesión guardada en este navegador. Sólo al montar.
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const s = params.get('s');
    const t = params.get('t');
    if (s && t) {
      router.replace('/simulador');
      void load({ sessionId: s, token: t });
      return;
    }
    const stored = readStored();
    if (stored) void load(stored);
    else setPhase('notice');
  }, [params, router, load]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const s = await api<SessionState>('/sessions', { method: 'POST', body: { acceptedNotice: true } });
      const c = { sessionId: s.sessionId, token: s.resumeToken! };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
      setCreds(c);
      setState(s);
      setPhase('chat');
    } catch (e) {
      setError({ message: errorMessage(e), retryable: false });
    } finally {
      setBusy(false);
    }
  }

  async function submit(p: Pending) {
    if (!creds) return;
    setPending(p);
    setBusy(true);
    setError(null);
    try {
      const s = await api<SessionState>(`/sessions/${creds.sessionId}/answers`, {
        method: 'POST',
        sessionToken: creds.token,
        body: { questionKey: p.questionKey, value: p.value, requestId: p.requestId },
      });
      setState(s);
      setPending(null);
    } catch (e) {
      const retryable = !(e instanceof ApiError) || e.status === 0 || e.status >= 500;
      if (!retryable) setPending(null);
      setError({ message: errorMessage(e), retryable });
    } finally {
      setBusy(false);
    }
  }

  async function complete() {
    if (!creds) return;
    setBusy(true);
    setError(null);
    try {
      setState(await api<SessionState>(`/sessions/${creds.sessionId}/complete`, { method: 'POST', sessionToken: creds.token }));
    } catch (e) {
      setError({ message: errorMessage(e), retryable: true });
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    localStorage.removeItem(STORAGE_KEY);
    setCreds(null);
    setState(null);
    setPending(null);
    setError(null);
    setAccepted(false);
    setPhase('notice');
  }

  async function copyResumeLink() {
    if (!creds) return;
    const url = `${window.location.origin}/simulador?s=${encodeURIComponent(creds.sessionId)}&t=${encodeURIComponent(creds.token)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 3500);
    } catch {
      window.prompt('Copiá este enlace para retomar:', url);
    }
  }

  const progress = state ? Math.round((state.progress.answered / Math.max(state.progress.total, 1)) * 100) : 0;
  const completed = state?.status === 'COMPLETED';

  return (
    <div className="flex min-h-dvh flex-col bg-petrol-950 sm:items-center sm:justify-center sm:p-6">
      <div className="mb-4 hidden w-full max-w-md items-center justify-between sm:flex">
        <Logo light />
        <Link href="/solicitudes" className="text-sm text-petrol-200 hover:text-white">
          Panel de asesores →
        </Link>
      </div>

      <div className="flex w-full flex-1 flex-col overflow-hidden bg-white sm:h-[760px] sm:max-h-[88dvh] sm:max-w-md sm:flex-none sm:rounded-3xl sm:shadow-2xl">
        {/* Encabezado tipo mensajería */}
        <header className="flex items-center gap-3 bg-petrol-700 px-4 py-3 text-white">
          <div className="flex size-10 items-center justify-center rounded-full bg-white/10">
            <Logo withText={false} light />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-tight">Asistente Adhera</p>
            <p className="text-xs text-petrol-200">
              {phase === 'chat' && !completed ? (busy ? 'escribiendo…' : 'en línea') : 'preafiliación demo'}
            </p>
          </div>
          {phase === 'chat' && (
            <div className="flex gap-1">
              {!completed && (
                <button onClick={copyResumeLink} title="Copiar enlace para retomar" aria-label="Copiar enlace para retomar" className="rounded-full p-2 hover:bg-white/10">
                  {copied ? <Check className="size-5" /> : <Link2 className="size-5" />}
                </button>
              )}
              <button
                onClick={() => {
                  const inProgress = state?.status === 'IN_PROGRESS' && state.progress.answered > 0;
                  if (!inProgress || window.confirm('¿Reiniciar? Vas a empezar una conversación nueva desde cero.')) restart();
                }}
                title="Reiniciar conversación" aria-label="Reiniciar conversación" className="rounded-full p-2 hover:bg-white/10">
                <RotateCcw className="size-5" />
              </button>
            </div>
          )}
        </header>

        {phase === 'chat' && state && (
          <div className="bg-petrol-800 px-4 pb-2.5 pt-1">
            <div className="flex justify-between text-[11px] text-petrol-200">
              <span>{state.questionnaire.name}</span>
              <span data-testid="progress">
                {state.progress.answered} de {state.progress.total}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-petrol-950/40" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-turq-400 transition-all duration-500" style={{ width: `${completed ? 100 : progress}%` }} />
            </div>
          </div>
        )}

        {copied && (
          <p role="status" className="bg-turq-50 px-4 py-1.5 text-center text-xs text-turq-700">
            Enlace copiado: abrilo en cualquier navegador para retomar la conversación.
          </p>
        )}
        {phase === 'loading' && <div className="chat-bg flex-1" aria-busy="true" />}

        {phase === 'notice' && (
          <Notice accepted={accepted} setAccepted={setAccepted} onStart={start} busy={busy} error={error?.message} />
        )}

        {phase === 'chat' && (
          <ChatBody
            state={state}
            pending={pending}
            busy={busy}
            error={error}
            onRetry={() => (pending ? submit(pending) : creds && load(creds))}
            onSubmit={submit}
            onComplete={complete}
            onRestart={restart}
          />
        )}
      </div>
      <p className="hidden pt-3 text-center text-xs text-petrol-300 sm:block">Demo con datos ficticios. No ingreses información real.</p>
    </div>
  );
}

function Notice({
  accepted, setAccepted, onStart, busy, error,
}: { accepted: boolean; setAccepted: (v: boolean) => void; onStart: () => void; busy: boolean; error?: string }) {
  return (
    <div className="chat-bg flex flex-1 flex-col justify-end gap-3 p-4">
      <Bubble from="bot">
        ¡Hola! Soy el asistente de preafiliación de <strong>Adhera</strong>. Te haré unas preguntas breves para que un
        asesor pueda contactarte con todo listo.
      </Bubble>
      <div className="msg-in rounded-2xl border border-petrol-100 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-petrol-800">
          <ShieldCheck className="size-5" />
          <p className="font-semibold">Aviso de uso de datos</p>
        </div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>Esta es una demostración: usá únicamente datos ficticios.</li>
          <li>No se piden datos médicos, documentos ni información sensible.</li>
          <li>Tus respuestas se guardan para que un asesor las revise.</li>
        </ul>
        <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-slate-800">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-turq-600"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
          />
          Entiendo y acepto usar datos ficticios en esta demo.
        </label>
        {error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
        <Button variant="accent" className="mt-3 w-full" disabled={!accepted} loading={busy} onClick={onStart}>
          Comenzar conversación
        </Button>
      </div>
    </div>
  );
}

function Bubble({ from, children, className, testId }: { from: 'bot' | 'user'; children: React.ReactNode; className?: string; testId?: string }) {
  return (
    <div className={cn('msg-in flex', from === 'user' ? 'justify-end' : 'justify-start')} data-testid={testId}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3.5 py-2 text-[15px] leading-snug shadow-sm',
          from === 'user' ? 'rounded-br-md bg-turq-100 text-slate-900' : 'rounded-bl-md bg-white text-slate-900',
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

function ChatBody({
  state, pending, busy, error, onRetry, onSubmit, onComplete, onRestart,
}: {
  state: SessionState | null;
  pending: Pending | null;
  busy: boolean;
  error: { message: string; retryable: boolean } | null;
  onRetry: () => void;
  onSubmit: (p: Pending) => void;
  onComplete: () => void;
  onRestart: () => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [state, pending, error]);

  const completed = state?.status === 'COMPLETED';
  const question = state?.nextQuestion ?? null;

  return (
    <>
      <div className="chat-bg flex-1 overflow-y-auto px-3 py-4" data-testid="chat">
        <div className="flex flex-col gap-2">
          <Bubble from="bot">¡Hola! Vamos a completar tu preafiliación. Podés retomar cuando quieras.</Bubble>
          {state?.transcript.map((t) => (
            <div key={t.key} className="flex flex-col gap-2">
              <Bubble from="bot">{t.label}</Bubble>
              <Bubble from="user" testId={`answer-${t.key}`}>
                <span>{t.answer}</span>
                <CheckCheck className="ml-1.5 inline size-3.5 text-turq-600" aria-label="guardada" />
              </Bubble>
            </div>
          ))}
          {question && !completed && (
            <Bubble from="bot" testId="current-question">
              {question.label}
              {!question.required && <span className="block text-xs text-slate-500">(opcional)</span>}
            </Bubble>
          )}
          {pending && (
            <Bubble from="user" className={cn(error ? 'opacity-70' : 'opacity-80')}>
              {pending.display} <span className="text-xs text-slate-500">{error ? '· no enviada' : '· enviando…'}</span>
            </Bubble>
          )}
          {busy && !pending && (
            <Bubble from="bot">
              <span className="flex gap-1 py-1">
                <span className="typing-dot size-1.5 rounded-full bg-slate-500" />
                <span className="typing-dot size-1.5 rounded-full bg-slate-500 [animation-delay:150ms]" />
                <span className="typing-dot size-1.5 rounded-full bg-slate-500 [animation-delay:300ms]" />
              </span>
            </Bubble>
          )}
          {error && (
            <div role="alert" className="msg-in mx-auto flex max-w-[90%] flex-col items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-center text-sm text-rose-800 ring-1 ring-rose-200">
              {error.message}
              {error.retryable && (
                <Button size="sm" variant="outline" onClick={onRetry}>
                  Reintentar
                </Button>
              )}
            </div>
          )}
          {state?.canComplete && !completed && (
            <Bubble from="bot">
              ¡Listo! Respondiste todas las preguntas. ¿Enviamos tus respuestas a un asesor?
              <Button variant="accent" className="mt-2 w-full" onClick={onComplete} loading={busy}>
                Enviar solicitud
              </Button>
            </Bubble>
          )}
          {completed && (
            <Bubble from="bot" testId="completed">
              <strong>¡Gracias!</strong> Recibimos tu solicitud. Un asesor la revisará y te contactará por el canal que
              elegiste.
              <Button variant="outline" className="mt-2 w-full" onClick={onRestart}>
                Iniciar una nueva conversación
              </Button>
            </Bubble>
          )}
          <div ref={endRef} />
        </div>
      </div>
      {question && !completed && !pending && (
        <Composer key={question.key} question={question} disabled={busy} onSubmit={onSubmit} />
      )}
    </>
  );
}

function Composer({ question, disabled, onSubmit }: { question: PublicQuestion; disabled: boolean; onSubmit: (p: Pending) => void }) {
  const [text, setText] = useState('');
  const send = (value: Pending['value'], display: string) =>
    onSubmit({ questionKey: question.key, value, display, requestId: newRequestId() });

  const skip = !question.required && (
    <Button variant="ghost" size="sm" onClick={() => send(null, 'Omitida')} disabled={disabled}>
      <SkipForward /> Omitir
    </Button>
  );

  if (question.type === 'single_choice' || question.type === 'yes_no') {
    const options =
      question.type === 'yes_no'
        ? [{ value: 'true', label: 'Sí' }, { value: 'false', label: 'No' }]
        : (question.options ?? []);
    return (
      <div className="border-t border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Opciones de respuesta">
          {options.map((o) => (
            <button
              key={o.value}
              disabled={disabled}
              onClick={() => send(question.type === 'yes_no' ? o.value === 'true' : o.value, o.label)}
              className="rounded-full border border-turq-300 bg-white px-4 py-2 text-sm font-medium text-petrol-800 shadow-sm transition-colors hover:bg-turq-50 disabled:opacity-50"
            >
              {o.label}
            </button>
          ))}
          {skip}
        </div>
      </div>
    );
  }

  const inputType = question.type === 'number' ? 'number' : question.type === 'date' ? 'date' : 'text';
  return (
    <form
      className="flex items-center gap-2 border-t border-slate-200 bg-slate-50 p-3"
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
        type={inputType}
        inputMode={question.type === 'number' ? 'numeric' : undefined}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled}
        maxLength={500}
        placeholder={question.type === 'number' ? 'Escribí un número' : 'Escribí tu respuesta'}
        className="h-11 min-w-0 flex-1 rounded-full border border-slate-300 bg-white px-4 text-[15px] focus:border-turq-500 focus:outline-none focus:ring-2 focus:ring-turq-200"
      />
      {skip}
      <button
        type="submit"
        aria-label="Enviar respuesta"
        disabled={disabled || !text.trim()}
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-turq-500 text-white shadow-sm transition-colors hover:bg-turq-600 disabled:opacity-40"
      >
        <Send className="size-5" />
      </button>
    </form>
  );
}
