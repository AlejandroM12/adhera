import type { Metadata } from 'next';
import Image, { type StaticImageData } from 'next/image';
import Link from 'next/link';
import {
  ArrowRight, BadgeCheck, Building2, Check, ClipboardCheck, HeartPulse, HelpCircle, Link2, ListChecks, MapPin,
  MessageCircle, MonitorSmartphone, ShieldCheck, UserCheck, UsersRound,
} from 'lucide-react';
import { Logo } from '@/components/logo';
import { buttonVariants } from '@/components/ui';
import { cn } from '@/lib/utils';
import panelResumen from './imagenes/panel-resumen.jpg';
import fichaFamiliar from './imagenes/ficha-familiar.jpg';
import fichaIntegrante from './imagenes/ficha-integrante.jpg';
import fichaObservaciones from './imagenes/ficha-observaciones.jpg';
import pdfIntegrante from './imagenes/pdf-integrante.jpg';

export const metadata: Metadata = {
  title: { absolute: 'Adhera · Preentrevistas de afiliación por WhatsApp' },
  description:
    'Adhera guía la conversación con tus futuros afiliados, recopila datos personales, familiares y de salud, y prepara una ficha completa para tus asesores.',
};

/**
 * Landing comercial. Se muestra en `/` a quien no tiene sesión de asesor (ver middleware);
 * con sesión, `/` sigue siendo el resumen del panel.
 * Las capturas son del producto real con los casos ficticios de presentación (prisma/presentation.ts).
 */
export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-white text-slate-900">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-brand-800 focus:ring-2 focus:ring-petrol-500">
        Saltar al contenido
      </a>
      <SiteHeader />
      <main id="contenido">
        <Hero />
        <HowItWorks />
        <Product />
        <Solutions />
        <Closing />
      </main>
      <SiteFooter />
    </div>
  );
}

const container = 'mx-auto w-full max-w-6xl px-4 sm:px-6';

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <div className={cn(container, 'flex h-16 items-center justify-between gap-4')}>
        <Link href="/" aria-label="Adhera, inicio" className="rounded-md">
          <Logo />
        </Link>
        <nav aria-label="Secciones" className="hidden items-center gap-6 text-sm font-medium text-slate-700 md:flex">
          <a href="#como-funciona" className="rounded hover:text-brand-800">Cómo funciona</a>
          <a href="#producto" className="rounded hover:text-brand-800">Producto</a>
          <a href="#soluciones" className="rounded hover:text-brand-800">Soluciones</a>
          <a href="#simulador" className="rounded hover:text-brand-800">Simulador</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
            Ingresar
          </Link>
          <Link href="/demo" className={cn(buttonVariants({ size: 'sm' }), 'hidden sm:inline-flex')}>
            Probar experiencia
          </Link>
        </div>
      </div>
    </header>
  );
}

// ───────────────────────── Hero ─────────────────────────

function Hero() {
  return (
    <section className="overflow-hidden border-b border-slate-200 bg-canvas">
      <div className={cn(container, 'grid items-center gap-10 py-10 sm:py-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-10 lg:py-16')}>
        <div>
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-petrol-200 bg-white px-3 py-1 text-xs font-semibold text-petrol-700">
            <MessageCircle className="size-3.5" aria-hidden />
            Para obras sociales y prepagas
          </p>
          <h1 className="text-balance text-[2.1rem] font-semibold leading-[1.1] tracking-tight text-brand-950 sm:text-5xl">
            Automatizá las preentrevistas de afiliación por WhatsApp.
          </h1>
          <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-slate-700 sm:text-lg">
            Transformá el primer contacto con tus futuros afiliados en una experiencia simple y organizada. Adhera guía la
            conversación, recopila información personal, familiar y antecedentes de salud, y prepara una ficha completa para
            que tus asesores puedan continuar la gestión.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link href="/demo" className={cn(buttonVariants({ variant: 'accent', size: 'lg' }), 'gap-2')}>
              Probar experiencia <ArrowRight className="size-4" aria-hidden />
            </Link>
            <a href="#como-funciona" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
              Conocer la solución
            </a>
          </div>
        </div>
        <HeroVisual />
      </div>
    </section>
  );
}

