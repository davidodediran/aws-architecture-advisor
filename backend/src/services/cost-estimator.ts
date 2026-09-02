import { PricingClient, GetProductsCommand } from '@aws-sdk/client-pricing';
import type { ArchitectureModel, Resource } from '@aws-arch-advisor/shared';
import { putItem, getItem } from './dynamo-client';

const pricingClient = new PricingClient({ region: 'us-east-1' });
const PRICING_CACHE_TABLE = process.env.PRICING_CACHE_TABLE!;
const CACHE_TTL_SECONDS = 86_400; // 24 hours

export interface CostEstimateResult {
  totalMonthlyCost: number;
  breakdown: ResourceCostBreakdown[];
  currency: 'USD';
  disclaimer: string;
}

interface ResourceCostBreakdown {
  resourceId: string;
  resourceType: string;
  resourceName: string;
  monthlyCost: number;
  details: string;
}

interface CachedPrice {
  pk: string;
  sk: string;
  pricePerUnit: number;
  unit: string;
  expiresAt: number;
}

const DEFAULT_PRICES: Record<string, number> = {
  'ec2-t3.micro': 7.59,
  'ec2-t3.small': 15.18,
  'ec2-t3.medium': 30.37,
  'ec2-m5.large': 70.08,
  'lambda-request': 0.0000002,
  'lambda-duration-gb-sec': 0.0000166667,
  'dynamodb-wru': 1.25,
  'dynamodb-rru': 0.25,
  'dynamodb-storage-gb': 0.25,
  's3-storage-gb': 0.023,
  's3-put-1k': 0.005,
  's3-get-1k': 0.0004,
  'rds-aurora-acu-hour': 0.06,
  'rds-storage-gb': 0.10,
  'cloudfront-gb': 0.085,
  'sqs-request-1m': 0.40,
  'sns-publish-1m': 0.50,
  'elasticache-node-hour': 0.017,
  'apigateway-request-1m': 3.50,
  'cognito-mau': 0.0055,
  'ecs-fargate-vcpu-hour': 0.04048,
  'ecs-fargate-gb-hour': 0.004445,
  'cloudwatch-metric': 0.30,
  'waf-rule': 1.00,
  'waf-request-1m': 0.60,
  'kinesis-shard-hour': 0.015,
  'stepfunctions-transition-1k': 0.025,
  'eventbridge-event-1m': 1.00,
  'opensearch-instance-hour': 0.092,
};

async function getCachedPrice(serviceKey: string): Promise<number | null> {
  const cached = await getItem<CachedPrice>(PRICING_CACHE_TABLE, {
    pk: `PRICE#${serviceKey}`,
    sk: 'LATEST',
  });
  if (!cached) return null;

  const now = Math.floor(Date.now() / 1000);
  if (cached.expiresAt < now) return null;

  return cached.pricePerUnit;
}

async function setCachedPrice(serviceKey: string, pricePerUnit: number, unit: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await putItem(PRICING_CACHE_TABLE, {
    pk: `PRICE#${serviceKey}`,
    sk: 'LATEST',
    pricePerUnit,
    unit,
    expiresAt: now + CACHE_TTL_SECONDS,
    updatedAt: new Date().toISOString(),
  });
}

async function lookupPrice(serviceCode: string, filters: Record<string, string>): Promise<number | null> {
  try {
    const filterList = Object.entries(filters).map(([field, value]) => ({
      Type: 'TERM_MATCH' as const,
      Field: field,
      Value: value,
    }));

    const res = await pricingClient.send(
      new GetProductsCommand({
        ServiceCode: serviceCode,
        Filters: filterList,
        MaxResults: 1,
      }),
    );

    if (!res.PriceList || res.PriceList.length === 0) return null;

    const priceData = JSON.parse(res.PriceList[0] as string);
    const terms = priceData.terms?.OnDemand;
    if (!terms) return null;

    const firstTerm = Object.values(terms)[0] as Record<string, unknown>;
    const priceDimensions = (firstTerm as { priceDimensions: Record<string, unknown> }).priceDimensions;
    const firstDimension = Object.values(priceDimensions)[0] as {
      pricePerUnit: { USD: string };
    };

    return parseFloat(firstDimension.pricePerUnit.USD);
  } catch {
    return null;
  }
}

function estimateEc2Cost(resource: Resource): { cost: number; details: string } {
  const instanceType = (resource.config.instanceType as string) ?? 't3.micro';
  const cacheKey = `ec2-${instanceType}`;
  const hourlyPrice = DEFAULT_PRICES[cacheKey] ?? DEFAULT_PRICES['ec2-t3.micro']!;
  const monthlyCost = hourlyPrice;
  return { cost: monthlyCost, details: `${instanceType} instance, 730 hrs/month` };
}

