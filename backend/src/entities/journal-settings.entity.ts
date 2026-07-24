import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

@Entity('journal_settings')
export class JournalSetting extends BaseEntity {
  @Column({ type: 'varchar', length: 100, unique: true })
  key: string;

  @Column({ type: 'text', default: '' })
  value: string;
}