/** Conversación (ilustración) sobre la ficha real que recibe el asesor. */
function HeroVisual() {
  return (
    <figure className="relative">
      <div className="relative sm:pb-6 sm:pl-24 lg:w-[128%] lg:pb-8 lg:pl-28">
        {/* En escritorio el marco se extiende hacia el borde derecho (la sección recorta el sobrante). */}
        <BrowserFrame className="hidden sm:block">
          <Image
            src={fichaFamiliar}
            alt="Ficha de un grupo familiar en el panel de Adhera, con los puntos para revisar y el índice por persona (datos ficticios)."
            sizes="(min-width: 1024px) 760px, 90vw"
            priority
            placeholder="blur"
          />
        </BrowserFrame>
        <div className="mx-auto w-[min(100%,300px)] sm:absolute sm:bottom-0 sm:left-0 sm:w-[250px] lg:w-[240px]">
          <PhoneChat compact />
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-slate-600 sm:text-right lg:text-left lg:pl-28">
        Conversación ilustrativa y ficha del panel. Datos ficticios.
      </figcaption>
    </figure>
  );
}

/** Teléfono con una conversación de ejemplo (ilustración, no es WhatsApp real). */
function PhoneChat({ compact = false }: { compact?: boolean }) {
  return (
    <div className="rounded-[1.75rem] border border-slate-300 bg-white p-1.5 shadow-[0_24px_48px_-20px_rgba(13,24,44,0.45)]" aria-hidden>
      <div className="overflow-hidden rounded-[1.4rem] border border-slate-200">
        <div className="flex items-center gap-2.5 bg-brand-900 px-3.5 py-2.5 text-white">
          <Logo withText={false} light className="[&_svg]:size-7" />
          <div className="leading-tight">
            <p className="text-[13px] font-semibold">Adhera</p>
            <p className="text-[11px] text-brand-200">Preentrevista de afiliación</p>
          </div>
        </div>
        <div className="chat-bg space-y-2 px-2.5 py-3 text-[12.5px] leading-snug">
          <ChatBubble from="bot">¿El plan sería sólo para vos o también para tu grupo familiar?</ChatBubble>
          <ChatBubble from="user">Con grupo familiar</ChatBubble>
          <ChatBubble from="bot">Integrante 1: ¿qué vínculo tiene con vos?</ChatBubble>
          <ChatBubble from="user">Pareja conviviente</ChatBubble>
          {!compact && <ChatBubble from="bot">¿Carolina está cursando un embarazo?</ChatBubble>}
          <ChatBubble from="bot">¿Carolina toma medicación de forma habitual?</ChatBubble>
          <div className="grid grid-cols-2 gap-1.5 pt-0.5">
            <span className="rounded-md border border-petrol-300 bg-white py-1.5 text-center text-[12px] font-medium text-petrol-700">Sí</span>
            <span className="rounded-md border border-petrol-300 bg-white py-1.5 text-center text-[12px] font-medium text-petrol-700">No</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ from, children }: { from: 'bot' | 'user'; children: React.ReactNode }) {
  return (
    <div className={cn('flex', from === 'user' ? 'justify-end' : 'justify-start')}>
      <p className={cn(
        'max-w-[88%] rounded-lg px-2.5 py-1.5',
        from === 'user' ? 'rounded-br-sm bg-brand-800 text-white' : 'rounded-bl-sm border border-slate-200 bg-white text-slate-900',
      )}>
        {children}
      </p>
    </div>
  );
}

/** Marco de ventana para capturas del panel. */
function BrowserFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_20px_50px_-24px_rgba(13,24,44,0.35)]', className)}>
      <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-3 py-2" aria-hidden>
        <span className="size-2.5 rounded-full bg-slate-300" />
        <span className="size-2.5 rounded-full bg-slate-300" />
        <span className="size-2.5 rounded-full bg-slate-300" />
        <span className="ml-3 text-[11px] font-medium text-slate-500">Panel de asesores · Adhera</span>
      </div>
      {children}
    </div>
  );
}

// ───────────────────────── Cómo funciona ─────────────────────────