function estimateLambdaCost(resource: Resource): { cost: number; details: string } {
  const requestsPerMonth = (resource.config.estimatedRequestsPerMonth as number) ?? 1_000_000;
  const avgDurationMs = (resource.config.avgDurationMs as number) ?? 200;
  const memoryMb = (resource.config.memorySize as number) ?? 128;

  const freeRequests = 1_000_000;
  const freeDurationGbSec = 400_000;

  const billableRequests = Math.max(0, requestsPerMonth - freeRequests);
  const durationSec = avgDurationMs / 1000;
  const gbSec = (memoryMb / 1024) * durationSec * requestsPerMonth;
  const billableGbSec = Math.max(0, gbSec - freeDurationGbSec);

  const requestCost = billableRequests * DEFAULT_PRICES['lambda-request']!;
  const durationCost = billableGbSec * DEFAULT_PRICES['lambda-duration-gb-sec']!;
  const totalCost = requestCost + durationCost;

  return {
    cost: totalCost,
    details: `${(requestsPerMonth / 1_000_000).toFixed(1)}M requests/month, ${avgDurationMs}ms avg, ${memoryMb}MB`,
  };
}

function estimateDynamoDbCost(resource: Resource): { cost: number; details: string } {
  const wru = (resource.config.writeCapacityUnits as number) ?? 5;
  const rru = (resource.config.readCapacityUnits as number) ?? 5;
  const storageGb = (resource.config.estimatedStorageGb as number) ?? 1;
  const isOnDemand = resource.config.billingMode === 'PAY_PER_REQUEST';

  if (isOnDemand) {
    const estimatedWrites = (resource.config.estimatedWritesPerMonth as number) ?? 100_000;
    const estimatedReads = (resource.config.estimatedReadsPerMonth as number) ?? 500_000;
    const writeCost = (estimatedWrites / 1_000_000) * 1.25;
    const readCost = (estimatedReads / 1_000_000) * 0.25;
    const storageCost = storageGb * DEFAULT_PRICES['dynamodb-storage-gb']!;
    return {
      cost: writeCost + readCost + storageCost,
      details: `On-demand: ~${(estimatedWrites / 1000).toFixed(0)}K writes, ~${(estimatedReads / 1000).toFixed(0)}K reads/month, ${storageGb}GB`,
    };
  }

  const wruCost = wru * DEFAULT_PRICES['dynamodb-wru']! * 0.00065 * 730;
  const rruCost = rru * DEFAULT_PRICES['dynamodb-rru']! * 0.00013 * 730;
  const storageCost = storageGb * DEFAULT_PRICES['dynamodb-storage-gb']!;
  return {
    cost: wruCost + rruCost + storageCost,
    details: `Provisioned: ${wru} WCU, ${rru} RCU, ${storageGb}GB storage`,
  };
}

function estimateS3Cost(resource: Resource): { cost: number; details: string } {
  const storageGb = (resource.config.estimatedStorageGb as number) ?? 10;
  const putsPerMonth = (resource.config.estimatedPutsPerMonth as number) ?? 10_000;
  const getsPerMonth = (resource.config.estimatedGetsPerMonth as number) ?? 100_000;

  const storageCost = storageGb * DEFAULT_PRICES['s3-storage-gb']!;
  const putCost = (putsPerMonth / 1000) * DEFAULT_PRICES['s3-put-1k']!;
  const getCost = (getsPerMonth / 1000) * DEFAULT_PRICES['s3-get-1k']!;

  return {
    cost: storageCost + putCost + getCost,
    details: `${storageGb}GB storage, ${(putsPerMonth / 1000).toFixed(0)}K puts, ${(getsPerMonth / 1000).toFixed(0)}K gets/month`,
  };
}

function estimateRdsCost(resource: Resource): { cost: number; details: string } {
  const minAcu = (resource.config.minCapacity as number) ?? 0.5;
  const maxAcu = (resource.config.maxCapacity as number) ?? 2;
  const storageGb = (resource.config.allocatedStorageGb as number) ?? 20;

  const avgAcu = (minAcu + maxAcu) / 2;
  const computeCost = avgAcu * DEFAULT_PRICES['rds-aurora-acu-hour']! * 730;
  const storageCost = storageGb * DEFAULT_PRICES['rds-storage-gb']!;

  return {
    cost: computeCost + storageCost,
    details: `Aurora Serverless v2: ${minAcu}-${maxAcu} ACU avg, ${storageGb}GB storage`,
  };
}

