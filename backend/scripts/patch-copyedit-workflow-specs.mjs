import fs from 'fs';
import path from 'path';

const dir = path.join('src', 'submissions');
const importLine =
  "import { CopyeditWorkflowService } from './copyedit-workflow.service';";
const providerLine = '        CopyeditWorkflowService,';

for (const file of fs.readdirSync(dir).filter(
  (f) => f.startsWith('submissions.service') && f.endsWith('.spec.ts'),
)) {
  const p = path.join(dir, file);
  let c = fs.readFileSync(p, 'utf8');
  if (c.includes('CopyeditWorkflowService')) {
    console.log('skip', file);
    continue;
  }
  if (!c.includes('ReviewWorkflowService')) {
    console.log('no ReviewWorkflow', file);
    continue;
  }
  c = c.replace(
    "import { ReviewWorkflowService } from './review-workflow.service';",
    `import { ReviewWorkflowService } from './review-workflow.service';\n${importLine}`,
  );
  c = c.replace(
    /        ReviewWorkflowService,\n/,
    `        ReviewWorkflowService,\n${providerLine}\n`,
  );
  fs.writeFileSync(p, c);
  console.log('patched', file);
}
