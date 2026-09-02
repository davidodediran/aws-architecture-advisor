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
