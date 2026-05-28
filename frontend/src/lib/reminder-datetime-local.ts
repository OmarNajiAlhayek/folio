/** `datetime-local` value (local timezone, minute precision) from an ISO timestamp. */
export function isoToDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Earliest allowed reschedule time for `min` on datetime-local inputs. */
export function minReminderRescheduleDatetimeLocal(
  leadMs = 120_000,
): string {
  const d = new Date(Date.now() + leadMs);
  return isoToDatetimeLocal(d.toISOString());
}

/** Resolve editor input: explicit state, else current scheduled send time. */
export function reminderRescheduleInputValue(
  state: Record<string, string>,
  reminderId: string,
  sendAtIso: string,
): string {
  const edited = state[reminderId]?.trim();
  if (edited) return edited;
  return isoToDatetimeLocal(sendAtIso);
}
