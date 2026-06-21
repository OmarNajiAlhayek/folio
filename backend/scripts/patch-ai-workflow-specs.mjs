import fs from 'fs';
import path from 'path';

const dir = path.join('src', 'submissions');
const importLine = "import { SubmissionAiService } from './submission-ai.service';";
const providerLine = '        SubmissionAiService,';

for (const file of fs.readdirSync(dir).filter(
  (f) => f.startsWith('submissions.service') && f.endsWith('.spec.ts'),
)) {
  const p = path.join(dir, file);
  let c = fs.readFileSync(p, 'utf8');
  if (c.includes('SubmissionAiService')) {
    console.log('skip', file);
    continue;
  }
  if (!c.includes('SubmissionLifecycleService')) {
    console.log('no Lifecycle', file);
    continue;
  }
  c = c.replace(
    "import { SubmissionLifecycleService } from './submission-lifecycle.service';",
    `import { SubmissionLifecycleService } from './submission-lifecycle.service';\n${importLine}`,
  );
  c = c.replace(
    /        SubmissionLifecycleService,\n/,
    `        SubmissionLifecycleService,\n${providerLine}\n`,
  );
  fs.writeFileSync(p, c);
  console.log('patched', file);
}
