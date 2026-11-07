import { describe, expect, it } from 'vitest';
import { PdfService } from './pdf.service';
import { buildDossier } from './dossier';
import { EngineQuestion, expandSteps } from '../engine/conversation-engine';
import { healthV2Questions } from '../questionnaires/templates/health-v2';
import { healthV2Examples } from '../questionnaires/templates/health-v2.examples';

const TODAY = new Date(Date.UTC(2026, 10, 7));
const QS: EngineQuestion[] = healthV2Questions().map((q, i) => ({ ...q, id: `q${i}` }));

describe('PDF de la ficha', () => {
  it('genera un PDF A4 con una página por integrante y la hoja de notas', async () => {
    const ex = healthV2Examples(TODAY)[1]!; // titular + 2 integrantes
    const rows = expandSteps(QS, ex.answers, TODAY).map((s) => ({
      questionId: QS.find((q) => q.key === s.question.key)!.id,
      instance: s.instance,
      valueJson: ex.answers[s.id] ?? null,
      rawText: null,
      confirmationJson: null,
      createdAt: TODAY,
      revisions: [],
    }));
    const dossier = buildDossier({ questions: QS, rows, answers: ex.answers, notes: [], version: { title: 'Preentrevista de salud', templateKey: 'health-v2' }, today: TODAY });
    const pdf = await new PdfService().render({
      id: 'seed-v2-app-02', displayName: 'Gustavo Ferreyra', status: 'CONTACTED', createdAt: TODAY, completedAt: TODAY,
      assignedUser: null, session: { questionnaire: { version: 2, title: 'Preentrevista de salud' }, consentAt: TODAY },
      dossier, answers: [],
    }, TODAY);
    const text = pdf.toString('latin1');
    expect(text.startsWith('%PDF-')).toBe(true);
    // A4 = 595.28 x 841.89 puntos.
    expect(text).toMatch(/MediaBox \[0 0 595\.28 841\.89\]/);
    const pages = (text.match(/\/Type \/Page\b/g) ?? []).length;
    expect(pages).toBeGreaterThanOrEqual(5); // portada + 3 personas + notas
  }, 20_000);
});
