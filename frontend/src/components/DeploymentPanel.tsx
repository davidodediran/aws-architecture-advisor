import { useState } from 'react';
import { api, useApiCall } from '../hooks/useApi';
import { useArchitectureStore } from '../store/architectureStore';
import type { RequestDeploymentResponse } from '@shared/types/api';
import { SUPPORTED_REGIONS } from '@shared/constants/regions';

interface DeploymentPanelProps {
  projectId: string;
  architectureVersion: number;
}

export default function DeploymentPanel({ projectId, architectureVersion }: DeploymentPanelProps) {
  const [roleArn, setRoleArn] = useState('');
  const [externalId, setExternalId] = useState('');
  const [region, setRegion] = useState('us-east-1');
  const [maxSpend, setMaxSpend] = useState('25');
  const { deploymentStatus, setDeploymentStatus } = useArchitectureStore();
  const { loading, error, execute } = useApiCall<RequestDeploymentResponse>();

  const budgetDenied = deploymentStatus?.status === 'pending-approval';
  const deployed =
    deploymentStatus?.status === 'create-complete' && deploymentStatus.outputs;

  const handleDeploy = async () => {
    if (!roleArn.trim()) return;
    const result = await execute(() =>
      api.post<RequestDeploymentResponse>(`/projects/${projectId}/deploy`, {
        projectId,
        architectureVersion,
        roleArn,
        externalId,
        budget: {
          monthlyLimitUsd: parseFloat(maxSpend) || 25,
          alertThresholdPercent: 80,
          alertEmail: '',
        },
        cleanupLambdaEnabled: true,
      }),
    );
    if (result) {
      if (!result.budgetComparison.withinBudget) {
        setDeploymentStatus({
          deploymentId: result.deploymentId,
          status: 'pending-approval',
          stackEvents: [],
        });
      } else {
        setDeploymentStatus({
          deploymentId: result.deploymentId,
          status: result.status,
          stackEvents: [],
        });
      }
    }
  };

  if (deployed) {
    return (
      <div className="deploy-panel">
        <div className="deploy-success">
          <h3>Deployment Complete</h3>
          <p>Your stack has been successfully deployed.</p>
          <div className="stack-info">
            <div className="stack-field">
              <strong>Deployment ID:</strong> {deploymentStatus.deploymentId}
            </div>
            {deploymentStatus.outputs &&
              Object.entries(deploymentStatus.outputs).map(([key, value]) => (
                <div key={key} className="stack-field">
                  <strong>{key}:</strong> {value}
                </div>
              ))}
          </div>
        </div>
      </div>
    );
  }

  if (budgetDenied) {
    return (
      <div className="deploy-panel">
        <div className="deploy-budget-denied">
          <h3>Budget Exceeded</h3>
          <p>
            The estimated cost exceeds your maximum spend of ${maxSpend}/mo. Adjust your
            budget or simplify the architecture.
          </p>
          <button
            className="btn btn-secondary"
            onClick={() => setDeploymentStatus(null)}
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="deploy-panel">
      <h3>Deploy to AWS</h3>
      <p className="deploy-description">
        Deploy this architecture to your AWS account using CloudFormation.
      </p>

      <div className="form">
        <div className="form-group">
          <label htmlFor="roleArn">IAM Role ARN</label>
          <input
            id="roleArn"
            type="text"
            value={roleArn}
            onChange={(e) => setRoleArn(e.target.value)}
            placeholder="arn:aws:iam::123456789012:role/DeployRole"
          />
        </div>
        <div className="form-group">
          <label htmlFor="externalId">External ID</label>
          <input
            id="externalId"
            type="text"
            value={externalId}
            onChange={(e) => setExternalId(e.target.value)}
            placeholder="Optional external ID for cross-account access"
          />
        </div>
        <div className="form-group">
          <label htmlFor="deployRegion">Region</label>
          <select
            id="deployRegion"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
          >
            {Object.values(SUPPORTED_REGIONS).map((r) => (
              <option key={r.code} value={r.code}>
                {r.name} ({r.code})
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="maxSpend">Max Spend ($/mo)</label>
          <input
            id="maxSpend"
            type="number"
            value={maxSpend}
            onChange={(e) => setMaxSpend(e.target.value)}
            min="1"
            max="1000"
          />
        </div>

        {error && <div className="deploy-error">{error}</div>}

        <div className="form-actions">
          <button
            className="btn btn-primary"
            onClick={handleDeploy}
            disabled={loading || !roleArn.trim()}
          >
            {loading ? 'Deploying...' : 'Deploy Stack'}
          </button>
        </div>
      </div>
    </div>
  );
}
