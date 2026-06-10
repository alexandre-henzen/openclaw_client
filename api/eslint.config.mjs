import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/** Harness-aligned lint: hygiene only (see docs/specs/refatoracao-inicial.spec.md §Verify). */
export default tseslint.config(
  { ignores: ['build/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      'no-console': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Legacy Express / TypeORM patterns — behaviour gates live in harness:check + tests.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  }
);
