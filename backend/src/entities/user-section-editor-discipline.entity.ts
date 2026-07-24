import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from './user.entity';

@Entity('user_section_editor_disciplines')
export class UserSectionEditorDiscipline {
  @PrimaryColumn('uuid', { name: 'user_id' })
  userId: string;

  @PrimaryColumn('text', { name: 'discipline_label' })
  disciplineLabel: string;

  @ManyToOne(() => User, (u) => u.sectionEditorDisciplines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
