import js from '@eslint/js'
import importPlugin from 'eslint-plugin-import'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'data_raw', 'data_interim', 'public/data'] },

  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      importPlugin.flatConfigs.recommended,
      importPlugin.flatConfigs.typescript,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      'import/resolver': {
        typescript: { alwaysTryTypes: true, project: './tsconfig.app.json' },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // PRD 5.2: no `any` di kode 3D — ditegakkan global, viewer wajib.
      '@typescript-eslint/no-explicit-any': 'error',

      // === PRD 5.5 — Batas modul. Ini aturan keras, bukan saran. ===
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              // src/viewer/** = three.js murni. Tanpa React, tanpa komponen, tanpa store.
              target: './src/viewer',
              from: './src/components',
              message:
                'PRD §5.5: src/viewer tidak boleh import dari src/components. Viewer harus bebas React — komunikasi viewer→UI lewat event emitter.',
            },
            {
              target: './src/viewer',
              from: './src/stores',
              message:
                'PRD §5.5: src/viewer tidak boleh import dari src/stores. State diskrit masuk lewat method call imperatif dari UI.',
            },
            {
              // src/components/** tidak boleh import three (kecuali `import type`).
              target: './src/components',
              from: './src/viewer',
              // Hanya file yang mengekspos tipe/handle publik yang boleh ditembus.
              except: ['./types.ts', './events.ts'],
              message:
                'PRD §5.5: src/components hanya boleh menyentuh viewer lewat src/viewer/types.ts atau events.ts (import type).',
            },
          ],
        },
      ],
    },
  },

  // src/viewer/**: larangan import react ditegakkan terpisah (paket eksternal,
  // di luar jangkauan no-restricted-paths yang berbasis path).
  {
    files: ['src/viewer/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react',
              message:
                'PRD §5.2: scene three.js hidup di luar React. src/viewer tidak boleh import react.',
            },
            {
              name: 'react-dom',
              message: 'PRD §5.2: src/viewer tidak boleh import react-dom.',
            },
            {
              name: 'zustand',
              message:
                'PRD §5.2: state per-frame tidak masuk store. Viewer tidak boleh import zustand.',
            },
            {
              name: '@react-three/fiber',
              message: 'PRD §5.2: mesh anatomi inti tetap imperatif. Jangan pakai R3F di scene inti.',
            },
          ],
          patterns: [
            {
              group: ['react', 'react/*', 'react-dom', 'react-dom/*', '@react-three/*'],
              message: 'PRD §5.2: src/viewer harus bebas React.',
            },
          ],
        },
      ],
    },
  },

  // src/components/**: three hanya boleh sebagai `import type`.
  {
    files: ['src/components/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'three',
              allowTypeImports: true,
              message:
                'PRD §5.5: src/components tidak boleh import three secara nilai. `import type` saja.',
            },
          ],
          patterns: [
            {
              group: ['three/*'],
              allowTypeImports: true,
              message: 'PRD §5.5: src/components tidak boleh import three secara nilai.',
            },
          ],
        },
      ],
    },
  },

  // Service worker: bukan modul bundle. Global-nya beda (self, caches,
  // clients), dan tiga placeholder di bawah baru diisi saat build oleh
  // plugin `corpus-service-worker` di vite.config.ts.
  {
    files: ['src/sw/**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        __SHELL__: 'readonly',
        __DATA_SHELL__: 'readonly',
        __BUILD__: 'readonly',
        __DATA_VERSION__: 'readonly',
      },
    },
  },

  // Config files: tanpa type-checking project service.
  {
    files: ['*.config.{js,ts}', 'eslint.config.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
)
