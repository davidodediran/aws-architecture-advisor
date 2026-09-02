import { LIMITS } from '@aws-arch-advisor/shared';

export interface BudgetComparison {
  approved: boolean;
  estimatedMonthlyCost: number;
  budgetLimit: number;
  circuitBreakerLimit: number;
  percentOfBudget: number;
  reasons: string[];
  suggestions: string[];
}

interface BudgetConfig {
  maxMonthlySpend: number;
}

export interface BudgetCheckResult {
  approved: boolean;
  estimatedCostUsd: number;
  budgetLimitUsd: number;
  circuitBreakerTripped: boolean;
  warningLevel: 'none' | 'approaching' | 'exceeded';
  message: string;
}

const DEFAULT_CIRCUIT_BREAKER_USD = 10;

export function checkBudget(
  estimatedMonthlyCost: number,
  budgetConfig: BudgetConfig,
): BudgetComparison {
  const circuitBreakerLimit = LIMITS.CIRCUIT_BREAKER_THRESHOLD_USD;
  const reasons: string[] = [];
  const suggestions: string[] = [];
  let approved = true;

  const percentOfBudget =
    budgetConfig.maxMonthlySpend > 0
      ? (estimatedMonthlyCost / budgetConfig.maxMonthlySpend) * 100
      : 0;

  if (estimatedMonthlyCost > circuitBreakerLimit) {
    approved = false;
    reasons.push(
      `Estimated cost $${estimatedMonthlyCost.toFixed(2)}/month exceeds the circuit breaker threshold of $${circuitBreakerLimit.toFixed(2)}/month`,
    );
    suggestions.push('Consider using serverless services (Lambda, DynamoDB on-demand) to reduce baseline costs');
    suggestions.push('Use smaller instance sizes or reduce the number of resources');
  }

  if (estimatedMonthlyCost > budgetConfig.maxMonthlySpend) {
    approved = false;
    reasons.push(
      `Estimated cost $${estimatedMonthlyCost.toFixed(2)}/month exceeds your budget limit of $${budgetConfig.maxMonthlySpend.toFixed(2)}/month`,
    );
    suggestions.push('Review resource configurations for over-provisioned capacity');
    suggestions.push('Consider reserved instances or savings plans for predictable workloads');
  }

  if (approved && percentOfBudget > 80) {
    reasons.push(
      `Estimated cost is ${percentOfBudget.toFixed(1)}% of your budget — close to the limit`,
    );
    suggestions.push('Monitor usage closely and set up billing alerts');
    suggestions.push('Evaluate if any resources can be right-sized to add buffer');
  }

  if (suggestions.length === 0) {
    suggestions.push('Architecture is within budget constraints');
  }

  return {
    approved,
    estimatedMonthlyCost,
    budgetLimit: budgetConfig.maxMonthlySpend,
    circuitBreakerLimit,
    percentOfBudget: Math.round(percentOfBudget * 10) / 10,
    reasons,
    suggestions,
  };
}

export function checkBudgetSimple(
  estimatedCostUsd: number,
  budgetLimitUsd: number,
  circuitBreakerUsd: number = DEFAULT_CIRCUIT_BREAKER_USD,
): BudgetCheckResult {
  const circuitBreakerTripped = estimatedCostUsd > circuitBreakerUsd;
  const exceeded = estimatedCostUsd > budgetLimitUsd;
  const approaching = estimatedCostUsd > budgetLimitUsd * 0.8;

  let warningLevel: BudgetCheckResult['warningLevel'] = 'none';
  if (exceeded) warningLevel = 'exceeded';
  else if (approaching) warningLevel = 'approaching';

  let approved = true;
  let message = 'Within budget';

  if (circuitBreakerTripped) {
    approved = false;
    message = `Cost $${estimatedCostUsd.toFixed(2)} exceeds circuit breaker limit $${circuitBreakerUsd.toFixed(2)}`;
  } else if (exceeded) {
    approved = false;
    message = `Cost $${estimatedCostUsd.toFixed(2)} exceeds budget $${budgetLimitUsd.toFixed(2)}`;
  } else if (approaching) {
    message = `Warning: cost $${estimatedCostUsd.toFixed(2)} is above 80% of budget $${budgetLimitUsd.toFixed(2)}`;
  }

  return {
    approved,
    estimatedCostUsd,
    budgetLimitUsd,
    circuitBreakerTripped,
    warningLevel,
    message,
  };
}
