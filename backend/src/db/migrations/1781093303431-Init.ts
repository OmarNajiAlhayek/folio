import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1781093303431 implements MigrationInterface {
  name = 'Init1781093303431';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `CREATE TABLE "ai_jobs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "job_type" character varying(32) NOT NULL, "status" character varying(16) NOT NULL DEFAULT 'pending', "idempotency_key" character varying(200) NOT NULL, "submission_id" uuid, "submission_slug" character varying(220), "requested_by_user_id" uuid, "result" jsonb, "error_message" text, "attempts" integer NOT NULL DEFAULT '0', "started_at" TIMESTAMP WITH TIME ZONE, "completed_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_2f5a0ff84b8a259e4c991736df9" UNIQUE ("idempotency_key"), CONSTRAINT "PK_895e59e4adb993a3f45dacb1d6b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_ai_jobs_slug_type_status" ON "ai_jobs" ("submission_slug", "job_type", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_ai_jobs_submission_status" ON "ai_jobs" ("submission_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."submission_files_file_stage_enum" AS ENUM('submission', 'review')`,
    );
    await queryRunner.query(
      `CREATE TABLE "submission_files" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "submission_id" uuid NOT NULL, "storage_key" character varying NOT NULL, "original_name" character varying NOT NULL, "mime_type" character varying NOT NULL, "size_bytes" bigint NOT NULL, "kind" character varying NOT NULL DEFAULT 'manuscript', "file_stage" "public"."submission_files_file_stage_enum" NOT NULL DEFAULT 'submission', "is_public" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_5a50c4ff6bd91c77fe659c86b6f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."reviews_recommendation_enum" AS ENUM('accept', 'reject', 'revisions')`,
    );
    await queryRunner.query(
      `CREATE TABLE "reviews" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "assignment_id" uuid NOT NULL, "comments_for_author" text NOT NULL DEFAULT '', "comments_to_editor_only" text NOT NULL DEFAULT '', "recommendation" "public"."reviews_recommendation_enum" NOT NULL, "submitted_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "UQ_d27a79b26ffcfbf4fc314bf7675" UNIQUE ("assignment_id"), CONSTRAINT "REL_d27a79b26ffcfbf4fc314bf767" UNIQUE ("assignment_id"), CONSTRAINT "PK_231ae565c273ee700b283f15c1d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "review_assignments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "slug" character varying(260), "submission_id" uuid NOT NULL, "reviewer_id" uuid NOT NULL, "status" character varying(32) NOT NULL DEFAULT 'invited', "assigned_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_f210a3dd74930a9f9a9a0100241" UNIQUE ("slug"), CONSTRAINT "PK_57627790f79af37bc6a5e982176" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "copyedit_notes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "assignment_id" uuid NOT NULL, "round" integer NOT NULL, "note_for_author" text NOT NULL DEFAULT '', "note_to_editor_only" text NOT NULL DEFAULT '', "submitted_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_7f19a906150afec948b796593fc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "copyedit_assignments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "slug" character varying(260), "submission_id" uuid NOT NULL, "copyeditor_id" uuid NOT NULL, "status" character varying(32) NOT NULL DEFAULT 'active', "assigned_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_7c157156bc5bcb0a797e977775d" UNIQUE ("slug"), CONSTRAINT "PK_af5f1809e8a4bca2242f411b05a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."submissions_article_type_enum" AS ENUM('original_research', 'review_article', 'case_report', 'short_communication', 'other')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."submissions_discipline_source_enum" AS ENUM('ai', 'author', 'editor')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."submissions_status_enum" AS ENUM('draft', 'submitted', 'under_review', 'revisions_requested', 'accepted', 'rejected', 'copyediting', 'published')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."submissions_review_method_enum" AS ENUM('open', 'anonymous', 'double_anonymous')`,
    );
    await queryRunner.query(
      `CREATE TABLE "submissions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "author_id" uuid NOT NULL, "slug" character varying(220), "title" character varying NOT NULL, "title_ar" character varying(500), "abstract" text NOT NULL, "abstract_ar" text, "article_type" "public"."submissions_article_type_enum", "keywords" character varying(800), "keywords_ar" character varying(800), "contributors" jsonb, "funding_statement" text, "conflict_of_interest_statement" text, "ethical_approval_reference" text, "originality_confirmed" boolean NOT NULL DEFAULT false, "ai_usage_statement" text, "discipline" character varying(120), "discipline_source" "public"."submissions_discipline_source_enum", "discipline_suggested" character varying(120), "discipline_suggested_confidence" numeric(5,2), "discipline_classification" jsonb, "constructor_content" jsonb, "review_manuscript_presentation" jsonb, "status" "public"."submissions_status_enum" NOT NULL DEFAULT 'draft', "message_for_author" text, "review_method" "public"."submissions_review_method_enum" NOT NULL DEFAULT 'double_anonymous', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "published_at" TIMESTAMP WITH TIME ZONE, "similarity_indexed_at" TIMESTAMP WITH TIME ZONE, "publication_search_document" text, "publication_search_vector" tsvector, CONSTRAINT "UQ_96a4fe00c00e5495d51cf6ec926" UNIQUE ("slug"), CONSTRAINT "PK_10b3be95b8b2fb1e482e07d706b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "permissions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "slug" character varying NOT NULL, "description" text, CONSTRAINT "UQ_d090ad82a0e97ce764c06c7b312" UNIQUE ("slug"), CONSTRAINT "PK_920331560282b8bd21bb02290df" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "role_permissions" ("role_id" uuid NOT NULL, "permission_id" uuid NOT NULL, CONSTRAINT "PK_25d24010f53bb80b78e412c9656" PRIMARY KEY ("role_id", "permission_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "roles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "slug" character varying NOT NULL, "name" character varying NOT NULL, CONSTRAINT "UQ_881f72bac969d9a00a1a29e1079" UNIQUE ("slug"), CONSTRAINT "PK_c1433d71a4838793a49dcad46ab" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "user_roles" ("user_id" uuid NOT NULL, "role_id" uuid NOT NULL, CONSTRAINT "PK_23ed6f04fe43066df08379fd034" PRIMARY KEY ("user_id", "role_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "password_hash" character varying, "display_name" character varying NOT NULL, "affiliation" character varying(500), "orcid" character varying(19), "review_keywords" text, "willing_to_review" boolean NOT NULL DEFAULT false, "preferred_locale" character varying(10), "email_verified_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "UQ_b89e98c55f8cea971d3f9a6b832" UNIQUE ("orcid"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "auth_challenges" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "purpose" character varying(32) NOT NULL, "secret_hash" character varying(64) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "consumed_at" TIMESTAMP WITH TIME ZONE, "attempt_count" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_6993bc9c45bbf5948e4118de560" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5e51c07dbb014ac8c70676ff6d" ON "auth_challenges" ("user_id", "purpose", "consumed_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "type" character varying(64) NOT NULL, "title_key" character varying(128) NOT NULL, "body_key" character varying(128) NOT NULL, "params" jsonb NOT NULL DEFAULT '{}', "href" character varying(512) NOT NULL, "idempotency_key" character varying(256) NOT NULL, "read_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_5af2abaf70226e88b27ae3b6391" UNIQUE ("idempotency_key"), CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_notifications_user_read" ON "notifications" ("user_id", "read_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_notifications_user_created" ON "notifications" ("user_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "oauth_identities" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "provider" character varying(32) NOT NULL, "provider_subject_id" character varying(64) NOT NULL, "provider_email" character varying(320), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_095205cf320039e4ce248933681" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c6dc3ff085342dbe71e0066d03" ON "oauth_identities" ("user_id", "provider") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_86e1dd062f4974522936778d11" ON "oauth_identities" ("provider", "provider_subject_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "outbound_event_outbox" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "routing_key" character varying(128) NOT NULL, "payload" jsonb NOT NULL, "attempts" integer NOT NULL DEFAULT '0', "last_error" text, "status" character varying(16) NOT NULL DEFAULT 'pending', "next_attempt_at" TIMESTAMP WITH TIME ZONE, "claimed_at" TIMESTAMP WITH TIME ZONE, "published_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1a99e322cc6c010ea0a8e913534" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_outbox_pending_next_attempt" ON "outbound_event_outbox" ("status", "next_attempt_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "refresh_sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "token_hash" character varying(64) NOT NULL, "family_id" uuid NOT NULL, "access_jti" character varying(36) NOT NULL, "user_agent" character varying(512), "ip_hash" character varying(64), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "last_used_at" TIMESTAMP WITH TIME ZONE NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_d76f5941d821678137ef15d9651" UNIQUE ("token_hash"), CONSTRAINT "PK_9190032f6967b7971dca07d69f3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_refresh_sessions_expires_at" ON "refresh_sessions" ("expires_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_refresh_sessions_family_id" ON "refresh_sessions" ("family_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_refresh_sessions_user_id" ON "refresh_sessions" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "revoked_tokens" ("jti" character varying(36) NOT NULL, "user_id" uuid NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b18aa48269f87cafba8c6310624" PRIMARY KEY ("jti"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_revoked_tokens_expires_at" ON "revoked_tokens" ("expires_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "role_invitations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "invitee_user_id" uuid NOT NULL, "invited_by_user_id" uuid NOT NULL, "roleSlug" character varying(32) NOT NULL, "status" character varying(32) NOT NULL DEFAULT 'invited', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "resolved_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_55c5da30f2a4927ba77d0638958" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "submission_files" ADD CONSTRAINT "FK_2922aa3bbea583473e9b510618c" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "FK_d27a79b26ffcfbf4fc314bf7675" FOREIGN KEY ("assignment_id") REFERENCES "review_assignments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "review_assignments" ADD CONSTRAINT "FK_2649b70645ca27053ad2ecd92f6" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "review_assignments" ADD CONSTRAINT "FK_ba32727b847200cf824fcb68dc1" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "copyedit_notes" ADD CONSTRAINT "FK_c2ca2127dddf3f5575539a48819" FOREIGN KEY ("assignment_id") REFERENCES "copyedit_assignments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "copyedit_assignments" ADD CONSTRAINT "FK_65eab8728521bc608d6678c452e" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "copyedit_assignments" ADD CONSTRAINT "FK_62e51aebf3236db8d1148aa8043" FOREIGN KEY ("copyeditor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "submissions" ADD CONSTRAINT "FK_56a9a3c5a1e37b022a3315e2648" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" ADD CONSTRAINT "FK_178199805b901ccd220ab7740ec" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" ADD CONSTRAINT "FK_17022daf3f885f7d35423e9971e" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_roles" ADD CONSTRAINT "FK_87b8888186ca9769c960e926870" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_roles" ADD CONSTRAINT "FK_b23c65e50a758245a33ee35fda1" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "auth_challenges" ADD CONSTRAINT "FK_ce2bfa62e2ffd702457bc39b7eb" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "oauth_identities" ADD CONSTRAINT "FK_b13247ad5cd3fca4761084cf1a0" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_invitations" ADD CONSTRAINT "FK_7c23bdf0701bf40907f78edfbb3" FOREIGN KEY ("invitee_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_invitations" ADD CONSTRAINT "FK_c000a8eb28040df2f2b5a3d6990" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "role_invitations" DROP CONSTRAINT "FK_c000a8eb28040df2f2b5a3d6990"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_invitations" DROP CONSTRAINT "FK_7c23bdf0701bf40907f78edfbb3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "oauth_identities" DROP CONSTRAINT "FK_b13247ad5cd3fca4761084cf1a0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "auth_challenges" DROP CONSTRAINT "FK_ce2bfa62e2ffd702457bc39b7eb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_roles" DROP CONSTRAINT "FK_b23c65e50a758245a33ee35fda1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_roles" DROP CONSTRAINT "FK_87b8888186ca9769c960e926870"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_17022daf3f885f7d35423e9971e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_178199805b901ccd220ab7740ec"`,
    );
    await queryRunner.query(
      `ALTER TABLE "submissions" DROP CONSTRAINT "FK_56a9a3c5a1e37b022a3315e2648"`,
    );
    await queryRunner.query(
      `ALTER TABLE "copyedit_assignments" DROP CONSTRAINT "FK_62e51aebf3236db8d1148aa8043"`,
    );
    await queryRunner.query(
      `ALTER TABLE "copyedit_assignments" DROP CONSTRAINT "FK_65eab8728521bc608d6678c452e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "copyedit_notes" DROP CONSTRAINT "FK_c2ca2127dddf3f5575539a48819"`,
    );
    await queryRunner.query(
      `ALTER TABLE "review_assignments" DROP CONSTRAINT "FK_ba32727b847200cf824fcb68dc1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "review_assignments" DROP CONSTRAINT "FK_2649b70645ca27053ad2ecd92f6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" DROP CONSTRAINT "FK_d27a79b26ffcfbf4fc314bf7675"`,
    );
    await queryRunner.query(
      `ALTER TABLE "submission_files" DROP CONSTRAINT "FK_2922aa3bbea583473e9b510618c"`,
    );
    await queryRunner.query(`DROP TABLE "role_invitations"`);
    await queryRunner.query(
      `DROP INDEX "public"."ix_revoked_tokens_expires_at"`,
    );
    await queryRunner.query(`DROP TABLE "revoked_tokens"`);
    await queryRunner.query(
      `DROP INDEX "public"."ix_refresh_sessions_user_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."ix_refresh_sessions_family_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."ix_refresh_sessions_expires_at"`,
    );
    await queryRunner.query(`DROP TABLE "refresh_sessions"`);
    await queryRunner.query(
      `DROP INDEX "public"."ix_outbox_pending_next_attempt"`,
    );
    await queryRunner.query(`DROP TABLE "outbound_event_outbox"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_86e1dd062f4974522936778d11"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c6dc3ff085342dbe71e0066d03"`,
    );
    await queryRunner.query(`DROP TABLE "oauth_identities"`);
    await queryRunner.query(
      `DROP INDEX "public"."ix_notifications_user_created"`,
    );
    await queryRunner.query(`DROP INDEX "public"."ix_notifications_user_read"`);
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5e51c07dbb014ac8c70676ff6d"`,
    );
    await queryRunner.query(`DROP TABLE "auth_challenges"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TABLE "user_roles"`);
    await queryRunner.query(`DROP TABLE "roles"`);
    await queryRunner.query(`DROP TABLE "role_permissions"`);
    await queryRunner.query(`DROP TABLE "permissions"`);
    await queryRunner.query(`DROP TABLE "submissions"`);
    await queryRunner.query(
      `DROP TYPE "public"."submissions_review_method_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."submissions_status_enum"`);
    await queryRunner.query(
      `DROP TYPE "public"."submissions_discipline_source_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."submissions_article_type_enum"`,
    );
    await queryRunner.query(`DROP TABLE "copyedit_assignments"`);
    await queryRunner.query(`DROP TABLE "copyedit_notes"`);
    await queryRunner.query(`DROP TABLE "review_assignments"`);
    await queryRunner.query(`DROP TABLE "reviews"`);
    await queryRunner.query(`DROP TYPE "public"."reviews_recommendation_enum"`);
    await queryRunner.query(`DROP TABLE "submission_files"`);
    await queryRunner.query(
      `DROP TYPE "public"."submission_files_file_stage_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."ix_ai_jobs_submission_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."ix_ai_jobs_slug_type_status"`,
    );
    await queryRunner.query(`DROP TABLE "ai_jobs"`);
  }
}
