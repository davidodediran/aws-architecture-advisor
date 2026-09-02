#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${1:-prod}"
STACK_NAME="aws-arch-advisor-frontend-${ENVIRONMENT}"

echo "=== AWS Architecture Advisor - Frontend Deployment ==="
echo "Environment: ${ENVIRONMENT}"
echo ""

BUCKET_NAME=$(aws cloudformation describe-stacks \
  --stack-name "${STACK_NAME}" \
  --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue" \
  --output text)

DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
  --stack-name "${STACK_NAME}" \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" \
  --output text)

if [ -z "${BUCKET_NAME}" ] || [ -z "${DISTRIBUTION_ID}" ]; then
  echo "ERROR: Could not retrieve stack outputs. Is the frontend stack deployed?"
  exit 1
fi

echo "S3 Bucket:      ${BUCKET_NAME}"
echo "Distribution:   ${DISTRIBUTION_ID}"
echo ""

echo "--- Building frontend ---"
npm run build --workspace=frontend

echo ""
echo "--- Syncing to S3 ---"

aws s3 sync frontend/dist/ "s3://${BUCKET_NAME}/" \
  --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "index.html" \
  --exclude "*.json"

aws s3 cp frontend/dist/index.html "s3://${BUCKET_NAME}/index.html" \
  --cache-control "no-cache, no-store, must-revalidate"

if [ -f frontend/dist/manifest.json ]; then
  aws s3 cp frontend/dist/manifest.json "s3://${BUCKET_NAME}/manifest.json" \
    --cache-control "no-cache"
fi

echo ""
echo "--- Invalidating CloudFront cache ---"

INVALIDATION_ID=$(aws cloudfront create-invalidation \
  --distribution-id "${DISTRIBUTION_ID}" \
  --paths "/index.html" "/*.json" \
  --query "Invalidation.Id" \
  --output text)

echo "Invalidation created: ${INVALIDATION_ID}"

echo ""
echo "--- Waiting for invalidation to complete ---"
aws cloudfront wait invalidation-completed \
  --distribution-id "${DISTRIBUTION_ID}" \
  --id "${INVALIDATION_ID}"

WEBSITE_URL=$(aws cloudformation describe-stacks \
  --stack-name "${STACK_NAME}" \
  --query "Stacks[0].Outputs[?OutputKey=='WebsiteUrl'].OutputValue" \
  --output text)

echo ""
echo "=== Deployment complete ==="
echo "URL: ${WEBSITE_URL}"
