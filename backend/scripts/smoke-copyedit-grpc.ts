import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { AiClientService } from '../src/ai/ai-client.service';

async function main(): Promise<void> {
  const config = new ConfigService({
    AI_SERVICE_ENABLED: 'true',
    AI_COPYEDIT_ENABLED: 'true',
    AI_SERVICE_GRPC_HOST: '127.0.0.1',
    AI_SERVICE_GRPC_PORT: '5246',
    AI_SERVICE_TOKEN:
      process.env.AI_SERVICE_TOKEN ??
      '_gbHN0Z7AsZHaj9PhrPatt85F5Tukfxwjkj5s3yRvA4',
    AI_SERVICE_TIMEOUT_MS: '120000',
  });
  const cls = { get: () => undefined } as unknown as ClsService;
  const ai = new AiClientService(config, cls);
  console.log('copyedit enabled:', ai.isCopyeditEnabled());
  const out = await ai.checkReferences({
    referenceList: ['Smith J. Example study. 2020.'],
    inlineCitations: ['(Smith, 2020)', '(Jones, 2019)'],
  });
  console.log('gRPC result:', JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
