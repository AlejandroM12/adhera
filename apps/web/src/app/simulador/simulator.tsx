'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, CheckCheck, Link2, Pencil, RotateCcw, ShieldCheck, Sparkles } from 'lucide-react';
import { api, ApiError, errorMessage } from '@/lib/api';
import type { SessionState, TranscriptItem } from '@/lib/types';
import { cn, newRequestId } from '@/lib/utils';
import { Composer, type Pending } from './composer';
import { fictionalAnswer, fictionalNames } from './fictional';
import { Button } from '@/components/ui';
import { Logo } from '@/components/logo';

const STORAGE_KEY = 'adhera.simulator.session';

type Stored = { sessionId: string; token: string };

function readStored(): Stored | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

/**
 * Simulador conversacional público (sin login). Lo usan /demo (demostración comercial) y /simulador.
 * Usa los endpoints públicos de sesiones: el motor conversacional y la validación viven en la API.
 */
export function Simulator({ basePath = '/simulador', showPanelLink = true }: { basePath?: '/demo' | '/simulador'; showPanelLink?: boolean }) {
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
  const [correcting, setCorrecting] = useState<TranscriptItem | null>(null);
  const [filling, setFilling] = useState(false);

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
      router.replace(basePath);
      void load({ sessionId: s, token: t });
      return;
    }
    const stored = readStored();
    if (stored) void load(stored);
    else setPhase('notice');
  }, [params, router, load, basePath]);

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
        body: {
          questionKey: p.questionKey,
          value: p.value,
          requestId: p.requestId,
          ...(p.confirm !== undefined ? { confirm: p.confirm } : {}),
          ...(p.correction ? { correction: true } : {}),
        },
      });
      setState(s);
      setPending(null);
      if (p.correction && !s.pendingConfirmation) setCorrecting(null);
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

  /** Demo: responde con datos ficticios hasta la revisión final (no la confirma ni da el consentimiento). */
  async function fillFictional() {
    if (!creds || !state) return;
    setFilling(true);
    setError(null);
    const names = fictionalNames();
    let s = state;
    try {
      for (let i = 0; i < 300; i++) {
        const q = s.nextQuestion;
        const body = s.pendingConfirmation
          ? { questionKey: s.pendingConfirmation.key, value: null, confirm: 0, requestId: newRequestId() }
          : q && !q.role
            ? { questionKey: q.key, value: (await fictionalAnswer(q, names)).value, requestId: newRequestId() }
            : null;
        if (!body) break;
        s = await api<SessionState>(`/sessions/${creds.sessionId}/answers`, { method: 'POST', sessionToken: creds.token, body });
        setState(s);
      }
    } catch (e) {
      setError({ message: errorMessage(e), retryable: false });
    } finally {
      setFilling(false);
    }
  }

  function restart() {
    localStorage.removeItem(STORAGE_KEY);
    setCreds(null);
    setState(null);
    setPending(null);
    setError(null);
    setCorrecting(null);
    setAccepted(false);
    setPhase('notice');
  }

  async function copyResumeLink() {
    if (!creds) return;
    const url = `${window.location.origin}${basePath}?s=${encodeURIComponent(creds.sessionId)}&t=${encodeURIComponent(creds.token)}`;
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
  const step = currentStepLabel(state);

  return (
    <div className="flex h-dvh flex-col bg-canvas sm:h-auto sm:min-h-dvh sm:items-center sm:justify-center sm:px-6 sm:py-8">
      <div className="mb-3 hidden w-full max-w-lg items-center justify-between sm:flex">
        <Logo />
        {showPanelLink ? (
          <Link href="/solicitudes" className="rounded text-sm font-medium text-brand-700 hover:underline">
            Panel de asesores →
          </Link>
        ) : (
          <span className="text-xs font-medium text-slate-600">Demostración con datos ficticios</span>
        )}
      </div>

      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-white sm:h-[min(820px,90dvh)] sm:max-w-lg sm:flex-none sm:rounded-lg sm:border sm:border-slate-200">
        <header className="flex items-center gap-3 bg-brand-900 px-4 py-3 text-white">
          <Logo withText={false} light />
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-base font-semibold leading-tight">
              Asistente Adhera
              <span className="rounded bg-white/15 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-white" data-testid="simulator-badge">
                Simulador
              </span>
            </h1>
            <p className="truncate text-xs text-brand-200" aria-live="polite">
              {phase === 'chat' && !completed && busy ? 'Escribiendo…' : (state?.questionnaire.title ?? 'Preentrevista')}
            </p>
          </div>
          {phase === 'chat' && (
            <div className="flex gap-1">
              {!completed && (
                <button onClick={copyResumeLink} title="Copiar enlace para retomar" aria-label="Copiar enlace para retomar" className="flex size-10 items-center justify-center rounded-md hover:bg-white/10">
                  {copied ? <Check className="size-5" aria-hidden /> : <Link2 className="size-5" aria-hidden />}
                </button>
              )}
              <button
                onClick={() => {
                  const inProgress = state?.status === 'IN_PROGRESS' && state.progress.answered > 0;
                  if (!inProgress || window.confirm('¿Empezar de nuevo? Vas a iniciar una conversación nueva desde cero.')) restart();
                }}
                title="Empezar de nuevo" aria-label="Reiniciar conversación" className="flex size-10 items-center justify-center rounded-md hover:bg-white/10">
                <RotateCcw className="size-5" aria-hidden />
              </button>
            </div>
          )}
        </header>

        <p className="border-b border-slate-200 bg-slate-50 px-4 py-1.5 text-center text-xs text-slate-700" data-testid="demo-notice">
          Demostración. Usá sólo datos ficticios.
        </p>

        {phase === 'chat' && state && (
          <div className="border-b border-slate-200 bg-white px-4 pb-2.5 pt-2">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="min-w-0 truncate font-medium text-brand-900">{step}</span>
              <span className="shrink-0 tabular-nums text-slate-600" data-testid="progress">
                {state.progress.answered} de {state.progress.total}
              </span>
            </div>
            <div
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200"
              role="progressbar"
              aria-label="Progreso del cuestionario"
              aria-valuenow={completed ? 100 : progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="h-full rounded-full bg-petrol-600 transition-all duration-500" style={{ width: `${completed ? 100 : progress}%` }} />
            </div>
          </div>
        )}

        {copied && (
          <p role="status" className="border-b border-petrol-100 bg-petrol-50 px-4 py-1.5 text-center text-xs text-petrol-900">
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
            busy={busy || filling}
            error={error}
            onRetry={() => (pending ? submit(pending) : creds && load(creds))}
            onSubmit={submit}
            onComplete={complete}
            onRestart={restart}
            correcting={correcting}
            onCorrect={(item) => {
              setError(null);
              setCorrecting(item);
            }}
            onCancelCorrect={() => setCorrecting(null)}
            onFill={canFill(state) ? fillFictional : undefined}
            filling={filling}
          />
        )}
      </div>
    </div>
  );
}

const memberLabel = (m?: { name: string; titular: boolean }) => (m ? (m.titular ? `${m.name} (titular)` : m.name) : '');

/** Dónde está el interesado: sección actual (y persona), revisión final o envío. */
function currentStepLabel(state: SessionState | null): string {
  if (!state) return '';
  if (state.status === 'COMPLETED') return 'Solicitud enviada';
  if (state.canComplete) return 'Listo para enviar';
  const q = state.nextQuestion;
  if (q?.role === 'review') return 'Revisión final';
  if (q?.role === 'consent') return 'Consentimiento';
  const last = state.transcript[state.transcript.length - 1];
  const section = q?.section ?? last?.section;
  const member = q?.section ? q.member : last?.member;
  if (section) return member ? `${section} · ${memberLabel(member)}` : section;
  return state.questionnaire.title ?? state.questionnaire.name;
}

function Notice({
  accepted, setAccepted, onStart, busy, error,
}: { accepted: boolean; setAccepted: (v: boolean) => void; onStart: () => void; busy: boolean; error?: string }) {
  return (
    <div className="chat-bg flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 [&>:first-child]:mt-auto">
      <Bubble from="bot">
        ¡Hola! Soy el asistente de <strong>Adhera</strong>. Te voy a hacer algunas preguntas para preparar tu entrevista con un asesor.
      </Bubble>
      <div className="msg-in rounded-lg border border-slate-200 bg-white p-4">
        <p className="flex items-center gap-2 font-semibold text-slate-900">
          <ShieldCheck className="size-5 text-petrol-600" aria-hidden /> Antes de empezar
        </p>
        <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
          <li>• Es una demostración: usá únicamente datos ficticios.</li>
          <li>• Tus respuestas se guardan para que un asesor prepare la entrevista. No es una evaluación: no aprueba ni rechaza afiliaciones.</li>
          <li>• Podés revisar y corregir tus respuestas antes de enviarlas.</li>
        </ul>
        <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-md border border-slate-200 p-3 text-sm text-slate-900 has-[:checked]:border-petrol-500 has-[:checked]:bg-petrol-50">
          <input
            type="checkbox"
            className="mt-0.5 size-5 shrink-0 accent-petrol-600"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
          />
          Entiendo y acepto usar datos ficticios en esta demo.
        </label>
        {error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
        <Button variant="accent" size="lg" className="mt-3 w-full" disabled={!accepted} loading={busy} onClick={onStart}>
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
          'max-w-[85%] rounded-lg px-3.5 py-2 text-[15px] leading-snug',
          from === 'user' ? 'rounded-br-sm bg-brand-800 text-white' : 'rounded-bl-sm border border-slate-200 bg-white text-slate-900',
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** El botón de datos ficticios sólo aparece en la preentrevista v2, antes de la revisión final. */
function canFill(state: SessionState | null): boolean {
  if (!state?.questionnaire.title || state.status !== 'IN_PROGRESS' || state.canComplete) return false;
  const role = state.nextQuestion?.role;
  return role !== 'review' && role !== 'consent';
}

/** Divisor de sección (y persona) en el chat. */
function SectionDivider({ section, member }: { section?: string; member?: { name: string; titular: boolean } }) {
  if (!section) return null;
  return (
    <div className="mb-1 mt-3 flex items-center gap-2" data-testid="section-divider">
      <span className="h-px flex-1 bg-slate-300" />
      <span className="rounded border border-slate-200 bg-white px-2.5 py-0.5 text-center text-xs font-semibold text-brand-900">
        {section}
        {member ? ` · ${memberLabel(member)}` : ''}
      </span>
      <span className="h-px flex-1 bg-slate-300" />
    </div>
  );
}

const groupKey = (t: { section?: string; member?: { id: string } }) => `${t.section ?? ''}|${t.member?.id ?? ''}`;

/** Revisión final: todas las respuestas por sección y persona, con "Corregir". */
function ReviewPanel({ state, onCorrect, disabled }: { state: SessionState; onCorrect: (t: TranscriptItem) => void; disabled: boolean }) {
  const groups: { key: string; section?: string; member?: TranscriptItem['member']; items: TranscriptItem[] }[] = [];
  for (const t of state.transcript) {
    if (t.editable === false) continue;
    const k = groupKey(t);
    const last = groups[groups.length - 1];
    if (last && last.key === k) last.items.push(t);
    else groups.push({ key: k, section: t.section, member: t.member, items: [t] });
  }
  return (
    <div className="msg-in rounded-lg border border-slate-200 bg-white p-3" data-testid="review-panel">
      <p className="text-[15px] font-semibold text-slate-900">Resumen de tus respuestas</p>
      <p className="mb-3 text-[13px] text-slate-600">Revisá cada sección. Si algo no es correcto, tocá «Corregir»: no perdés el resto de las respuestas.</p>
      <div className="flex flex-col gap-4">
        {groups.map((g) => (
          <section key={g.key}>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-petrol-800">
              {g.section ?? 'Respuestas'}
              {g.member ? ` · ${memberLabel(g.member)}` : ''}
            </h3>
            <dl className="divide-y divide-slate-100 rounded-md border border-slate-200">
              {g.items.map((t) => (
                <div key={t.key} className="flex items-start gap-2 px-3 py-2" data-testid={`review-${t.key}`}>
                  <div className="min-w-0 flex-1">
                    <dt className="text-[13px] text-slate-600">{t.label}</dt>
                    <dd className="text-[15px] font-medium text-slate-900">{t.answer}</dd>
                  </div>
                  {state.canCorrect && t.question && (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onCorrect(t)}
                      className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md px-2 text-[13px] font-medium text-brand-700 hover:bg-brand-50"
                      aria-label={`Corregir: ${t.label}`}
                    >
                      <Pencil className="size-3.5" aria-hidden /> Corregir
                    </button>
                  )}
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}

function ChatBody({
  state, pending, busy, error, onRetry, onSubmit, onComplete, onRestart, correcting, onCorrect, onCancelCorrect, onFill, filling,
}: {
  state: SessionState | null;
  pending: Pending | null;
  busy: boolean;
  error: { message: string; retryable: boolean } | null;
  onRetry: () => void;
  onSubmit: (p: Pending) => void;
  onComplete: () => void;
  onRestart: () => void;
  correcting: TranscriptItem | null;
  onCorrect: (t: TranscriptItem) => void;
  onCancelCorrect: () => void;
  onFill?: () => void;
  filling: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [state, pending, error, correcting]);

  const completed = state?.status === 'COMPLETED';
  const question = state?.nextQuestion ?? null;
  const confirmation = state?.pendingConfirmation ?? null;
  const inReview = question?.role === 'review';
  const transcript = state?.transcript ?? [];
  const confirm = (choice: number | 'reject', display: string) => {
    if (!confirmation) return;
    onSubmit({
      questionKey: confirmation.key,
      value: null,
      display,
      requestId: newRequestId(),
      confirm: choice,
      ...(confirmation.correction ? { correction: true } : {}),
    });
  };

  const fixing = Boolean(correcting?.question && !confirmation && !pending && !completed);
  const answering = Boolean(question && !completed && !pending && !confirmation);
  // Un error de validación se muestra junto al campo; los de conexión, en el chat con "Reintentar".
  const fieldError = error && !error.retryable && (fixing || answering) ? error.message : null;
  const chatError = error && !fieldError ? error : null;

  return (
    <>
      <div className="chat-bg min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4" data-testid="chat">
        <div className="flex flex-col gap-2">
          <Bubble from="bot">¡Hola! Vamos a preparar tu preentrevista. Podés retomarla cuando quieras.</Bubble>
          {onFill && transcript.length < 3 && (
            <div className="msg-in mx-auto flex max-w-[92%] flex-col items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white/70 px-3 py-2.5 text-center text-xs text-slate-700">
              Para la demostración podés completar la preentrevista con una persona ficticia.
              <Button size="sm" variant="outline" onClick={onFill} loading={filling}>
                <Sparkles aria-hidden /> Completar con datos ficticios
              </Button>
            </div>
          )}
          {transcript.map((t, i) => (
            <div key={t.key} className="flex flex-col gap-2">
              {groupKey(t) !== groupKey(transcript[i - 1] ?? {}) && <SectionDivider section={t.section} member={t.member} />}
              <Bubble from="bot">{t.label}</Bubble>
              <Bubble from="user" testId={`answer-${t.key}`}>
                <span>{t.answer}</span>
                <CheckCheck className="ml-1.5 inline size-3.5 text-brand-200" aria-label="guardada" />
              </Bubble>
            </div>
          ))}
          {question && !completed && (
            <>
              {groupKey(question) !== groupKey(transcript[transcript.length - 1] ?? {}) && (
                <SectionDivider section={question.section} member={question.member} />
              )}
              {inReview && state && <ReviewPanel state={state} onCorrect={onCorrect} disabled={busy} />}
              <Bubble from="bot" testId="current-question" className="border-brand-200">
                <span className="font-medium">{question.label}</span>
                {!question.required && <span className="block text-xs text-slate-600">(opcional)</span>}
                {question.help && <span className="mt-1 block text-[13px] text-slate-600">{question.help}</span>}
              </Bubble>
            </>
          )}
          {pending && (
            <Bubble from="user" className="opacity-80">
              {pending.display} <span className="text-xs text-brand-200">{error ? '· no enviada' : '· enviando…'}</span>
            </Bubble>
          )}
          {confirmation && !pending && (
            <Bubble from="bot" testId="confirmation">
              {confirmation.message}
              <span className="mt-2 flex flex-col gap-1.5" role="group" aria-label="Confirmar respuesta">
                {confirmation.options.map((label, i) => (
                  <button
                    key={i}
                    type="button"
                    disabled={busy}
                    onClick={() => confirm(i, label)}
                    className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-[15px] font-medium text-slate-900 hover:border-petrol-500 hover:bg-petrol-50"
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => confirm('reject', 'Escribir de nuevo')}
                  className="min-h-11 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  Ninguna, quiero escribir de nuevo
                </button>
              </span>
            </Bubble>
          )}
          {busy && !pending && (
            <Bubble from="bot">
              <span className="flex gap-1 py-1" aria-label="Escribiendo">
                <span className="typing-dot size-1.5 rounded-full bg-slate-500" />
                <span className="typing-dot size-1.5 rounded-full bg-slate-500 [animation-delay:150ms]" />
                <span className="typing-dot size-1.5 rounded-full bg-slate-500 [animation-delay:300ms]" />
              </span>
            </Bubble>
          )}
          {chatError && (
            <div role="alert" className="msg-in mx-auto flex max-w-[90%] flex-col items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-center text-sm text-rose-900">
              {chatError.message}
              {chatError.retryable && (
                <Button size="sm" variant="outline" onClick={onRetry}>
                  Reintentar
                </Button>
              )}
            </div>
          )}
          {state?.canComplete && !completed && (
            <Bubble from="bot">
              Respondiste todas las preguntas. Al enviarlas, un asesor las revisa para preparar la entrevista.
              <Button variant="accent" size="lg" className="mt-2.5 w-full" onClick={onComplete} loading={busy}>
                Enviar solicitud
              </Button>
            </Bubble>
          )}
          {completed && (
            <Bubble from="bot" testId="completed">
              <strong>¡Gracias!</strong> Recibimos tu solicitud. Un asesor la va a revisar y te va a contactar por el canal que elegiste.
              <span className="mt-1 block text-[13px] text-slate-600">Esta preentrevista no aprueba ni rechaza la afiliación: es el primer paso para la entrevista.</span>
              <Button variant="outline" className="mt-2.5 w-full" onClick={onRestart}>
                Iniciar una nueva conversación
              </Button>
            </Bubble>
          )}
          <div ref={endRef} />
        </div>
      </div>
      {fixing ? (
        <Composer key={`fix-${correcting!.key}`} question={correcting!.question!} disabled={busy} onSubmit={onSubmit} correction onCancel={onCancelCorrect} error={fieldError} />
      ) : (
        answering && question && <Composer key={question.key} question={question} disabled={busy} onSubmit={onSubmit} error={fieldError} />
      )}
    </>
  );
}
