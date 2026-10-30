/**
 * Layer 0 live QA: API + site only. Optional services are expected to be down.
 * Reads the outbox for OTP and reset links. Does not print secrets.
 */
import { config as loadEnv } from 'dotenv';
import pg from 'pg';
import { writeFileSync } from 'fs';

loadEnv();

const API = 'http://127.0.0.1:5243/api/v1';
const results = [];

function record(name, ok, detail = '') {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`;
  results.push({ name, ok, detail });
  console.log(line);
}

function clip(value) {
  const text =
    typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return text.replace(/\s+/g, ' ').slice(0, 280);
}

function orcidFromSerial(serial) {
  const fifteen = String(serial).padStart(15, '0').slice(-15);
  let total = 0;
  for (const digit of fifteen) total = (total + Number(digit)) * 2;
  const result = (12 - (total % 11)) % 11;
  const check = result === 10 ? 'X' : String(result);
  const raw = fifteen + check;
  return raw.replace(/(\d{4})(?=\d)/g, '$1-').replace(/-([\dX])$/, '-$1');
}

function minimalPdf(title) {
  const safe = String(title)
    .replace(/[()\\]/g, ' ')
    .replace(/[^\x20-\xff]/g, '?')
    .slice(0, 80);
  const stream = `BT\n/F1 14 Tf\n72 700 Td\n(${safe}) Tj\nET\n`;
  const streamBytes = Buffer.from(stream, 'latin1');
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>\n', 'latin1'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>\n', 'latin1'),
    Buffer.from(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\n',
      'latin1',
    ),
    Buffer.concat([
      Buffer.from(`<< /Length ${streamBytes.length} >>\nstream\n`, 'latin1'),
      streamBytes,
      Buffer.from('endstream\n', 'latin1'),
    ]),
    Buffer.from(
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\n',
      'latin1',
    ),
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
  for (let i = 1; i < offsets.length; i += 1) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${cursor}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(chunks);
}

class Session {
  constructor(name) {
    this.name = name;
    this.jar = {};
    this.csrf = '';
    this.user = null;
  }
  absorb(res, body) {
    const cookies = res.headers.getSetCookie?.() ?? [];
    for (const cookie of cookies) {
      const pair = cookie.split(';')[0];
      const i = pair.indexOf('=');
      if (i > 0) this.jar[pair.slice(0, i).trim()] = pair.slice(i + 1);
    }
    if (body && typeof body.csrfToken === 'string') this.csrf = body.csrfToken;
    if (body && body.user) this.user = body.user;
    else if (body && body.id && body.email) this.user = body;
  }
  headers(extra = {}) {
    const headers = { ...extra };
    const cookie = Object.entries(this.jar)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
    if (cookie) headers.cookie = cookie;
    if (this.csrf) headers['x-csrf-token'] = this.csrf;
    return headers;
  }
}

async function call(session, method, path, opts = {}) {
  const headers = session ? session.headers(opts.headers ?? {}) : { ...(opts.headers ?? {}) };
  let body;
  if (opts.json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.json);
  } else if (opts.form) {
    body = opts.form;
  } else if (opts.raw) {
    body = opts.raw;
    if (opts.contentType) headers['content-type'] = opts.contentType;
  }
  const url = path.startsWith('http') ? path : `${API}${path}`;
  let res;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    res = await fetch(url, { method, headers, body, redirect: opts.redirect ?? 'manual' });
    if (res.status !== 429) break;
    await new Promise((r) => setTimeout(r, 15000));
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const type = res.headers.get('content-type') ?? '';
  let parsed = null;
  if (type.includes('json') || type.includes('text') || type.includes('xml')) {
    const text = buf.toString('utf8');
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (session) session.absorb(res, parsed);
  return { status: res.status, body: parsed, buf, headers: res.headers };
}

function codeOf(body) {
  if (!body || typeof body !== 'object') return '';
  return body.code || body.message || '';
}

async function expectStatus(name, res, okStatuses, detailExtra = '') {
  const ok = okStatuses.includes(res.status);
  record(
    name,
    ok,
    ok
      ? detailExtra
      : `HTTP ${res.status} ${clip(codeOf(res.body) || res.body)} ${detailExtra}`.trim(),
  );
  return ok;
}

const db = new pg.Client({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_DATABASE ?? 'folio_review',
});

async function latestOutbox(routingKey, email) {
  const { rows } = await db.query(
    `SELECT payload, status, last_error
     FROM outbound_event_outbox
     WHERE routing_key = $1
       AND payload->'user'->>'email' = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [routingKey, email],
  );
  return rows[0] ?? null;
}

function itemsOf(body) {
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.items)) return body.items;
  if (body && Array.isArray(body.data)) return body.data;
  return [];
}

const stamp = Date.now();
const qaEmail = `qa.${stamp}@folio.dev`;
const reviewerEmail = `qa.reviewer.${stamp}@folio.dev`;
const qaPassword = 'QaPass123!';
const qaPassword2 = 'QaPass456!';
const KW = 'feedback, learning, students, classes, performance';
const KW_AR = 'تغذية, تعلم, طلاب, صفوف, أداء';
const ABSTRACT =
  'This study evaluates immediate feedback, learning, students, classes, and performance in a large university course.';
const ABSTRACT_AR =
  'تقيس هذه الدراسة التغذية الراجعة والتعلم لدى الطلاب في الصفوف وأثر ذلك على الأداء.';

const constructorContent = {
  defaultDir: 'ltr',
  sections: [
    {
      id: 't1',
      kind: 'title',
      text: 'QA constructor manuscript',
      lang: 'en',
      dir: 'ltr',
      dirSource: 'manual',
    },
    {
      id: 'a1',
      kind: 'abstract',
      lang: 'en',
      text: ABSTRACT,
      keywords: KW,
      dir: 'ltr',
      dirSource: 'manual',
    },
    {
      id: 'p1',
      kind: 'paragraph',
      html: '<p>Immediate feedback changes how students perform in large classes.</p>',
      dir: 'ltr',
      dirSource: 'manual',
    },
    {
      id: 'r1',
      kind: 'references',
      items: [{ lang: 'en', html: '<p>Author. Title. Journal. 2024.</p>' }],
      dir: 'ltr',
      dirSource: 'manual',
    },
  ],
};

