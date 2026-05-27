import { AiClientService } from './ai-client.service';

export const aiClientServiceMock = {
  provide: AiClientService,
  useValue: {
    isEnabled: jest.fn().mockReturnValue(false),
    classifyArticle: jest.fn().mockResolvedValue(null),
  },
};
