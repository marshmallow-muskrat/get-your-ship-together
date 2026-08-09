import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/** Minimal TypeScript lint gate for Containment Protocol. */
export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['dist/**', 'node_modules/**', 'public/**', 'assets/**'],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'prefer-const': 'warn',
      'no-useless-escape': 'warn',
      'no-useless-assignment': 'off',
    },
  },
);
