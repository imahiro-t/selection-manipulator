import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import stylistic from "@stylistic/eslint-plugin";

export default defineConfig([
    // Same as the former .eslintrc.json "ignorePatterns" (gitignore-style, so match at any depth).
    globalIgnores(["**/out/", "**/dist/", "**/*.d.ts"]),
    {
        files: ["**/*.ts"],
        languageOptions: {
            parser: tseslint.parser,
            ecmaVersion: 6,
            sourceType: "module",
            parserOptions: {
                // Type information for the type-aware rules (@typescript-eslint/only-throw-error).
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        plugins: {
            "@typescript-eslint": tseslint.plugin,
            "@stylistic": stylistic,
        },
        rules: {
            "@typescript-eslint/naming-convention": [
                "warn",
                {
                    selector: "import",
                    format: ["camelCase", "PascalCase"],
                },
            ],
            // @typescript-eslint/semi was removed in typescript-eslint 8; @stylistic/semi is its official successor.
            "@stylistic/semi": "warn",
            curly: "warn",
            eqeqeq: "warn",
            // Type-aware successor of the deprecated core no-throw-literal rule.
            "@typescript-eslint/only-throw-error": "warn",
            semi: "off",
        },
    },
]);
