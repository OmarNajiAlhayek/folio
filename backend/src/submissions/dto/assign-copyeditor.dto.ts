import { IsUUID } from 'class-validator';

export class AssignCopyeditorDto {
  @IsUUID()
  copyeditorId: string;
}
