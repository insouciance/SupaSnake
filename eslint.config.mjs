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
];

export default eslintConfig;
