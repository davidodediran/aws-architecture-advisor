import type { AwsRegion } from '../types/architecture-model';

export interface RegionInfo {
  code: AwsRegion;
  name: string;
  bedrockAvailable: boolean;
  bedrockKnowledgeBasesAvailable: boolean;
}

export const SUPPORTED_REGIONS: Record<AwsRegion, RegionInfo> = {
  'us-east-1': {
    code: 'us-east-1',
    name: 'US East (N. Virginia)',
    bedrockAvailable: true,
    bedrockKnowledgeBasesAvailable: true,
  },
  'us-west-2': {
    code: 'us-west-2',
    name: 'US West (Oregon)',
    bedrockAvailable: true,
    bedrockKnowledgeBasesAvailable: true,
  },
  'eu-west-1': {
    code: 'eu-west-1',
    name: 'Europe (Ireland)',
    bedrockAvailable: true,
    bedrockKnowledgeBasesAvailable: true,
  },
  'eu-central-1': {
    code: 'eu-central-1',
    name: 'Europe (Frankfurt)',
    bedrockAvailable: true,
    bedrockKnowledgeBasesAvailable: true,
  },
  'ap-southeast-1': {
    code: 'ap-southeast-1',
    name: 'Asia Pacific (Singapore)',
    bedrockAvailable: true,
    bedrockKnowledgeBasesAvailable: true,
  },
  'ap-northeast-1': {
    code: 'ap-northeast-1',
    name: 'Asia Pacific (Tokyo)',
    bedrockAvailable: true,
    bedrockKnowledgeBasesAvailable: true,
  },
};

export const DEFAULT_REGION: AwsRegion = 'us-east-1';
