import { generateEntityId } from '@folio/shared';
import { BeforeInsert, PrimaryColumn } from 'typeorm';

export abstract class BaseEntity {
  @PrimaryColumn('uuid')
  id: string;

  @BeforeInsert()
  generateId() {
    if (!this.id) this.id = generateEntityId();
  }
}
