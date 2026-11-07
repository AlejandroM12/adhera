export type ApplicationStatus = 'IN_PROGRESS' | 'PENDING_REVIEW' | 'CONTACTED' | 'INTERVIEW_SCHEDULED' | 'CLOSED';
export type InterviewStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
export type QuestionType =
  | 'text' | 'single_choice' | 'number' | 'yes_no' | 'date'
  | 'multi_choice' | 'dni' | 'phone' | 'email' | 'locality';

export interface UserRef {
  id: string;
  displayName: string;
}
export interface Advisor extends UserRef {
  email: string;
}

export interface ChoiceOption {
  value: string;
  label: string;
  exclusive?: boolean;
}

export interface MemberRef {
  id: string;
  name: string;
  titular: boolean;
}

export interface PublicQuestion {
  /** Paso: `clave` o `clave#integrante`. */
  key: string;
  questionKey?: string;
  label: string;
  type: QuestionType;
  required: boolean;
  options?: ChoiceOption[];
  section?: string;
  help?: string;
  placeholder?: string;
  allowUnknown?: boolean;
  allowPreferNot?: boolean;
  otherLabel?: string;
  role?: 'review' | 'consent';
  member?: MemberRef;
  /** Localidad: provincia elegida (para el autocompletado). */
  provinceId?: string;
}

/** Valor enviado al responder. */
export type AnswerInput =
  | string | number | boolean | null | string[]
  | { special: 'unknown' | 'prefer_not' }
  | { other: string }
  | { values: string[]; other?: string }
  | { localityId: string };

export interface TranscriptItem {
  key: string;
  label: string;
  answer: string;
  section?: string;
  member?: MemberRef;
  editable?: boolean;
  question?: PublicQuestion;
}

export interface SessionState {
  sessionId: string;
  status: 'IN_PROGRESS' | 'COMPLETED';
  questionnaire: { name: string; version: number; title?: string | null };
  progress: { answered: number; total: number };
  nextQuestion: PublicQuestion | null;
  pendingConfirmation?: { key: string; message: string; options: string[]; correction: boolean } | null;
  canComplete: boolean;
  canCorrect?: boolean;
  transcript: TranscriptItem[];
  startedAt: string;
  completedAt: string | null;
  resumeToken?: string;
}

export type Segment = 'submitted' | 'in_progress' | 'abandoned';

export interface ProfileField {
  key: string;
  label: string;
  value: string;
  type: QuestionType;
  long: boolean;
}

export interface ApplicationListItem {
  id: string;
  displayName: string;
  status: ApplicationStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  assignedUser: UserRef | null;
  answerCount: number;
  highlights: string[];
  lastActivityAt: string;
  segment: Segment;
  channel: Channel;
  handoffRequestedAt: string | null;
}

export type Channel = 'SIMULATOR' | 'WHATSAPP';

export interface ChannelContactInfo {
  channel: Channel;
  phone: string;
  consentAt: string | null;
  optedOut: boolean;
  lastInboundAt: string | null;
  lastDelivery: { status: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'SKIPPED'; errorCode: string | null; at: string } | null;
}

export interface ApplicationsPage extends Paginated<ApplicationListItem> {
  segments: Record<Segment | 'all', number>;
}

export interface Paginated<T> {
  total: number;
  page: number;
  limit: number;
  items: T[];
}

export type NoteKind = 'NOTE' | 'OBSERVATION' | 'CLARIFICATION';

export interface Note {
  id: string;
  content: string;
  createdAt: string;
  author: UserRef;
  kind?: NoteKind;
  /** Paso al que se refiere la observación (`clave` o `clave#integrante`). */
  questionKey?: string | null;
  resolvedAt?: string | null;
}

export interface DossierItem {
  stepId: string;
  key: string;
  label: string;
  question: string;
  answer: string;
  original: string | null;
  status: 'answered' | 'unknown' | 'prefer_not' | 'skipped' | 'to_verify';
  confirmed: { message: string; chosen: string } | null;
  corrections: { previous: string; previousOriginal: string | null; at: string }[];
  observations: Note[];
  answeredAt: string;
}

export interface DossierSection {
  title: string;
  items: DossierItem[];
}

