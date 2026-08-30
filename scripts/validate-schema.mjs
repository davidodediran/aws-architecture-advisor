import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(__dirname, '../shared/schemas/architecture-model.schema.json');

let passed = 0;
let failed = 0;

function check(name, condition) {
  if (condition) {
    console.log(`  PASS: ${name}`);
    passed++;
  } else {
    console.error(`  FAIL: ${name}`);
    failed++;
  }
}

console.log('Validating architecture-model.schema.json...\n');

const raw = readFileSync(schemaPath, 'utf-8');
const schema = JSON.parse(raw);

check('Schema uses draft-07', schema.$schema === 'http://json-schema.org/draft-07/schema#');
check('Schema has definitions', typeof schema.definitions === 'object');

const requiredDefinitions = [
  'ModelMetadata', 'NetworkTopology', 'VpcConfig', 'NatGatewayConfig',
  'Subnet', 'PublicAccessPoint', 'Resource', 'Connection',
  'SecurityGroup', 'SecurityGroupRule', 'IamRole', 'IamPolicy',
  'CostEstimate', 'CostBreakdownItem', 'DiagramPosition',
  'ServiceType', 'AwsRegion',
];

for (const def of requiredDefinitions) {
  check(`Definition exists: ${def}`, def in schema.definitions);
}

const serviceTypeEnum = schema.definitions.ServiceType?.enum ?? [];
check('ServiceType has 21 entries', serviceTypeEnum.length === 21);

const expectedServices = [
  'lambda', 'api-gateway', 'api-gateway-websocket', 'dynamodb', 's3',
  'cloudfront', 'cognito', 'sqs', 'sns', 'step-functions', 'eventbridge',
  'kinesis', 'rds-aurora-serverless', 'elasticache', 'ecs-fargate', 'ecr',
  'cloudwatch', 'cloudtrail', 'waf', 'secrets-manager', 'kms',
];
for (const svc of expectedServices) {
  check(`ServiceType includes: ${svc}`, serviceTypeEnum.includes(svc));
}

const regionEnum = schema.definitions.AwsRegion?.enum ?? [];
check('AwsRegion has 6 entries', regionEnum.length === 6);

const expectedRegions = ['us-east-1', 'us-west-2', 'eu-west-1', 'eu-central-1', 'ap-southeast-1', 'ap-northeast-1'];
for (const region of expectedRegions) {
  check(`AwsRegion includes: ${region}`, regionEnum.includes(region));
}

check('Resources maxItems is 50', schema.properties.resources?.maxItems === 50);
check('Connections maxItems is 200', schema.properties.connections?.maxItems === 200);
check('SecurityGroups maxItems is 25', schema.properties.securityGroups?.maxItems === 25);

const namingPrefixPattern = schema.definitions.ModelMetadata?.properties?.namingPrefix?.pattern;
check('NamingPrefix pattern is correct', namingPrefixPattern === '^[a-z][a-z0-9-]{2,19}$');

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);

if (failed > 0) {
  process.exit(1);
}
