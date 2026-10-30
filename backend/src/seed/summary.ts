import type { User } from '../entities/user.entity';
import { JOURNAL_CATALOG } from '../journals/journal-catalog';
import {
  SEEDED_EDITOR_PASSWORD,
  SEEDED_SECTION_EDITOR_PASSWORD,
  seededEditorEmail,
  seededSectionEditorEmail,
  type SeededPress,
} from '../journals/seed-journals';
import {
  SAMPLE_COMPLETED_TITLE,
  SAMPLE_COPYEDIT_TITLE,
  SAMPLE_DRAFT_TITLE,
  SAMPLE_INVITE_PENDING_ASSIGNMENT_SLUG,
  SAMPLE_INVITE_PENDING_TITLE,
  SAMPLE_PUBLISHED_MEDICAL_TITLE,
  SAMPLE_PUBLISHED_PEER_TITLE,
  SAMPLE_PUBLISHED_TITLE,
  SAMPLE_QUEUE_TITLE,
  SAMPLE_REVIEW_TITLE,
  SAMPLE_REVISIONS_TITLE,
} from './sample-content';

export function printSeedSummary(options: {
  author: User;
  reviewer: User;
  copyeditor: User;
  press: SeededPress & { membershipsCreated: number };
  placement: { placed: number; publishedPlaced: number };
  aiEnabled: boolean;
}): void {
  const { author, reviewer, copyeditor, press, placement, aiEnabled } = options;
  const tDraft = SAMPLE_DRAFT_TITLE;
  const tQueue = SAMPLE_QUEUE_TITLE;
  const tInvitePending = SAMPLE_INVITE_PENDING_TITLE;
  const tReview = SAMPLE_REVIEW_TITLE;
  const tCompleted = SAMPLE_COMPLETED_TITLE;
  const tRev = SAMPLE_REVISIONS_TITLE;
  const tCopyedit = SAMPLE_COPYEDIT_TITLE;
  const tPub = SAMPLE_PUBLISHED_TITLE;
  const tPub2 = SAMPLE_PUBLISHED_PEER_TITLE;
  const tPub3 = SAMPLE_PUBLISHED_MEDICAL_TITLE;

  console.log('\n--- Sample accounts (change passwords in production) ---');
  console.log('author@folio.dev            / Author123!      roles: author');
  console.log(
    'manager@folio.local         / Manager123!     roles: journal_manager (every journal; edits titles)',
  );
  console.log('reviewer@folio.dev          / Reviewer123!    roles: reviewer');
  console.log(
    'copyeditor@folio.local      / Copyeditor123!  roles: copyeditor',
  );
  console.log(
    `\n--- Editor-in-chief, one journal each (password ${SEEDED_EDITOR_PASSWORD}) ---`,
  );
  for (const entry of JOURNAL_CATALOG) {
    console.log(
      `${seededEditorEmail(entry.slug).padEnd(32)} editor of ${entry.slug}`,
    );
  }
  console.log(
    `\n--- Section editor, one journal each (password ${SEEDED_SECTION_EDITOR_PASSWORD}) ---`,
  );
  for (const entry of JOURNAL_CATALOG) {
    const note =
      entry.slug === 'eduj'
        ? '  (assigned to the education revisions demo)'
        : '';
    console.log(
      `${seededSectionEditorEmail(entry.slug).padEnd(32)} section editor of ${entry.slug}${note}`,
    );
  }
  console.log(
    '\n--- Journals (catalog rows from migration; seed looks up by slug) ---',
  );
  console.log(
    `${press.journalsBySlug.size} journals × 3 issues (published 2025/2, published 2026/1, open 2026/2)`,
  );
  console.log(
    `Staff memberships: reviewer and copyeditor on every journal (${press.membershipsCreated} new). Each journal has its own editor-in-chief and section editor. journal_manager stays global.`,
  );
  console.log(
    `Placed ${placement.placed} demo submission(s) onto journals (${placement.publishedPlaced} into العدد 1، 2026).`,
  );
  console.log('\n--- Demo submissions (title prefix [Demo]) ---');
  console.log(`${tDraft} — author: draft with file`);
  console.log(`${tQueue} — editor queue: submitted`);
  console.log(
    `${tInvitePending} — reviewer invite pending (reviewer-invited email + /assignments/.../invite)`,
  );
  console.log(`${tReview} — editor/reviewer: under review`);
  console.log(`${tCompleted} — reviewer: assignment completed`);
  console.log(
    `${tRev} — round1: revisions requested; author resubmitted + revised file; round2: same reviewer, invitation pending (accept in app)`,
  );
  console.log(`${tCopyedit} — copyediting: assigned + note submitted`);
  console.log(`${tPub} — public catalog: published (open-access policy)`);
  console.log(
    `${tPub2} — public catalog: published (near-duplicate of ${tPub} for similarity)`,
  );
  console.log(
    `${tPub3} — public catalog: published (medical ethics, distant peer)`,
  );
  console.log('\n--- Demo paths by role ---');
  console.log(
    `Author (${author.email}): ${tDraft} — edit metadata, files, optional AI suggest; ${tRev} — resubmit flow`,
  );
  console.log(
    `Editor (${seededEditorEmail('econj')}): ${tQueue}, ${tReview}, and the published econj articles. ${seededEditorEmail('lawj')} reads ${tCompleted}. ${seededEditorEmail('engj')} owns ${tCopyedit}. ${seededEditorEmail('medj')} publishes ${tPub3}. ${seededSectionEditorEmail('eduj')} is assigned to ${tRev}.`,
  );
  console.log(
    `Reviewer (${reviewer.email} / Reviewer123!): ${tInvitePending} — invited (email accept link works); ${tReview} — active review; ${tRev} — round-2 invite if still pending`,
  );
  console.log(
    `Reviewer-invited email: log in as ${reviewer.email} (not author/editor). After seed:fresh, the TOP inbox message should be "Review invitation: ${tInvitePending}" — or visit /en/assignments/${SAMPLE_INVITE_PENDING_ASSIGNMENT_SLUG}/invite`,
  );
  console.log(
    `Copyeditor (${copyeditor.email}): ${tCopyedit} — notes; published rows show full accept→publish path`,
  );
  console.log(
    'Public catalog: search "open access", "metadata", or Arabic terms from published abstracts (keyword FTS)',
  );
  console.log(
    `Email pipeline scripts: similarity title contains keywords from "${tQueue}" or "${tInvitePending}"`,
  );
  console.log(
    '\n--- AI features (optional; enable flags in backend + ai-service .env) ---',
  );
  if (aiEnabled) {
    console.log(
      'Discipline: submit() classifies from Arabic abstract; fallbacks apply only when classification did not persist.',
    );
  } else {
    console.log(
      'Discipline: seeded disciplineSuggested on each sample (no ai-service). Enable AI_SERVICE_ENABLED + gRPC, then npm run seed:reset.',
    );
  }
  console.log(
    `Keywords suggest: author draft ${tDraft} (AI_KEYWORDS_ENABLED + OpenAI on ai-service)`,
  );
  console.log(
    `Corpus similarity: editor/reviewer on ${tQueue} or ${tReview} (AI_SIMILARITY_ENABLED; overlaps ${tPub})`,
  );
  console.log(
    `Suggested reviewers: editor on ${tQueue} or ${tReview} (AI_REVIEWER_MATCHING_ENABLED)`,
  );
  console.log(
    `Related articles: open ${tPub} or ${tPub2} — expect the other with high similarity; ${tPub3} stays distant`,
  );
  console.log(
    'Semantic catalog: searchMode=semantic with q e.g. وصول مفتوح or نشر رقمي مجلات عربية',
  );
  console.log(
    'JOURNAL_ALLOWED_DISCIPLINES (pipe-separated Arabic labels): out-of-scope badge on queue sample when medical label is outside scope.',
  );
  console.log(
    'After changing published Arabic text: npm run seed:reset (re-indexes similarity corpus).',
  );
  console.log('\nRe-run safely. Dev reset options:');
  console.log(
    '  SEED_RESET_ALL=1       — truncate all users/submissions/uploads, then re-seed (npm run seed:fresh)',
  );
  console.log(
    '  SEED_RESET_SAMPLE=1    — remove only [Demo] / [SAMPLE] / [DEMO] submissions, then re-seed (npm run seed:reset)',
  );
}
