import { IsOptional, IsString } from 'class-validator';

export class SubmitCopyeditNoteDto {
  @IsString()
  noteForAuthor: string;

  @IsOptional()
  @IsString()
  noteToEditorOnly?: string;
}
