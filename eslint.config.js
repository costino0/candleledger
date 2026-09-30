import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';

export default [
  { ignores: ['**/node_modules', '**/dist', '**/coverage'] },

  js.configs.recommended,

  // Server and root config files run in Node.
  {
    files: ['server/**/*.js', '*.js'],
    languageOptions: { globals: globals.node },
  },

  // Client code runs in the browser and uses React.
  {
    files: ['client/**/*.{js,jsx}'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Vite's config file runs in Node, not the browser.
  {
    files: ['client/vite.config.js'],
    languageOptions: { globals: globals.node },
  },

  // Turn off stylistic rules that Prettier handles.
  prettier,
];
