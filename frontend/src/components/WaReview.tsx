import type { WaReviewResponse, WaFinding } from '@shared/types/api';

interface WaReviewProps {
  waReview: WaReviewResponse | null;
}

const SEVERITY_ORDER: WaFinding['severity'][] = ['critical', 'high', 'medium', 'low', 'info'];

const SEVERITY_COLORS: Record<WaFinding['severity'], string> = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#d97706',
  low: '#2563eb',
  info: '#6b7280',
};

export default function WaReview({ waReview }: WaReviewProps) {
  if (!waReview) {
    return (
      <div className="wa-empty">
        <p>Well-Architected review will appear once an architecture is generated.</p>
      </div>
    );
  }

  const allFindings = [...waReview.ruleEngineFindings, ...waReview.ragFindings].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );

  return (
    <div className="wa-panel">
      <div className="wa-header">
        <h3>Well-Architected Review</h3>
        <span className="wa-score">Score: {waReview.overallScore}/100</span>
      </div>

      <div className="wa-pillars">
        {waReview.pillars.map((pillar) => (
          <div key={pillar.pillar} className="wa-pillar-card">
            <div className="pillar-name">{pillar.pillar}</div>
            <div className="pillar-score">{pillar.score}/100</div>
            <div className="pillar-bar">
              <div
                className="pillar-bar-fill"
                style={{ width: `${pillar.score}%`, background: pillar.score >= 70 ? '#10b981' : pillar.score >= 40 ? '#f59e0b' : '#ef4444' }}
              />
            </div>
            <div className="pillar-findings">{pillar.findings.length} findings</div>
          </div>
        ))}
      </div>

      {allFindings.length > 0 && (
        <div className="wa-findings">
          <h4>Findings ({allFindings.length})</h4>
          {allFindings.map((finding, i) => (
            <div key={i} className="wa-finding-card">
              <div className="finding-header">
                <span
                  className="severity-badge"
                  style={{ background: SEVERITY_COLORS[finding.severity] }}
                >
                  {finding.severity}
                </span>
                <span className="finding-pillar">{finding.pillar}</span>
                <span className="finding-source">{finding.source}</span>
              </div>
              <h5>{finding.title}</h5>
              <p className="finding-desc">{finding.description}</p>
              <div className="finding-recommendation">
                <strong>Recommendation:</strong> {finding.recommendation}
              </div>
              <div className="finding-ref">{finding.waFrameworkRef}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
