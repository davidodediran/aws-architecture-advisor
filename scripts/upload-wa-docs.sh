#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${1:-prod}"
STACK_NAME="aws-arch-advisor-kb-${ENVIRONMENT}"
DOCS_DIR="${2:-/tmp/wa-docs}"

echo "=== AWS Architecture Advisor - WA Framework Docs Upload ==="
echo "Environment: ${ENVIRONMENT}"
echo ""

BUCKET_NAME=$(aws cloudformation describe-stacks \
  --stack-name "${STACK_NAME}" \
  --query "Stacks[0].Outputs[?OutputKey=='WADocsBucketName'].OutputValue" \
  --output text)

KB_ID=$(aws cloudformation describe-stacks \
  --stack-name "${STACK_NAME}" \
  --query "Stacks[0].Outputs[?OutputKey=='KnowledgeBaseId'].OutputValue" \
  --output text)

DS_ID=$(aws cloudformation describe-stacks \
  --stack-name "${STACK_NAME}" \
  --query "Stacks[0].Outputs[?OutputKey=='DataSourceId'].OutputValue" \
  --output text)

if [ -z "${BUCKET_NAME}" ] || [ -z "${KB_ID}" ] || [ -z "${DS_ID}" ]; then
  echo "ERROR: Could not retrieve stack outputs. Is the knowledge-base stack deployed?"
  exit 1
fi

echo "S3 Bucket:       ${BUCKET_NAME}"
echo "Knowledge Base:  ${KB_ID}"
echo "Data Source:     ${DS_ID}"
echo ""

mkdir -p "${DOCS_DIR}"

WA_PILLAR_DOCS=(
  "wellarchitected-operational-excellence-pillar"
  "wellarchitected-security-pillar"
  "wellarchitected-reliability-pillar"
  "wellarchitected-performance-efficiency-pillar"
  "wellarchitected-cost-optimization-pillar"
  "wellarchitected-sustainability-pillar"
  "wellarchitected-framework"
)

echo "--- Downloading Well-Architected Framework documents ---"

for doc in "${WA_PILLAR_DOCS[@]}"; do
  echo "  Downloading: ${doc}.pdf"
  curl -sS -L \
    "https://docs.aws.amazon.com/pdfs/wellarchitected/latest/${doc}/${doc}.pdf" \
    -o "${DOCS_DIR}/${doc}.pdf" || {
      echo "  WARNING: Failed to download ${doc}.pdf, skipping"
      continue
    }
done

DOWNLOADED=$(find "${DOCS_DIR}" -name "*.pdf" -type f | wc -l)
echo ""
echo "Downloaded ${DOWNLOADED} documents"

if [ "${DOWNLOADED}" -eq 0 ]; then
  echo "ERROR: No documents downloaded. Check network connectivity."
  exit 1
fi

echo ""
echo "--- Uploading documents to S3 ---"

aws s3 sync "${DOCS_DIR}/" "s3://${BUCKET_NAME}/wa-framework/" \
  --exclude "*" \
  --include "*.pdf"

echo ""
echo "--- Starting Knowledge Base ingestion job ---"

INGESTION_JOB=$(aws bedrock-agent start-ingestion-job \
  --knowledge-base-id "${KB_ID}" \
  --data-source-id "${DS_ID}" \
  --query "ingestionJob.ingestionJobId" \
  --output text)

echo "Ingestion job started: ${INGESTION_JOB}"

echo ""
echo "--- Waiting for ingestion to complete ---"

while true; do
  STATUS=$(aws bedrock-agent get-ingestion-job \
    --knowledge-base-id "${KB_ID}" \
    --data-source-id "${DS_ID}" \
    --ingestion-job-id "${INGESTION_JOB}" \
    --query "ingestionJob.status" \
    --output text)

  echo "  Status: ${STATUS}"

  if [ "${STATUS}" = "COMPLETE" ]; then
    break
  elif [ "${STATUS}" = "FAILED" ]; then
    echo "ERROR: Ingestion job failed"
    aws bedrock-agent get-ingestion-job \
      --knowledge-base-id "${KB_ID}" \
      --data-source-id "${DS_ID}" \
      --ingestion-job-id "${INGESTION_JOB}" \
      --query "ingestionJob.failureReasons" \
      --output text
    exit 1
  fi

  sleep 15
done

echo ""
echo "=== Upload and ingestion complete ==="
echo "Knowledge Base ${KB_ID} is ready for queries"
