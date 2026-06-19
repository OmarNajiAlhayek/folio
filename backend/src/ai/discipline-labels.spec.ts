import {
  DISCIPLINE_SUGGEST_THRESHOLD,
  DISCIPLINE_UNSPECIFIED_LABEL,
  labelsFromProbabilities,
  validateDisciplines,
} from './discipline-labels';

describe('labelsFromProbabilities', () => {
  it('always includes top label first when selectable', () => {
    const labels = labelsFromProbabilities('العلوم الطبية', {
      'العلوم الطبية': 72,
      'العلوم الأساسية': 18,
      'العلوم الهندسية': 5,
      [DISCIPLINE_UNSPECIFIED_LABEL]: 5,
    });
    expect(labels[0]).toBe('العلوم الطبية');
    expect(labels).toContain('العلوم الأساسية');
    expect(labels).not.toContain(DISCIPLINE_UNSPECIFIED_LABEL);
    expect(labels.length).toBeLessThanOrEqual(3);
  });

  it('skips secondary labels below threshold', () => {
    const labels = labelsFromProbabilities('العلوم الطبية', {
      'العلوم الطبية': 90,
      'العلوم الأساسية': DISCIPLINE_SUGGEST_THRESHOLD - 1,
    });
    expect(labels).toEqual(['العلوم الطبية']);
  });

  it('caps at three labels', () => {
    const labels = labelsFromProbabilities('العلوم الطبية', {
      'العلوم الطبية': 50,
      'العلوم الأساسية': 20,
      'العلوم الهندسية': 18,
      'العلوم القانونية': 15,
    });
    expect(labels).toHaveLength(3);
  });
});

describe('validateDisciplines', () => {
  it('accepts one to three unique selectable labels', () => {
    expect(() =>
      validateDisciplines(['العلوم الطبية', 'العلوم الأساسية']),
    ).not.toThrow();
  });

  it('rejects empty, duplicates, and unspecified', () => {
    expect(() => validateDisciplines([])).toThrow();
    expect(() => validateDisciplines([DISCIPLINE_UNSPECIFIED_LABEL])).toThrow();
    expect(() =>
      validateDisciplines(['العلوم الطبية', 'العلوم الطبية']),
    ).toThrow();
    expect(() =>
      validateDisciplines([
        'العلوم الطبية',
        'العلوم الأساسية',
        'العلوم الهندسية',
        'العلوم القانونية',
      ]),
    ).toThrow();
  });
});
