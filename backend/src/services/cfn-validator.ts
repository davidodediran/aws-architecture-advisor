import type { ArchitectureModel } from '@aws-arch-advisor/shared';
import type { CfnTemplate } from './cfn-generator';

type ValidationLayer = 'structural' | 'best-practices' | 'cross-reference' | 'aws-api';
type Severity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  layer: ValidationLayer;
  code: string;
  message: string;
  resourceId?: string;
  severity: Severity;
}

export interface CfnValidationResult {
  isValid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  info: ValidationIssue[];
}

function validateStructural(template: CfnTemplate): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (template.AWSTemplateFormatVersion !== '2010-09-09') {
    issues.push({
      layer: 'structural',
      code: 'S001',
      message: `AWSTemplateFormatVersion must be "2010-09-09", got "${template.AWSTemplateFormatVersion}"`,
      severity: 'error',
    });
  }

  if (!template.Resources || typeof template.Resources !== 'object') {
    issues.push({
      layer: 'structural',
      code: 'S002',
      message: 'Template must have a Resources section',
      severity: 'error',
    });
    return issues;
  }

  const resourceKeys = Object.keys(template.Resources);
  if (resourceKeys.length === 0) {
    issues.push({
      layer: 'structural',
      code: 'S003',
      message: 'Resources section must contain at least one resource',
      severity: 'error',
    });
  }

  if (resourceKeys.length > 500) {
    issues.push({
      layer: 'structural',
      code: 'S004',
      message: `Template has ${resourceKeys.length} resources, exceeding the AWS limit of 500`,
      severity: 'error',
    });
  }

  for (const [logicalId, resource] of Object.entries(template.Resources)) {
    if (!resource.Type) {
      issues.push({
        layer: 'structural',
        code: 'S005',
        message: `Resource "${logicalId}" is missing a Type property`,
        resourceId: logicalId,
        severity: 'error',
      });
    }

    if (!resource.Type?.startsWith('AWS::') && !resource.Type?.startsWith('Custom::')) {
      issues.push({
        layer: 'structural',
        code: 'S006',
        message: `Resource "${logicalId}" has unrecognized type "${resource.Type}"`,
        resourceId: logicalId,
        severity: 'warning',
      });
    }
  }

  return issues;
}

function validateBestPractices(template: CfnTemplate, architecture: ArchitectureModel): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const [logicalId, resource] of Object.entries(template.Resources)) {
    if (resource.Type === 'AWS::S3::Bucket') {
      const props = resource.Properties;
      if (!props.BucketEncryption) {
        issues.push({
          layer: 'best-practices',
          code: 'BP001',
          message: `S3 bucket "${logicalId}" does not have encryption configured`,
          resourceId: logicalId,
          severity: 'warning',
        });
      }

      const publicBlock = props.PublicAccessBlockConfiguration;
      if (!publicBlock) {
        issues.push({
          layer: 'best-practices',
          code: 'BP002',
          message: `S3 bucket "${logicalId}" does not have public access block configured`,
          resourceId: logicalId,
          severity: 'warning',
        });
      }
    }

    if (resource.Type === 'AWS::RDS::DBCluster') {
      const props = resource.Properties;
      if (props.StorageEncrypted !== true) {
        issues.push({
          layer: 'best-practices',
          code: 'BP003',
          message: `RDS cluster "${logicalId}" does not have storage encryption enabled`,
          resourceId: logicalId,
          severity: 'warning',
        });
      }

      if (!props.BackupRetentionPeriod || props.BackupRetentionPeriod < 1) {
        issues.push({
          layer: 'best-practices',
          code: 'BP004',
          message: `RDS cluster "${logicalId}" has no backup retention configured`,
          resourceId: logicalId,
          severity: 'warning',
        });
      }
    }

    if (resource.Type === 'AWS::DynamoDB::Table') {
      const pitr = resource.Properties.PointInTimeRecoverySpecification;
      if (!pitr || pitr.PointInTimeRecoveryEnabled !== true) {
        issues.push({
          layer: 'best-practices',
          code: 'BP005',
          message: `DynamoDB table "${logicalId}" does not have Point-in-Time Recovery enabled`,
          resourceId: logicalId,
          severity: 'warning',
        });
      }
    }

    if (resource.Type === 'AWS::EC2::SecurityGroup') {
      const ingress = resource.Properties.SecurityGroupIngress;
      if (Array.isArray(ingress)) {
        for (const rule of ingress) {
          const cidr = (rule as Record<string, unknown>).CidrIp as string;
          const fromPort = (rule as Record<string, unknown>).FromPort as number;
          const toPort = (rule as Record<string, unknown>).ToPort as number;
          if (cidr === '0.0.0.0/0' && fromPort !== 443 && toPort !== 443) {
            issues.push({
              layer: 'best-practices',
              code: 'BP006',
              message: `Security group "${logicalId}" allows unrestricted inbound access (0.0.0.0/0) on port ${fromPort}`,
              resourceId: logicalId,
              severity: 'warning',
            });
          }
        }
      }
    }

    if (resource.Type === 'AWS::IAM::Role') {
      const statements = resource.Properties.AssumeRolePolicyDocument?.Statement;
      if (Array.isArray(statements)) {
        for (const statement of statements) {
          const actions = (statement as Record<string, unknown>).Action;
          if (actions === '*') {
            issues.push({
              layer: 'best-practices',
              code: 'BP007',
              message: `IAM role "${logicalId}" uses Action:'*' wildcard — follow least privilege`,
              resourceId: logicalId,
              severity: 'warning',
            });
          }
        }
      }
    }
  }

  const hasMonitoring = Object.values(template.Resources).some(
    (r) =>
      r.Type === 'AWS::CloudWatch::Dashboard' ||
      r.Type === 'AWS::CloudWatch::Alarm' ||
      r.Type === 'AWS::CloudTrail::Trail',
  );

  if (!hasMonitoring && Object.keys(template.Resources).length > 3) {
    issues.push({
      layer: 'best-practices',
      code: 'BP008',
      message: 'Template has no CloudWatch monitoring resources — consider adding dashboards and alarms',
      severity: 'warning',
    });
  }

  return issues;
}

