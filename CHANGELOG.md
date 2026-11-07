# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Monorepo with server, panel, database and shared packages.
- First-run setup that creates the admin account.
- Admin login with argon2 password hashing, httpOnly session cookie and rate limiting.
- Health endpoint and database migrations on start.
- Single Docker image, docker-compose stack (Nocap, Postgres, Traefik) and install script.
- CI for lint, typecheck, tests and build.
- Neutral black and white panel theme in the style of shadcn/ui, with a light, dark and system switch.
- Projects: create, search, rename and delete projects, with a confirm step before delete.
- Sidebar with icons, user menu and breadcrumbs.
- Landing page in `apps/site`, published to GitHub Pages.
- Demo mode for the panel with a fake API in the browser, deployed to Vercel.
- Website with Features, Roadmap (version tree) and Community (ideas with voting) pages,
  an interactive deploy graph and scroll animations.
- Short install address: `curl -fsSL https://get.nocapcloud.click | sudo sh`.
- Sign in with GitHub on the website to vote on ideas and suggest new ones without leaving the
  page. Ideas stay GitHub issues and votes stay 👍 reactions.
- Founder section on the home page.
- Applications from a Git repository or a Docker image, with deployments, live build logs,
  zero-downtime switch, domains with HTTPS, encrypted environment variables and app logs.
- Dashboard with server CPU, memory and disk, and a Deployments page with project filter.
- Git providers: a private GitHub App per install (manifest flow), GitLab tokens, private
  repositories, deploy on push with signed webhooks, and a deploy hook URL per app.
- Settings page with the panel's public address.
