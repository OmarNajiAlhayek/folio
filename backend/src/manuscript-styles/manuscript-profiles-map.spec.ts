import { manuscriptProfilesMap } from './manuscript-profiles-map';
import { damascusUniversityJournalV1 } from './profiles/damascus-university-journal-v1.profile';

describe('manuscriptProfilesMap', () => {
  it('builds a map from profiles', () => {
    const m = manuscriptProfilesMap(damascusUniversityJournalV1);
    expect(m.get('damascus-university-journal-v1')).toBe(damascusUniversityJournalV1);
  });

  it('throws on duplicate ids', () => {
    expect(() =>
      manuscriptProfilesMap(
        damascusUniversityJournalV1,
        damascusUniversityJournalV1,
      ),
    ).toThrow(/Duplicate manuscript style id/);
  });
});
