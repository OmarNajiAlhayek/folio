import { config as loadEnv } from 'dotenv';
loadEnv();

const API = 'http://127.0.0.1:5243/api/v1';
const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const clip = (v) => JSON.stringify(v ?? '').replace(/\s+/g, ' ').slice(0, 240);

class Session {
  constructor() {
    this.jar = {};
    this.csrf = '';
    this.user = null;
  }
  absorb(res, body) {
    for (const cookie of res.headers.getSetCookie?.() ?? []) {
      const pair = cookie.split(';')[0];
      const i = pair.indexOf('=');
      if (i > 0) this.jar[pair.slice(0, i).trim()] = pair.slice(i + 1);
    }
    if (body?.csrfToken) this.csrf = body.csrfToken;
    if (body?.user) this.user = body.user;
    else if (body?.id) this.user = body;
  }
  headers(extra = {}) {
    const headers = { ...extra };
    const cookie = Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) headers.cookie = cookie;
    if (this.csrf) headers['x-csrf-token'] = this.csrf;
    return headers;
  }
}

async function call(session, method, path, json) {
  const headers = session ? session.headers() : {};
  let body;
  if (json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(json);
  }
  let res;
  for (let i = 0; i < 5; i += 1) {
    res = await fetch(`${API}${path}`, { method, headers, body });
    if (res.status !== 429) break;
    await new Promise((r) => setTimeout(r, 20000));
  }
  const buf = Buffer.from(await res.arrayBuffer());
  let parsed = null;
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('json') || buf.slice(0, 1).toString() === '{' || buf.slice(0, 1).toString() === '[') {
    try { parsed = JSON.parse(buf.toString('utf8')); } catch { parsed = buf.toString('utf8'); }
  }
  if (session) session.absorb(res, parsed);
  return { status: res.status, body: parsed, buf };
}

async function login(email, password) {
  const s = new Session();
  const res = await call(s, 'POST', '/auth/login', { email, password });
  record(`login ${email}`, res.status === 200, `HTTP ${res.status}`);
  return res.status === 200 ? s : null;
}

