import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";


export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs}"],
    plugins: {
      '@stylistic': stylistic,
    },
    extends: ["js/recommended"],
    languageOptions: {
      globals: globals.node,
    },
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.pnpm/**",
    ],
  },
  {
    rules: {
      'max-len': ['warn', {
        code: 99,
        tabWidth: 2,
        comments: 99,
        ignoreComments: false,
        ignoreTrailingComments: false,
        ignoreUrls: true,
        ignoreStrings: false,
        ignoreTemplateLiterals: true,
        ignoreRegExpLiterals: true,
      }],
      "comma-dangle": ["warn", "always-multiline"],
    },
  },
]);
