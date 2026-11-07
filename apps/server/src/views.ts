// Database rows to API shapes for applications and deployments.
import { desc, eq, getTableColumns, inArray } from "drizzle-orm";
import {
  applications,
  deployments,
  domains,
  gitProviders,
  projects,
  type Database,
} from "@nocap/db";
import type { Application, Deployment } from "@nocap/shared";
import { HttpError } from "./http";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const iso = (date: Date | null) => (date ? date.toISOString() : null);

/** Deployments with their app and project, newest first. */
export function selectDeployments(db: Database) {
  return db
    .select({
      ...getTableColumns(deployments),
      applicationName: applications.name,
      projectId: applications.projectId,
    })
    .from(deployments)
    .innerJoin(applications, eq(applications.id, deployments.applicationId))
    .orderBy(desc(deployments.createdAt));
}

type DeploymentRow = Awaited<ReturnType<typeof selectDeployments>>[number];

export function toDeployment(row: DeploymentRow): Deployment {
  return {
    id: row.id,
    applicationId: row.applicationId,
    applicationName: row.applicationName,
    projectId: row.projectId,
    status: row.status,
    trigger: row.trigger,
    commitSha: row.commitSha,
    commitMessage: row.commitMessage,
    imageTag: row.imageTag,
    error: row.error,
    startedAt: iso(row.startedAt),
    finishedAt: iso(row.finishedAt),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function findDeployment(db: Database, id: string): Promise<Deployment> {
  if (!UUID.test(id)) throw new HttpError(404, "Deployment not found");
  const [row] = await selectDeployments(db).where(eq(deployments.id, id));
  if (!row) throw new HttpError(404, "Deployment not found");
  return toDeployment(row);
}

/** Applications with project name, domains and latest deployment. */
export async function loadApplications(
  db: Database,
  where: { projectId?: string; id?: string },
): Promise<Application[]> {
  const base = db
    .select({
      ...getTableColumns(applications),
      projectName: projects.name,
      providerName: gitProviders.name,
      providerType: gitProviders.type,
    })
    .from(applications)
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .leftJoin(gitProviders, eq(gitProviders.id, applications.gitProviderId))
    .orderBy(desc(applications.createdAt));
  const rows = where.id
    ? await base.where(eq(applications.id, where.id))
    : where.projectId
      ? await base.where(eq(applications.projectId, where.projectId))
      : await base;
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const hostRows = await db
    .select({ applicationId: domains.applicationId, hostname: domains.hostname })
    .from(domains)
    .where(inArray(domains.applicationId, ids))
    .orderBy(domains.createdAt);
  const latest = await db
    .selectDistinctOn([deployments.applicationId], {
      ...getTableColumns(deployments),
      applicationName: applications.name,
      projectId: applications.projectId,
    })
    .from(deployments)
    .innerJoin(applications, eq(applications.id, deployments.applicationId))
    .where(inArray(deployments.applicationId, ids))
    .orderBy(deployments.applicationId, desc(deployments.createdAt));

  return rows.map((row) => {
    const last = latest.find((d) => d.applicationId === row.id);
    return {
      id: row.id,
      projectId: row.projectId,
      projectName: row.projectName,
      name: row.name,
      source: row.buildType === "image" ? "image" : "git",
      repoUrl: row.repoUrl,
      gitProvider:
        row.gitProviderId && row.providerName && row.providerType
          ? { id: row.gitProviderId, name: row.providerName, type: row.providerType }
          : null,
      autoDeploy: row.autoDeploy,
      deployToken: row.deployToken,
      branch: row.branch,
      dockerfilePath: row.dockerfilePath,
      image: row.image,
      port: row.port ?? 3000,
      status: row.status,
      domains: hostRows.filter((h) => h.applicationId === row.id).map((h) => h.hostname),
      lastDeployment: last ? toDeployment(last) : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}

export async function findApplication(db: Database, id: string): Promise<Application> {
  if (!UUID.test(id)) throw new HttpError(404, "Application not found");
  const [app] = await loadApplications(db, { id });
  if (!app) throw new HttpError(404, "Application not found");
  return app;
}
