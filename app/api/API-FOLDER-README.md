# API adapters

Next.js requires each stable `/api/...` address to have a native file under `app/api/`. Most route files here are thin generated adapters: they preserve those public addresses and literal Next.js route settings while the real handlers remain owned by each tool.

Do not edit generated adapters manually. Declare tool routes in the owning `manifest.ts`, then run `npm run tools:generate`. Authentication, feedback, and the `/api/figures` compatibility dispatcher are handwritten shared exceptions.
