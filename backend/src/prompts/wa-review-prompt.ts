export function buildWaReviewPrompt(architectureJson: string, ragContext: string): string {
  return `Review the following AWS architecture against all six Well-Architected Framework pillars:

1. Security
2. Reliability
3. Performance Efficiency
4. Cost Optimization
5. Operational Excellence
6. Sustainability

Architecture:
\`\`\`json
${architectureJson}
\`\`\`
${ragContext}

Analyze each pillar and return your findings as a JSON array inside \`\`\`json fences. Each finding must have:
- "pillar": one of "security", "reliability", "performance", "cost-optimization", "operational-excellence", "sustainability"
- "finding": a clear description of the issue
- "severity": one of "critical", "high", "medium", "low"
- "recommendation": a specific actionable recommendation
- "waReference": a reference to the relevant Well-Architected Framework best practice or documentation`;
}