function validateCrossReferences(template: CfnTemplate): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const definedResources = new Set(Object.keys(template.Resources));
  const definedParameters = new Set(Object.keys(template.Parameters ?? {}));
  const validTargets = new Set([...definedResources, ...definedParameters, 'AWS::AccountId', 'AWS::Region', 'AWS::StackName', 'AWS::StackId', 'AWS::NoValue', 'AWS::URLSuffix']);

  function checkRefs(obj: unknown, path: string): void {
    if (obj === null || obj === undefined) return;

    if (typeof obj === 'object' && !Array.isArray(obj)) {
      const record = obj as Record<string, unknown>;

      if ('Ref' in record && typeof record.Ref === 'string') {
        if (!validTargets.has(record.Ref)) {
          issues.push({
            layer: 'cross-reference',
            code: 'XR001',
            message: `Ref "${record.Ref}" at ${path} does not resolve to any declared resource or parameter`,
            severity: 'error',
          });
        }
      }

      if ('Fn::GetAtt' in record) {
        const getAtt = record['Fn::GetAtt'];
        let targetLogicalId: string | undefined;

        if (Array.isArray(getAtt) && getAtt.length >= 1) {
          targetLogicalId = getAtt[0] as string;
        } else if (typeof getAtt === 'string') {
          targetLogicalId = getAtt.split('.')[0];
        }

        if (targetLogicalId && !definedResources.has(targetLogicalId)) {
          issues.push({
            layer: 'cross-reference',
            code: 'XR002',
            message: `Fn::GetAtt target "${targetLogicalId}" at ${path} does not exist in Resources`,
            severity: 'error',
          });
        }
      }

      for (const [key, value] of Object.entries(record)) {
        if (key !== 'Ref' && key !== 'Fn::GetAtt') {
          checkRefs(value, `${path}.${key}`);
        }
      }
    }

    if (Array.isArray(obj)) {
      obj.forEach((item, index) => checkRefs(item, `${path}[${index}]`));
    }
  }

  for (const [logicalId, resource] of Object.entries(template.Resources)) {
    checkRefs(resource.Properties, `Resources.${logicalId}.Properties`);

    if (resource.DependsOn) {
      const deps = Array.isArray(resource.DependsOn) ? resource.DependsOn : [resource.DependsOn];
      for (const dep of deps) {
        if (!definedResources.has(dep)) {
          issues.push({
            layer: 'cross-reference',
            code: 'XR003',
            message: `DependsOn target "${dep}" in resource "${logicalId}" does not exist in Resources`,
            resourceId: logicalId,
            severity: 'error',
          });
        }
      }
    }
  }

  return issues;
}

function validateAwsApi(): ValidationIssue[] {
  return [
    {
      layer: 'aws-api',
      code: 'API001',
      message: 'AWS API validation is not implemented yet — template was validated structurally only',
      severity: 'info',
    },
  ];
}

export function validateTemplate(
  template: CfnTemplate,
  architecture: ArchitectureModel,
): CfnValidationResult {
  const allIssues = [
    ...validateStructural(template),
    ...validateBestPractices(template, architecture),
    ...validateCrossReferences(template),
    ...validateAwsApi(),
  ];

  const errors = allIssues.filter((i) => i.severity === 'error');
  const warnings = allIssues.filter((i) => i.severity === 'warning');
  const info = allIssues.filter((i) => i.severity === 'info');

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    info,
  };
}
