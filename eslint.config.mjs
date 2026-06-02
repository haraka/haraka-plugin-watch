import globals from 'globals'
import haraka from '@haraka/eslint-config'

export default [
  ...haraka,
  {
    files: ['html/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        $: 'readonly',
      },
    },
  },
]
