#!/usr/bin/env bash
# One-time setup so GitHub Actions can deploy matagochi-api to Cloud Run without a key file.
# Run in Cloud Shell:  bash api/scripts/setup-github-deploy.sh
# Safe to run again: existing pieces are kept.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-youtube-quiz-mvp}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-matagochi-api}"
REPO="165cm/matagochi"
SA_NAME="github-deploy"
POOL="github"
PROVIDER="matagochi"

gcloud config set project "$PROJECT_ID" >/dev/null
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
SA="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
RUNTIME_SA="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(spec.template.spec.serviceAccountName)' 2>/dev/null || true)"
RUNTIME_SA="${RUNTIME_SA:-$COMPUTE_SA}"

echo "1/5 必要なAPIを有効にしています…"
gcloud services enable iamcredentials.googleapis.com sts.googleapis.com run.googleapis.com \
  cloudbuild.googleapis.com artifactregistry.googleapis.com >/dev/null

echo "2/5 デプロイ用のサービスアカウントを用意しています…"
gcloud iam service-accounts describe "$SA" >/dev/null 2>&1 || \
  gcloud iam service-accounts create "$SA_NAME" --display-name="GitHub Actions deploy (matagochi-api)" >/dev/null

echo "3/5 デプロイに必要な権限を付けています…"
for role in roles/run.admin roles/cloudbuild.builds.editor roles/artifactregistry.admin roles/storage.admin roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SA" --role="$role" --condition=None >/dev/null
done
for target in $(printf '%s\n' "$RUNTIME_SA" "$COMPUTE_SA" | sort -u); do
  gcloud iam service-accounts add-iam-policy-binding "$target" --member="serviceAccount:$SA" --role=roles/iam.serviceAccountUser >/dev/null
done

echo "4/5 GitHubからのログイン（Workload Identity）を用意しています…"
gcloud iam workload-identity-pools describe "$POOL" --location=global >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools create "$POOL" --location=global --display-name="GitHub Actions" >/dev/null
gcloud iam workload-identity-pools providers describe "$PROVIDER" --location=global --workload-identity-pool="$POOL" >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --location=global --workload-identity-pool="$POOL" \
    --display-name="matagochi main" --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition="assertion.repository=='${REPO}' && assertion.ref=='refs/heads/main'" >/dev/null

echo "5/5 このリポジトリのmainブランチだけにデプロイを許可しています…"
gcloud iam service-accounts add-iam-policy-binding "$SA" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${REPO}" >/dev/null

echo
echo "完了しました。"
echo "  プロジェクト番号: ${PROJECT_NUMBER}（.github/workflows/deploy-api.yml の PROJECT_NUMBER と同じか確認）"
echo "  デプロイ用アカウント: ${SA}"