export interface DossierMember {
  id: string;
  titular: boolean;
  name: string;
  relation: string | null;
  dni: string | null;
  birthDate: string | null;
  age: number | null;
  data: DossierItem[];
  health: DossierSection[];
}

export interface ReviewFlag {
  stepId: string | null;
  memberId: string | null;
  section: string | null;
  label: string;
  detail: string;
}

export interface Dossier {
  templateKey: string | null;
  title: string | null;
  general: DossierSection[];
  members: DossierMember[];
  review: { missing: ReviewFlag[]; contradictions: ReviewFlag[]; clarifications: ReviewFlag[] };
  counts: { answered: number; missing: number; toVerify: number };
}

export interface Interview {
  id: string;
  applicationId: string;
  scheduledAt: string;
  status: InterviewStatus;
  notes: string | null;
  nextStep: string | null;
  createdAt: string;
  updatedAt: string;
  advisor: UserRef;
  application?: { id: string; displayName: string; status: ApplicationStatus };
}

export interface ApplicationDetail {
  id: string;
  displayName: string;
  status: ApplicationStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  assignedUser: UserRef | null;
  notes: Note[];
  interviews: Interview[];
  session: {
    id: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    questionnaire: { name: string; version: number; title?: string | null; templateKey?: string | null };
    reviewConfirmedAt?: string | null;
    consentAt?: string | null;
    consentVersion?: string | null;
  } | null;
  /** Ficha por secciones e integrantes (preentrevista v2). */
  dossier?: Dossier | null;
  answers: {
    questionKey: string;
    label: string;
    type: QuestionType;
    order: number;
    display: string;
    rawText: string | null;
    answeredAt: string;
  }[];
  summary: string[];
  profile: ProfileField[];
  segment: Segment;
  lastActivityAt: string;
  channel: Channel;
  handoffRequestedAt: string | null;
  contact: ChannelContactInfo | null;
}

export interface ActivityEvent {
  id: string;
  kind: string;
  actorType: 'APPLICANT' | 'ADVISOR' | 'SYSTEM';
  actorName: string | null;
  payloadJson: Record<string, unknown> | null;
  createdAt: string;
  application?: { id: string; displayName: string };
}

export interface DashboardSummary {
  kpis: {
    newThisWeek: number;
    newPrevWeek: number;
    pendingReview: number;
    unassignedPending: number;
    handoffPending: number;
    upcomingInterviews: number;
    inProgress: number;
    abandonedRecoverable: number;
    completionRate: number | null;
  };
  funnel: { key: string; label: string; count: number }[];
  toReview: {
    id: string;
    displayName: string;
    completedAt: string | null;
    assignedUser: UserRef | null;
    highlights: string[];
    channel: Channel;
    handoffRequestedAt: string | null;
  }[];
  upcomingInterviews: Interview[];
  abandoned: { id: string; displayName: string; createdAt: string; lastActivityAt: string; answerCount: number; assignedUser: UserRef | null; highlights: string[] }[];
  recentActivity: ActivityEvent[];
}

export interface QuestionCondition {
  questionKey: string;
  equals?: string | number | boolean;
  notEquals?: string | number | boolean;
  in?: Array<string | number | boolean>;
  includes?: string;
  excludes?: string;
  answered?: boolean;
}

export interface EditableQuestion {
  key: string;
  label: string;
  shortLabel?: string | null;
  type: QuestionType;
  required: boolean;
  options?: ChoiceOption[] | null;
  condition?: QuestionCondition | null;
  validation?: Record<string, number | boolean | string> | null;
  /** Configuración de plantilla (secciones, repetición por integrante, catálogos): se conserva tal cual. */
  meta?: Record<string, unknown> | null;
}

export interface QuestionnaireVersion {
  id: string;
  version: number;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  title?: string | null;
  templateKey?: string | null;
  publishedAt: string | null;
  createdAt: string;
  sessionCount: number;
  questions: (EditableQuestion & { id: string; order: number })[];
  errors: string[];
}

export interface QuestionnaireDetail {
  id: string;
  name: string;
  versions: QuestionnaireVersion[];
}

export interface QuestionnaireListItem {
  id: string;
  name: string;
  versions: { id: string; version: number; status: string; questionCount: number; sessionCount: number }[];
}
