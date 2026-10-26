# Vastu Portal

A modern educational platform for Vastu courses.

## Features
- Student Dashboard
- Video Lessons
- Material Downloads
- Teacher Course Editor

## Tech Stack
- React + Vite
- Tailwind CSS
- Supabase (Auth + Database)

## Adding lesson files from the command line
`scripts/import-lesson.mjs` uploads a file to the `course-content` bucket and
attaches it to a lesson (or a week) of a course. Re-running it replaces the
file instead of adding a second one; `--dry-run` shows the plan first. It needs
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the environment or in `.env`
(gitignored).

    node scripts/import-lesson.mjs --course vastu-design-2026 --week 1 --day 1 \
      --title "Конспект урока" --file ~/Downloads/lesson-1.pdf --dry-run

`--help` lists every option. Tests: `npm test`.
