/**
 * API request/response types — match the OpenAPI spec in docs/api-spec.yml
 */

// ---- Projects ----

export interface CreateProjectRequest {
  name: string;
  description: string;
  templateId?: string;
  region: string;
}

export interface CreateProjectResponse {
  projectId: string;
  name: string;
  status: string;
  createdAt: string;
}

export interface ListProjectsResponse {
  projects: ProjectSummary[];
  nextToken?: string;
}

export interface ProjectSummary {
  projectId: string;
  name: string;
  description: string;
  status: string;
  currentArchitectureVersion: number;
  createdAt: string;
  updatedAt: string;
}

// ---- Conversations ----

export interface SendMessageRequest {
  projectId: string;
  message: string;
  attachments?: AttachmentRef[];
}

export interface SendMessageResponse {
  conversationId: string;
  response: string;
  architectureUpdated: boolean;
  guardrailBlocked: boolean;
  tokensUsed: number;
}

export interface AttachmentRef {
  key: string;
  type: 'image' | 'yaml' | 'json' | 'pdf';
  filename: string;
}

// ---- Architecture ----

export interface GetArchitectureResponse {
  projectId: string;
  version: number;
  model: import('./architecture-model').ArchitectureModel;
  validationStatus: string;
  costEstimateUsd?: number;
}

export interface GenerateCfnResponse {
  projectId: string;
  version: number;
  templateYaml: string;
  templateS3Key: string;
  validationResults: CfnValidationResult;
  namingPrefix: string;
}

export interface CfnValidationResult {
  cfnLint: ValidationLayerResult;
  cfnNag: ValidationLayerResult;
  awsValidate: ValidationLayerResult;
  overallStatus: 'passed' | 'warnings' | 'failed';
}

export interface ValidationLayerResult {
  status: 'passed' | 'warnings' | 'failed';
  findings: ValidationFinding[];
}

export interface ValidationFinding {
  severity: 'error' | 'warning' | 'info';
  rule: string;
  message: string;
  resource?: string;
  line?: number;
}

// ---- Deployments ----

export interface RequestDeploymentRequest {
  projectId: string;
  architectureVersion: number;
  roleArn: string;
  externalId: string;
  budget: BudgetConfig;
  cleanupLambdaEnabled: boolean;
}

export interface BudgetConfig {
  monthlyLimitUsd: number;
  alertThresholdPercent: number;
  alertEmail: string;
}

export interface RequestDeploymentResponse {
  deploymentId: string;
  estimatedCostUsd: number;
  budgetComparison: BudgetComparison;
  status: string;
}

export interface BudgetComparison {
  estimatedMonthlyUsd: number;
  budgetLimitUsd: number;
  withinBudget: boolean;
  overageUsd?: number;
  suggestions?: CostSuggestion[];
}

export interface CostSuggestion {
  resourceName: string;
  currentCostUsd: number;
  suggestedAlternative: string;
  savingsUsd: number;
  tradeoff: string;
}

export interface DeploymentStatusResponse {
  deploymentId: string;
  status: string;
  stackEvents: StackEvent[];
  outputs?: Record<string, string>;
  errorMessage?: string;
}

export interface StackEvent {
  timestamp: string;
  resourceType: string;
  logicalId: string;
  status: string;
  reason?: string;
}

// ---- File Upload ----

export interface GetUploadUrlRequest {
  filename: string;
  contentType: string;
  projectId: string;
}

export interface GetUploadUrlResponse {
  uploadUrl: string;
  key: string;
  expiresIn: number;
}

// ---- Templates ----

export interface ListTemplatesResponse {
  templates: TemplateSummary[];
}

export interface TemplateSummary {
  templateId: string;
  name: string;
  description: string;
  category: string;
  services: string[];
  estimatedCostUsd: number;
  thumbnail?: string;
}

// ---- Trainer ----

export interface UnlockStudentRequest {
  studentUserId: string;
  additionalProjects: number;
}

// ---- WA Review ----

export interface WaReviewResponse {
  projectId: string;
  version: number;
  pillars: PillarAssessment[];
  overallScore: number;
  ruleEngineFindings: WaFinding[];
  ragFindings: WaFinding[];
}

export interface PillarAssessment {
  pillar: string;
  score: number;
  findings: WaFinding[];
}

export interface WaFinding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  pillar: string;
  title: string;
  description: string;
  recommendation: string;
  waFrameworkRef: string;
  source: 'rule-engine' | 'rag';
  autoFixAvailable: boolean;
}

// ---- Portfolio Export ----

export interface ExportPortfolioResponse {
  downloadUrl: string;
  expiresIn: number;
  contents: string[];
}

// ---- Error ----

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
