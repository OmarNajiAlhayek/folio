'use client';

import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { SimpleSelect } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import {
  BOARD_ROLE_LABEL_KEY,
  EDITORIAL_BOARD_ROLES,
  boardMemberAffiliation,
  boardMemberName,
  type EditorialBoardRole,
} from '@/lib/editorial-board';
import { isValidOrcidId } from '@/lib/orcid';
import {
  createBoardMember,
  deleteBoardMember,
  reorderBoard,
  updateBoardMember,
  useEditorialBoard,
  type EditorialBoardMember,
  type EditorialBoardMemberInput,
} from '@/lib/queries/journal-admin';
import { queryKeys } from '@/lib/query-keys';
import { toast } from '@/lib/toast';
import { useToastApiError } from '@/lib/use-toast-api-error';
import { cn } from '@/lib/utils';

type Draft = {
  nameAr: string;
  nameEn: string;
  role: EditorialBoardRole;
  affiliationAr: string;
  affiliationEn: string;
  orcid: string;
};

type DraftErrors = Partial<Record<'name' | 'orcid', string>>;

/** Nothing open, the add form, or the id of the member being edited. */
type Editing = null | 'new' | string;

const EMPTY_DRAFT: Draft = {
  nameAr: '',
  nameEn: '',
  role: 'member',
  affiliationAr: '',
  affiliationEn: '',
  orcid: '',
};

const SECTION_CLS =
  'rounded-2xl border border-ink/10 bg-surface p-5 shadow-xs sm:p-6';

function toDraft(m: EditorialBoardMember): Draft {
  return {
    nameAr: m.nameAr ?? '',
    nameEn: m.nameEn ?? '',
    role: m.role,
    affiliationAr: m.affiliationAr ?? '',
    affiliationEn: m.affiliationEn ?? '',
    orcid: m.orcid ?? '',
  };
}

function fieldCls(err: boolean) {
  return cn(
    'w-full rounded-xl border bg-paper/60 px-3 py-2.5 text-sm text-ink outline-hidden transition focus:border-accent focus:ring-2 focus:ring-accent/15',
    err ? 'border-red-400' : 'border-ink/15 dark:border-white/15',
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex size-8 items-center justify-center rounded-lg text-ink/55 transition hover:bg-ink/6 hover:text-ink disabled:pointer-events-none disabled:opacity-35',
        danger && 'hover:bg-red-500/10 hover:text-red-600',
      )}
    >
      {children}
    </button>
  );
}

/**
 * A journal's published editorial board, edited by the journal manager or the
 * journal's editor-in-chief. Members are not accounts. Each change saves on its
 * own — add, edit, delete, reorder — so nothing here waits for the journal
 * details form above.
 */
