#!/usr/bin/env bash
# Deploy MICHI? (web + API) to Cloud Run. Run in Cloud Shell from the repo root:
#   bash scripts/deploy-cloudrun.sh <PROJECT_ID> [REGION]
# Creates billable resources. Read docs/DEPLOY.md before the first run.
#
# The first run must be done by a project Owner (it grants IAM roles). After
# that, an Editor can redeploy: every grant is checked first and only added
# when missing, so nothing here needs Owner rights once the setup exists.
set -euo pipefail

PROJECT_ID="${1:?usage: bash scripts/deploy-cloudrun.sh <PROJECT_ID> [REGION]}"
REGION="${2:-asia-northeast1}"
SERVICE=michi
SA_NAME=michi-run
SA="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

owner_needed() { # <what> <command an Owner should run once>
  echo ""
  echo "[止めました] $1 にはオーナー権限が必要です。"
  echo "プロジェクトのオーナーに、Cloud Shellで次を一度だけ実行してもらってください:"
  echo "  $2"
  echo "そのあと、もう一度このスクリプトを実行してください。"
  exit 1
}

gcloud config set project "$PROJECT_ID"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  aiplatform.googleapis.com secretmanager.googleapis.com routes.googleapis.com maps-backend.googleapis.com

if ! gcloud iam service-accounts describe "$SA" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SA_NAME" --display-name "MICHI Cloud Run"
fi

# Gemini on Vertex AI only. No other roles.
if [ -z "$(gcloud projects get-iam-policy "$PROJECT_ID" --flatten='bindings[].members' \
    --filter="bindings.role=roles/aiplatform.user AND bindings.members=\"serviceAccount:${SA}\"" --format='value(bindings.role)')" ]; then
  GRANT="gcloud projects add-iam-policy-binding ${PROJECT_ID} --member serviceAccount:${SA} --role roles/aiplatform.user --condition None"
  $GRANT >/dev/null || owner_needed "Vertex AI の権限付与" "$GRANT"
fi

SECRETS=()
use_secret() { # <secret name> <env var> <message when missing>
  if ! gcloud secrets describe "$1" >/dev/null 2>&1; then
    echo "$3"
    return
  fi
  if [ -z "$(gcloud secrets get-iam-policy "$1" --flatten='bindings[].members' \
      --filter="bindings.role=roles/secretmanager.secretAccessor AND bindings.members=\"serviceAccount:${SA}\"" --format='value(bindings.role)')" ]; then
    local grant="gcloud secrets add-iam-policy-binding $1 --member serviceAccount:${SA} --role roles/secretmanager.secretAccessor"
    $grant >/dev/null || owner_needed "$1 を読む権限の付与" "$grant"
  fi
  SECRETS+=("$2=$1:latest")
}
use_secret routes-api-key GOOGLE_ROUTES_API_KEY "routes-api-key がないため、Google Routes なしでデプロイします(体験デモとGeminiは動きます)。"
use_secret maps-browser-key GOOGLE_MAPS_BROWSER_KEY "maps-browser-key がないため、Web版の地図は略図になります。"
SECRET_ARGS=()
if [ "${#SECRETS[@]}" -gt 0 ]; then SECRET_ARGS=(--set-secrets "$(IFS=,; echo "${SECRETS[*]}")"); fi

# Public access (allUsers may invoke) is set once. When the service is already
# public, omit the flag so the deploy does not try to rewrite the IAM policy.
ACCESS_ARGS=(--allow-unauthenticated)
if gcloud run services describe "$SERVICE" --region "$REGION" >/dev/null 2>&1 \
  && [ -n "$(gcloud run services get-iam-policy "$SERVICE" --region "$REGION" --flatten='bindings[].members' \
      --filter='bindings.role=roles/run.invoker AND bindings.members=allUsers' --format='value(bindings.role)')" ]; then
  ACCESS_ARGS=()
fi

# max-instances=1 keeps the in-process rate limits meaningful and caps cost.
gcloud run deploy "$SERVICE" --source . --region "$REGION" \
  --service-account "$SA" "${ACCESS_ARGS[@]}" \
  --max-instances 1 --memory 512Mi --cpu 1 --timeout 30 \
  --set-env-vars GEMINI_MODEL=gemini-3.8-flash,GEMINI_LOCATION=global,MAX_GEMINI_CALLS_PER_DAY=500,MAX_GOOGLE_CALLS_PER_DAY=200 \
  "${SECRET_ARGS[@]}"

if [ -z "$(gcloud run services get-iam-policy "$SERVICE" --region "$REGION" --flatten='bindings[].members' \
    --filter='bindings.role=roles/run.invoker AND bindings.members=allUsers' --format='value(bindings.role)')" ]; then
  owner_needed "URLを誰でも開けるようにする設定" "gcloud run services add-iam-policy-binding ${SERVICE} --region ${REGION} --member allUsers --role roles/run.invoker"
fi

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format 'value(status.url)')"
echo "デプロイ先: $URL"
curl -s "$URL/health"; echo
