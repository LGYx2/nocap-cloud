<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/logo-dark.svg">
    <img src=".github/assets/logo.svg" alt="Nocap Cloud logo: a cap with an up arrow" width="200">
  </picture>
</p>

<h1 align="center">nocapcloud</h1>

<p align="center"><strong>Deploys, no cap.</strong><br>
A free, open-source and lightweight deployment panel for your own server.<br>
<a href="https://nocapcloud.click">Website</a> · <a href="https://demo.nocapcloud.click">Live demo</a> · <a href="#roadmap">Roadmap</a> · <a href="CONTRIBUTING.md">Contribute</a></p>

<p align="center">
  <a href="LICENSE"><img alt="License: Apache 2.0" src="https://img.shields.io/badge/license-Apache%202.0-171717"></a>
  <img alt="Status: early" src="https://img.shields.io/badge/status-early-737373">
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
- **One-click databases:** PostgreSQL, MySQL, MariaDB, MongoDB and Redis, linked to your apps
  with one click. Backups to any S3-compatible storage are next.
- **Migrations built in:** a release command runs in the new version before it gets traffic.

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
| 4. Databases, release commands (migrations) and backups                     | In progress |
| 5. Monitoring: per-app CPU and memory history, alerts, uptime checks        | In progress |
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

## Databases and migrations

**Databases → New database** (or **New database** on a project) starts PostgreSQL, MySQL, MariaDB,
MongoDB or Redis in its own container, with its data in a Docker volume and a generated password
stored encrypted. It has no public port: only apps on the server can reach it.

Under **Used by**, link it to an app. The app gets the connection URL as `DATABASE_URL` (or
`REDIS_URL`, `MONGODB_URI`, or a name you pick) on its next deploy.

The project page shows every service in it, apps and databases, with status, CPU, memory and
which app uses which database.

**Migrations:** in an app's **Settings → Release command**, pick your framework or type a
command. It runs in the new image, with the app's variables and linked databases, before traffic
moves to it. If it fails, the deployment stops and the current version keeps running. Presets:

| Framework                | Command                                                     |
| ------------------------ | ----------------------------------------------------------- |
| Prisma                   | `npx prisma migrate deploy`                                 |
| Drizzle                  | `npx drizzle-kit migrate`                                   |
| Django                   | `python manage.py migrate --noinput`                        |
| Alembic (FastAPI, Flask) | `alembic upgrade head`                                      |
| Laravel                  | `php artisan migrate --force`                               |
| Rails                    | `bin/rails db:migrate`                                      |
| Spring Boot              | `java -Dspring.main.web-application-type=none -jar app.jar` |

Knex, Sequelize, TypeORM, EF Core bundles and golang-migrate are in the list too. The command runs
with `sh -c`, so the image needs a shell.

## Monitoring

Once a minute Nocap reads CPU and memory of the server and of every app and database, and asks
each running app for an answer on its port. The readings go to the Postgres that is already
there and are kept for 7 days, so monitoring adds no containers.

- **Monitoring** shows the server, every service with its uptime and answer time, and the
  incidents of the last 30 days. Each app has a **Metrics** tab with its own charts.
- **Incidents** open when an app misses two checks in a row, a deployment fails, or memory or
  disk is almost full. They close on their own when things are back to normal.
- **Alerts:** paste a Slack or Discord webhook (or any https address) under **Monitoring →
  Alerts** to get a message when an incident opens or closes.

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

## Credits

Brand marks for databases, languages and Git hosts come from
[Simple Icons](https://simpleicons.org) (CC0). The names and logos belong to their owners.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first, and report security
issues privately as described in [SECURITY.md](SECURITY.md).

## License

[Apache 2.0](LICENSE)