async function login(email, password) {
  const session = new Session(email);
  const res = await call(session, 'POST', '/auth/login', {
    json: { email, password },
  });
  const ok = res.status === 200 && !!session.csrf;
  record(`login ${email}`, ok, ok ? '' : `HTTP ${res.status} ${clip(res.body)}`);
  return ok ? session : null;
}

async function upload(session, slug, kind, bytes, filename, mime) {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mime }), filename);
  return call(session, 'POST', `/submissions/${slug}/files?kind=${kind}`, { form });
}

async function main() {
  await db.connect();

  const health = await call(null, 'GET', '/health');
  await expectStatus('health', health, [200]);
  const outbox = await call(null, 'GET', '/health/outbox');
  const outboxOk =
    outbox.status === 200 &&
    typeof outbox.body?.pending === 'number' &&
    outbox.body.pending > 0;
  record(
    'outbox waiting while broker is down',
    outboxOk,
    clip(outbox.body),
  );

  const journals = await call(null, 'GET', '/public/journals');
  const journalItems = itemsOf(journals.body);
  record(
    'nine public journals',
    journals.status === 200 && journalItems.length === 9,
    `HTTP ${journals.status} count=${journalItems.length}`,
  );
  const badJournal = await call(null, 'GET', '/public/journals/not-a-journal');
  await expectStatus('bad journal slug', badJournal, [404]);
  const badYear = await call(null, 'GET', '/public/journals/econj/issues/1800/1');
  await expectStatus('issue year out of range', badYear, [400]);

  const issueRows = await db.query(
    `SELECT j.slug, i.year, i.number, i.status
     FROM journal_issues i
     JOIN journals j ON j.id = i.journal_id
     ORDER BY i.status, j.slug`,
  );
  const publishedIssue = issueRows.rows.find((r) => r.status === 'published');
  const openIssue = issueRows.rows.find((r) => r.status === 'open');
  if (publishedIssue) {
    const pub = await call(
      null,
      'GET',
      `/public/journals/${publishedIssue.slug}/issues/${publishedIssue.year}/${publishedIssue.number}`,
    );
    await expectStatus(
      'published issue is public',
      pub,
      [200],
      `${publishedIssue.slug} ${publishedIssue.year}/${publishedIssue.number}`,
    );
  } else record('published issue is public', false, 'no published issue in seed');
  if (openIssue) {
    const hidden = await call(
      null,
      'GET',
      `/public/journals/${openIssue.slug}/issues/${openIssue.year}/${openIssue.number}`,
    );
    await expectStatus(
      'open issue is hidden',
      hidden,
      [404],
      `${openIssue.slug} ${openIssue.year}/${openIssue.number}`,
    );
  } else record('open issue is hidden', false, 'no open issue in seed');

  const board = await call(null, 'GET', '/public/journals/econj/editorial-board');
  const boardItems = itemsOf(board.body?.members ?? board.body);
  record(
    'editorial board endpoint (empty seed is expected)',
    board.status === 200,
    `HTTP ${board.status} members=${boardItems.length}`,
  );

  const catalog = await call(
    null,
    'GET',
    '/public/submissions?q=' + encodeURIComponent('سياسات'),
  );
  const catalogItems = itemsOf(catalog.body);
  record(
    'catalog search',
    catalog.status === 200 && catalogItems.length > 0,
    `HTTP ${catalog.status} count=${catalogItems.length}`,
  );
  const suggestions = await call(
    null,
    'GET',
    '/public/submissions/author-suggestions?q=Author',
  );
  record(
    'author suggestions',
    suggestions.status === 200,
    `HTTP ${suggestions.status} ${clip(suggestions.body)}`,
  );
  if (catalogItems[0]?.slug) {
    const related = await call(
      null,
      'GET',
      `/public/submissions/${catalogItems[0].slug}/related`,
    );
    const relatedOk =
      related.status === 200 &&
      (Array.isArray(related.body) || Array.isArray(related.body?.items));
    record(
      'related articles degrade without AI',
      relatedOk,
      relatedOk ? '' : `HTTP ${related.status} ${clip(related.body)}`,
    );
    const detail = await call(
      null,
      'GET',
      `/public/submissions/${catalogItems[0].slug}`,
    );
    const files = detail.body?.files ?? detail.body?.publicFiles ?? [];
    const pdf = Array.isArray(files)
      ? files.find((f) => f.mimeType === 'application/pdf' || /pdf/i.test(f.originalName ?? ''))
      : null;
    if (detail.status === 200 && pdf?.id) {
      const downloaded = await call(
        null,
        'GET',
        `/public/submissions/${catalogItems[0].slug}/files/${pdf.id}`,
      );
      const isPdf = downloaded.buf.slice(0, 5).toString() === '%PDF-';
      record(
        'public article PDF opens',
        downloaded.status === 200 && isPdf,
        `HTTP ${downloaded.status} bytes=${downloaded.buf.length}`,
      );
    } else {
      record(
        'public article PDF opens',
        false,
        `detail HTTP ${detail.status} files=${clip(files)}`,
      );
    }
  }
  const styles = await call(null, 'GET', '/public/manuscript-styles');
  record(
    'manuscript style catalog',
    styles.status === 200 && Array.isArray(styles.body?.styles ?? styles.body),
    `HTTP ${styles.status}`,
  );
  const oaiBad = await call(null, 'GET', '/oai?verb=badVerb');
  const oaiText = typeof oaiBad.body === 'string' ? oaiBad.body : clip(oaiBad.body);
  record(
    'OAI badVerb',
    oaiBad.status === 200 && /badVerb|error/i.test(oaiText),
    `HTTP ${oaiBad.status} ${oaiText.slice(0, 120)}`,
  );
  const oaiId = await call(null, 'GET', '/oai?verb=Identify');
  const oaiIdText = typeof oaiId.body === 'string' ? oaiId.body : clip(oaiId.body);
  record(
    'OAI Identify',
    oaiId.status === 200 && /Identify|repositoryName/i.test(oaiIdText),
    `HTTP ${oaiId.status}`,
  );
  const orcid = await call(null, 'GET', '/auth/orcid?mode=login&locale=en');
  const orcidOff =
    orcid.status === 400 &&
    (codeOf(orcid.body) === 'ORCID_DISABLED' || /not configured/i.test(clip(orcid.body)));
  record('ORCID disabled', orcidOff, `HTTP ${orcid.status} ${clip(orcid.body)}`);

  const author = await login('author@folio.dev', 'Author123!');
  const manager = await login('manager@folio.local', 'Manager123!');
  const editor = await login('editor@folio.dev', 'Editor123!');
  const lawEditor = await login('editor.lawj@folio.dev', 'Editor123!');
  const section = await login('section.eduj@folio.dev', 'Section123!');
  const reviewer = await login('reviewer@folio.dev', 'Reviewer123!');
  const copyeditor = await login('copyeditor@folio.local', 'Copyeditor123!');
  if (!author || !manager || !editor || !lawEditor || !section || !reviewer || !copyeditor) {
    throw new Error('seed login failed; remaining flows skipped');
  }

  const wrong = await call(null, 'POST', '/auth/login', {
    json: { email: 'author@folio.dev', password: 'not-the-password' },
  });
  await expectStatus('wrong password', wrong, [401]);

  const editorList = itemsOf((await call(editor, 'GET', '/submissions')).body);
  const lawList = itemsOf((await call(lawEditor, 'GET', '/submissions')).body);
  const sectionList = itemsOf((await call(section, 'GET', '/submissions')).body);
  const editorTitles = editorList.map((s) => s.title ?? '');
  const lawTitles = lawList.map((s) => s.title ?? '');
  const sectionTitles = sectionList.map((s) => s.title ?? '');
  record(
    'economics editor does not see the legal manuscript',
    editorTitles.some((t) => t.includes('Digital Publishing and Open-Access Policy')) &&
      !editorTitles.some((t) => t.includes('Personal Data Protection')),
    `econj=${editorTitles.length}`,
  );
  record(
    'law editor does not see the economics manuscript',
    lawTitles.some((t) => t.includes('Personal Data Protection')) &&
      !lawTitles.some((t) => t.includes('Digital Publishing and Open-Access Policy')),
    `lawj=${lawTitles.length}`,
  );
  record(
    'education section editor sees the assigned revisions demo',
    sectionTitles.some((t) => t.includes('Immediate Feedback')),
    sectionTitles.map((t) => t.slice(0, 40)).join(' | ') || 'empty',
  );
  const econSample = editorList.find((s) =>
    (s.title ?? '').includes('Digital Publishing and Open-Access Policy'),
  );
  if (econSample?.slug) {
    const denied = await call(lawEditor, 'GET', `/submissions/${econSample.slug}`);
    await expectStatus('law editor cannot open an economics manuscript', denied, [403, 404]);
  }

  const authorList = itemsOf((await call(author, 'GET', '/submissions')).body);
  record(
    'author queue is only their own manuscripts',
    authorList.length > 0 &&
      authorList.every((s) => !s.authorId || s.authorId === author.user?.id),
    `count=${authorList.length} author=${author.user?.id ?? 'missing'}`,
  );
  const statusDenied = await call(author, 'PATCH', `/submissions/${authorList[0]?.slug}/status`, {
    json: { status: 'rejected' },
  });
  await expectStatus('author cannot decide a manuscript', statusDenied, [403]);

  const me = await call(author, 'GET', '/auth/me');
  record(
    'profile has ORCID and is not held for completion',
    me.status === 200 && typeof me.body?.orcid === 'string' && me.body.orcid.includes('-'),
    `orcid=${me.body?.orcid ? 'set' : 'missing'} emailVerified=${me.body?.emailVerified}`,
  );
  const locale = await call(author, 'PATCH', '/auth/me', { json: { preferredLocale: 'ar' } });
  const localeBack = await call(author, 'PATCH', '/auth/me', { json: { preferredLocale: 'en' } });
  record(
    'profile locale updates',
    locale.status === 200 && localeBack.status === 200,
    `HTTP ${locale.status}/${localeBack.status}`,
  );
  const profile = await call(author, 'PATCH', '/auth/me/researcher-profile', {
    json: { affiliation: 'Damascus University — QA', willingToReview: true },
  });
  record(
    'researcher profile updates',
    profile.status === 200 && /QA/.test(profile.body?.affiliation ?? ''),
    `HTTP ${profile.status} ${clip(profile.body?.affiliation ?? profile.body)}`,
  );

  const sessionsA = author;
  const sessionsB = await login('author@folio.dev', 'Author123!');
  const listed = await call(sessionsA, 'GET', '/auth/sessions');
  const sessionRows = itemsOf(listed.body?.sessions ?? listed.body);
  record(
    'session list shows more than one device',
    listed.status === 200 && sessionRows.length >= 2,
    `HTTP ${listed.status} count=${sessionRows.length}`,
  );
  const other = sessionRows.find((s) => s.current === false || s.isCurrent === false);
  if (other?.id) {
    const revoked = await call(sessionsA, 'DELETE', `/auth/sessions/${other.id}`);
    await expectStatus('revoke one session', revoked, [200, 204]);
    const refreshDead = await call(sessionsB, 'POST', '/auth/refresh');
    await expectStatus('revoked session cannot refresh', refreshDead, [401]);
  } else {
    record('revoke one session', false, clip(sessionRows[0]));
  }
  const sessionsC = await login('author@folio.dev', 'Author123!');
  const revokeOthers = await call(sessionsA, 'POST', '/auth/sessions/revoke-others');
  await expectStatus('revoke other sessions', revokeOthers, [200, 201, 204]);
  if (sessionsC) {
    const refreshOthers = await call(sessionsC, 'POST', '/auth/refresh');
    await expectStatus('other sessions are revoked', refreshOthers, [401]);
  }
  const stillHere = await call(sessionsA, 'GET', '/auth/me');
  await expectStatus('current session survives revoke-others', stillHere, [200]);

  const qaOrcid = orcidFromSerial(`9${String(stamp).slice(-14)}`);
  const reviewerOrcid = orcidFromSerial(`8${String(stamp).slice(-14)}`);
  const registered = await call(null, 'POST', '/auth/register', {
    json: {
      email: qaEmail,
      password: qaPassword,
      displayName: 'QA Author',
      affiliation: 'Damascus University',
      orcid: qaOrcid,
    },
  });
  const qa = new Session(qaEmail);
  if (registered.status === 200 || registered.status === 201) {
    qa.absorb(registered, registered.body);
    record('register while mail is down', true, '');
  } else {
    record('register while mail is down', false, `HTTP ${registered.status} ${clip(registered.body)}`);
  }
  const qaLogin = await call(qa, 'POST', '/auth/login', {
    json: { email: qaEmail, password: qaPassword },
  });
  record('unverified user can sign in', qaLogin.status === 200, `HTTP ${qaLogin.status}`);

  const options = await call(qa, 'GET', '/submissions/journal-options');
  const econ = itemsOf(options.body).find((j) => j.slug === 'econj');
  record('journal options include economics', !!econ?.id, `HTTP ${options.status}`);

  let unverifiedSlug = null;
  if (econ?.id) {
    const draft = await call(qa, 'POST', '/submissions', {
      json: {
        journalId: econ.id,
        title: `QA unverified draft ${stamp}`,
        abstract: ABSTRACT,
      },
    });
    unverifiedSlug = draft.body?.slug;
    record('unverified user can save a draft', draft.status === 201 || draft.status === 200, `HTTP ${draft.status} ${clip(draft.body)}`);
    if (unverifiedSlug) {
      const blocked = await call(qa, 'POST', `/submissions/${unverifiedSlug}/submit`, {
        json: { presentUploadedManuscript: true },
      });
      await expectStatus('unverified user cannot submit', blocked, [403], codeOf(blocked.body));
    }
  }
  const badCode = await call(qa, 'POST', '/auth/verify-email', { json: { code: '000000' } });
  await expectStatus('bad verification code', badCode, [400, 401]);
  const otpRow = await latestOutbox('auth.verification_otp', qaEmail);
  const otp = otpRow?.payload?.otpCode;
  record(
    'verification OTP is stored in the outbox',
    typeof otp === 'string' && /^\d{6}$/.test(otp) && otpRow.status === 'pending',
    otpRow ? `status=${otpRow.status}` : 'no row',
  );
  if (typeof otp === 'string') {
    const verified = await call(qa, 'POST', '/auth/verify-email', { json: { code: otp } });
    await expectStatus('verify email from outbox OTP', verified, [200, 201]);
    const welcome = await latestOutbox('auth.registration_welcome', qaEmail);
    record(
      'welcome event queued without a mailer',
      !!welcome && welcome.status === 'pending',
      welcome ? welcome.status : 'no row',
    );
  }

  const forgot = await call(null, 'POST', '/auth/forgot-password', { json: { email: qaEmail } });
  await expectStatus('forgot password always accepts', forgot, [200]);
  const unknownReset = await call(null, 'GET', '/auth/reset-password/validate?token=not-a-real-token');
  record(
    'unknown reset token is rejected',
    unknownReset.status === 200
      ? unknownReset.body?.valid === false || unknownReset.body?.ok === false
      : [400, 404].includes(unknownReset.status),
    `HTTP ${unknownReset.status} ${clip(unknownReset.body)}`,
  );
  const resetRow = await latestOutbox('auth.password_reset', qaEmail);
  const resetUrl = resetRow?.payload?.resetUrl ?? '';
  const tokenMatch = String(resetUrl).match(/[?&]token=([^&]+)/);
  const resetToken = tokenMatch ? decodeURIComponent(tokenMatch[1]) : '';
  record(
    'reset link is stored in the outbox',
    resetToken.length > 10 && resetRow.status === 'pending',
    resetRow ? resetRow.status : 'no row',
  );
  if (resetToken) {
    const valid = await call(
      null,
      'GET',
      `/auth/reset-password/validate?token=${encodeURIComponent(resetToken)}`,
    );
    record(
      'reset token validates',
      valid.status === 200 && valid.body?.valid !== false,
      `HTTP ${valid.status} ${clip(valid.body)}`,
    );
    const reset = await call(null, 'POST', '/auth/reset-password', {
      json: { token: resetToken, password: qaPassword2 },
    });
    await expectStatus('password reset completes', reset, [200, 201]);
    const oldLogin = await call(null, 'POST', '/auth/login', {
      json: { email: qaEmail, password: qaPassword },
    });
    await expectStatus('old password fails after reset', oldLogin, [401]);
    const newLogin = await call(qa, 'POST', '/auth/login', {
      json: { email: qaEmail, password: qaPassword2 },
    });
    await expectStatus('new password signs in', newLogin, [200]);
  }

  const reviewerReg = await call(null, 'POST', '/auth/register', {
    json: {
      email: reviewerEmail,
      password: qaPassword,
      displayName: 'QA Reviewer',
      affiliation: 'Damascus University',
      orcid: reviewerOrcid,
      willingToReview: true,
    },
  });
  const qaReviewer = new Session(reviewerEmail);
  record(
    'second account registers',
    reviewerReg.status === 200 || reviewerReg.status === 201,
    `HTTP ${reviewerReg.status} ${clip(reviewerReg.body)}`,
  );
  if (reviewerReg.status === 200 || reviewerReg.status === 201) {
    qaReviewer.absorb(reviewerReg, reviewerReg.body);
    await call(qaReviewer, 'POST', '/auth/login', {
      json: { email: reviewerEmail, password: qaPassword },
    });
    const reviewerOtp = (await latestOutbox('auth.verification_otp', reviewerEmail))?.payload?.otpCode;
    if (reviewerOtp) {
      const verified = await call(qaReviewer, 'POST', '/auth/verify-email', {
        json: { code: reviewerOtp },
      });
      await expectStatus('second account verifies', verified, [200, 201]);
    }
  }

  const userList = await call(manager, 'GET', `/users?q=${encodeURIComponent(reviewerEmail)}&limit=20`);
  const qaReviewerRow = itemsOf(userList.body).find((u) => u.email === reviewerEmail);
  record('manager can find the new user', !!qaReviewerRow?.id, `HTTP ${userList.status}`);
  if (qaReviewerRow?.id) {
    const granted = await call(manager, 'PATCH', `/users/${qaReviewerRow.id}/roles`, {
      json: { roleSlugs: ['author', 'reviewer', 'copyeditor'] },
    });
    const slugs = granted.body?.roleSlugs ?? granted.body?.roles?.map((r) => r.slug) ?? [];
    record(
      'manager grants reviewer and copyeditor',
      granted.status === 200 && slugs.includes('reviewer') && slugs.includes('copyeditor'),
      `HTTP ${granted.status} ${clip(slugs.length ? slugs : granted.body)}`,
    );
    const invited = await call(manager, 'POST', `/users/${qaReviewerRow.id}/role-invitations`, {
      json: { roleSlug: 'editor' },
    });
    await expectStatus('manager invites an editor', invited, [200, 201]);
    const mine = await call(qaReviewer, 'GET', '/users/me/role-invitations');
    const invitation = itemsOf(mine.body)[0];
    record(
      'invitee sees the role invitation',
      mine.status === 200 && !!invitation?.id,
      `HTTP ${mine.status} ${clip(mine.body)}`,
    );
    if (invitation?.id) {
      const accepted = await call(qaReviewer, 'POST', `/role-invitations/${invitation.id}/accept`);
      const acceptedSlugs =
        accepted.body?.roleSlugs ?? accepted.body?.roles?.map((r) => r.slug) ?? [];
      record(
        'invitee accepts the editor invitation',
        [200, 201].includes(accepted.status) && acceptedSlugs.includes('editor'),
        `HTTP ${accepted.status} ${clip(acceptedSlugs.length ? acceptedSlugs : accepted.body)}`,
      );
    }
    const selfGrant = await call(manager, 'PATCH', `/users/${manager.user?.id}/roles`, {
      json: { roleSlugs: ['journal_manager', 'editor'] },
    });
    record(
      'manager cannot grant themselves editor',
      selfGrant.status === 400,
      `HTTP ${selfGrant.status} ${codeOf(selfGrant.body)}`,
    );
  }

  if (!econ?.id) throw new Error('no economics journal');
  const meta = {
    journalId: econ.id,
    abstract: ABSTRACT,
    abstractAr: ABSTRACT_AR,
    titleAr: 'مقالة اختبار',
    articleType: 'original_research',
    keywords: KW,
    keywordsAr: KW_AR,
    contributors: [
      {
        fullName: 'QA Author',
        email: 'author@folio.dev',
        affiliation: 'Damascus University',
        sortOrder: 0,
        isCorresponding: true,
      },
    ],
    fundingStatement: 'None',
    conflictOfInterestStatement: 'None declared',
    ethicalApprovalReference: 'N/A',
    originalityConfirmed: true,
    aiUsageStatement: 'No generative AI was used.',
  };

  const reviewDraft = await call(author, 'POST', '/submissions', {
    json: { ...meta, title: `QA review cycle ${stamp}` },
  });
  const reviewSlug = reviewDraft.body?.slug;
  record('bilingual draft created', !!reviewSlug, `HTTP ${reviewDraft.status} ${clip(reviewDraft.body)}`);
  if (!reviewSlug) throw new Error('draft create failed');

  const badKw = await call(author, 'PATCH', `/submissions/${reviewSlug}`, {
    json: { keywords: 'one, two' },
  });
  await expectStatus('short keyword list can be saved on a draft', badKw, [200]);
  const badSubmit = await call(author, 'POST', `/submissions/${reviewSlug}/submit`, {
    json: { presentUploadedManuscript: true },
  });
  record(
    'submit rejects a keyword list that is not five words',
    badSubmit.status === 400 && /KEYWORD|keyword/i.test(clip(badSubmit.body)),
    `HTTP ${badSubmit.status} ${codeOf(badSubmit.body)}`,
  );
  await call(author, 'PATCH', `/submissions/${reviewSlug}`, { json: { keywords: KW } });

  const textFile = await upload(
    author,
    reviewSlug,
    'manuscript',
    Buffer.from('not a manuscript'),
    'notes.txt',
    'text/plain',
  );
  record(
    'text file rejected',
    [400, 415].includes(textFile.status),
    `HTTP ${textFile.status} ${codeOf(textFile.body)}`,
  );
  const fakePdf = await upload(
    author,
    reviewSlug,
    'manuscript',
    Buffer.from('%PDF-1.4\nthis is not a pdf'),
    'fake.pdf',
    'application/pdf',
  );
  record(
    'header-only PDF rejected',
    [400, 415].includes(fakePdf.status),
    `HTTP ${fakePdf.status} ${codeOf(fakePdf.body)}`,
  );
  const pdf = minimalPdf('QA review cycle');
  for (const kind of ['cover_letter', 'title_page', 'manuscript']) {
    const up = await upload(author, reviewSlug, kind, pdf, `${kind}.pdf`, 'application/pdf');
    record(`upload ${kind}`, up.status === 201 || up.status === 200, `HTTP ${up.status} ${codeOf(up.body)}`);
  }
  const figure = await upload(author, reviewSlug, 'figure', pdf, 'figure.pdf', 'application/pdf');
  const figureId = figure.body?.id;
  if (figureId) {
    const downloaded = await call(author, 'GET', `/submissions/${reviewSlug}/files/${figureId}`);
    record(
      'uploaded file downloads',
      downloaded.status === 200 && downloaded.buf.slice(0, 5).toString() === '%PDF-',
      `HTTP ${downloaded.status}`,
    );
    const deleted = await call(author, 'DELETE', `/submissions/${reviewSlug}/files/${figureId}`);
    await expectStatus('uploaded file deletes', deleted, [200, 204]);
  } else record('uploaded file downloads', false, clip(figure.body));

  const docx = await call(author, 'POST', '/submissions/generate-docx-standalone', {
    json: { content: constructorContent },
  });
  record(
    'constructor exports a docx',
    docx.status === 200 && docx.buf.slice(0, 2).toString() === 'PK',
    `HTTP ${docx.status} bytes=${docx.buf.length} ${codeOf(docx.body)}`,
  );
  const attached = await call(author, 'POST', `/submissions/${reviewSlug}/generate-docx?attach=true`, {
    json: { content: constructorContent, attach: true, attachKind: 'manuscript_constructor' },
  });
  record(
    'constructor docx attaches to the draft',
    attached.status === 200 || attached.status === 201,
    `HTTP ${attached.status} ${codeOf(attached.body)}`,
  );

  const submitted = await call(author, 'POST', `/submissions/${reviewSlug}/submit`, {
    json: { presentUploadedManuscript: true },
  });
  await expectStatus('author submits with AI off', submitted, [200], submitted.body?.status);

  const detail = await call(author, 'GET', `/submissions/${reviewSlug}`);
  const hasTimeline = !!(
    detail.body?.timeline ||
    detail.body?.history ||
    detail.body?.events ||
    detail.body?.statusHistory
  );
  record(
    'submission detail exposes progress',
    detail.status === 200 && (hasTimeline || detail.body?.status === 'submitted'),
    `status=${detail.body?.status} timeline=${hasTimeline}`,
  );

  const discipline = await call(editor, 'POST', `/submissions/${reviewSlug}/suggest-discipline`);
  record(
    'discipline suggest degrades with AI off',
    [400, 404, 409, 422, 503].includes(discipline.status) && discipline.status !== 500,
    `HTTP ${discipline.status} ${codeOf(discipline.body)}`,
  );
  const keywords = await call(author, 'POST', '/submissions/suggest-keywords-preview', {
    json: { title: 'QA', abstract: ABSTRACT },
  });
  record(
    'keyword suggest degrades with AI off',
    [400, 404, 409, 422, 503].includes(keywords.status) && keywords.status !== 500,
    `HTTP ${keywords.status} ${codeOf(keywords.body)}`,
  );

  const method = await call(editor, 'PATCH', `/submissions/${reviewSlug}/review-method`, {
    json: { reviewMethod: 'double_blind' },
  });
  await expectStatus('editor sets double-blind', method, [200]);
  const toReview = await call(editor, 'PATCH', `/submissions/${reviewSlug}/status`, {
    json: { status: 'under_review' },
  });
  await expectStatus('editor moves submitted to under review', toReview, [200], toReview.body?.status);

  const authorId = author.user?.id;
  if (authorId) {
    const selfInvite = await call(editor, 'POST', `/submissions/${reviewSlug}/assignments`, {
      json: { reviewerId: authorId },
    });
    record(
      'author cannot be invited as reviewer',
      [400, 403, 409].includes(selfInvite.status),
      `HTTP ${selfInvite.status} ${codeOf(selfInvite.body)}`,
    );
  }

  const due = new Date(Date.now() + 7 * 86400000).toISOString();
  const inviteDecline = await call(editor, 'POST', `/submissions/${reviewSlug}/assignments`, {
    json: {
      reviewerId: reviewer.user.id,
      responseDueAt: due,
      reviewDueAt: due,
    },
  });
  const declineSlug = inviteDecline.body?.slug;
  await expectStatus('editor invites the seed reviewer', inviteDecline, [200, 201], declineSlug ?? '');
  if (declineSlug) {
    const files = detail.body?.files ?? (await call(author, 'GET', `/submissions/${reviewSlug}`)).body?.files ?? [];
    const manuscript = (Array.isArray(files) ? files : []).find((f) => f.kind === 'manuscript');
    if (manuscript?.id) {
      const early = await call(
        reviewer,
        'GET',
        `/submissions/${reviewSlug}/files/${manuscript.id}`,
      );
      await expectStatus('review file download refused before accept', early, [403]);
    } else record('review file download refused before accept', false, 'no manuscript id');
    const earlyReview = await call(reviewer, 'POST', `/assignments/${declineSlug}/reviews`, {
      json: {
        commentsForAuthor: 'Too early',
        commentsToEditorOnly: 'Too early',
        recommendation: 'accept',
      },
    });
    await expectStatus('review submit refused before accept', earlyReview, [400, 403]);
    const form = new FormData();
    form.append('file', new Blob([pdf], { type: 'application/pdf' }), 'review.pdf');
    const earlyUpload = await call(reviewer, 'POST', `/assignments/${declineSlug}/files`, { form });
    await expectStatus('review file upload refused before accept', earlyUpload, [400, 403]);
    const declined = await call(reviewer, 'POST', `/assignments/${declineSlug}/decline`);
    await expectStatus('reviewer declines the invitation', declined, [200, 201]);
  }

  await call(qaReviewer, 'POST', '/auth/login', {
    json: { email: reviewerEmail, password: qaPassword },
  });
  const qaReviewerMe = await call(qaReviewer, 'GET', '/auth/me');
  qaReviewer.user = qaReviewerMe.body;
  const inviteAccept = await call(editor, 'POST', `/submissions/${reviewSlug}/assignments`, {
    json: { reviewerId: qaReviewer.user?.id, responseDueAt: due, reviewDueAt: due },
  });
  const acceptSlug = inviteAccept.body?.slug;
  await expectStatus('editor invites the second reviewer', inviteAccept, [200, 201], codeOf(inviteAccept.body));
  if (acceptSlug) {
    const accepted = await call(qaReviewer, 'POST', `/assignments/${acceptSlug}/accept`);
    await expectStatus('reviewer accepts', accepted, [200, 201], accepted.body?.status);
    const manuscript = (
      (await call(author, 'GET', `/submissions/${reviewSlug}`)).body?.files ?? []
    ).find((f) => f.kind === 'manuscript');
    if (manuscript?.id) {
      const pack = await call(
        qaReviewer,
        'GET',
        `/submissions/${reviewSlug}/files/${manuscript.id}`,
      );
      record(
        'accepted reviewer downloads the review package',
        pack.status === 200 && pack.buf.slice(0, 5).toString() === '%PDF-',
        `HTTP ${pack.status}`,
      );
    }
    const filed = await call(qaReviewer, 'POST', `/assignments/${acceptSlug}/reviews`, {
      json: {
        commentsForAuthor: 'Please expand the methods and clarify the figure.',
        commentsToEditorOnly: 'Recommend minor revisions.',
        recommendation: 'minor_revisions',
      },
    });
    await expectStatus('reviewer submits a recommendation', filed, [200, 201]);
    const form = new FormData();
    form.append('file', new Blob([pdf], { type: 'application/pdf' }), 'annotated.pdf');
    const reviewFile = await call(qaReviewer, 'POST', `/assignments/${acceptSlug}/files`, { form });
    const reviewFileId = reviewFile.body?.id;
    record(
      'reviewer attaches a review file',
      reviewFile.status === 200 || reviewFile.status === 201,
      `HTTP ${reviewFile.status} ${codeOf(reviewFile.body)}`,
    );
    const discussion = await call(qaReviewer, 'POST', `/assignments/${acceptSlug}/discussions`, {
      json: { subject: 'Figure 1', body: 'Is the axis label final?' },
    });
    await expectStatus('reviewer opens a discussion', discussion, [200, 201]);
    if (reviewFileId) {
      const withdrawn = await call(
        qaReviewer,
        'DELETE',
        `/assignments/${acceptSlug}/files/${reviewFileId}`,
      );
      await expectStatus('reviewer withdraws the review file before release', withdrawn, [200, 204]);
    }
    const form2 = new FormData();
    form2.append('file', new Blob([pdf], { type: 'application/pdf' }), 'annotated-final.pdf');
    const reviewFile2 = await call(qaReviewer, 'POST', `/assignments/${acceptSlug}/files`, {
      form: form2,
    });
    const releaseId = reviewFile2.body?.id;
    if (releaseId) {
      const released = await call(
        editor,
        'PATCH',
        `/submissions/${reviewSlug}/files/${releaseId}/release`,
        { json: { released: true } },
      );
      await expectStatus('editor releases the review file', released, [200]);
      const authorView = await call(
        author,
        'GET',
        `/submissions/${reviewSlug}/files/${releaseId}`,
      );
      record(
        'author downloads the released review file',
        authorView.status === 200,
        `HTTP ${authorView.status}`,
      );
    }
  }

  const missingSeverity = await call(editor, 'PATCH', `/submissions/${reviewSlug}/status`, {
    json: { status: 'revisions_requested', messageForAuthor: 'Please revise.' },
  });
  record(
    'revisions without severity are refused',
    missingSeverity.status === 400,
    `HTTP ${missingSeverity.status} ${codeOf(missingSeverity.body)}`,
  );
  const revised = await call(editor, 'PATCH', `/submissions/${reviewSlug}/status`, {
    json: {
      status: 'revisions_requested',
      revisionSeverity: 'minor',
      messageForAuthor: 'Please expand the methods.',
    },
  });
  await expectStatus('editor requests minor revisions', revised, [200], revised.body?.status);
  const notesBefore = await call(author, 'GET', '/notifications?limit=20');
  record(
    'author notifications exist without a broker',
    notesBefore.status === 200,
    `HTTP ${notesBefore.status} count=${itemsOf(notesBefore.body).length}`,
  );
  const resubmitUpload = await upload(
    author,
    reviewSlug,
    'manuscript',
    minimalPdf('QA revised'),
    'revised.pdf',
    'application/pdf',
  );
  record(
    'author uploads a revised manuscript',
    resubmitUpload.status === 200 || resubmitUpload.status === 201,
    `HTTP ${resubmitUpload.status} ${codeOf(resubmitUpload.body)}`,
  );
  const resubmit = await call(author, 'POST', `/submissions/${reviewSlug}/submit`, {
    json: {
      presentUploadedManuscript: true,
      authorResponseToReviewers: 'Methods section expanded.',
    },
  });
  await expectStatus('author resubmits after revisions', resubmit, [200], resubmit.body?.status);

  const copyDraft = await call(author, 'POST', '/submissions', {
    json: { ...meta, title: `QA copyedit cycle ${stamp}`, titleAr: 'تدقيق اختبار' },
  });
  const copySlug = copyDraft.body?.slug;
  record('copyedit draft created', !!copySlug, `HTTP ${copyDraft.status}`);
  if (copySlug) {
    for (const kind of ['cover_letter', 'title_page', 'manuscript']) {
      await upload(author, copySlug, kind, pdf, `${kind}.pdf`, 'application/pdf');
    }
    const sent = await call(author, 'POST', `/submissions/${copySlug}/submit`, {
      json: { presentUploadedManuscript: true },
    });
    await expectStatus('copyedit manuscript submitted', sent, [200]);
    const under = await call(editor, 'PATCH', `/submissions/${copySlug}/status`, {
      json: { status: 'under_review' },
    });
    await expectStatus('copyedit manuscript enters review', under, [200]);
    const accepted = await call(editor, 'PATCH', `/submissions/${copySlug}/status`, {
      json: { status: 'accepted', messageForAuthor: 'Accepted for copyediting.' },
    });
    await expectStatus('editor accepts after review', accepted, [200], accepted.body?.status);
    const assigned = await call(editor, 'POST', `/submissions/${copySlug}/copyedit-assignments`, {
      json: { copyeditorId: copyeditor.user.id },
    });
    const ceSlug = assigned.body?.slug;
    await expectStatus('editor assigns the copyeditor', assigned, [200, 201], ceSlug ?? codeOf(assigned.body));
    if (ceSlug) {
      const note = await call(copyeditor, 'POST', `/copyedit-assignments/${ceSlug}/notes`, {
        json: {
          noteForAuthor: 'Please confirm the terminology in the abstract.',
          noteToEditorOnly: 'No structural concerns.',
        },
      });
      await expectStatus('copyeditor sends a query round', note, [200, 201]);
      const tooSoon = await call(copyeditor, 'POST', `/submissions/${copySlug}/publish`, {
        json: { issueId: '00000000-0000-4000-8000-000000000000' },
      });
      record(
        'publish refused before the author is ready',
        [400, 403, 404].includes(tooSoon.status),
        `HTTP ${tooSoon.status} ${codeOf(tooSoon.body)}`,
      );
      const notReady = await call(author, 'POST', `/copyedit-assignments/${ceSlug}/ready`);
      record(
        'ready refused until a new manuscript is uploaded',
        [400, 409].includes(notReady.status),
        `HTTP ${notReady.status} ${codeOf(notReady.body)}`,
      );
      const revisedCe = await upload(
        author,
        copySlug,
        'manuscript',
        minimalPdf('QA copyedit revision'),
        'copyedit-revision.pdf',
        'application/pdf',
      );
      record(
        'author uploads the copyedit revision',
        revisedCe.status === 200 || revisedCe.status === 201,
        `HTTP ${revisedCe.status} ${codeOf(revisedCe.body)}`,
      );
      const ready = await call(author, 'POST', `/copyedit-assignments/${ceSlug}/ready`);
      await expectStatus('author marks copyedit ready', ready, [200, 201], ready.body?.status);
      const issues = await call(copyeditor, 'GET', `/submissions/${copySlug}/publishable-issues`);
      const issueId = itemsOf(issues.body)[0]?.id;
      record('publishable issue exists', !!issueId, `HTTP ${issues.status} ${clip(issues.body)}`);
      const reviewerPublish = await call(reviewer, 'POST', `/submissions/${copySlug}/publish`, {
        json: { issueId: issueId ?? '00000000-0000-4000-8000-000000000000' },
      });
      await expectStatus('reviewer cannot publish', reviewerPublish, [403]);
      if (issueId) {
        const published = await call(copyeditor, 'POST', `/submissions/${copySlug}/publish`, {
          json: { issueId },
        });
        await expectStatus('copyeditor publishes', published, [200, 201], published.body?.status);
        const again = await call(copyeditor, 'POST', `/submissions/${copySlug}/publish`, {
          json: { issueId },
        });
        await expectStatus('publishing twice is refused', again, [400, 409]);
        const publicCopy = await call(null, 'GET', `/public/submissions/${copySlug}`);
        await expectStatus('published article is in the catalog', publicCopy, [200]);
      }
      const analysis = await call(
        copyeditor,
        'POST',
        `/copyedit-assignments/${ceSlug}/ai-analysis`,
      );
      record(
        'copyedit analysis does not crash with AI and LanguageTool off',
        analysis.status !== 500,
        `HTTP ${analysis.status} ${codeOf(analysis.body)}`,
      );
    }
  }

  const audit = await call(manager, 'GET', '/audit/logs?limit=5');
  record(
    'audit log is readable',
    audit.status === 200 && (Array.isArray(audit.body) || Array.isArray(audit.body?.items)),
    `HTTP ${audit.status}`,
  );
  const search = await call(manager, 'GET', '/editor/search/status');
  record(
    'search curation reports Typesense off',
    search.status === 200
      ? search.body?.enabled === false || search.body?.typesenseEnabled === false
      : search.status === 503,
    `HTTP ${search.status} ${clip(search.body)}`,
  );
  const mail = await call(manager, 'GET', '/admin/email/pipeline-status');
  record(
    'email pipeline does not crash while the mailer is down',
    mail.status !== 500,
    `HTTP ${mail.status} ${clip(mail.body)}`,
  );
  const unread = await call(author, 'GET', '/notifications/unread-count');
  record(
    'notification unread count',
    unread.status === 200 && typeof unread.body?.count === 'number',
    clip(unread.body),
  );
  const marked = await call(author, 'PATCH', '/notifications/read-all');
  await expectStatus('mark notifications read', marked, [200, 204]);

  const logout = await call(qa, 'POST', '/auth/logout');
  await expectStatus('logout', logout, [200, 201, 204]);
  const after = await call(qa, 'GET', '/auth/me');
  await expectStatus('logged out session is rejected', after, [401]);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  writeFileSync(
    'tmp-qa-layer0-results.json',
    JSON.stringify({ failed, total: results.length }, null, 2),
  );
  await db.end();
}

main().catch(async (error) => {
  console.error(error);
  record('script crashed', false, error instanceof Error ? error.message : String(error));
  writeFileSync(
    'tmp-qa-layer0-results.json',
    JSON.stringify({ crashed: true, error: String(error), results }, null, 2),
  );
  try {
    await db.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
