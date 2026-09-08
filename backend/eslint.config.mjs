// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'eslint.config.mjs',
      'src/ai/grpc/gen/**',
      // ── Lint debt, 2026-09-08 ────────────────────────────────────────────
      // These 16 files carry 103 pre-existing errors, mostly type-aware
      // `no-unsafe-*` around loosely typed dependencies (`ws`, the throttler
      // base class). They are excluded so CI can gate every *other* file and
      // stop new debt arriving; they are not excused.
      //
      // Do not mass-fix with `eslint --fix`: doing so on 2026-09-08 collapsed
      // `notification-hub.ts` onto a single line despite
      // `prettier/prettier: endOfLine: auto`. Fix these by hand, a file at a
      // time, deleting each line below as it goes clean.
      'src/admin-email/admin-email.controller.ts',
      'src/admin-email/dto/patch-reminder-policy.dto.ts',
      'src/auth/jwt-from-request.util.ts',
      'src/common/decorators/allow-authenticated.decorator.ts',
      'src/common/guards/folio-throttler.guard.spec.ts',
      'src/common/guards/folio-throttler.guard.ts',
      'src/common/guards/permissions.guard.spec.ts',
      'src/manuscript-styles/manuscript-profiles-map.spec.ts',
      'src/manuscript-styles/manuscript-style-registry.service.spec.ts',
      'src/messaging/dlq-replay.service.ts',
      'src/messaging/event-publisher.service.spec.ts',
      'src/messaging/outbox-drainer.service.spec.ts',
      'src/messaging/outbox-repair.service.spec.ts',
      'src/notifications/notification-hub.ts',
      'src/notifications/notifications.controller.ts',
      'src/notifications/notifications.service.spec.ts',
      // Untracked local scratch — never committed, never in CI.
      'src/**/ztmp-*.ts',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      "prettier/prettier": ["error", { endOfLine: "auto" }],
    },
  },
);
