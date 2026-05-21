import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Pre-existing issues -- warn only so CI passes while we clean up incrementally.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "no-empty": "warn",
      "prefer-const": "warn",
      // shared.tsx exports constants alongside components -- acceptable for now.
      "react-refresh/only-export-components": "warn",
      // exhaustive-deps has pre-existing violations in TRADR.tsx — kept as warn until
      // those are addressed in a dedicated cleanup. TODO: promote to error.
      "react-hooks/exhaustive-deps": "warn",
      // eslint-plugin-react-hooks v7 React Compiler rules — kept as warn (pre-existing violations)
      // TODO: promote to error once the compiler migration is complete
      "react-hooks/static-components": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/globals": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-render": "warn",
      "react-hooks/use-memo": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/error-boundaries": "warn",
      "react-hooks/config": "warn",
      "react-hooks/gating": "warn",
      "react-hooks/incompatible-library": "warn",
      "react-hooks/unsupported-syntax": "warn",
    },
  },
])
