#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${1:-dev}"
REGION="${AWS_REGION:-us-east-1}"

echo "=== AWS Architecture Advisor - WA Framework Document Upload ==="
echo "Environment: $ENVIRONMENT"
echo "Region: $REGION"

# Get stack outputs
STACK_NAME="arch-advisor-knowledge-base-${ENVIRONMENT}"

BUCKET_NAME=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='WaDocsBucketName'].OutputValue" \
  --output text 2>/dev/null || echo "")

if [ -z "$BUCKET_NAME" ]; then
  echo "Error: Could not find stack. Deploy infra/knowledge-base-stack.yaml first."
  exit 1
fi

echo "Bucket: $BUCKET_NAME"

# Download WA Framework documentation
WA_DOCS_DIR="/tmp/wa-framework-docs"
mkdir -p "$WA_DOCS_DIR"

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

# Cleanup
rm -rf "$WA_DOCS_DIR"

echo ""
echo "WA Framework document upload complete!"
echo ""
echo "Next steps:"
echo "  1. Set WA_DOCS_BUCKET=$BUCKET_NAME in your backend environment"
echo "  2. Deploy the backend: cd backend && sam deploy"
