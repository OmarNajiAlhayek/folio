import {
  isoToDatetimeLocal,
  reminderRescheduleInputValue,
} from "./reminder-datetime-local";

describe("reminder-datetime-local", () => {
  it("isoToDatetimeLocal formats in local timezone", () => {
    const iso = "2026-06-15T14:30:00.000Z";
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    const expected = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    expect(isoToDatetimeLocal(iso)).toBe(expected);
  });

  it("reminderRescheduleInputValue prefers explicit state", () => {
    expect(
      reminderRescheduleInputValue(
        { r1: "2026-07-01T09:00" },
        "r1",
        "2026-06-01T12:00:00.000Z",
      ),
    ).toBe("2026-07-01T09:00");
  });

  it("reminderRescheduleInputValue falls back to sendAt", () => {
    const iso = "2026-06-15T14:30:00.000Z";
    expect(reminderRescheduleInputValue({}, "r1", iso)).toBe(
      isoToDatetimeLocal(iso),
    );
  });
});