const MOMENTS = [
  {
    icon: MessageCircle,
    title: 'Conversación por WhatsApp',
    text: 'El interesado inicia el contacto y Adhera conduce la preentrevista con preguntas guiadas y condicionales.',
    steps: ['Un interesado inicia una conversación por WhatsApp.', 'Adhera realiza preguntas guiadas y condicionales.'],
  },
  {
    icon: ListChecks,
    title: 'Información organizada',
    text: 'Cada respuesta se valida y se ordena por sección y por persona del grupo familiar.',
    steps: ['Recopila datos personales y de los integrantes familiares.', 'Organiza las declaraciones de salud.'],
  },
  {
    icon: UserCheck,
    title: 'Revisión del asesor',
    text: 'Tu equipo recibe la ficha en el panel y sigue la gestión desde ahí.',
    steps: ['El asesor recibe una ficha estructurada.', 'Revisa, agrega observaciones y continúa el proceso.'],
  },
];

function HowItWorks() {
  let n = 0;
  return (
    <section id="como-funciona" className="scroll-mt-16 py-16 sm:py-24">
      <div className={container}>
        <SectionHeading
          eyebrow="Cómo funciona"
          title="Tus interesados responden por WhatsApp. Tu equipo recibe la información organizada."
        />
        <ol className="mt-12 grid gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 md:grid-cols-3">
          {MOMENTS.map((m, i) => (
            <li key={m.title} className="flex flex-col bg-white p-6 sm:p-7">
              <div className="flex items-center gap-3">
                <span className={cn(
                  'flex size-10 items-center justify-center rounded-lg',
                  i === 2 ? 'bg-brand-900 text-white' : 'bg-petrol-50 text-petrol-700',
                )}>
                  <m.icon className="size-5" aria-hidden />
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Momento {i + 1}</span>
              </div>
              <h3 className="mt-5 text-lg font-semibold text-slate-900">{m.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{m.text}</p>
              <ul className="mt-5 space-y-2.5 border-t border-slate-100 pt-5">
                {m.steps.map((s) => {
                  n += 1;
                  return (
                    <li key={s} className="flex gap-3 text-sm text-slate-800">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-slate-300 text-xs font-semibold text-slate-700">{n}</span>
                      <span className="pt-0.5">{s}</span>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ───────────────────────── Producto ─────────────────────────

function Product() {
  return (
    <section id="producto" className="scroll-mt-16 border-y border-slate-200 bg-canvas py-16 sm:py-24">
      <div className={container}>
        <SectionHeading
          eyebrow="El producto"
          title="Todo lo que tu equipo necesita para la preafiliación"
          description="Capturas del panel y del PDF que genera Adhera, con datos ficticios."
        />

        <div className="mt-14 space-y-16 sm:space-y-24">
          <FeatureRow
            title="Una ficha por persona, con todo el grupo familiar"
            text="La titular y cada integrante tienen su propia declaración de salud. Sólo se pregunta lo que corresponde a cada persona."
            points={[
              'Vínculo, documento, fecha de nacimiento y edad de cada integrante.',
              'Antecedentes, enfermedades crónicas, internaciones, cirugías, medicación, embarazo y estudios pendientes.',
              'Preguntas condicionales: el detalle aparece sólo si la respuesta es "Sí".',
              'Datos faltantes, contradicciones y aclaraciones marcados para la entrevista.',
            ]}
            visual={
              <div className="relative mx-auto max-w-md">
                <ShotCard
                  src={fichaIntegrante}
                  alt="Declaración de salud de un integrante del grupo familiar: cirugías, medicación y embarazo con sus preguntas de detalle (datos ficticios)."
                  className="aspect-[4/5]"
                />
              </div>
            }
          />

          <FeatureRow
            reverse
            title="Un panel para seguir cada solicitud"
            text="Tu equipo ve qué hay para revisar, quién es responsable y qué entrevistas vienen."
            points={[
              'Solicitudes pendientes de revisión con asesor responsable.',
              'Estados de gestión y agenda de entrevistas.',
              'Embudo de los últimos 30 días y actividad reciente.',
              'Búsqueda y filtros por estado y por asesor.',
            ]}
            visual={
              <BrowserFrame>
                <Image
                  src={panelResumen}
                  alt="Resumen del panel de asesores: nuevas solicitudes, pendientes de revisión, próximas entrevistas, embudo comercial y actividad (datos ficticios)."
                  sizes="(min-width: 1024px) 620px, 92vw"
                  placeholder="blur"
                />
              </BrowserFrame>
            }
          />

          <FeatureRow
            title="Observaciones y PDF listos para la entrevista"
            text="El asesor anota sobre cada respuesta sin modificar lo que declaró el interesado, y lleva la ficha impresa a la entrevista."
            points={[
              'Observaciones y aclaraciones pendientes por respuesta.',
              'Correcciones del interesado con el valor anterior.',
              'PDF A4 con una página por persona y espacio para notas.',
              'Historial de actividad de cada solicitud.',
            ]}
            visual={
              <div className="relative mx-auto max-w-lg pb-10 sm:pb-16">
                <div className="ml-auto w-[78%] rotate-1 overflow-hidden rounded-md border border-slate-200 bg-white shadow-[0_20px_50px_-24px_rgba(13,24,44,0.4)]">
                  <Image
                    src={pdfIntegrante}
                    alt="Página del PDF de la ficha con la declaración de salud de una persona y renglones para observaciones (datos ficticios)."
                    sizes="(min-width: 1024px) 400px, 70vw"
                    placeholder="blur"
                  />
                </div>
                <div className="absolute bottom-0 left-0 w-[80%] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_16px_40px_-18px_rgba(13,24,44,0.45)]">
                  <Image
                    src={fichaObservaciones}
                    alt="Observación del asesor y aclaración pendiente sobre respuestas de la ficha (datos ficticios)."
                    sizes="(min-width: 1024px) 420px, 75vw"
                    placeholder="blur"
                  />
                </div>
              </div>
            }
          />
        </div>

        <div className="mt-20 border-t border-slate-200 pt-10">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-600">Además</h3>
          <ul className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: BadgeCheck, text: 'Validación de DNI, fechas, teléfono y correo, con confirmación si algo parece mal escrito.' },
              { icon: MapPin, text: 'Provincias y localidades del catálogo oficial de Argentina.' },
              { icon: HelpCircle, text: '"No sé" y "Prefiero no responder" como respuestas válidas.' },
              { icon: ClipboardCheck, text: 'Resumen final para que el interesado revise y corrija antes de enviar.' },
              { icon: ShieldCheck, text: 'Consentimiento registrado con fecha en cada solicitud.' },
              { icon: Link2, text: 'La conversación se puede retomar donde quedó.' },
            ].map((f) => (
              <li key={f.text} className="flex gap-3 text-sm leading-relaxed text-slate-700">
                <f.icon className="mt-0.5 size-5 shrink-0 text-petrol-600" aria-hidden />
                {f.text}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function FeatureRow({ title, text, points, visual, reverse = false }: {
  title: string; text: string; points: string[]; visual: React.ReactNode; reverse?: boolean;
}) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div className={cn(reverse && 'lg:order-2')}>
        <h3 className="text-balance text-2xl font-semibold tracking-tight text-brand-950 sm:text-3xl">{title}</h3>
        <p className="mt-3 text-pretty leading-relaxed text-slate-700 sm:text-lg">{text}</p>
        <ul className="mt-6 space-y-3">
          {points.map((p) => (
            <li key={p} className="flex gap-3 text-sm leading-relaxed text-slate-800 sm:text-[15px]">
              <Check className="mt-0.5 size-5 shrink-0 text-petrol-600" aria-hidden />
              {p}
            </li>
          ))}
        </ul>
      </div>
      <div className={cn(reverse && 'lg:order-1')}>{visual}</div>
    </div>
  );
}

/** Captura recortada desde arriba dentro de una tarjeta. */
function ShotCard({ src, alt, className }: { src: StaticImageData; alt: string; className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_20px_50px_-24px_rgba(13,24,44,0.35)]', className)}>
      <Image src={src} alt={alt} fill sizes="(min-width: 1024px) 450px, 92vw" className="object-cover object-top" placeholder="blur" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-white to-transparent" aria-hidden />
    </div>
  );
}

// ───────────────────────── Soluciones ─────────────────────────

const AUDIENCES = [
  {
    icon: Building2,
    title: 'Obras sociales',
    text: 'Ordená las consultas de afiliación desde el primer mensaje.',
    points: ['Situación laboral y derivación de aportes, cuando corresponde.', 'Cobertura actual del interesado.', 'Grupo familiar con los datos de cada integrante.'],
  },
  {
    icon: HeartPulse,
    title: 'Prepagas',
    text: 'Llegá a la entrevista comercial con la preentrevista resuelta.',
    points: ['Plan individual o con grupo familiar.', 'Declaración de salud por persona, antes de la entrevista.', 'Ficha y PDF para el asesor comercial.'],
  },
  {
    icon: UsersRound,
    title: 'Equipos de afiliaciones',
    text: 'Menos carga manual e información centralizada.',
    points: ['Menos datos cargados a mano por los asesores.', 'Toda la solicitud en un solo lugar.', 'Asignación, estados y agenda de entrevistas.'],
  },
];

function Solutions() {
  return (
    <section id="soluciones" className="scroll-mt-16 py-16 sm:py-24">
      <div className={container}>
        <SectionHeading
          eyebrow="Soluciones"
          title="Para obras sociales, prepagas y equipos de afiliaciones"
          description="Adhera se adapta al circuito de preafiliación de cada organización: el interesado responde una vez y tu equipo trabaja sobre información ordenada."
        />
        <ul className="mt-12 grid gap-5 md:grid-cols-3">
          {AUDIENCES.map((a) => (
            <li key={a.title} className="flex flex-col rounded-xl border border-slate-200 bg-white p-6">
              <a.icon className="size-6 text-petrol-600" aria-hidden />
              <h3 className="mt-4 text-lg font-semibold text-slate-900">{a.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{a.text}</p>
              <ul className="mt-5 space-y-2.5 border-t border-slate-100 pt-5">
                {a.points.map((p) => (
                  <li key={p} className="flex gap-2.5 text-sm text-slate-800">
                    <Check className="mt-0.5 size-4 shrink-0 text-petrol-600" aria-hidden />
                    {p}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-col gap-3 rounded-xl border border-brand-800 bg-brand-900 p-6 text-white sm:flex-row sm:items-center sm:gap-5">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-white/10 text-petrol-300">
            <ShieldCheck className="size-6" aria-hidden />
          </span>
          <p className="text-pretty leading-relaxed text-brand-100">
            <strong className="font-semibold text-white">El asesor conserva la decisión final.</strong>{' '}
            Adhera prepara la información: no evalúa, no puntúa ni aprueba o rechaza afiliaciones.
          </p>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────── Cierre: simulador ─────────────────────────

function Closing() {
  return (
    <section id="simulador" className="scroll-mt-16 pb-16 sm:pb-24">
      <div className={container}>
        <div className="relative overflow-hidden rounded-2xl bg-brand-900 text-white">
          <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-petrol-500/20 blur-3xl" aria-hidden />
          <div className="relative grid items-center gap-10 px-6 py-12 sm:px-12 sm:py-16 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-petrol-300">Simulador</p>
              <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                Experimentá cómo funciona una preentrevista por WhatsApp.
              </h2>
              <p className="mt-4 max-w-xl text-pretty text-lg leading-relaxed text-brand-100">
                Explorá una simulación interactiva del recorrido conversacional que Adhera ofrece para la preafiliación.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link href="/demo" className={cn(buttonVariants({ variant: 'accent', size: 'lg' }), 'gap-2')}>
                  Probar simulador <ArrowRight className="size-4" aria-hidden />
                </Link>
                <Link href="/login" className="rounded px-1 text-sm font-medium text-brand-100 underline-offset-4 hover:text-white hover:underline">
                  Ingreso de asesores
                </Link>
              </div>
              <p className="mt-8 flex max-w-xl gap-2.5 text-sm leading-relaxed text-brand-200">
                <MonitorSmartphone className="mt-0.5 size-4 shrink-0 text-petrol-300" aria-hidden />
                Demostración web: reproduce la conversación en el navegador, no se conecta a WhatsApp ni envía mensajes. Usá sólo datos ficticios.
              </p>
            </div>
            <div className="mx-auto hidden w-[280px] lg:block">
              <PhoneChat />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────── Comunes ─────────────────────────

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <div className="max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-wider text-petrol-700">{eyebrow}</p>
      <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-brand-950 sm:text-4xl">{title}</h2>
      {description && <p className="mt-4 text-pretty text-lg leading-relaxed text-slate-700">{description}</p>}
    </div>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className={cn(container, 'flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between')}>
        <div>
          <Logo />
          <p className="mt-2 text-sm text-slate-600">Preentrevistas de afiliación por WhatsApp.</p>
        </div>
        <nav aria-label="Enlaces" className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium">
          <Link href="/demo" className="rounded text-brand-700 hover:underline">Probar experiencia</Link>
          <Link href="/login" className="rounded text-brand-700 hover:underline">Ingreso de asesores</Link>
        </nav>
      </div>
    </footer>
  );
}
