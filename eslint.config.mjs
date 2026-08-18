// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs', 'dist/**', 'coverage/**', 'node_modules/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      ecmaVersion: 5,
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      // --- Reglas que SI atrapan bugs reales: se mantienen en error ---
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
          ignoreRestSiblings: true,
        },
      ],

      // --- Decisiones explicitas del proyecto ---

      // El proyecto acepta `any` de forma deliberada (respuestas de APIs
      // externas, payloads de webhooks, filas crudas de TypeORM). Dejar
      // no-explicit-any en off pero marcar cada *uso* de un any generaba
      // ~2500 hallazgos sin valor accionable, asi que la familia no-unsafe-*
      // se apaga por coherencia con esa misma decision.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-enum-comparison': 'off',

      // require() es intencional en los pocos lugares donde aparece: lazy
      // import para cortar dependencias circulares (weekly-overrides ->
      // schedules), carga por path de la service-account de Firebase y
      // dependencias pesadas que solo se cargan si se usan.
      '@typescript-eslint/no-require-imports': 'off',

      // `async` se usa como contrato de interfaz: wrappers de jsonwebtoken,
      // hooks de Passport/NestJS y factories que deben devolver Promise
      // aunque su cuerpo sea sincronico. Quitar el async convertiria los
      // rechazos en throws sincronicos, cambiando el comportamiento.
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    // Los tests usan mocks sin tipar y pasan metodos sin bindear a expect(),
    // que es el uso idiomatico de jest y no un problema real.
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
    },
  },
);