export function EditorialBoardEditor({ slug }: { slug: string }) {
  const t = useTranslations('JournalSettings');
  const locale = useLocale();
  const isAr = locale === 'ar';
  const roleLabelId = useId();
  const queryClient = useQueryClient();
  const showApiError = useToastApiError();
  const board = useEditorialBoard(slug);
  const members = board.data ?? [];

  const [editing, setEditing] = useState<Editing>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [busy, setBusy] = useState(false);

  const roleOptions = EDITORIAL_BOARD_ROLES.map((role) => ({
    value: role,
    label: t(BOARD_ROLE_LABEL_KEY[role]),
  }));

  function setBoard(next: EditorialBoardMember[]) {
    queryClient.setQueryData(queryKeys.editorialBoard(slug), next);
  }

  function open(target: Editing, initial: Draft) {
    setEditing(target);
    setDraft(initial);
    setErrors({});
  }

  function close() {
    setEditing(null);
    setErrors({});
  }

  function setField(field: keyof Draft, value: string) {
    setDraft((d) => ({ ...d, [field]: value }));
  }

  function validate(d: Draft): DraftErrors {
    const out: DraftErrors = {};
    if (!d.nameAr.trim() && !d.nameEn.trim()) {
      out.name = t('boardNameRequired');
    }
    const orcid = d.orcid.trim().toUpperCase();
    if (!orcid) out.orcid = t('boardOrcidRequired');
    else if (!isValidOrcidId(orcid)) out.orcid = t('boardOrcidInvalid');
    return out;
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (editing === null) return;
    const nextErrors = validate(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const input: EditorialBoardMemberInput = {
      nameAr: draft.nameAr.trim() || null,
      nameEn: draft.nameEn.trim() || null,
      role: draft.role,
      affiliationAr: draft.affiliationAr.trim() || null,
      affiliationEn: draft.affiliationEn.trim() || null,
      orcid: draft.orcid.trim().toUpperCase(),
    };

    setBusy(true);
    try {
      if (editing === 'new') {
        const created = await createBoardMember(slug, input);
        setBoard([...members, created]);
      } else {
        const updated = await updateBoardMember(slug, editing, input);
        setBoard(members.map((m) => (m.id === updated.id ? updated : m)));
      }
      close();
      toast.success(t('boardSaved'));
    } catch (err) {
      showApiError(err, t('boardSaveFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(m: EditorialBoardMember) {
    const name = boardMemberName(m, isAr);
    if (!window.confirm(t('boardDeleteConfirm', { name }))) return;
    setBusy(true);
    try {
      await deleteBoardMember(slug, m.id);
      setBoard(members.filter((x) => x.id !== m.id));
      toast.success(t('boardSaved'));
    } catch (err) {
      showApiError(err, t('boardSaveFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= members.length) return;
    const previous = members;
    const next = [...members];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(target, 0, moved);

    setBoard(next);
    setBusy(true);
    try {
      setBoard(
        await reorderBoard(
          slug,
          next.map((m) => m.id),
        ),
      );
    } catch (err) {
      setBoard(previous);
      showApiError(err, t('boardSaveFailed'));
    } finally {
      setBusy(false);
    }
  }

  const form = (
    <form
      onSubmit={(e) => void save(e)}
      noValidate
      className="space-y-4 rounded-xl border border-accent/25 bg-accent/5 p-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t('boardNameAr')} error={errors.name}>
          <input
            dir="rtl"
            lang="ar"
            value={draft.nameAr}
            onChange={(e) => setField('nameAr', e.target.value)}
            maxLength={200}
            className={fieldCls(!!errors.name)}
          />
        </FormField>
        <FormField label={t('boardNameEn')}>
          <input
            dir="ltr"
            lang="en"
            value={draft.nameEn}
            onChange={(e) => setField('nameEn', e.target.value)}
            maxLength={200}
            className={fieldCls(!!errors.name)}
          />
        </FormField>
        <div className="flex flex-col gap-1 text-sm">
          <span id={roleLabelId} className="font-semibold text-ink/80">
            {t('boardRole')}
          </span>
          <SimpleSelect
            value={draft.role}
            onValueChange={(v) => setField('role', v)}
            options={roleOptions}
            aria-labelledby={roleLabelId}
          />
        </div>
        <FormField label={t('boardOrcid')} error={errors.orcid} required>
          <input
            dir="ltr"
            value={draft.orcid}
            onChange={(e) => setField('orcid', e.target.value)}
            placeholder="0000-0000-0000-0000"
            maxLength={40}
            autoComplete="off"
            className={cn(fieldCls(!!errors.orcid), 'font-mono')}
          />
        </FormField>
        <FormField label={t('boardAffiliationAr')}>
          <input
            dir="rtl"
            lang="ar"
            value={draft.affiliationAr}
            onChange={(e) => setField('affiliationAr', e.target.value)}
            maxLength={300}
            className={fieldCls(false)}
          />
        </FormField>
        <FormField label={t('boardAffiliationEn')}>
          <input
            dir="ltr"
            lang="en"
            value={draft.affiliationEn}
            onChange={(e) => setField('affiliationEn', e.target.value)}
            maxLength={300}
            className={fieldCls(false)}
          />
        </FormField>
      </div>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={close}
          disabled={busy}
        >
          {t('boardCancel')}
        </Button>
        <Button type="submit" size="sm" loading={busy}>
          {t('boardSave')}
        </Button>
      </div>
    </form>
  );

  let body: ReactNode;
  if (board.isPending) {
    body = (
      <div className="flex justify-center py-6">
        <Spinner size="sm" aria-hidden />
      </div>
    );
  } else if (board.isError) {
    body = <p className="text-sm text-red-600">{t('boardLoadFailed')}</p>;
  } else if (members.length === 0) {
    body =
      editing === 'new' ? null : (
        <p className="rounded-xl border border-dashed border-ink/15 px-4 py-6 text-center text-sm text-ink/55">
          {t('boardEmpty')}
        </p>
      );
  } else {
    body = (
      <>
        <p className="text-[11px] text-ink/45">{t('boardOrderHint')}</p>
        <ol className="space-y-2">
          {members.map((m, index) => {
            if (editing === m.id) return <li key={m.id}>{form}</li>;
            const affiliation = boardMemberAffiliation(m, isAr);
            const locked = busy || editing !== null;
            return (
              <li
                key={m.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-ink/10 bg-paper/40 px-4 py-3 dark:border-white/10"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">
                    {boardMemberName(m, isAr)}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-ink/55">
                    {t(BOARD_ROLE_LABEL_KEY[m.role])}
                    {affiliation ? ` · ${affiliation}` : ''}
                  </p>
                  {m.orcid ? (
                    <p className="mt-0.5 font-mono text-[11px] text-ink/45">
                      <span dir="ltr">{m.orcid}</span>
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-0.5">
                  <IconButton
                    label={t('boardMoveUp')}
                    onClick={() => void move(index, -1)}
                    disabled={locked || index === 0}
                  >
                    <ArrowUp className="size-3.5" aria-hidden />
                  </IconButton>
                  <IconButton
                    label={t('boardMoveDown')}
                    onClick={() => void move(index, 1)}
                    disabled={locked || index === members.length - 1}
                  >
                    <ArrowDown className="size-3.5" aria-hidden />
                  </IconButton>
                  <IconButton
                    label={t('boardEdit')}
                    onClick={() => open(m.id, toDraft(m))}
                    disabled={locked}
                  >
                    <Pencil className="size-3.5" aria-hidden />
                  </IconButton>
                  <IconButton
                    label={t('boardDelete')}
                    onClick={() => void remove(m)}
                    disabled={locked}
                    danger
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </IconButton>
                </div>
              </li>
            );
          })}
        </ol>
      </>
    );
  }

  return (
    <section className={SECTION_CLS} aria-labelledby="editorial-board-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="editorial-board-heading"
            className="font-serif text-lg font-semibold text-ink"
          >
            {t('boardTitle')}
          </h2>
          <p className="mt-1 max-w-xl text-xs text-ink/55">{t('boardHint')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/journals/${slug}/editorial-board`}
            target="_blank"
            className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
          >
            {t('boardViewPublic')}
            <ExternalLink className="size-3" aria-hidden />
          </Link>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => open('new', EMPTY_DRAFT)}
            disabled={busy || editing !== null || board.isPending}
          >
            <Plus className="size-3.5" aria-hidden />
            {t('boardAdd')}
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {editing === 'new' ? form : null}
        {body}
      </div>
    </section>
  );
}
