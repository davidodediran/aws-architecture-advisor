#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${1:-dev}"
REGION="${AWS_REGION:-eu-west-1}"

echo "=== AWS Architecture Advisor - Bedrock Knowledge Base Setup ==="
echo "Environment: $ENVIRONMENT"
echo "Region: $REGION"

STACK_NAME="arch-advisor-knowledge-base-${ENVIRONMENT}"

get_output() {
  aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" \
    --output text 2>/dev/null || echo ""
}

echo ""
echo "Reading stack outputs from $STACK_NAME..."

DOCS_BUCKET_NAME=$(get_output "WaDocsBucketName")
DOCS_BUCKET_ARN=$(get_output "WaDocsBucketArn")
KB_ROLE_ARN=$(get_output "KnowledgeBaseRoleArn")

if [ -z "$DOCS_BUCKET_NAME" ] || [ -z "$DOCS_BUCKET_ARN" ] || [ -z "$KB_ROLE_ARN" ]; then
  echo "Error: Could not find stack outputs. Deploy infra/knowledge-base-stack.yaml first:"
  echo "  aws cloudformation deploy \\"
  echo "    --template-file infra/knowledge-base-stack.yaml \\"
  echo "    --stack-name $STACK_NAME \\"
  echo "    --capabilities CAPABILITY_NAMED_IAM \\"
  echo "    --parameter-overrides Environment=$ENVIRONMENT"
  exit 1
fi

echo "  Docs bucket:   $DOCS_BUCKET_NAME"
echo "  Docs ARN:      $DOCS_BUCKET_ARN"
echo "  KB Role ARN:   $KB_ROLE_ARN"

VECTOR_BUCKET_NAME="arch-advisor-vectors-${ENVIRONMENT}"
VECTOR_INDEX_NAME="wa-framework-${ENVIRONMENT}"

echo ""
echo "Creating S3 Vectors bucket: $VECTOR_BUCKET_NAME..."
VECTOR_BUCKET_RESPONSE=$(aws s3vectors create-bucket \
  --bucket-name "$VECTOR_BUCKET_NAME" \
  --region "$REGION" \
  --output json 2>&1) || {
  if echo "$VECTOR_BUCKET_RESPONSE" | grep -q "AlreadyExists"; then
    echo "  S3 Vectors bucket already exists, continuing..."
    VECTOR_BUCKET_RESPONSE=$(aws s3vectors get-bucket \
      --bucket-name "$VECTOR_BUCKET_NAME" \
      --region "$REGION" \
      --output json)
  else
    echo "Error creating S3 Vectors bucket: $VECTOR_BUCKET_RESPONSE"
    exit 1
  fi
}
VECTOR_BUCKET_ARN=$(echo "$VECTOR_BUCKET_RESPONSE" | python3 -c "import sys,json; data=json.load(sys.stdin); print(data.get('bucket',data).get('bucketArn', data.get('arn','')))")
echo "  Vector bucket ARN: $VECTOR_BUCKET_ARN"

echo ""
echo "Creating vector index: $VECTOR_INDEX_NAME..."
VECTOR_INDEX_RESPONSE=$(aws s3vectors create-index \
  --bucket-name "$VECTOR_BUCKET_NAME" \
  --index-name "$VECTOR_INDEX_NAME" \
  --data-type "vector" \
  --dimension 1024 \
  --distance-metric "cosine" \
  --region "$REGION" \
  --output json 2>&1) || {
  if echo "$VECTOR_INDEX_RESPONSE" | grep -q "AlreadyExists"; then
    echo "  Vector index already exists, continuing..."
  else
    echo "Error creating vector index: $VECTOR_INDEX_RESPONSE"
    exit 1
  fi
}
echo "  Vector index created/verified: $VECTOR_INDEX_NAME"

EMBEDDING_MODEL_ARN="arn:aws:bedrock:${REGION}::foundation-model/amazon.titan-embed-text-v2:0"

echo ""
echo "Creating Bedrock Knowledge Base..."
KB_RESPONSE=$(aws bedrock-agent create-knowledge-base \
  --name "arch-advisor-wa-kb-${ENVIRONMENT}" \
  --description "AWS Well-Architected Framework knowledge base for architecture advisor" \
  --role-arn "$KB_ROLE_ARN" \
  --knowledge-base-configuration "{
    \"type\": \"VECTOR\",
    \"vectorKnowledgeBaseConfiguration\": {
      \"embeddingModelArn\": \"$EMBEDDING_MODEL_ARN\"
    }
  }" \
  --storage-configuration '{
    "type": "S3_VECTORS",
    "s3VectorsConfiguration": {
      "vectorBucketArn": "'"$VECTOR_BUCKET_ARN"'",
      "indexName": "'"$VECTOR_INDEX_NAME"'"
    }
  }' \
  --region "$REGION" \
  --output json)

KB_ID=$(echo "$KB_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['knowledgeBase']['knowledgeBaseId'])")
echo "Knowledge Base created: $KB_ID"

echo ""
echo "Creating Data Source..."
DS_RESPONSE=$(aws bedrock-agent create-data-source \
  --knowledge-base-id "$KB_ID" \
  --name "wa-framework-docs-${ENVIRONMENT}" \
  --data-source-configuration "{
    \"type\": \"S3\",
    \"s3Configuration\": {
      \"bucketArn\": \"$DOCS_BUCKET_ARN\",
      \"inclusionPrefixes\": [\"wa-framework/\"]
    }
  }" \
  --region "$REGION" \
  --output json)

DS_ID=$(echo "$DS_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['dataSource']['dataSourceId'])")
echo "Data Source created: $DS_ID"

echo ""
echo "========================================="
echo "  Knowledge Base ID: $KB_ID"
echo "  Data Source ID:    $DS_ID"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Export environment variables:"
echo "     export KNOWLEDGE_BASE_ID=$KB_ID"
echo "     export DATA_SOURCE_ID=$DS_ID"
echo "  2. Upload WA Framework docs:"
echo "     ./scripts/upload-wa-docs.sh $ENVIRONMENT"
echo "  3. If your backend runs in a different region, also set BEDROCK_REGION=$REGION"
echo "  4. Deploy the backend:"
echo "     cd backend && sam deploy"
