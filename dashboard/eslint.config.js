import nextPlugin from '@next/eslint-plugin-next';
import eslintConfigNext from 'eslint-config-next';

export default [
  {
    plugins: {
      '@next/next': nextPlugin,
    },
    rules: {
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
  {
    ignores: ['.next/*', 'node_modules/*'],
  },
];