function estimateResourceCost(resource: Resource): { cost: number; details: string } {
  switch (resource.type) {
    case 'lambda':
      return estimateLambdaCost(resource);
    case 'dynamodb':
      return estimateDynamoDbCost(resource);
    case 's3':
      return estimateS3Cost(resource);
    case 'rds-aurora-serverless':
      return estimateRdsCost(resource);
    case 'ecs-fargate': {
      const vcpu = (resource.config.cpu as number) ?? 256;
      const memMb = (resource.config.memory as number) ?? 512;
      const vcpuCost = (vcpu / 1024) * DEFAULT_PRICES['ecs-fargate-vcpu-hour']! * 730;
      const memCost = (memMb / 1024) * DEFAULT_PRICES['ecs-fargate-gb-hour']! * 730;
      return { cost: vcpuCost + memCost, details: `${vcpu} vCPU units, ${memMb}MB memory` };
    }
    case 'api-gateway': {
      const requestsM = (resource.config.estimatedRequestsPerMonth as number) ?? 1_000_000;
      return { cost: (requestsM / 1_000_000) * DEFAULT_PRICES['apigateway-request-1m']!, details: `${(requestsM / 1_000_000).toFixed(1)}M requests/month` };
    }
    case 'cloudfront': {
      const transferGb = (resource.config.estimatedTransferGb as number) ?? 100;
      return { cost: transferGb * DEFAULT_PRICES['cloudfront-gb']!, details: `${transferGb}GB transfer/month` };
    }
    case 'cognito': {
      const mau = (resource.config.estimatedMau as number) ?? 1000;
      const freeTier = 50_000;
      const billable = Math.max(0, mau - freeTier);
      return { cost: billable * DEFAULT_PRICES['cognito-mau']!, details: `${mau} MAU (50K free tier)` };
    }
    case 'sqs': {
      const msgs = (resource.config.estimatedMessagesPerMonth as number) ?? 1_000_000;
      const freeMessages = 1_000_000;
      const billable = Math.max(0, msgs - freeMessages);
      return { cost: (billable / 1_000_000) * DEFAULT_PRICES['sqs-request-1m']!, details: `${(msgs / 1_000_000).toFixed(1)}M messages/month` };
    }
    case 'sns': {
      const publishes = (resource.config.estimatedPublishesPerMonth as number) ?? 100_000;
      return { cost: (publishes / 1_000_000) * DEFAULT_PRICES['sns-publish-1m']!, details: `${(publishes / 1000).toFixed(0)}K publishes/month` };
    }
    case 'elasticache': {
      const nodes = (resource.config.numNodes as number) ?? 1;
      return { cost: nodes * DEFAULT_PRICES['elasticache-node-hour']! * 730, details: `${nodes} cache node(s)` };
    }
    case 'cloudwatch':
      return { cost: DEFAULT_PRICES['cloudwatch-metric']! * 10, details: 'Basic monitoring (~10 custom metrics)' };
    case 'waf': {
      const rules = (resource.config.ruleCount as number) ?? 5;
      const requestsM = (resource.config.estimatedRequestsPerMonth as number) ?? 1_000_000;
      return { cost: rules * DEFAULT_PRICES['waf-rule']! + (requestsM / 1_000_000) * DEFAULT_PRICES['waf-request-1m']!, details: `${rules} rules, ${(requestsM / 1_000_000).toFixed(1)}M requests` };
    }
    case 'kinesis': {
      const shards = (resource.config.shardCount as number) ?? 1;
      return { cost: shards * DEFAULT_PRICES['kinesis-shard-hour']! * 730, details: `${shards} shard(s)` };
    }
    case 'step-functions': {
      const transitions = (resource.config.estimatedTransitionsPerMonth as number) ?? 10_000;
      return { cost: (transitions / 1000) * DEFAULT_PRICES['stepfunctions-transition-1k']!, details: `${(transitions / 1000).toFixed(0)}K state transitions/month` };
    }
    case 'eventbridge': {
      const events = (resource.config.estimatedEventsPerMonth as number) ?? 100_000;
      return { cost: (events / 1_000_000) * DEFAULT_PRICES['eventbridge-event-1m']!, details: `${(events / 1000).toFixed(0)}K events/month` };
    }
    default:
      return estimateEc2Cost(resource);
  }
}

export async function estimateCost(architecture: ArchitectureModel): Promise<CostEstimateResult> {
  const breakdown: ResourceCostBreakdown[] = [];
  let totalMonthlyCost = 0;

  for (const resource of architecture.resources) {
    const cacheKey = `${resource.type}-${resource.id}`;
    const cachedPrice = await getCachedPrice(cacheKey);

    let cost: number;
    let details: string;

    if (cachedPrice !== null) {
      cost = cachedPrice;
      details = 'Cached estimate';
    } else {
      const estimate = estimateResourceCost(resource);
      cost = estimate.cost;
      details = estimate.details;

      await setCachedPrice(cacheKey, cost, 'USD/month').catch(() => {});
    }

    breakdown.push({
      resourceId: resource.id,
      resourceType: resource.type,
      resourceName: resource.name,
      monthlyCost: Math.round(cost * 100) / 100,
      details,
    });

    totalMonthlyCost += cost;
  }

  return {
    totalMonthlyCost: Math.round(totalMonthlyCost * 100) / 100,
    breakdown,
    currency: 'USD',
    disclaimer:
      'Cost estimates are approximate and based on default usage assumptions. ' +
      'Actual costs may vary based on usage patterns, data transfer, and AWS pricing changes. ' +
      'Free tier eligibility may reduce costs for new AWS accounts.',
  };
}
