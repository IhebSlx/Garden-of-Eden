import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    // Plain Node build scripts: outside the TypeScript project, so the type-aware
    // rules have no programme to consult. Still linted, just not type-checked.
    files: ['scripts/**/*.{js,mjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          // `const { position: _dropped, ...rest } = agent` is how we omit a field.
          ignoreRestSiblings: true,
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "Identifier[name=/^(TODO|FIXME)$/]",
          message: 'SPEC §10: no open markers on main.',
        },
      ],
    },
  },
  {
    files: ['eslint.config.js', 'vite.config.ts'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
