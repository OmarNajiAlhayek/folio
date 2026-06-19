import {
  Mail,
  FileText,
  FileCheck,
  FileX,
  Pencil,
  MessageCircle,
  BadgeCheck,
  ThumbsUp,
  Ban,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

export type NotificationVisuals = {
  bg: string;
  icon: LucideIcon;
};

export function getNotificationVisuals(
  type: string,
  params: Record<string, unknown> = {},
): NotificationVisuals {
  switch (type) {
    case 'review_invitation_accepted':
    case 'reviewAccepted':
      return {
        bg: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 border-emerald-500/20',
        icon: ThumbsUp,
      };
    case 'role_invitation_created':
    case 'roleInvitation':
      return {
        bg: 'bg-teal-500/10 text-teal-600 dark:bg-teal-500/20 dark:text-teal-400 border-teal-500/20',
        icon: ShieldCheck,
      };
    case 'submissionDecision': {
      const decision = String(params.decision ?? '');
      if (decision === 'accepted') {
        return {
          bg: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 border-emerald-500/20',
          icon: FileCheck,
        };
      } else if (decision === 'rejected') {
        return {
          bg: 'bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400 border-rose-500/20',
          icon: FileX,
        };
      } else {
        return {
          bg: 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border-amber-500/20',
          icon: FileCheck,
        };
      }
    }
    case 'submission_submitted':
    case 'submissionSubmitted':
    case 'submission_under_review':
    case 'submissionUnderReview':
      return {
        bg: 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 border-blue-500/20',
        icon: FileText,
      };
    case 'submission_published':
    case 'submissionPublished':
      return {
        bg: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 border-emerald-500/20',
        icon: FileCheck,
      };
    case 'review_submitted':
    case 'reviewSubmitted':
      return {
        bg: 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 border-indigo-500/20',
        icon: FileText,
      };
    case 'copyeditAssigned':
      return {
        bg: 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 border-indigo-500/20',
        icon: Pencil,
      };
    case 'reviewerInvited':
      return {
        bg: 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border-amber-500/20',
        icon: Mail,
      };
    case 'copyeditQueries':
      return {
        bg: 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border-amber-500/20',
        icon: MessageCircle,
      };
    case 'copyeditAuthorReady':
      return {
        bg: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 border-emerald-500/20',
        icon: BadgeCheck,
      };
    case 'review_invitation_declined':
    case 'reviewDeclined':
      return {
        bg: 'bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400 border-rose-500/20',
        icon: Ban,
      };
    default:
      return {
        bg: 'bg-accent/10 text-accent border-accent/20',
        icon: Mail,
      };
  }
}
