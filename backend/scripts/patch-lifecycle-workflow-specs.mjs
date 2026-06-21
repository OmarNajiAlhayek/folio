import fs from 'fs';
import path from 'path';

const dir = path.join('src', 'submissions');
const importLine =
  "import { SubmissionLifecycleService } from './submission-lifecycle.service';";
const providerLine = '        SubmissionLifecycleService,';

for (const file of fs.readdirSync(dir).filter(
  (f) => f.startsWith('submissions.service') && f.endsWith('.spec.ts'),
)) {
  const p = path.join(dir, file);
  let c = fs.readFileSync(p, 'utf8');
  if (c.includes('SubmissionLifecycleService')) {
    console.log('skip', file);
    continue;
  }
  if (!c.includes('CopyeditWorkflowService')) {
    console.log('no CopyeditWorkflow', file);
    continue;
  }
  c = c.replace(
    "import { CopyeditWorkflowService } from './copyedit-workflow.service';",
    `import { CopyeditWorkflowService } from './copyedit-workflow.service';\n${importLine}`,
  );
  c = c.replace(
    /        CopyeditWorkflowService,\n/,
    `        CopyeditWorkflowService,\n${providerLine}\n`,
  );
  fs.writeFileSync(p, c);
  console.log('patched', file);
}
