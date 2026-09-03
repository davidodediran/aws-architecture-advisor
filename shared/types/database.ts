/**
 * DynamoDB table schemas.
 * Every record tagged with cohort_id + trainer_id for future classroom mode.
 */

export interface BaseRecord {
  createdAt: string;
  updatedAt: string;
  cohortId: string;
  trainerId: string;
}

// ---- Projects Table ----
// PK: USER#{userId}  SK: PROJECT#{projectId}
// GSI1: PROJECT#{projectId} (for direct lookup)

export interface ProjectRecord extends BaseRecord {
  pk: string;
  sk: string;
  userId: string;
  projectId: string;
  name: string;
  description: string;
  status: ProjectStatus;
  templateId?: string;
  currentArchitectureVersion: number;
  deploymentCount: number;
  lastDeployedAt?: string;
}

export type ProjectStatus =
  | 'designing'
  | 'reviewed'
  | 'deploying'
  | 'deployed'
  | 'failed'
  | 'deleted';

// ---- Conversations Table ----
// PK: PROJECT#{projectId}  SK: CONV#{conversationId}

export interface ConversationRecord extends BaseRecord {
  pk: string;
  sk: string;
  projectId: string;
  conversationId: string;
  messages: ConversationMessage[];
  summary?: string;
  tokenCount: number;
  bedrockCostUsd: number;
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  modelId?: string;
  tokenCount?: number;
  guardrailBlocked?: boolean;
}

// ---- Architecture Versions Table ----
// PK: PROJECT#{projectId}  SK: VERSION#{version}

export interface ArchitectureVersionRecord extends BaseRecord {
  pk: string;
  sk: string;
  projectId: string;
  version: number;
  model: string; // JSON stringified ArchitectureModel
  changeDescription: string;
  validationStatus: 'valid' | 'invalid' | 'pending';
  cfnTemplateS3Key?: string;
  diagramS3Key?: string;
  costEstimateUsd?: number;
}

// ---- Deployments Table ----
// PK: PROJECT#{projectId}  SK: DEPLOY#{deploymentId}

export interface DeploymentRecord extends BaseRecord {
  pk: string;
  sk: string;
  projectId: string;
  deploymentId: string;
  userId: string;
  stackName: string;
  stackId?: string;
  architectureVersion: number;
  cfnTemplateHash: string;
  status: DeploymentStatus;
  roleArn: string;
  externalId: string;
  region: string;
  startedAt: string;
  completedAt?: string;
  errorMessage?: string;
  stackOutputs?: Record<string, string>;
  estimatedCostUsd: number;
  budgetAlertConfigured: boolean;
}

export type DeploymentStatus =
  | 'pending-approval'
  | 'creating'
  | 'create-complete'
  | 'create-failed'
  | 'rolling-back'
  | 'rollback-complete'
  | 'deleting'
  | 'delete-complete'
  | 'delete-failed';

// ---- Audit Log Table ----
// PK: USER#{userId}  SK: AUDIT#{timestamp}#{actionId}
// GSI1: ACTION#{actionType} for querying by action type

export interface AuditLogRecord {
  pk: string;
  sk: string;
  userId: string;
  actionId: string;
  actionType: AuditActionType;
  timestamp: string;
  projectId?: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export type AuditActionType =
  | 'login'
  | 'project-create'
  | 'project-delete'
  | 'architecture-generate'
  | 'architecture-update'
  | 'cfn-generate'
  | 'cfn-validate'
  | 'deploy-request'
  | 'deploy-complete'
  | 'deploy-failed'
  | 'stack-delete'
  | 'guardrail-block'
  | 'file-upload'
  | 'export-portfolio'
  | 'trainer-unlock';

// ---- User Usage / Quota Table ----
// PK: USER#{userId}  SK: QUOTA

export interface UserQuotaRecord extends BaseRecord {
  pk: string;
  sk: string;
  userId: string;
  projectsCreated: number;
  projectLimit: number;
  tier: 'free' | 'unlocked' | 'premium';
  unlockedBy?: string;
  unlockedAt?: string;
  dailyBedrockSpendUsd: number;
  dailyBedrockLimitUsd: number;
  circuitBreakerTripped: boolean;
}

// ---- Price Cache Table ----
// PK: SERVICE#{serviceCode}  SK: PRICE#{regionCode}#{usageType}
// TTL: expiresAt (daily refresh)

export interface PriceCacheRecord {
  pk: string;
  sk: string;
  serviceCode: string;
  regionCode: string;
  usageType: string;
  pricePerUnit: number;
  unit: string;
  currency: 'USD';
  effectiveDate: string;
  expiresAt: number; // TTL epoch
}
