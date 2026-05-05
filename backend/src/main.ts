import { BadRequestException, Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { appendFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';

// #region agent log
function agentDebugLog(payload: Record<string, unknown>) {
  try {
    const logPath = join(__dirname, '..', '..', 'debug-a1bf0c.log');
    appendFileSync(
      logPath,
      JSON.stringify({
        sessionId: 'a1bf0c',
        timestamp: Date.now(),
        ...payload,
      }) + '\n',
    );
  } catch {
    /* ignore */
  }
}
// #endregion

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: config.get<string>('FRONTEND_ORIGIN', 'http://localhost:5240'),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => {
        const messages = errors.flatMap((e) =>
          e.constraints ? Object.values(e.constraints) : [],
        );
        return new BadRequestException({
          message: messages.join('; ') || 'Validation failed',
          code: 'VALIDATION_ERROR',
        });
      },
    }),
  );

  const port = parseInt(config.get<string>('PORT', '5243'), 10);
  const nodeEnv =
    config.get<string>('NODE_ENV') ?? process.env.NODE_ENV ?? 'development';
  const swaggerEnabled =
    config.get<string>('SWAGGER_ENABLED') === 'true' ||
    nodeEnv !== 'production';

  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Folio API')
      .setDescription(
        'Manuscript submission and peer-review REST API. OpenAPI JSON: /api-docs-json',
      )
      .setVersion('0.0.1')
      .addServer(`http://localhost:${port}`, 'Local')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
        'JWT',
      )
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api-docs', app, document);
  }

  await app.listen(port);
  const baseUrl = await app.getUrl();
  const logger = new Logger('Bootstrap');
  logger.log(
    `Application is listening on port ${port} — API base: ${baseUrl}/api/v1`,
  );

  // #region agent log
  try {
    const compiledCtrl = join(__dirname, 'users', 'users.controller.js');
    const src = readFileSync(compiledCtrl, 'utf8');
    agentDebugLog({
      hypothesisId: 'A',
      location: 'main.ts:afterListen',
      message: 'compiled UsersController probe',
      runId: 'bootstrap',
      data: {
        compiledCtrlPath: compiledCtrl,
        hasReviewerCandidatesInDist: src.includes('reviewer-candidates'),
      },
    });
  } catch (e) {
    agentDebugLog({
      hypothesisId: 'B',
      location: 'main.ts:afterListen',
      message: 'compiled controller probe failed',
      runId: 'bootstrap',
      data: { err: String(e) },
    });
  }
  // #endregion
}
void bootstrap();
