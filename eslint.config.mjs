import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "coverage/**",
      "test-results/**",
      "playwright-report/**",
      "next-env.d.ts",
      // Agent worktrees carry their own node_modules, .next and coverage
      // output. Those are ignored above only RELATIVE TO THE ROOT, so without
      // this line `npm run lint` walks into every worktree and reports build
      // artifacts as source errors - 5 errors from generated chunk files, none
      // of them in this repository's code. CI never sees it (fresh checkout,
      // no worktrees), which is exactly why it went unnoticed locally.
      //
      // Deliberately NOT anchored with a leading slash: eslint flat-config
      // ignores are already resolved against the config's own directory, so a
      // worktree running its own copy of this file matches only its own
      // nested path - it cannot ignore itself, the way an unanchored jest
      // pattern once did (see jest.config.js).
      ".claude/worktrees/**",
    ],
  },
  ...compat.extends("next/core-web-vitals"),
  {
    rules: {
      /**
       * ERROR, not the default warning.
       *
       * A missing hook dependency cost an hour and a bad playtest: the growth
       * selector updated React state while `handleStart` - a useCallback
       * without `growthProfile` in its deps - kept sending the value captured
       * on first render. Every run grew +1, the three profiles were
       * indistinguishable, and nothing failed. No unit test could catch it,
       * because none of them go through React.
       *
       * The rule DID warn. It was dismissed, because a warning that sits
       * beside other warnings is a warning nobody reads. The codebase has zero
       * violations today, so this costs nothing and cannot be ignored again.
       */
      "react-hooks/exhaustive-deps": "error",
    },
  },
];

export default eslintConfig;
