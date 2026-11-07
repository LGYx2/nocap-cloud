# Contributing to Nocap Cloud

Thanks for helping. This guide keeps changes easy to review.

## Before you start

- For a bug, open an issue with the bug template first.
- For a new feature, open an issue to discuss it before writing code. Features outside the
  [roadmap](README.md#roadmap) may wait until after v0.1.
- Security problems never go in public issues: see [SECURITY.md](SECURITY.md).

## Set up

```sh
pnpm install
cp apps/server/.env.example apps/server/.env
pnpm dev
```

## Making a change

1. Create a branch from `main`.
2. Keep the change small and focused on one thing.
3. Add or update tests.
4. Run `pnpm lint`, `pnpm typecheck` and `pnpm test` before you push.
5. Open a pull request using the template.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`,
`refactor:`, `test:`, `chore:`. The changelog is built from them.

## Database changes

Edit `packages/db/src/schema.ts`, then run `pnpm db:generate` and commit the new SQL file in
`packages/db/drizzle`. Never edit a migration that is already on `main`.

## Code of conduct

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
