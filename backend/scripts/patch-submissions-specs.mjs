import fs from 'fs';
import path from 'path';

const dir = path.join('src', 'submissions');
const inject = `        SubmissionAccessService,
        PublicationCatalogService,
        SubmissionFileService,
        SubmissionEventsService,
        ReviewWorkflowService,
`;
const searchProvider = `        { provide: SearchService, useValue: null },`;
const extraImports = `import { SubmissionAccessService } from './submission-access.service';
import { PublicationCatalogService } from './publication-catalog.service';
import { SubmissionFileService } from './submission-file.service';
import { SubmissionEventsService } from './submission-events.service';
import { ReviewWorkflowService } from './review-workflow.service';
import { SearchService } from '../search/search.service';
`;

for (const file of fs.readdirSync(dir).filter(
  (f) => f.startsWith('submissions.service') && f.endsWith('.spec.ts'),
)) {
  const p = path.join(dir, file);
  let c = fs.readFileSync(p, 'utf8');
  if (c.includes('SubmissionAccessService')) {
    console.log('skip', file);
    continue;
  }
  c = c.replace(
    "import { SubmissionsService } from './submissions.service';",
    `import { SubmissionsService } from './submissions.service';\n${extraImports}`,
  );
  c = c.replace(/        SubmissionsService,\n/, `        SubmissionsService,\n${inject}`);
  if (!c.includes('SearchService')) {
    c = c.replace(
      /(languageToolServiceMock,)\n(\s+\],)/,
      `$1\n${searchProvider}\n$2`,
    );
  }
  fs.writeFileSync(p, c);
  console.log('patched', file);
}
