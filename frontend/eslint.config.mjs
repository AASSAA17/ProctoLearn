import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

export default defineConfig([
  ...nextVitals,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    // Client data loaders intentionally reset loading/selection before asynchronous I/O.
    // Keep this performance diagnostic visible without rewriting their cancellation semantics.
    rules: { 'react-hooks/set-state-in-effect': 'warn' },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
]);
