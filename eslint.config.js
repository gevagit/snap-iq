import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules', 'dist', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // The engine must be deterministic (CLAUDE.md): randomness only from the seeded RNG.
      'no-restricted-properties': ['error', { object: 'Math', property: 'random', message: 'Use the seeded RNG; Math.random is banned in engine code.' }],
    },
  },
);
