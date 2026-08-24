# Taktik Robot

A local publishing workspace for preparing textbook text, indexes, production
assets, diagrams, graphs, maps, barcodes, and cover concepts.

## Requirements

- Node.js `>=22.13.0`
- An OpenRouter API key for AI-assisted tools

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app uses the local
username/password pairs configured in `APP_USERS`.

## Environment

Required values:

- `OPENROUTER_API_KEY`: shared API key used by protected server routes.
- `APP_USERS`: comma-separated `username:password` pairs.
- `AUTH_SECRET`: long random value used to sign local sessions.

Optional Shutterstock preview research accepts either
`SHUTTERSTOCK_API_TOKEN` or the `SHUTTERSTOCK_API_KEY` /
`SHUTTERSTOCK_API_SECRET` pair. Watermarked previews are research references
only and must be licensed before publication.

Model environment variables are listed in `.env.example` and have application
defaults.

## Project structure

- `app/`: Next.js pages, protected API routes, and application modules.
- `app/content/`: static bilingual UI copy and design-manual content.
- `app/data/`: local processed datasets used by server-side map generation.
- `app/lib/`: deterministic renderers, parsers, authentication, and exporters.
- `public/`: browser-served assets and the single Cliopatria timeline dataset.
- `scripts/`: data imports, evaluations, and workflow checks.
- `tests/`: automated regression tests.
- `docs/`: dated development summaries and technical handoffs.

The Cliopatria dataset lives once at
`public/data/cliopatria-timeline.json`. The timeline API reads that repository
copy directly from disk.

## Commands

```bash
npm run dev          # local development server
npm run build        # production compilation
npm start            # serve the production build locally
npm test             # build plus rendered HTML tests
npm run test:figures # deterministic figure and map tests
npm run lint         # ESLint
```

Generated `.next`, `dist`, `.vinext`, `.wrangler`, and `tmp` directories are
ignored and can be safely cleared. They are not application source.
