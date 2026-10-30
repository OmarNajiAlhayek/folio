import * as bcrypt from 'bcrypt';
import type { RequestUser } from '../common/types/request-user';
import type { User } from '../entities/user.entity';
import { JOURNAL_CATALOG } from '../journals/journal-catalog';
import {
  ensureExclusiveJournalMembership,
  SEEDED_EDITOR_PASSWORD,
  SEEDED_SECTION_EDITOR_PASSWORD,
  seededEditorEmail,
  seededSectionEditorEmail,
  type SeededPress,
} from '../journals/seed-journals';
import { ROLE_SLUGS } from '../rbac/permission-slugs';
import { orcidCheckCharacter } from '../auth/orcid-id.util';
import type { SeedContext } from './context';

export type SeededJournalStaff = {
  editorReqBySlug: Map<string, RequestUser>;
  sectionEditorBySlug: Map<string, User>;
};

/** Editor-in-chief request users the demo manuscripts are filed under. */
export type SeedEditorRequests = {
  econj: RequestUser;
  eduj: RequestUser;
  lawj: RequestUser;
  engj: RequestUser;
  medj: RequestUser;
};

export type SeededCoreAccounts = {
  author: User;
  reviewer: User;
  copyeditor: User;
  authorReq: RequestUser;
  copyeditorReq: RequestUser;
};

export async function toRequestUser(
  usersService: SeedContext['usersService'],
  rbacService: SeedContext['rbacService'],
  userId: string,
): Promise<RequestUser> {
  const user = await usersService.findById(userId);
  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }
  const { roleSlugs, permissionSlugs } =
    await rbacService.getEffectiveForUser(userId);
  return {
    sub: userId,
    email: user.email,
    roleSlugs,
    permissionSlugs,
  };
}

export async function ensureUser(
  usersService: SeedContext['usersService'],
  rbacService: SeedContext['rbacService'],
  def: {
    email: string;
    password: string;
    displayName: string;
    roleSlugs: string[];
    profile?: {
      affiliation?: string | null;
      orcid?: string | null;
      reviewKeywords?: string | null;
      willingToReview?: boolean;
    };
  },
): Promise<User> {
  let user = await usersService.findByEmail(def.email);
  if (!user) {
    const passwordHash = await bcrypt.hash(def.password, 10);
    user = await usersService.create({
      email: def.email,
      passwordHash,
      displayName: def.displayName,
      affiliation: def.profile?.affiliation ?? null,
      orcid: def.profile?.orcid ?? null,
      reviewKeywords: def.profile?.reviewKeywords ?? null,
      willingToReview: def.profile?.willingToReview ?? false,
    });
  } else if (def.profile) {
    await usersService.patchResearcherProfile(user.id, def.profile);
  }
  await usersService.markEmailVerified(user.id);
  await rbacService.assignRoles(user.id, def.roleSlugs);
  return user;
}

