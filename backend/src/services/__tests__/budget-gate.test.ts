import { describe, it, expect } from 'vitest';

interface BudgetCheckResult {
  approved: boolean;
  estimatedCostUsd: number;
  budgetLimitUsd: number;
  circuitBreakerTripped: boolean;
  warningLevel: 'none' | 'approaching' | 'exceeded';
  message: string;
}

function checkBudget(
  estimatedCostUsd: number,
  budgetLimitUsd: number,
  circuitBreakerUsd: number = 10,
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

describe('checkBudget', () => {
  it('approves when cost is within budget', () => {
    const result = checkBudget(3.5, 5.0);
    expect(result.approved).toBe(true);
    expect(result.warningLevel).toBe('none');
    expect(result.message).toBe('Within budget');
  });

  it('denies when cost exceeds budget', () => {
    const result = checkBudget(7.0, 5.0);
    expect(result.approved).toBe(false);
    expect(result.warningLevel).toBe('exceeded');
    expect(result.message).toContain('exceeds budget');
  });

  it('denies when cost exceeds circuit breaker ($10)', () => {
    const result = checkBudget(12.0, 15.0);
    expect(result.approved).toBe(false);
    expect(result.circuitBreakerTripped).toBe(true);
    expect(result.message).toContain('circuit breaker');
  });

  it('warns when cost is above 80% of budget', () => {
    const result = checkBudget(4.5, 5.0);
    expect(result.approved).toBe(true);
    expect(result.warningLevel).toBe('approaching');
    expect(result.message).toContain('Warning');
    expect(result.message).toContain('80%');
  });

  it('returns all expected fields', () => {
    const result = checkBudget(2.0, 5.0);
    expect(result).toHaveProperty('approved');
    expect(result).toHaveProperty('estimatedCostUsd');
    expect(result).toHaveProperty('budgetLimitUsd');
    expect(result).toHaveProperty('circuitBreakerTripped');
    expect(result).toHaveProperty('warningLevel');
    expect(result).toHaveProperty('message');
    expect(result.estimatedCostUsd).toBe(2.0);
    expect(result.budgetLimitUsd).toBe(5.0);
    expect(result.circuitBreakerTripped).toBe(false);
  });
});
