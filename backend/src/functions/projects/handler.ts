import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { extractAuth } from '../../middleware/auth';
import { ok, created, badRequest, forbidden, notFound, unauthorized, serverError } from '../../middleware/api-response';
import { putItem, getItem, queryItems, updateItem, deleteItem } from '../../services/dynamo-client';
import { ulid } from 'ulid';

const PROJECTS_TABLE = process.env.PROJECTS_TABLE!;
const USER_QUOTA_TABLE = process.env.USER_QUOTA_TABLE!;

const FREE_TIER_PROJECT_LIMIT = 3;

interface QuotaRecord {
  pk: string;
  sk: string;
  maxProjects: number;
  usedProjects: number;
}

interface ProjectRecord {
  pk: string;
  sk: string;
  projectId: string;
  userId: string;
  name: string;
  description: string;
  status: string;
  region: string;
  templateId?: string;
  cohort_id?: string;
  trainer_id?: string;
  createdAt: string;
  updatedAt: string;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const auth = extractAuth(event);
    if (!auth) return unauthorized();
    const method = event.httpMethod;
    const projectId = event.pathParameters?.projectId;

    if (method === 'POST' && !projectId) return createProject(auth.userId, event.body);
    if (method === 'GET' && !projectId) return listProjects(auth.userId);
    if (method === 'GET' && projectId) return getProject(auth.userId, projectId);
    if (method === 'PUT' && projectId) return updateProject(auth.userId, projectId, event.body);
    if (method === 'DELETE' && projectId) return deleteProject(auth.userId, projectId);

    return badRequest('Unsupported method');
  } catch (err) {
    console.error('Projects handler error:', err);
    return serverError();
  }
}

async function createProject(userId: string, body: string | null): Promise<APIGatewayProxyResult> {
  if (!body) return badRequest('Request body is required');

  const parsed = JSON.parse(body);
  const { name, description, region, templateId, cohort_id, trainer_id } = parsed;
  if (!name || !description) return badRequest('name and description are required');

  const quota = await getItem<QuotaRecord>(USER_QUOTA_TABLE, {
    pk: `USER#${userId}`,
    sk: 'quota',
  });

  const maxProjects = quota?.maxProjects ?? FREE_TIER_PROJECT_LIMIT;
  const usedProjects = quota?.usedProjects ?? 0;

  if (usedProjects >= maxProjects) {
    return forbidden(`Project limit reached (${maxProjects}). Ask your trainer to unlock more.`);
  }

  const projectId = ulid();
  const now = new Date().toISOString();

  const project: ProjectRecord = {
    pk: `USER#${userId}`,
    sk: `PROJECT#${projectId}`,
    projectId,
    userId,
    name,
    description,
    status: 'designing',
    region: region ?? 'us-east-1',
    templateId,
    cohort_id,
    trainer_id,
    createdAt: now,
    updatedAt: now,
  };

  await putItem(PROJECTS_TABLE, project);

  await updateItem(
    USER_QUOTA_TABLE,
    { pk: `USER#${userId}`, sk: 'quota' },
    'SET usedProjects = if_not_exists(usedProjects, :zero) + :one, maxProjects = if_not_exists(maxProjects, :defaultMax)',
    { ':zero': 0, ':one': 1, ':defaultMax': FREE_TIER_PROJECT_LIMIT },
  );

  return created({ projectId, name, status: 'designing', cohort_id, trainer_id, createdAt: now });
}

async function listProjects(userId: string): Promise<APIGatewayProxyResult> {
  const projects = await queryItems<ProjectRecord>(
    PROJECTS_TABLE,
    'pk = :pk',
    { ':pk': `USER#${userId}` },
  );

  return ok({
    projects: projects
      .filter((p) => p.status !== 'deleted')
      .map((p) => ({
        projectId: p.projectId,
        name: p.name,
        description: p.description,
        status: p.status,
        cohort_id: p.cohort_id,
        trainer_id: p.trainer_id,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
  });
}

async function getProject(userId: string, projectId: string): Promise<APIGatewayProxyResult> {
  const project = await getItem<ProjectRecord>(PROJECTS_TABLE, {
    pk: `USER#${userId}`,
    sk: `PROJECT#${projectId}`,
  });

  if (!project) return notFound(`Project ${projectId} not found`);

  return ok(project);
}

async function updateProject(userId: string, projectId: string, body: string | null): Promise<APIGatewayProxyResult> {
  if (!body) return badRequest('Request body is required');

  const project = await getItem<ProjectRecord>(PROJECTS_TABLE, {
    pk: `USER#${userId}`,
    sk: `PROJECT#${projectId}`,
  });

  if (!project) return notFound(`Project ${projectId} not found`);

  const parsed = JSON.parse(body);
  const { name, description, region, status, cohort_id, trainer_id } = parsed;

  const expressions: string[] = ['updatedAt = :now'];
  const values: Record<string, unknown> = { ':now': new Date().toISOString() };

  if (name !== undefined) { expressions.push('name = :name'); values[':name'] = name; }
  if (description !== undefined) { expressions.push('description = :desc'); values[':desc'] = description; }
  if (region !== undefined) { expressions.push('region = :region'); values[':region'] = region; }
  if (status !== undefined) { expressions.push('#s = :status'); values[':status'] = status; }
  if (cohort_id !== undefined) { expressions.push('cohort_id = :cohort'); values[':cohort'] = cohort_id; }
  if (trainer_id !== undefined) { expressions.push('trainer_id = :trainer'); values[':trainer'] = trainer_id; }

  await updateItem(
    PROJECTS_TABLE,
    { pk: `USER#${userId}`, sk: `PROJECT#${projectId}` },
    `SET ${expressions.join(', ')}`,
    values,
  );

  return ok({ projectId, message: 'Project updated' });
}

async function deleteProject(userId: string, projectId: string): Promise<APIGatewayProxyResult> {
  const project = await getItem<ProjectRecord>(PROJECTS_TABLE, {
    pk: `USER#${userId}`,
    sk: `PROJECT#${projectId}`,
  });

  if (!project) return notFound(`Project ${projectId} not found`);

  await deleteItem(PROJECTS_TABLE, {
    pk: `USER#${userId}`,
    sk: `PROJECT#${projectId}`,
  });

  await updateItem(
    USER_QUOTA_TABLE,
    { pk: `USER#${userId}`, sk: 'quota' },
    'SET usedProjects = usedProjects - :one',
    { ':one': 1 },
  );

  return ok({ message: `Project ${projectId} deleted` });
}