function devOrcid(serial: number): string {
  const fifteen = String(serial).padStart(15, '0');
  const raw = `${fifteen}${orcidCheckCharacter(fifteen)}`;
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12)}`;
}

/**
 * One editor-in-chief and one section editor per catalog journal.
 * `editor@folio.dev` stays the econj chief so existing logins still work.
 * Membership is exclusive: a re-seed drops any extra journals that user held.
 */
export async function seedJournalEditors(options: {
  ctx: SeedContext;
  press: SeededPress;
}): Promise<SeededJournalStaff> {
  const { ctx, press } = options;
  const { dataSource, usersService, rbacService } = ctx;
  const editorReqBySlug = new Map<string, RequestUser>();
  const sectionEditorBySlug = new Map<string, User>();
  let orcidSerial = 6;

  for (const entry of JOURNAL_CATALOG) {
    const journal = press.journalsBySlug.get(entry.slug);
    if (!journal) {
      throw new Error(`Seed: no journal row for slug "${entry.slug}"`);
    }
    const isPressEditor = entry.slug === 'econj';
    const editor = await ensureUser(usersService, rbacService, {
      email: seededEditorEmail(entry.slug),
      password: SEEDED_EDITOR_PASSWORD,
      displayName: isPressEditor ? 'C. Editor' : `Editor, ${entry.slug}`,
      roleSlugs: [ROLE_SLUGS.EDITOR],
      profile: {
        affiliation: entry.titleEn,
        orcid: isPressEditor ? '0000-0000-0000-0036' : devOrcid(orcidSerial++),
        reviewKeywords: null,
        willingToReview: false,
      },
    });
    await ensureExclusiveJournalMembership(
      dataSource,
      journal,
      editor.id,
      ROLE_SLUGS.EDITOR,
    );
    editorReqBySlug.set(
      entry.slug,
      await toRequestUser(usersService, rbacService, editor.id),
    );

    const sectionEditor = await ensureUser(usersService, rbacService, {
      email: seededSectionEditorEmail(entry.slug),
      password: SEEDED_SECTION_EDITOR_PASSWORD,
      displayName: `Section editor, ${entry.slug}`,
      roleSlugs: [ROLE_SLUGS.SECTION_EDITOR],
      profile: {
        affiliation: entry.titleEn,
        orcid: devOrcid(orcidSerial++),
        willingToReview: false,
      },
    });
    await ensureExclusiveJournalMembership(
      dataSource,
      journal,
      sectionEditor.id,
      ROLE_SLUGS.SECTION_EDITOR,
    );
    sectionEditorBySlug.set(entry.slug, sectionEditor);
  }

  return { editorReqBySlug, sectionEditorBySlug };
}

/** Looks up the five chiefs the demo manuscripts are acted on by, in seed order. */
export function requireSeedEditors(
  journalStaff: SeededJournalStaff,
): SeedEditorRequests {
  const editorReqForSlug = (slug: string): RequestUser => {
    const req = journalStaff.editorReqBySlug.get(slug);
    if (!req) {
      throw new Error(`Seed: no editor-in-chief for ${slug}`);
    }
    return req;
  };
  return {
    econj: editorReqForSlug('econj'),
    eduj: editorReqForSlug('eduj'),
    lawj: editorReqForSlug('lawj'),
    engj: editorReqForSlug('engj'),
    medj: editorReqForSlug('medj'),
  };
}

export async function seedCoreAccounts(
  ctx: SeedContext,
): Promise<SeededCoreAccounts> {
  const { usersService, rbacService } = ctx;

  // Every account needs an ORCID iD, or the app holds it at /complete-profile.
  // These are deliberately synthetic — below any range ORCID issues — but
  // carry valid check digits.
  const author = await ensureUser(usersService, rbacService, {
    email: 'author@folio.dev',
    password: 'Author123!',
    displayName: 'A. Researcher',
    roleSlugs: [ROLE_SLUGS.AUTHOR],
    profile: {
      affiliation: 'Faculty of Information Studies, Arab Open University',
      orcid: '0000-0000-0000-001X',
      reviewKeywords: 'methods, reproducibility',
      willingToReview: false,
    },
  });
  await ensureUser(usersService, rbacService, {
    email: 'manager@folio.local',
    password: 'Manager123!',
    displayName: 'M. Journal Manager',
    roleSlugs: [ROLE_SLUGS.JOURNAL_MANAGER],
    profile: {
      affiliation: 'Damascus University Journal — Editorial office',
      orcid: '0000-0000-0000-0028',
    },
  });
  const reviewer = await ensureUser(usersService, rbacService, {
    email: 'reviewer@folio.dev',
    password: 'Reviewer123!',
    displayName: 'R. Reviewer',
    roleSlugs: [ROLE_SLUGS.REVIEWER],
    profile: {
      affiliation: 'Institute for Sample Research',
      orcid: '0000-0000-0000-0044',
      reviewKeywords:
        'open access, digital publishing, economics, arabic journals, peer review',
      willingToReview: true,
    },
  });
  const copyeditor = await ensureUser(usersService, rbacService, {
    email: 'copyeditor@folio.local',
    password: 'Copyeditor123!',
    displayName: 'P. Copyeditor',
    roleSlugs: [ROLE_SLUGS.COPYEDITOR],
    profile: {
      affiliation: 'Damascus University Journal — Editorial office',
      orcid: '0000-0000-0000-0052',
    },
  });

  const authorReq = await toRequestUser(usersService, rbacService, author.id);
  const copyeditorReq = await toRequestUser(
    usersService,
    rbacService,
    copyeditor.id,
  );

  return { author, reviewer, copyeditor, authorReq, copyeditorReq };
}
