// Servidor falso de WhatsApp Cloud API (Graph) para pruebas E2E. Nunca contacta a Meta.
// POST /:version/:phoneNumberId/messages → registra el envío y devuelve un wamid.
// POST /_control { fail, status, code } → las próximas `fail` llamadas responden con error.
// GET  /_sent?to=<wa_id> → envíos registrados. DELETE /_sent → limpia. GET /_health.
import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_GRAPH_PORT ?? 4199);
const TOKEN = process.env.MOCK_GRAPH_TOKEN ?? 'test-access-token';
let sent = [];
let reads = 0;
let counter = 0;
let failure = { remaining: 0, status: 500, code: 1 };

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

function summarize(body, id) {
  const it = body.interactive;
  return {
    id,
    to: body.to,
    type: body.type,
    text: body.type === 'text' ? body.text?.body : it?.body?.text,
    interactive: it?.type ?? null,
    ids: it?.type === 'button'
      ? it.action.buttons.map((b) => b.reply.id)
      : it?.type === 'list'
        ? it.action.sections.flatMap((s) => s.rows.map((r) => r.id))
        : [],
    footer: it?.footer?.text ?? null,
  };
}

createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    if (url.pathname === '/_health') return json(res, 200, { ok: true });
    if (url.pathname === '/_sent' && req.method === 'GET') {
      const to = url.searchParams.get('to');
      return json(res, 200, { reads, messages: to ? sent.filter((m) => m.to === to) : sent });
    }
    if (url.pathname === '/_sent' && req.method === 'DELETE') {
      sent = [];
      reads = 0;
      return json(res, 200, { ok: true });
    }
    if (url.pathname === '/_control' && req.method === 'POST') {
      const c = JSON.parse(raw || '{}');
      failure = { remaining: c.fail ?? 0, status: c.status ?? 500, code: c.code ?? 1 };
      return json(res, 200, { ok: true });
    }
    if (/^\/v\d+\.\d+\/[^/]+\/messages$/.test(url.pathname) && req.method === 'POST') {
      if (req.headers.authorization !== `Bearer ${TOKEN}`) return json(res, 401, { error: { code: 190, message: 'Invalid OAuth access token' } });
      const body = JSON.parse(raw || '{}');
      if (body.status === 'read') {
        reads++;
        return json(res, 200, { success: true });
      }
      if (failure.remaining > 0) {
        failure.remaining--;
        return json(res, failure.status, { error: { code: failure.code, message: 'Simulated failure' } });
      }
      const id = `wamid.mock.${++counter}`;
      sent.push(summarize(body, id));
      return json(res, 200, { messaging_product: 'whatsapp', contacts: [{ wa_id: body.to }], messages: [{ id }] });
    }
    json(res, 404, { error: { message: 'not found' } });
  });
}).listen(PORT, () => console.log(`mock-graph en :${PORT}`));
