import js from '@eslint/js';
import globals from 'globals';

export default [
  // .claude/ holds a skill's templates: copies of files linted where they live.
  { ignores: ['dist/', 'node_modules/', '.claude/'] },

  js.configs.recommended,

  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
    },
  },

  {
    files: ['src/vendor/**/*.js'],
    rules: { 'no-unused-vars': 'off', 'no-empty': 'off' },
  },

  {
    files: ['test/**/*.js', 'scripts/**/*.js', 'vite.config.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
  },

  {
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        caughtErrors: 'none',
        ignoreRestSiblings: true,
      }],
    },
  },
];
