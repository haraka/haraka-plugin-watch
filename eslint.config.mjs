import haraka from '@haraka/eslint-config'
import globals from 'globals'

export default [
  ...haraka,
  {
    files: ['html/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.jquery,
      },
    },
  },
]
