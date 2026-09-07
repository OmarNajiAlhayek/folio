import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class PublishSubmissionDto {
  @ApiProperty({
    description:
      'Issue (العدد) to file this article under. Must belong to the submission’s journal and be open or published.',
    format: 'uuid',
  })
  @IsUUID()
  issueId: string;
}
