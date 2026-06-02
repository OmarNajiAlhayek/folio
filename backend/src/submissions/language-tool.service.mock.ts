import { LanguageToolService } from './language-tool.service';

export const languageToolServiceMock = {
  provide: LanguageToolService,
  useValue: {
    isEnabled: jest.fn().mockReturnValue(false),
    check: jest.fn().mockResolvedValue([]),
  },
};