function pdf() {
  const stream = 'BT\n/F1 14 Tf\n72 700 Td\n(QA) Tj\nET\n';
  const streamBytes = Buffer.from(stream, 'latin1');
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>\n', 'latin1'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>\n', 'latin1'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\n', 'latin1'),
    Buffer.concat([
      Buffer.from(`<< /Length ${streamBytes.length} >>\nstream\n`, 'latin1'),
      streamBytes,
      Buffer.from('endstream\n', 'latin1'),
    ]),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\n', 'latin1'),
  ];
  const header = Buffer.concat([
    Buffer.from('%PDF-1.4\n', 'latin1'),
    Buffer.from([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]),
  ]);
  const chunks = [header];
  const offsets = [0];
  let cursor = header.length;
  objects.forEach((body, index) => {
    const wrapped = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`, 'latin1'),
      body,
      Buffer.from('endobj\n', 'latin1'),
    ]);
    offsets.push(cursor);
    chunks.push(wrapped);
    cursor += wrapped.length;
  });
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${cursor}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(chunks);
}

async function upload(session, path, bytes, filename, mime) {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mime }), filename);
  const headers = session.headers();
  const res = await fetch(`${API}${path}`, { method: 'POST', headers, body: form });
  const buf = Buffer.from(await res.arrayBuffer());
  let body = null;
  try { body = JSON.parse(buf.toString('utf8')); } catch { body = null; }
  return { status: res.status, body, buf };
}

const reviewSlug = 'qa-review-cycle-1793375815422';
const draftSlug = 'qa-unverified-draft-1793375815422';

const author = await login('author@folio.dev', 'Author123!');
const qa = await login('qa.1793375815422@folio.dev', 'QaPass456!');
const editor = await login('editor@folio.dev', 'Editor123!');
const reviewer = await login('qa.reviewer.1793375815422@folio.dev', 'QaPass123!');
if (!author || !qa || !editor || !reviewer) process.exit(1);

const suggestions = await call(null, 'GET', '/public/submissions/author-suggestions?q=Researcher');
const names = JSON.stringify(suggestions.body);
record('author suggestions match the seeded author', suggestions.status === 200 && /Researcher/.test(names), clip(suggestions.body));

const docx = await call(qa, 'POST', '/submissions/generate-docx-standalone', {
  content: {
    defaultDir: 'ltr',
    sections: [
      { id: 't1', kind: 'title', text: 'QA constructor manuscript', lang: 'en' },
      { id: 'p1', kind: 'paragraph', html: '<p>Immediate feedback in large classes.</p>' },
    ],
  },
});
record('constructor docx is a zip', (docx.status === 200 || docx.status === 201) && docx.buf.slice(0, 2).toString() === 'PK', `HTTP ${docx.status} ${docx.buf.slice(0, 2).toString('hex')}`);

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const figure = await upload(qa, `/submissions/${draftSlug}/files?kind=figure`, png, 'dot.png', 'image/png');
record('figure png uploads', figure.status === 201 || figure.status === 200, `HTTP ${figure.status} ${clip(figure.body)}`);
if (figure.body?.id) {
  const got = await call(qa, 'GET', `/submissions/${draftSlug}/files/${figure.body.id}`);
  record('figure downloads', got.status === 200 && got.buf[0] === 0x89, `HTTP ${got.status}`);
  const del = await fetch(`${API}/submissions/${draftSlug}/files/${figure.body.id}`, { method: 'DELETE', headers: qa.headers() });
  record('figure deletes', del.status === 200 || del.status === 204, `HTTP ${del.status}`);
}

const kw = await call(qa, 'PATCH', `/submissions/${draftSlug}`, {
  keywords: 'one, two',
  keywordsAr: 'واحد, اثنان',
  titleAr: 'مسودة',
  abstractAr: 'ملخص قصير عن الاختبار.',
  articleType: 'original_research',
  originalityConfirmed: true,
  conflictOfInterestStatement: 'None declared',
  ethicalApprovalReference: 'N/A',
  aiUsageStatement: 'None',
  contributors: [{ fullName: 'QA Author', affiliation: 'Damascus University', sortOrder: 0, isCorresponding: true }],
});
record('draft accepts a short keyword list', kw.status === 200, `HTTP ${kw.status} ${clip(kw.body)}`);
const file = pdf();
for (const kind of ['cover_letter', 'title_page', 'manuscript']) {
  const up = await upload(qa, `/submissions/${draftSlug}/files?kind=${kind}`, file, `${kind}.pdf`, 'application/pdf');
  if (up.status !== 200 && up.status !== 201) record(`prep ${kind}`, false, clip(up.body));
}
const badSubmit = await call(qa, 'POST', `/submissions/${draftSlug}/submit`, { presentUploadedManuscript: true });
record('five-keyword rule blocks submit', badSubmit.status === 400 && /KEYWORD/i.test(JSON.stringify(badSubmit.body)), `HTTP ${badSubmit.status} ${clip(badSubmit.body)}`);

const suggest = await call(qa, 'POST', `/submissions/${draftSlug}/suggest-discipline`);
record('author discipline suggest degrades', suggest.status !== 500 && /UNAVAILABLE|DISABLED|not enabled/i.test(JSON.stringify(suggest.body)), `HTTP ${suggest.status} ${clip(suggest.body)}`);

const method = await call(editor, 'PATCH', `/submissions/${reviewSlug}/review-method`, { reviewMethod: 'double_anonymous' });
record('editor sets double-anonymous review', method.status === 200, `HTTP ${method.status} ${clip(method.body)}`);

const invites = await call(reviewer, 'GET', '/users/me/role-invitations');
const invitation = (Array.isArray(invites.body) ? invites.body : invites.body?.items ?? [])[0];
record('invitee sees the editor invitation after signing in again', invites.status === 200 && !!invitation?.id, `HTTP ${invites.status} ${clip(invites.body)}`);
if (invitation?.id) {
  const accepted = await call(reviewer, 'POST', `/role-invitations/${invitation.id}/accept`);
  const roles = accepted.body?.roles ?? accepted.body?.roleSlugs ?? [];
  record('invitee accepts editor', [200, 201].includes(accepted.status) && roles.includes('editor'), `HTTP ${accepted.status} ${clip(roles.length ? roles : accepted.body)}`);
}

const due = new Date(Date.now() + 5 * 86400000).toISOString();
const me = await call(reviewer, 'GET', '/auth/me');
const invite = await call(editor, 'POST', `/submissions/${reviewSlug}/assignments`, {
  reviewerId: me.body.id,
  responseDueAt: due,
  reviewDueAt: due,
});
record('second-round invite', invite.status === 200 || invite.status === 201, `HTTP ${invite.status} ${clip(invite.body)}`);
const slug = invite.body?.slug;
if (slug) {
  const accepted = await call(reviewer, 'POST', `/assignments/${slug}/accept`);
  record('accept second round', accepted.status === 200, `HTTP ${accepted.status} ${clip(accepted.body)}`);
  const up = await upload(reviewer, `/assignments/${slug}/files`, file, 'annotated.pdf', 'application/pdf');
  record('review pdf attaches before submit', up.status === 200 || up.status === 201, `HTTP ${up.status} ${clip(up.body)}`);
  if (up.body?.id) {
    const gone = await fetch(`${API}/assignments/${slug}/files/${up.body.id}`, { method: 'DELETE', headers: reviewer.headers() });
    record('review pdf withdraws before release', gone.status === 200 || gone.status === 204, `HTTP ${gone.status}`);
  }
  const up2 = await upload(reviewer, `/assignments/${slug}/files`, file, 'annotated-final.pdf', 'application/pdf');
  const filed = await call(reviewer, 'POST', `/assignments/${slug}/reviews`, {
    commentsForAuthor: 'Methods are clearer now.',
    commentsToEditorOnly: 'Fine to proceed.',
    recommendation: 'accept',
  });
  record('review submits after the file is attached', filed.status === 200 || filed.status === 201, `HTTP ${filed.status} ${clip(filed.body)}`);
  if (up2.body?.id) {
    const released = await call(editor, 'PATCH', `/submissions/${reviewSlug}/files/${up2.body.id}/release`, { released: true });
    record('editor releases the attached review file', released.status === 200, `HTTP ${released.status} ${clip(released.body)}`);
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
