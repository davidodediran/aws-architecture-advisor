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
