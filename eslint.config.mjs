import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.git/**', '.next/**', '.openai/**', '.tauri/**', '.wrangler/**', '.codex/**', '.agents/**', 'out/**', 'build/**', 'dist/**', 'dist-reader/**', 'src-tauri/target/**', 'src-tauri/gen/**', 'tmp/**', 'next-env.d.ts']),
]);

export default eslintConfig;
