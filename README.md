<p align="center">
  <img src=".github/assets/logo.svg" alt="Nocap Cloud logo: a blue cap with an up arrow" width="220">
</p>

<h1 align="center">nocapcloud</h1>

<p align="center"><strong>Deploys, no cap.</strong><br>
A free, open-source and lightweight deployment panel for your own server.<br>
<a href="https://nocapcloud.click">Website</a> · <a href="https://demo.nocapcloud.click">Live demo</a> · <a href="#roadmap">Roadmap</a> · <a href="CONTRIBUTING.md">Contribute</a></p>

<p align="center">
  <a href="LICENSE"><img alt="License: Apache 2.0" src="https://img.shields.io/badge/license-Apache%202.0-4B3BFF"></a>
  <img alt="Status: early" src="https://img.shields.io/badge/status-early-A99BFF">
</p>

> **Early project.** Nocap Cloud is in active development and not ready for production yet.
> Follow the [roadmap](#roadmap) to see what works today.

## What it is

Nocap Cloud turns a clean Linux server into your own deployment platform. Connect GitHub or GitLab,
push your code, and your app goes live with HTTPS. It is free for everyone, with no paid plans and
no telemetry.

- **Lightweight:** three containers (Nocap, Postgres and Traefik), no Redis.
- **Git push to deploy:** GitHub App and GitLab integration, set up in a few clicks.
- **Zero-downtime deploys** with health checks and one-click rollback.
- **Databases and backups:** PostgreSQL, MySQL and Redis, backed up to any S3-compatible storage.

## Install

> Not available yet. The installer ships with v0.1.

```sh
curl -fsSL https://get.nocapcloud.click | sudo sh
```

Requirements: Ubuntu 22.04 or 24.04, amd64 or arm64, 1 GB RAM (2 GB recommended), 20 GB disk,
ports 80, 443 and 3000 free.

## Roadmap

| Phase                                                                       | Status      |
| --------------------------------------------------------------------------- | ----------- |
| 0. Foundations: repo, CI, login, projects, install script, website          | Done        |
| 1. Deploy: build and run apps, Traefik, SSL, live logs                      | Done        |
| 2. Git: GitHub App, GitLab token, deploy on push, deploy hooks              | Done        |
| 3. Reliability: encrypted variables, health checks, zero downtime, rollback | In progress |
| 4. Databases, release commands (migrations) and backups                     | Next        |
| 5. Monitoring: per-app CPU and memory history, alerts, uptime checks        | Planned     |
| 6. Release v0.1: images on GHCR, in-panel updates, docs                     | Planned     |

## Deploying from Git

**Public repositories** work right away: paste the `https://` address when you create an app.

**GitHub** (private repositories, deploy on push):

1. In the panel, open **Git providers → Connect GitHub**. Check the panel address: GitHub calls it
   back and sends push events there, so it must be reachable from the internet.
2. GitHub opens and creates a private GitHub App just for your server, with read-only access to
   code. Click **Create**.
3. Choose which repositories the app can see and click **Install**.
4. Create an app, pick the account and the repository from the list. Every push to its branch
   deploys it.

Code is cloned with short-lived tokens. They are hidden in build logs, and the `.git` folder is
removed before the build, so tokens never end up in an image.

**GitLab** (gitlab.com or self-hosted): **Git providers → GitLab**, paste a personal access token
with the `api` and `read_repository` scopes. Nocap adds the push webhook to the project when you
create the app.

**Anything else** (Bitbucket, Gitea, a cron job): every app has a deploy hook URL under
**Settings → Automatic deploys**. `curl -X POST <url>` deploys it.

## Develop

You need Node.js 22, pnpm 10 and a PostgreSQL 16 database.

```sh
pnpm install
cp apps/server/.env.example apps/server/.env   # set DATABASE_URL
pnpm dev                                        # server on :3000, panel on :5173
```

Other commands: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`.

To run the panel without a server, start it in demo mode: `pnpm --filter @nocap/web dev:demo`.
It uses a fake API in the browser with sample data. `build:demo` builds the version deployed
at [demo.nocapcloud.click](https://demo.nocapcloud.click).

### Repository layout

```text
apps/server       Fastify API, background worker, serves the built panel
apps/web          React panel (Vite, Tailwind)
apps/site         Landing page at nocapcloud.click (Vercel), mirrored on GitHub Pages
packages/db       Drizzle schema and SQL migrations
packages/shared   Zod schemas and types shared by server and panel
infra             docker-compose.yml and install.sh
```

## Founder

Nocap Cloud was founded by **Ismael Valgy** ([@LGYx2](https://github.com/LGYx2)), who leads the
roadmap and reviews every change.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first, and report security
issues privately as described in [SECURITY.md](SECURITY.md).

## License

[Apache 2.0](LICENSE)
