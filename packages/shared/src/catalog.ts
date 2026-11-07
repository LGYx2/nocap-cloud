// Plain data with no zod, so the panel can import it without pulling in the schemas.

// ---------------------------------------------------------------- databases

export type DatabaseEngine = "postgres" | "mysql" | "mariadb" | "mongodb" | "redis";
export type DatabaseStatus = "starting" | "running" | "stopped" | "failed";

export interface EngineInfo {
  label: string;
  /** Docker Hub image. */
  image: string;
  /** Supported tags, the default first. */
  versions: string[];
  port: number;
  /** Variable name suggested when linking to an app. */
  variable: string;
}

export const DATABASE_ENGINES: Record<DatabaseEngine, EngineInfo> = {
  postgres: {
    label: "PostgreSQL",
    image: "postgres",
    versions: ["17-alpine", "16-alpine", "15-alpine"],
    port: 5432,
    variable: "DATABASE_URL",
  },
  mysql: {
    label: "MySQL",
    image: "mysql",
    versions: ["8.4", "8.0"],
    port: 3306,
    variable: "DATABASE_URL",
  },
  mariadb: {
    label: "MariaDB",
    image: "mariadb",
    versions: ["11.4", "10.11"],
    port: 3306,
    variable: "DATABASE_URL",
  },
  mongodb: {
    label: "MongoDB",
    image: "mongo",
    versions: ["8.0", "7.0"],
    port: 27017,
    variable: "MONGODB_URI",
  },
  redis: {
    label: "Redis",
    image: "redis",
    versions: ["7-alpine", "8-alpine"],
    port: 6379,
    variable: "REDIS_URL",
  },
};

export const DATABASE_ENGINE_IDS = Object.keys(DATABASE_ENGINES) as DatabaseEngine[];

// ---------------------------------------------------------------- release commands

export interface ReleasePreset {
  id: string;
  label: string;
  command: string;
}

/** Common migration commands. They run inside the new image, so the tool must be in it. */
export const RELEASE_PRESETS: ReleasePreset[] = [
  { id: "prisma", label: "Prisma", command: "npx prisma migrate deploy" },
  { id: "drizzle", label: "Drizzle", command: "npx drizzle-kit migrate" },
  { id: "knex", label: "Knex", command: "npx knex migrate:latest" },
  { id: "sequelize", label: "Sequelize", command: "npx sequelize-cli db:migrate" },
  { id: "typeorm", label: "TypeORM", command: "npx typeorm migration:run -d dist/data-source.js" },
  { id: "django", label: "Django", command: "python manage.py migrate --noinput" },
  { id: "alembic", label: "Alembic (FastAPI, Flask)", command: "alembic upgrade head" },
  { id: "laravel", label: "Laravel", command: "php artisan migrate --force" },
  { id: "rails", label: "Rails", command: "bin/rails db:migrate" },
  {
    id: "spring",
    label: "Spring Boot (Flyway or Liquibase)",
    command: "java -Dspring.main.web-application-type=none -jar app.jar",
  },
  { id: "ef", label: ".NET EF Core bundle", command: "./efbundle" },
  {
    id: "golang-migrate",
    label: "golang-migrate",
    command: 'migrate -path ./migrations -database "$DATABASE_URL" up',
  },
];
