import type { ArchitectureModel, Resource, SecurityGroup } from '@aws-arch-advisor/shared';
import type { RetrievedContext } from './knowledge-base';

type Pillar =
  | 'security'
  | 'reliability'
  | 'performance'
  | 'cost-optimization'
  | 'operational-excellence'
  | 'sustainability';

type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface WaFinding {
  pillar: Pillar;
  finding: string;
  severity: Severity;
  recommendation: string;
  waReference?: string;
  resourceId?: string;
}

export interface PillarSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface WaReviewResult {
  findings: WaFinding[];
  summary: Record<Pillar, PillarSummary>;
}

function emptySummary(): PillarSummary {
  return { critical: 0, high: 0, medium: 0, low: 0 };
}

function checkSecurity(resources: Resource[], securityGroups: SecurityGroup[]): WaFinding[] {
  const findings: WaFinding[] = [];

  for (const resource of resources) {
    if (resource.type === 's3') {
      if (!resource.config.encryption && !resource.config.sseAlgorithm) {
        findings.push({
          pillar: 'security',
          severity: 'high',
          finding: `S3 bucket "${resource.name}" does not have encryption enabled`,
          recommendation: 'Enable SSE-S3 or SSE-KMS encryption on the bucket',
          waReference: 'SEC-08',
          resourceId: resource.id,
        });
      }
      if (resource.config.publicAccess === true || resource.config.blockPublicAccess === false) {
        findings.push({
          pillar: 'security',
          severity: 'critical',
          finding: `S3 bucket "${resource.name}" allows public access`,
          recommendation: 'Enable S3 Block Public Access settings unless public access is explicitly required',
          waReference: 'SEC-07',
          resourceId: resource.id,
        });
      }
    }

    if (resource.type === 'rds-aurora-serverless') {
      if (resource.config.storageEncrypted === false || resource.config.encryption === false) {
        findings.push({
          pillar: 'security',
          severity: 'critical',
          finding: `RDS cluster "${resource.name}" does not have encryption at rest enabled`,
          recommendation: 'Enable encryption at rest using AWS KMS. This must be set at cluster creation time.',
          waReference: 'SEC-08',
          resourceId: resource.id,
        });
      }
    }

    if (resource.type === 'api-gateway' || resource.type === 'api-gateway-websocket') {
      const hasWaf = resources.some(
        (r) => r.type === 'waf' && ((r.config.associatedResources as string[]) ?? []).includes(resource.id),
      );
      if (!hasWaf) {
        findings.push({
          pillar: 'security',
          severity: 'medium',
          finding: `API Gateway "${resource.name}" is not protected by AWS WAF`,
          recommendation: 'Attach a WAF Web ACL with rate limiting and common attack protection rules',
          waReference: 'SEC-06',
          resourceId: resource.id,
        });
      }
    }
  }

  for (const sg of securityGroups) {
    for (const rule of sg.ingressRules) {
      if (rule.source === '0.0.0.0/0' && rule.fromPort !== 443 && rule.toPort !== 443) {
        findings.push({
          pillar: 'security',
          severity: 'high',
          finding: `Security group "${sg.name}" allows unrestricted inbound access on port ${rule.fromPort}`,
          recommendation: 'Restrict inbound rules to specific IP ranges or security groups',
          waReference: 'SEC-05',
        });
      }
    }
  }

  return findings;
}

function checkReliability(resources: Resource[], architecture: ArchitectureModel): WaFinding[] {
  const findings: WaFinding[] = [];

  for (const resource of resources) {
    if (resource.type === 'rds-aurora-serverless') {
      if (resource.config.multiAz === false || resource.config.availabilityZones === 1) {
        findings.push({
          pillar: 'reliability',
          severity: 'high',
          finding: `RDS cluster "${resource.name}" is configured for a single Availability Zone`,
          recommendation: 'Enable Multi-AZ deployment for automatic failover and higher availability',
          waReference: 'REL-10',
          resourceId: resource.id,
        });
      }
    }

    if (resource.type === 'sqs') {
      if (!resource.config.deadLetterQueue && !resource.config.dlqArn) {
        findings.push({
          pillar: 'reliability',
          severity: 'medium',
          finding: `SQS queue "${resource.name}" does not have a dead-letter queue configured`,
          recommendation: 'Configure a DLQ to capture messages that fail processing after max retries',
          waReference: 'REL-06',
          resourceId: resource.id,
        });
      }
    }
  }

  const azCount = architecture.network.availabilityZones.length;
  if (azCount < 2 && architecture.network.subnets.length > 0) {
    findings.push({
      pillar: 'reliability',
      severity: 'medium',
      finding: `Architecture uses only ${azCount} Availability Zone(s) — fewer than 2`,
      recommendation: 'Deploy across at least 2 AZs for fault tolerance against zone failures',
      waReference: 'REL-10',
    });
  }

  return findings;
}

