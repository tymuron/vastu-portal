// The config `npm run lint` was written for (Vite's React + TypeScript
// template); it was never committed, so lint could not run at all.
//
// The overrides below list the files that already broke a rule when the
// config was added (30 Oct 2026), so lint passes without touching them. New
// files get every rule; fix a file and take it off its list.
module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
  },
  overrides: [
    {
      files: [
        'src/components/FileUploader.tsx',
        'src/components/HomeworkSubmission.tsx',
        'src/components/layout/StudentLayout.tsx',
        'src/contexts/AuthContext.tsx',
        'src/pages/ForgotPasswordPage.tsx',
        'src/pages/LoginPage.tsx',
        'src/pages/RegisterPage.tsx',
        'src/pages/UpdatePasswordPage.tsx',
        'src/pages/student/Profile.tsx',
        'src/pages/teacher/CourseEditor.tsx',
        'src/pages/teacher/ManageLibrary.tsx',
        'src/pages/teacher/ManageStreams.tsx',
        'src/pages/teacher/Submissions.tsx',
      ],
      rules: { '@typescript-eslint/no-explicit-any': 'off' },
    },
    {
      files: [
        'src/hooks/useCourse.ts',
        'src/pages/student/Library.tsx',
        'src/pages/student/LiveStreams.tsx',
        'src/pages/teacher/CourseEditor.tsx',
        'src/pages/teacher/ManageLibrary.tsx',
        'src/pages/teacher/ManageStreams.tsx',
      ],
      rules: { 'react-hooks/exhaustive-deps': 'off' },
    },
    {
      files: ['src/contexts/AuthContext.tsx', 'src/contexts/CourseContext.tsx'],
      rules: { 'react-refresh/only-export-components': 'off' },
    },
    {
      files: ['src/pages/teacher/ManageLibrary.tsx', 'src/pages/teacher/ManageStreams.tsx'],
      rules: { 'no-empty': 'off' },
    },
  ],
}
