# AWS Architecture Advisor - Development Guide

AI-Powered AWS Architecture Advisor & Deployment Platform built for AmalitechTraining students.

## Architecture

Fully serverless on AWS:
- **Frontend:** React + Vite SPA → S3 + CloudFront
- **Backend:** API Gateway (REST + WebSocket) → Lambda (Node.js 20)
- **Database:** DynamoDB (on-demand)
- **AI:** Amazon Bedrock (Foundation Models) + Bedrock Knowledge Bases (RAG over WA Framework docs)
- **Auth:** Amazon Cognito
- **Observability:** CloudWatch + CloudTrail + X-Ray
- **IaC:** CloudFormation (generated, not hand-written by LLM)

## Monorepo Structure

```
frontend/     React + Vite SPA
backend/      Lambda functions (domain-grouped)
shared/       TypeScript types, JSON schemas, constants shared across packages
infra/        CloudFormation / CDK stacks
docs/         Architecture docs, API spec, design decisions
scripts/      Build, deploy, validation scripts
```

## Key Design Decisions

1. **Architecture model is the single source of truth** — one JSON object drives diagram, CFN, cost estimate, and WA review. They never drift.
2. **CFN templates are deterministic code transforms** — the LLM designs the architecture; tested code writes the CloudFormation. Never LLM-generated CFN.
3. **RAG over Well-Architected Framework** — every recommendation cites real AWS documentation via Bedrock Knowledge Bases, not LLM memory.
4. **Bedrock Guardrails for IP protection** — students cannot reverse-engineer the platform's own architecture.
5. **Budget gate before every deployment** — no surprise bills. CloudWatch billing alarms + AWS Budgets.
6. **Freemium model** — 3 projects free, then trainer unlock or subscription.

## Commands

```bash
npm run dev:frontend     # Start frontend dev server
npm run dev:backend      # Start backend (SAM local)
npm run build            # Build all workspaces
npm run test             # Run all tests
npm run lint             # Lint all workspaces
npm run typecheck        # TypeScript checks
npm run validate:schema  # Validate architecture model schema against references
```

## Development

- Node.js 20+, npm workspaces
- TypeScript strict mode everywhere
- Zod for runtime validation (API inputs match OpenAPI spec)
- Vitest for unit/integration tests
- Playwright for E2E
- ESLint + Prettier

## Conventions

- Lambda functions grouped by domain (projects, conversations, architectures, deployments, ai, validation, auth) — 4-5 functions total, not per-route
- DynamoDB: multi-table for V1 clarity (single-table optimization is V2)
- Every DynamoDB record tagged with `cohort_id` + `trainer_id` for future classroom mode
- Architecture model carries `schemaVersion` — migration functions per version bump
- All S3 buckets have Block Public Access enabled (all four settings)
- CORS locked to exact CloudFront domain — no wildcards
