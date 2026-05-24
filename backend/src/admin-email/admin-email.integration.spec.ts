import { CanActivate } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import { AdminEmailController } from './admin-email.controller';
import { AdminEmailService } from './admin-email.service';
import { EmailPipelineObservabilityService } from './email-pipeline-observability.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';

class AllowGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

describe('AdminEmailController (integration)', () => {
  let controller: AdminEmailController;
  let adminEmail: jest.Mocked<
    Pick<
      AdminEmailService,
      | 'getReminderPolicy'
      | 'patchReminderPolicy'
      | 'getTemplate'
      | 'patchTemplate'
      | 'previewTemplate'
    >
  >;
  let pipelineObservability: jest.Mocked<
    Pick<EmailPipelineObservabilityService, 'getPipelineStatus'>
  >;

  beforeEach(async () => {
    adminEmail = {
      getReminderPolicy: jest.fn(),
      patchReminderPolicy: jest.fn(),
      getTemplate: jest.fn(),
      patchTemplate: jest.fn(),
      previewTemplate: jest.fn(),
    };
    pipelineObservability = {
      getPipelineStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminEmailController],
      providers: [
        { provide: AdminEmailService, useValue: adminEmail },
        {
          provide: EmailPipelineObservabilityService,
          useValue: pipelineObservability,
        },
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useClass(AllowGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(AllowGuard)
      .compile();

    controller = module.get(AdminEmailController);
  });

  it('patchTemplate passes locale query through to service', async () => {
    const dto = {
      subjectTemplate: 's',
      htmlBody: '<p>x</p>',
      textBody: 't',
      expectedUpdatedAt: '2026-05-05T00:00:00.000Z',
    };
    adminEmail.patchTemplate.mockResolvedValue({
      templateKey: 'reviewer-invited',
      locale: 'ar',
      subjectTemplate: dto.subjectTemplate,
      htmlBody: dto.htmlBody,
      textBody: dto.textBody,
      updatedAt: dto.expectedUpdatedAt,
    });

    await controller.patchTemplate('reviewer-invited', dto, 'ar');

    expect(adminEmail.patchTemplate).toHaveBeenCalledWith(
      'reviewer-invited',
      'ar',
      dto.subjectTemplate,
      dto.htmlBody,
      dto.textBody,
      dto.expectedUpdatedAt,
    );
  });

  it('previewTemplate delegates to service', async () => {
    adminEmail.previewTemplate.mockResolvedValue({
      subject: 'a',
      html: '<p>b</p>',
      text: 'c',
    });
    const out = await controller.previewTemplate(
      'reviewer-invited',
      {},
      'ar',
    );
    expect(out.subject).toBe('a');
    expect(adminEmail.previewTemplate).toHaveBeenCalledWith(
      'reviewer-invited',
      undefined,
      'ar',
    );
  });
});
