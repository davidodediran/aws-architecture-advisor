import { describe, it, expect } from 'vitest';
import type { ArchitectureModel, Resource } from '@aws-arch-advisor/shared';

interface WaFinding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  pillar: string;
  title: string;
  description: string;
  recommendation: string;
}

interface WaReviewResult {
  findings: WaFinding[];
  summary: Record<string, { score: number; findingCount: number }>;
}

function reviewArchitecture(architecture: ArchitectureModel, _ragContext?: string): WaReviewResult {
  const findings: WaFinding[] = [];

  for (const resource of architecture.resources) {
    if (resource.type === 's3') {
      const encryption = resource.config?.encryption as string | undefined;
      if (!encryption || encryption === 'NONE') {
        findings.push({
          severity: 'high',
          pillar: 'Security',
          title: `Unencrypted S3 bucket: ${resource.name}`,
          description: `S3 bucket "${resource.name}" does not have server-side encryption configured.`,
          recommendation: 'Enable server-side encryption with AES256 or aws:kms.',
        });
      }
    }

    if (resource.type === 'rds-aurora-serverless') {
      const encryption = resource.config?.storageEncrypted as boolean | undefined;
      if (encryption === false) {
        findings.push({
          severity: 'critical',
          pillar: 'Security',
          title: `Unencrypted RDS: ${resource.name}`,
          description: `RDS instance "${resource.name}" does not have storage encryption enabled.`,
          recommendation: 'Enable storage encryption for all RDS instances. This is a critical security requirement.',
        });
      }
    }
  }

  const hasCloudWatch = architecture.resources.some((r) => r.type === 'cloudwatch');
  if (!hasCloudWatch && architecture.resources.length > 2) {
    findings.push({
      severity: 'medium',
      pillar: 'Operational Excellence',
      title: 'Missing CloudWatch monitoring',
      description: `Architecture has ${architecture.resources.length} resources but no CloudWatch monitoring configured.`,
      recommendation: 'Add CloudWatch alarms and dashboards for key metrics across all resources.',
    });
  }

  const pillars = ['Security', 'Reliability', 'Performance Efficiency', 'Cost Optimization', 'Operational Excellence', 'Sustainability'];
  const summary: Record<string, { score: number; findingCount: number }> = {};
  for (const pillar of pillars) {
    const pillarFindings = findings.filter((f) => f.pillar === pillar);
    const criticalCount = pillarFindings.filter((f) => f.severity === 'critical').length;
    const highCount = pillarFindings.filter((f) => f.severity === 'high').length;
    const score = Math.max(0, 100 - criticalCount * 30 - highCount * 15 - pillarFindings.length * 5);
    summary[pillar] = { score, findingCount: pillarFindings.length };
  }

  return { findings, summary };
}

function makeArchitecture(resources: Resource[]): ArchitectureModel {
  return {
    schemaVersion: '1.0',
    metadata: {
      projectId: 'test',
      userId: 'user1',
      name: 'Test',
      description: 'Test architecture',
      region: 'us-east-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      cleanupLambdaEnabled: false,
      namingPrefix: 'test',
    },
    network: { subnets: [], availabilityZones: [], publicAccess: [] },
    resources,
    connections: [],
    securityGroups: [],
    iamRoles: [],
    tags: {},
  };
}

describe('reviewArchitecture', () => {
  it('flags unencrypted S3 bucket with severity high', () => {
    const arch = makeArchitecture([
      { id: 's3-1', type: 's3', name: 'MyBucket', logicalId: 'MyBucket', config: { encryption: 'NONE' } },
    ]);

    const result = reviewArchitecture(arch);
    const s3Finding = result.findings.find((f) => f.title.includes('Unencrypted S3'));
    expect(s3Finding).toBeDefined();
    expect(s3Finding!.severity).toBe('high');
    expect(s3Finding!.pillar).toBe('Security');
  });

  it('flags unencrypted RDS with severity critical', () => {
    const arch = makeArchitecture([
      { id: 'rds-1', type: 'rds-aurora-serverless', name: 'MyDB', logicalId: 'MyDB', config: { storageEncrypted: false } },
    ]);

    const result = reviewArchitecture(arch);
    const rdsFinding = result.findings.find((f) => f.title.includes('Unencrypted RDS'));
    expect(rdsFinding).toBeDefined();
    expect(rdsFinding!.severity).toBe('critical');
  });

  it('flags missing CloudWatch for architectures with >2 resources', () => {
    const arch = makeArchitecture([
      { id: 'fn-1', type: 'lambda', name: 'Fn1', logicalId: 'Fn1', config: {} },
      { id: 'fn-2', type: 'lambda', name: 'Fn2', logicalId: 'Fn2', config: {} },
      { id: 'db-1', type: 'dynamodb', name: 'Table', logicalId: 'Table', config: {} },
    ]);

    const result = reviewArchitecture(arch);
    const cwFinding = result.findings.find((f) => f.title.includes('CloudWatch'));
    expect(cwFinding).toBeDefined();
    expect(cwFinding!.severity).toBe('medium');
    expect(cwFinding!.pillar).toBe('Operational Excellence');
  });

  it('generates summary per pillar', () => {
    const arch = makeArchitecture([
      { id: 's3-1', type: 's3', name: 'Bucket', logicalId: 'Bucket', config: { encryption: 'NONE' } },
    ]);

    const result = reviewArchitecture(arch);
    expect(result.summary).toHaveProperty('Security');
    expect(result.summary).toHaveProperty('Reliability');
    expect(result.summary).toHaveProperty('Operational Excellence');
    expect(result.summary['Security'].findingCount).toBeGreaterThan(0);
    expect(result.summary['Security'].score).toBeLessThan(100);
  });

  it('returns no critical findings for well-configured architecture', () => {
    const arch = makeArchitecture([
      { id: 's3-1', type: 's3', name: 'Bucket', logicalId: 'Bucket', config: { encryption: 'AES256' } },
      { id: 'fn-1', type: 'lambda', name: 'Fn', logicalId: 'Fn', config: {} },
      { id: 'cw-1', type: 'cloudwatch', name: 'Monitor', logicalId: 'Monitor', config: {} },
    ]);

    const result = reviewArchitecture(arch);
    const criticalFindings = result.findings.filter((f) => f.severity === 'critical');
    expect(criticalFindings).toHaveLength(0);
  });
});
