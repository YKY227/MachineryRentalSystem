# Repository Guidelines

## Project Structure & Module Organization
The active product lives in `rental-system-frontend/`, a Next.js 14 App Router app. Put UI routes in `rental-system-frontend/src/app`, shared components in `rental-system-frontend/src/components`, and business logic, auth, API helpers, and rental domain code in `rental-system-frontend/src/lib`. Static assets belong in `rental-system-frontend/public`. Use `rental-system-frontend/docs` for testing notes, SQL references, and migration logs; use the root `docs/` folder for broader architecture and agent-facing documentation.

## Build, Test, and Development Commands
Run app commands from `rental-system-frontend/` unless noted.

- `npm run dev`: start the Next.js dev server.
- `npm run build`: create a production build.
- `npm run start`: serve the production build locally.
- `npm run lint`: run Next.js ESLint checks.
- `npm run check:backend`: verify the local backend health endpoint.
- `npm run backfill:rental-equipment`: import seeded rental equipment data.
- `npm run log:migration` / `npm run doc:log`: append migration-log entries.

The root `package.json` only exposes `npm run dev` and should not be treated as the main app entrypoint.

## Coding Style & Naming Conventions
Use TypeScript throughout. Follow the existing style: 2-space indentation, semicolons, single quotes, and descriptive camelCase identifiers. Name React components and route files with PascalCase where appropriate (`EquipmentCard.tsx`), and keep utility modules lowercase with hyphenated or domain-oriented names (`db-rental-equipment-repo.ts`). Prefer colocating route handlers under `src/app/api/**` and domain logic under `src/lib/rental/**`.

## Testing Guidelines
This repository currently relies mainly on manual regression coverage. Start with `rental-system-frontend/docs/testing/test-plan.md`, then execute the module test cases in `rental-system-frontend/docs/testing/test-cases/` and record defects in `bug-log.md`. Run `npm run lint` before opening a PR. If you add automated checks, keep them targeted and name scripts clearly by workflow.

## Commit & Pull Request Guidelines
Recent history favors short, imperative subjects, sometimes prefixed with `Scope:`; for example, `Scope: rental orders drawer readability pass`. Keep commits focused on one workflow or subsystem. PRs should include a concise summary, affected areas, linked issues when applicable, and screenshots for UI changes. Call out environment, SQL, or Supabase migration impacts explicitly.

## Security & Configuration Tips
Keep secrets in `rental-system-frontend/.env.local`; never commit API keys or service-role credentials. Review `docs/architecture.md` before changing admin auth, invoice flows, or Supabase-backed storage paths. When changing schema-related behavior, update the relevant SQL docs and migration log in the same branch.