function checkPerformance(resources: Resource[]): WaFinding[] {
  const findings: WaFinding[] = [];

  const hasS3WebHosting = resources.some(
    (r) => r.type === 's3' && (r.config.websiteHosting === true || r.config.staticWebsite === true),
  );
  const hasCloudFront = resources.some((r) => r.type === 'cloudfront');

  if (hasS3WebHosting && !hasCloudFront) {
    findings.push({
      pillar: 'performance',
      severity: 'medium',
      finding: 'S3 static website hosting is used without CloudFront distribution',
      recommendation: 'Add CloudFront to cache content at edge locations and reduce latency for global users',
      waReference: 'PERF-04',
    });
  }

  const hasDatabase = resources.some(
    (r) => r.type === 'rds-aurora-serverless' || r.type === 'dynamodb',
  );
  const hasCache = resources.some((r) => r.type === 'elasticache');

  if (hasDatabase && !hasCache) {
    findings.push({
      pillar: 'performance',
      severity: 'low',
      finding: 'Architecture uses databases without a caching layer',
      recommendation: 'Consider adding ElastiCache (Redis/Memcached) to reduce database load for read-heavy workloads',
      waReference: 'PERF-03',
    });
  }

  return findings;
}

function checkCostOptimization(resources: Resource[]): WaFinding[] {
  const findings: WaFinding[] = [];

  for (const resource of resources) {
    if (resource.type === 'ecs-fargate') {
      const cpu = (resource.config.cpu as number) ?? 256;
      if (cpu >= 1024) {
        findings.push({
          pillar: 'cost-optimization',
          severity: 'medium',
          finding: `ECS Fargate service "${resource.name}" uses ${cpu} CPU units — consider if Lambda would suffice`,
          recommendation:
            'For bursty or low-traffic workloads, Lambda can be more cost-effective than always-on Fargate tasks',
          waReference: 'COST-07',
          resourceId: resource.id,
        });
      }
    }

    if (resource.type === 'rds-aurora-serverless') {
      const maxAcu = (resource.config.maxCapacity as number) ?? 2;
      const minAcu = (resource.config.minCapacity as number) ?? 0.5;
      if (maxAcu > 8 && minAcu >= 4) {
        findings.push({
          pillar: 'cost-optimization',
          severity: 'low',
          finding: `RDS cluster "${resource.name}" has high min capacity (${minAcu} ACU) — may be over-provisioned`,
          recommendation: 'Review if a lower minimum capacity would work for off-peak hours',
          waReference: 'COST-06',
          resourceId: resource.id,
        });
      }
    }
  }

  return findings;
}

function checkOperationalExcellence(resources: Resource[]): WaFinding[] {
  const findings: WaFinding[] = [];

  if (resources.length > 2) {
    const hasMonitoring = resources.some(
      (r) => r.type === 'cloudwatch' || r.type === 'cloudtrail',
    );
    if (!hasMonitoring) {
      findings.push({
        pillar: 'operational-excellence',
        severity: 'medium',
        finding: 'Architecture has multiple resources but no explicit CloudWatch monitoring',
        recommendation:
          'Add CloudWatch dashboards, alarms, and log groups for observability across all services',
        waReference: 'OPS-08',
      });
    }
  }

  return findings;
}

function checkSustainability(resources: Resource[]): WaFinding[] {
  const findings: WaFinding[] = [];

  for (const resource of resources) {
    if (resource.type === 'lambda') {
      const architecture = (resource.config.architecture as string) ?? 'x86_64';
      if (architecture !== 'arm64') {
        findings.push({
          pillar: 'sustainability',
          severity: 'low',
          finding: `Lambda function "${resource.name}" uses ${architecture} instead of ARM64 (Graviton)`,
          recommendation:
            'Switch to arm64 architecture for better price-performance and lower energy consumption',
          waReference: 'SUS-02',
          resourceId: resource.id,
        });
      }
    }
  }

  return findings;
}

function enrichWithRag(findings: WaFinding[], ragContexts?: RetrievedContext[]): WaFinding[] {
  if (!ragContexts || ragContexts.length === 0) return findings;

  return findings.map((finding) => {
    const relevantContext = ragContexts.find(
      (ctx) =>
        ctx.content.toLowerCase().includes(finding.pillar) ||
        ctx.content.toLowerCase().includes(finding.severity),
    );

    if (relevantContext) {
      return {
        ...finding,
        recommendation: `${finding.recommendation}. Reference: ${relevantContext.sourceUri}`,
      };
    }
    return finding;
  });
}

export function reviewArchitecture(
  architecture: ArchitectureModel,
  ragContexts?: RetrievedContext[],
): WaReviewResult {
  const allFindings: WaFinding[] = [
    ...checkSecurity(architecture.resources, architecture.securityGroups),
    ...checkReliability(architecture.resources, architecture),
    ...checkPerformance(architecture.resources),
    ...checkCostOptimization(architecture.resources),
    ...checkOperationalExcellence(architecture.resources),
    ...checkSustainability(architecture.resources),
  ];

  const enrichedFindings = enrichWithRag(allFindings, ragContexts);

  const pillars: Pillar[] = [
    'security',
    'reliability',
    'performance',
    'cost-optimization',
    'operational-excellence',
    'sustainability',
  ];

  const summary = {} as Record<Pillar, PillarSummary>;
  for (const pillar of pillars) {
    const pillarFindings = enrichedFindings.filter((f) => f.pillar === pillar);
    summary[pillar] = {
      critical: pillarFindings.filter((f) => f.severity === 'critical').length,
      high: pillarFindings.filter((f) => f.severity === 'high').length,
      medium: pillarFindings.filter((f) => f.severity === 'medium').length,
      low: pillarFindings.filter((f) => f.severity === 'low').length,
    };
  }

  return { findings: enrichedFindings, summary };
}
