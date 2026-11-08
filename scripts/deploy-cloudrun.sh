#!/usr/bin/env bash
# Deploy MICHI? (web + API) to Cloud Run. Run in Cloud Shell from the repo root:
#   bash scripts/deploy-cloudrun.sh <PROJECT_ID> [REGION]
# Creates billable resources. Read docs/DEPLOY.md before the first run.
set -euo pipefail

PROJECT_ID="${1:?usage: bash scripts/deploy-cloudrun.sh <PROJECT_ID> [REGION]}"
REGION="${2:-asia-northeast1}"
SERVICE=michi
SA_NAME=michi-run
SA="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud config set project "$PROJECT_ID"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  aiplatform.googleapis.com secretmanager.googleapis.com routes.googleapis.com maps-backend.googleapis.com

if ! gcloud iam service-accounts describe "$SA" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SA_NAME" --display-name "MICHI Cloud Run"
fi
# Gemini on Vertex AI only. No other roles.
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:${SA}" \
  --role roles/aiplatform.user --condition None >/dev/null

SECRETS=()
use_secret() { # <secret name> <env var> <message when missing>
  if gcloud secrets describe "$1" >/dev/null 2>&1; then
    gcloud secrets add-iam-policy-binding "$1" --member "serviceAccount:${SA}" \
      --role roles/secretmanager.secretAccessor >/dev/null
    SECRETS+=("$2=$1:latest")
  else
    echo "$3"
  fi
}
use_secret routes-api-key GOOGLE_ROUTES_API_KEY "routes-api-key がないため、Google Routes なしでデプロイします(体験デモとGeminiは動きます)。"
use_secret maps-browser-key GOOGLE_MAPS_BROWSER_KEY "maps-browser-key がないため、Web版の地図は略図になります。"
SECRET_ARGS=()
if [ "${#SECRETS[@]}" -gt 0 ]; then SECRET_ARGS=(--set-secrets "$(IFS=,; echo "${SECRETS[*]}")"); fi

# max-instances=1 keeps the in-process rate limits meaningful and caps cost.
gcloud run deploy "$SERVICE" --source . --region "$REGION" \
  --service-account "$SA" --allow-unauthenticated \
  --max-instances 1 --memory 512Mi --cpu 1 --timeout 30 \
  --set-env-vars GEMINI_MODEL=gemini-3.8-flash,GEMINI_LOCATION=global,MAX_GEMINI_CALLS_PER_DAY=500,MAX_GOOGLE_CALLS_PER_DAY=200 \
  "${SECRET_ARGS[@]}"

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format 'value(status.url)')"
echo "デプロイ先: $URL"
curl -s "$URL/health"; echo
