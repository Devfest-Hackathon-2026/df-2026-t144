#!/usr/bin/env bash
# Deploy MICHI? (web + API) to Cloud Run. Run in Cloud Shell from the repo root:
#   bash scripts/deploy-cloudrun.sh <PROJECT_ID> [REGION]
# Creates billable resources. Read docs/DEPLOY.md before the first run.
#
# The first run must be done by a project Owner (it grants IAM roles). After
# that, an Editor can redeploy: every grant is checked first and only added
# when missing, so nothing here needs Owner rights once the setup exists.
set -euo pipefail

PROJECT_ID="${1:?usage: bash scripts/deploy-cloudrun.sh <PROJECT_ID> [REGION] [PAID_API_UNTIL]}"
REGION="${2:-asia-northeast1}"
# Paid APIs (Gemini, Routes, the browser Maps key) stop at this moment; the demo
# and fixed text keep working. Extending it is a deliberate redeploy.
PAID_API_UNTIL="${3:-2026-11-14T23:59:59+09:00}"
# Per instance and day; the server never goes above 50 whatever is set here.
MAX_PAID_CALLS_PER_DAY=50
SERVICE=michi
SA_NAME=michi-run
SA="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
# Cloud Build runs `--source` builds as this account. New projects no longer
# give the default build account enough rights, so the build gets its own.
BUILD_SA_NAME=michi-build
BUILD_SA="${BUILD_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
GRANTED=0

if ! [[ "$PROJECT_ID" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]]; then
  echo "プロジェクトIDの形式ではありません: $PROJECT_ID(プロジェクト名ではなくIDを指定してください)"
  exit 1
fi
if ! [[ "$PAID_API_UNTIL" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(Z|[+-][0-9]{2}:[0-9]{2})$ ]]; then
  echo "PAID_API_UNTIL は 2026-11-14T23:59:59+09:00 の形式で指定してください: $PAID_API_UNTIL"
  exit 1
fi
echo "有料APIの利用期限: $PAID_API_UNTIL(Gemini・Routesはそれぞれ1日${MAX_PAID_CALLS_PER_DAY}回まで)"

owner_needed() { # <what> <command an Owner should run once>
  echo ""
  echo "[止めました] $1 にはオーナー権限が必要です。"
  echo "プロジェクトのオーナーに、Cloud Shellで次を一度だけ実行してもらってください:"
  echo "  $2"
  echo "そのあと、もう一度このスクリプトを実行してください。"
  exit 1
}

gcloud config set project "$PROJECT_ID"

# Without a linked billing account every step below fails with unclear errors.
# Best-effort: an empty answer (no right to read billing) just continues.
if [ "$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingEnabled)' 2>/dev/null || true)" = "False" ]; then
  echo "[止めました] $PROJECT_ID に請求先アカウントがリンクされていません。"
  echo "「お支払い」で、クレジットを適用した請求先アカウントをこのプロジェクトにリンクしてから、もう一度実行してください。"
  exit 1
fi
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  aiplatform.googleapis.com secretmanager.googleapis.com routes.googleapis.com maps-backend.googleapis.com

ensure_sa() { # <name> <display name>
  if ! gcloud iam service-accounts describe "$1@${PROJECT_ID}.iam.gserviceaccount.com" >/dev/null 2>&1; then
    gcloud iam service-accounts create "$1" --display-name "$2"
  fi
}
ensure_project_role() { # <service account> <role> <what>
  if [ -z "$(gcloud projects get-iam-policy "$PROJECT_ID" --flatten='bindings[].members' \
      --filter="bindings.role=$2 AND bindings.members=\"serviceAccount:$1\"" --format='value(bindings.role)')" ]; then
    local grant="gcloud projects add-iam-policy-binding ${PROJECT_ID} --member serviceAccount:$1 --role $2 --condition None"
    $grant >/dev/null || owner_needed "$3" "$grant"
    GRANTED=1
  fi
}

ensure_sa "$SA_NAME" "MICHI Cloud Run"
# Gemini on Vertex AI only. No other roles.
ensure_project_role "$SA" roles/aiplatform.user "Vertex AI の権限付与"

BUILD_ARGS=()
if gcloud run deploy --help 2>/dev/null | grep -q -- '--build-service-account'; then
  ensure_sa "$BUILD_SA_NAME" "MICHI Cloud Build"
  # run.builder: read the uploaded source, push the image, write build logs.
  ensure_project_role "$BUILD_SA" roles/run.builder "Cloud Build の権限付与"
  BUILD_ARGS=(--build-service-account "projects/${PROJECT_ID}/serviceAccounts/${BUILD_SA}")
else
  echo "この gcloud は --build-service-account に未対応です。Cloud Shellか gcloud components update 後の環境で実行してください。既定のビルド用アカウントで続けます。"
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
    GRANTED=1
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

# New IAM grants take a minute to reach Cloud Build and Cloud Run.
if [ "$GRANTED" = 1 ]; then echo "付与した権限の反映を60秒待ちます。"; sleep 60; fi

# max-instances=1 keeps the in-process rate limits meaningful and caps cost.
gcloud run deploy "$SERVICE" --source . --region "$REGION" \
  --service-account "$SA" "${BUILD_ARGS[@]}" "${ACCESS_ARGS[@]}" \
  --max-instances 1 --memory 512Mi --cpu 1 --timeout 30 \
  --set-env-vars "GEMINI_MODEL=gemini-3.8-flash,GEMINI_LOCATION=global,PAID_API_UNTIL=${PAID_API_UNTIL},MAX_GEMINI_CALLS_PER_DAY=${MAX_PAID_CALLS_PER_DAY},MAX_GOOGLE_CALLS_PER_DAY=${MAX_PAID_CALLS_PER_DAY}" \
  "${SECRET_ARGS[@]}"

if [ -z "$(gcloud run services get-iam-policy "$SERVICE" --region "$REGION" --flatten='bindings[].members' \
    --filter='bindings.role=roles/run.invoker AND bindings.members=allUsers' --format='value(bindings.role)')" ]; then
  owner_needed "URLを誰でも開けるようにする設定" "gcloud run services add-iam-policy-binding ${SERVICE} --region ${REGION} --member allUsers --role roles/run.invoker"
fi

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format 'value(status.url)')"
echo "デプロイ先: $URL"
curl -s "$URL/health"; echo
