export function buildWaReviewPrompt(architectureJson: string, ragContext: string): string {
  return `Review the following AWS architecture against all six Well-Architected Framework pillars:

1. Operational Excellence
2. Security
3. Reliability
4. Performance Efficiency
5. Cost Optimization
6. Sustainability

Architecture:
\`\`\`json
${architectureJson}
\`\`\`
${ragContext}

For each pillar, identify:
- Findings (what could be improved)
- Severity (critical, high, medium, low)
- Specific recommendations

Format your response as a JSON array of findings inside \`\`\`json fences:
[
  {
    "pillar": "security",
    "severity": "high",
    "finding": "description",
    "recommendation": "what to do"
  }
]`;
}
