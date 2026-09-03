import type { CostEstimate as CostEstimateType } from '@shared/types/architecture-model';

interface CostEstimateProps {
  costEstimate: CostEstimateType | null;
}

export default function CostEstimate({ costEstimate }: CostEstimateProps) {
  if (!costEstimate) {
    return (
      <div className="cost-empty">
        <p>Cost estimate will appear once an architecture is generated.</p>
      </div>
    );
  }

  return (
    <div className="cost-panel">
      <div className="cost-header">
        <h3>Monthly Cost Estimate</h3>
        <span className="cost-total">${costEstimate.monthlyUsd.toFixed(2)}/mo</span>
      </div>

      <table className="cost-table">
        <thead>
          <tr>
            <th>Service</th>
            <th>Resource</th>
            <th className="cost-col">Cost</th>
          </tr>
        </thead>
        <tbody>
          {costEstimate.breakdown.map((item, i) => (
            <tr key={i}>
              <td>{item.dimension}</td>
              <td>
                {item.quantity} {item.unit} @ ${item.unitPriceUsd.toFixed(4)}/{item.unit}
              </td>
              <td className="cost-col">${item.monthlyUsd.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {costEstimate.assumptions.length > 0 && (
        <div className="cost-assumptions">
          <h4>Assumptions</h4>
          <ul>
            {costEstimate.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="cost-disclaimer">
        Estimates are approximate. Actual costs may vary based on usage patterns, data transfer,
        and regional pricing.
      </div>
    </div>
  );
}
