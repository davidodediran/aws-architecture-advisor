#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${1:-dev}"
REGION="${AWS_REGION:-us-east-1}"

echo "=== AWS Architecture Advisor - WA Framework Document Upload ==="
echo "Environment: $ENVIRONMENT"
echo "Region: $REGION"

# Get stack outputs
STACK_NAME="arch-advisor-knowledge-base-${ENVIRONMENT}"

get_output() {
  aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" \
    --output text 2>/dev/null || echo ""
}

BUCKET_NAME=$(get_output "WaDocsBucketName")

if [ -z "$BUCKET_NAME" ]; then
  echo "Error: Could not find stack outputs. Deploy infra/knowledge-base-stack.yaml first."
  exit 1
fi

# KB and DS IDs come from environment variables (set after running setup-knowledge-base.sh)
KB_ID="${KNOWLEDGE_BASE_ID:-}"
DS_ID="${DATA_SOURCE_ID:-}"

if [ -z "$KB_ID" ] || [ -z "$DS_ID" ]; then
  echo "Error: KNOWLEDGE_BASE_ID and DATA_SOURCE_ID environment variables are required."
  echo "Run scripts/setup-knowledge-base.sh first, then export the IDs it prints."
  exit 1
fi

echo "Bucket: $BUCKET_NAME"
echo "Knowledge Base: $KB_ID"
echo "Data Source: $DS_ID"

# Download WA Framework documentation
WA_DOCS_DIR=$(mktemp -d)
trap 'rm -rf "$WA_DOCS_DIR"' EXIT

echo ""
echo "Downloading Well-Architected Framework documentation..."

WA_PILLARS=(
  "operational-excellence"
  "security"
  "reliability"
  "performance-efficiency"
  "cost-optimization"
  "sustainability"
)

for PILLAR in "${WA_PILLARS[@]}"; do
  echo "  Fetching: $PILLAR pillar..."
  curl -sL "https://docs.aws.amazon.com/wellarchitected/latest/framework/${PILLAR}-pillar.html" \
    -o "$WA_DOCS_DIR/${PILLAR}-pillar.html" 2>/dev/null || true

  curl -sL "https://docs.aws.amazon.com/wellarchitected/latest/framework/${PILLAR}.html" \
    -o "$WA_DOCS_DIR/${PILLAR}-best-practices.html" 2>/dev/null || true
done

# Download general framework overview
curl -sL "https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html" \
  -o "$WA_DOCS_DIR/framework-overview.html" 2>/dev/null || true

echo ""
echo "Uploading documents to S3..."
aws s3 sync "$WA_DOCS_DIR/" "s3://${BUCKET_NAME}/wa-framework/" \
  --region "$REGION"

# Start Bedrock ingestion job
echo ""
echo "Starting Bedrock Knowledge Base ingestion job..."
INGESTION_JOB=$(aws bedrock-agent start-ingestion-job \
  --knowledge-base-id "$KB_ID" \
  --data-source-id "$DS_ID" \
  --region "$REGION" \
  --output json)

JOB_ID=$(echo "$INGESTION_JOB" | python3 -c "import sys,json; print(json.load(sys.stdin)['ingestionJob']['ingestionJobId'])")
echo "Ingestion job started: $JOB_ID"

# Monitor ingestion job
echo "Waiting for ingestion to complete..."
while true; do
  STATUS_JSON=$(aws bedrock-agent get-ingestion-job \
    --knowledge-base-id "$KB_ID" \
    --data-source-id "$DS_ID" \
    --ingestion-job-id "$JOB_ID" \
    --region "$REGION" \
    --output json)

  STATUS=$(echo "$STATUS_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['ingestionJob']['status'])")

  case "$STATUS" in
    COMPLETE)
      echo "Ingestion complete!"
      STATS=$(echo "$STATUS_JSON" | python3 -c "
import sys, json
s = json.load(sys.stdin)['ingestionJob'].get('statistics', {})
print(f\"  Documents scanned: {s.get('numberOfDocumentsScanned', 'N/A')}\")
print(f\"  Documents indexed: {s.get('numberOfNewDocumentsIndexed', 'N/A')}\")
print(f\"  Documents failed:  {s.get('numberOfDocumentsFailed', 'N/A')}\")
")
      echo "$STATS"
      break
      ;;
    FAILED)
      echo "Error: Ingestion job failed."
      echo "$STATUS_JSON" | python3 -c "
import sys, json
reasons = json.load(sys.stdin)['ingestionJob'].get('failureReasons', [])
for r in reasons: print(f'  Reason: {r}')
" 2>/dev/null || true
      exit 1
      ;;
    *)
      echo "  Status: $STATUS ..."
      sleep 10
      ;;
  esac
done

echo ""
echo "WA Framework document upload and ingestion complete!"
echo ""
echo "Next steps:"
echo "  1. Set KNOWLEDGE_BASE_ID=$KB_ID in your backend environment"
echo "  2. Deploy the backend: cd backend && sam deploy"
