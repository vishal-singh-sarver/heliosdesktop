import js from '@eslint/js'
import globals from 'globals'
import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import reactPlugin from 'eslint-plugin-react'
import reactHooksPlugin from 'eslint-plugin-react-hooks'

const tsRules = {
  ...tsPlugin.configs.recommended.rules,
  'no-undef': 'off', // TypeScript handles this
  '@typescript-eslint/no-explicit-any': 'warn',
  '@typescript-eslint/explicit-function-return-type': 'off'
}

export default [
  // Base JS recommended rules
  js.configs.recommended,

  // Build/dev scripts (plain Node.js CommonJS)
  {
    files: ['scripts/**/*.{js,cjs,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: { ...globals.node }
    },
    rules: { 'no-console': 'off' }
  },

  // Main process (Node.js)
  //
  // `no-console` is off here, as it is for scripts/ above. The main process has
  // no devtools console - stdout/stderr IS its logging channel, and in a
  // packaged app it is usually the only diagnostic available when the backend
  // child process fails to launch. The statements this rule flagged are all
  // deliberate operational logging (backend stdout/stderr forwarding, exit
  // codes, startup failures), not debug leftovers, so enforcing the rule would
  // mean deleting the output you need when a user reports the app not starting.
  {
    files: ['src/main/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
      globals: { ...globals.node }
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: { ...tsRules, 'no-console': 'off' }
  },

  // Preload process (Node.js + browser globals)
  {
    files: ['src/preload/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
      globals: { ...globals.node, ...globals.browser }
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsRules,
      'no-console': 'warn',
      '@typescript-eslint/ban-ts-comment': 'off'
    }
  },

  // Renderer source files (browser + React)
  {
    files: ['src/renderer/src/**/*.ts', 'src/renderer/src/**/*.tsx'],
    ignores: ['src/renderer/src/tests/**'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true }
      },
      globals: { ...globals.browser }
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin
    },
    rules: {
      ...tsRules,
      ...reactPlugin.configs.recommended.rules,
      ...reactPlugin.configs['jsx-runtime'].rules,
      ...reactHooksPlugin.configs.recommended.rules,
      'no-console': 'warn',
      'react-hooks/immutability': 'off'
    },
    settings: { react: { version: 'detect' } }
  },

  // Renderer test files (browser + vitest globals)
  {
    files: ['src/renderer/src/tests/**/*.ts', 'src/renderer/src/tests/**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true }
      },
      globals: {
        ...globals.browser,
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        vi: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        test: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin
    },
    rules: {
      ...tsRules,
      ...reactPlugin.configs.recommended.rules,
      ...reactPlugin.configs['jsx-runtime'].rules,
      'no-console': 'warn'
    },
    settings: { react: { version: 'detect' } }
  },

  // Ignore generated output
  {
    ignores: ['out/**', 'dist/**', 'node_modules/**', 'coverage/**']
  }
]
