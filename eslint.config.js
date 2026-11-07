import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/drizzle/**", "**/*.gen.ts"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx,js}", "apps/site/src/**/*.js"],
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      // The shared index pulls in Zod. The panel may import its types, and values only
      // from "@nocap/shared/constants", to keep Zod out of the browser bundle.
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@nocap/shared",
              message: 'Import values from "@nocap/shared/constants"; use "import type" for types.',
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },
);
