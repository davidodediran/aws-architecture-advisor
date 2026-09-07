#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${1:-dev}"
AWS_PROFILE="${AWS_PROFILE:-certpath-sandbox}"
AWS_REGION="${AWS_REGION:-eu-west-1}"

AWS_OPTS="--profile ${AWS_PROFILE} --region ${AWS_REGION}"

FRONTEND_STACK_NAME="arch-advisor-frontend-${ENVIRONMENT}"
BACKEND_STACK_NAME="arch-advisor-backend-${ENVIRONMENT}"

echo "=== AWS Architecture Advisor - Frontend Deployment ==="
echo "Environment: ${ENVIRONMENT}"
echo "AWS Profile: ${AWS_PROFILE}"
echo "AWS Region:  ${AWS_REGION}"
echo ""

BUCKET_NAME=$(aws cloudformation describe-stacks ${AWS_OPTS} \
  --stack-name "${BACKEND_STACK_NAME}" \
  --query "Stacks[0].Outputs[?OutputKey=='FrontendBucketName'].OutputValue" \
  --output text 2>/dev/null || echo "")

if [ -z "${BUCKET_NAME}" ] || [ "${BUCKET_NAME}" = "None" ]; then
  echo "Backend stack bucket not found, checking frontend stack..."
  BUCKET_NAME=$(aws cloudformation describe-stacks ${AWS_OPTS} \
    --stack-name "${FRONTEND_STACK_NAME}" \
    --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue" \
    --output text 2>/dev/null || echo "")
fi

if [ -z "${BUCKET_NAME}" ] || [ "${BUCKET_NAME}" = "None" ]; then
  echo "ERROR: Could not retrieve bucket name from either stack."
  echo "Set BUCKET_NAME env var or deploy the frontend infrastructure first."
  exit 1
fi

DISTRIBUTION_ID=$(aws cloudfront list-distributions ${AWS_OPTS} \
  --query "DistributionList.Items[?Origins.Items[?DomainName=='${BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com']].Id | [0]" \
  --output text 2>/dev/null || echo "")

if [ -z "${DISTRIBUTION_ID}" ] || [ "${DISTRIBUTION_ID}" = "None" ]; then
  DISTRIBUTION_ID=$(aws cloudformation describe-stacks ${AWS_OPTS} \
    --stack-name "${FRONTEND_STACK_NAME}" \
    --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" \
    --output text 2>/dev/null || echo "")
fi

echo "S3 Bucket:      ${BUCKET_NAME}"
echo "Distribution:   ${DISTRIBUTION_ID:-none}"
echo ""

echo "--- Building frontend ---"
npm run build --workspace=frontend

echo ""
echo "--- Syncing to S3 ---"

aws s3 sync frontend/dist/ "s3://${BUCKET_NAME}/" ${AWS_OPTS} \
  --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "index.html" \
  --exclude "*.json"

aws s3 cp frontend/dist/index.html "s3://${BUCKET_NAME}/index.html" ${AWS_OPTS} \
  --cache-control "no-cache, no-store, must-revalidate" \
  --content-type "text/html"

if [ -f frontend/dist/manifest.json ]; then
  aws s3 cp frontend/dist/manifest.json "s3://${BUCKET_NAME}/manifest.json" ${AWS_OPTS} \
    --cache-control "no-cache"
fi

echo ""

if [ -n "${DISTRIBUTION_ID}" ] && [ "${DISTRIBUTION_ID}" != "None" ]; then
  echo "--- Invalidating CloudFront cache ---"
  INVALIDATION_ID=$(aws cloudfront create-invalidation ${AWS_OPTS} \
    --distribution-id "${DISTRIBUTION_ID}" \
    --paths "/index.html" "/*.json" \
    --query "Invalidation.Id" \
    --output text)

  echo "Invalidation created: ${INVALIDATION_ID}"
  echo ""
  echo "--- Waiting for invalidation to complete ---"
  aws cloudfront wait invalidation-completed ${AWS_OPTS} \
    --distribution-id "${DISTRIBUTION_ID}" \
    --id "${INVALIDATION_ID}"

  WEBSITE_URL="https://$(aws cloudfront get-distribution ${AWS_OPTS} \
    --id "${DISTRIBUTION_ID}" \
    --query "Distribution.DomainName" \
    --output text)"
else
  echo "No CloudFront distribution found. Using S3 bucket URL."
  WEBSITE_URL="http://${BUCKET_NAME}.s3-website-${AWS_REGION}.amazonaws.com"
fi

echo ""
echo "=== Deployment complete ==="
echo "URL: ${WEBSITE_URL}"
