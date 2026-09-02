import { useState } from 'react';
import type { GenerateCfnResponse } from '@shared/types/api';

interface CfnViewerProps {
  cfnTemplate: GenerateCfnResponse | null;
}

export default function CfnViewer({ cfnTemplate }: CfnViewerProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!cfnTemplate) {
    return (
      <div className="cfn-empty">
        <p>CloudFormation template will appear once an architecture is generated.</p>
      </div>
    );
  }

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(cfnTemplate.templateYaml);
  } catch {
    // template might be YAML, display as-is
  }

  const resourceCount = parsed.Resources ? Object.keys(parsed.Resources as object).length : 0;
  const outputCount = parsed.Outputs ? Object.keys(parsed.Outputs as object).length : 0;
  const validation = cfnTemplate.validationResults;

  const allIssues = [
    ...validation.cfnLint.findings,
    ...validation.cfnNag.findings,
    ...validation.awsValidate.findings,
  ];

  const handleCopy = async () => {
    await navigator.clipboard.writeText(cfnTemplate.templateYaml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="cfn-panel">
      <div className="cfn-header">
        <div className="cfn-stats">
          <span className="cfn-stat">{resourceCount} Resources</span>
          <span className="cfn-stat">{outputCount} Outputs</span>
          <span className={`cfn-validation cfn-validation-${validation.overallStatus}`}>
            {validation.overallStatus}
          </span>
        </div>
        <div className="cfn-actions">
          <button className="btn btn-secondary" onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy JSON'}
          </button>
          <button className="btn btn-secondary" onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>

      {allIssues.length > 0 && (
        <div className="cfn-issues">
          <h4>Validation Issues ({allIssues.length})</h4>
          {allIssues.map((issue, i) => (
            <div key={i} className={`cfn-issue cfn-issue-${issue.severity}`}>
              <span className="issue-severity">{issue.severity}</span>
              <span className="issue-rule">{issue.rule}</span>
              <span className="issue-message">{issue.message}</span>
              {issue.resource && <span className="issue-resource">{issue.resource}</span>}
            </div>
          ))}
        </div>
      )}

      <div className={`cfn-code ${expanded ? 'cfn-code-expanded' : ''}`}>
        <pre>
          <code>{cfnTemplate.templateYaml}</code>
        </pre>
      </div>
    </div>
  );
}
