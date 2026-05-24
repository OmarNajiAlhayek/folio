import {

  Column,

  Entity,

  PrimaryColumn,

  UpdateDateColumn,

} from 'typeorm';



@Entity({ name: 'email_template', schema: 'email' })

export class EmailTemplateEntity {

  @PrimaryColumn({ type: 'varchar', length: 64, name: 'template_key' })

  templateKey: string;



  @PrimaryColumn({ type: 'varchar', length: 10 })

  locale: string;



  @Column({ type: 'text', name: 'subject_template' })

  subjectTemplate: string;



  @Column({ type: 'text', name: 'html_body' })

  htmlBody: string;



  @Column({ type: 'text', name: 'text_body' })

  textBody: string;



  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })

  updatedAt: Date;

}

