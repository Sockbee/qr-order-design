# GCP 배포 가이드

이 문서는 Google Cloud를 처음 사용하는 사람이 빈 로컬 환경에서 `staging` 백엔드를
처음 배포하는 경우를 기준으로 작성했습니다. 인프라는 Terraform으로 관리하고,
애플리케이션은 Cloud Build에서 빌드한 뒤 Cloud Run에 배포합니다.

> **비용 주의:** `terraform apply`를 실행하면 유료 리소스가 만들어집니다. 특히 이
> 구성은 Cloud SQL과 Cloud Run 최소 인스턴스 1개를 사용하므로 요청이 없어도 비용이
> 발생할 수 있습니다. 적용 전에 결제 예산 알림을 만들고, 테스트가 끝난 staging은
> [리소스 삭제](#14-테스트-리소스-삭제)를 참고해 정리하세요. 예산 알림은 비용을
> 자동으로 차단하는 기능이 아닙니다.

## 배포 후 만들어지는 리소스

| 리소스 | 용도 | staging 이름 |
|---|---|---|
| Cloud Run | Spring Boot API 실행 | `qr-order-staging` |
| Cloud SQL for PostgreSQL | 주문·메뉴·테이블 데이터 저장 | `qr-order-staging` |
| Artifact Registry | 백엔드 Docker 이미지 저장 | `qr-order` |
| Secret Manager | DB 비밀번호와 인증 secret 저장 | `qr-order-staging-*` |
| 서비스 계정 | Cloud Run에서 DB와 secret 접근 | `qr-order-staging-runtime` |
| Cloud Monitoring | Cloud Run 5xx 알림 정책 | `qr-order-staging: Cloud Run 5xx` |

기본 리전은 서울 `asia-northeast3`입니다. 최초 staging 배포는 아래 순서대로 진행합니다.

1. Google Cloud 계정, 프로젝트, 결제 및 예산 알림 준비
2. 로컬에 Google Cloud CLI와 Terraform 설치
3. 사용자 로그인과 Terraform용 ADC 인증
4. `terraform.tfvars` 작성
5. Terraform 부트스트랩 적용
6. Secret 값과 DB 사용자 등록
7. Cloud Build 서비스 계정 권한 설정
8. 첫 백엔드 이미지 빌드 및 최종 Terraform 적용
9. API 검증, 테이블 import, Netlify 연결

## 1. Google Cloud 프로젝트와 결제 준비

### 1.1 프로젝트 만들기

1. [Google Cloud Console](https://console.cloud.google.com/)에 Google 계정으로 로그인합니다.
2. 상단 프로젝트 선택기에서 **새 프로젝트**를 누릅니다.
3. 알아보기 쉬운 프로젝트 이름을 입력합니다. 예: `QR Order`.
4. 프로젝트 ID를 확인하고 기록합니다. 예: `caucse-qr-order`.

프로젝트 **이름**은 바꿀 수 있지만 프로젝트 **ID**는 전 세계에서 고유하고 생성 후
바꿀 수 없습니다. 이 문서의 `GCP_PROJECT_ID`에는 이름이 아니라 프로젝트 ID를 넣습니다.

### 1.2 결제 계정 연결하기

Cloud Console에서 방금 만든 프로젝트를 선택한 뒤 **결제** 메뉴를 열어 결제 계정을
연결합니다. Cloud SQL 생성에는 결제 연결이 필수입니다. 조직에서 제공한 프로젝트를
사용한다면 프로젝트 생성과 결제 연결 권한을 관리자에게 요청해야 할 수 있습니다.

### 1.3 예산 알림 만들기

Cloud Console의 **결제 > 예산 및 알림 > 예산 만들기**에서 다음처럼 시작하는 것을
권장합니다.

- 범위: 새로 만든 GCP 프로젝트만 선택
- 기간: 월간
- 금액: 처음에는 본인이 즉시 확인 가능한 작은 금액
- 임계값: 50%, 90%, 100%에서 이메일 알림

예산 알림은 지출을 강제로 멈추지 않습니다. 알림을 받으면 Billing 보고서와 실행 중인
리소스를 직접 확인해야 합니다.

## 2. macOS 로컬 도구 설치

현재 이 Mac에는 Homebrew와 Docker CLI가 있지만 `gcloud`와 `terraform`은 설치되어
있지 않은 상태입니다. 아래 명령은 Apple Silicon macOS와 Homebrew 기준입니다.

### 2.1 Google Cloud CLI 설치

```bash
brew install --cask gcloud-cli
```

설치가 끝나면 터미널을 새로 열고 확인합니다.

```bash
gcloud version
```

`gcloud: command not found`가 계속 나오면 현재 터미널에서 PATH를 추가한 후 다시
확인합니다.

```bash
export PATH="/opt/homebrew/share/google-cloud-sdk/bin:$PATH"
gcloud version
```

매번 PATH를 지정해야 한다면 위 `export` 줄을 `~/.zshrc`에 추가하고 새 터미널을
여세요.

### 2.2 Terraform 설치

```bash
brew tap hashicorp/tap
brew install hashicorp/tap/terraform
terraform version
```

이 저장소는 Terraform `1.8.0` 이상을 요구합니다.

### 2.3 애플리케이션 테스트용 도구 확인

Cloud Build를 사용한 원격 빌드에는 로컬 Docker daemon이 필수는 아닙니다. 다만
Testcontainers 기반 백엔드 통합 테스트를 로컬에서 실행하려면 Docker Desktop이
실행 중이어야 합니다.

```bash
open -a Docker
docker info
java -version
node --version
jq --version
```

- Java는 Temurin JDK 21을 선택합니다.
- `docker info`가 daemon 연결 오류를 출력하면 Docker Desktop이 준비될 때까지 기다립니다.
- `node`가 없다면 Node.js 22 LTS를 설치합니다.
- 이 Mac에는 `/usr/bin/jq`가 기본 제공되어 있습니다.

선택적으로 배포 전에 로컬 테스트를 실행할 수 있습니다.

```bash
cd /Users/samso/Desktop/qr-order-design
./qr-order-backend/gradlew -p qr-order-backend test
npm --prefix qr-order-frontend ci
npm --prefix qr-order-frontend run test
npm --prefix qr-order-frontend run lint
npm --prefix qr-order-frontend run build
```

## 3. gcloud 로그인과 기본 프로젝트 설정

터미널에서 이번 작업에 사용할 값을 설정합니다. `caucse-qr-order` 부분은 1단계에서
만든 실제 프로젝트 ID로 바꾸세요. 이 환경 변수는 터미널을 닫으면 사라집니다.

```bash
export GCP_PROJECT_ID="caucse-qr-order"
export GCP_REGION="asia-northeast3"
```

### 3.1 gcloud 사용자 로그인

```bash
gcloud init
```

브라우저에서 로그인한 뒤 다음을 선택합니다.

- 계정: 프로젝트 소유자 또는 배포 권한이 있는 Google 계정
- 프로젝트: `$GCP_PROJECT_ID`에 지정한 프로젝트
- 기본 리전/존 질문이 나오면 리전은 `asia-northeast3` 선택

명령으로 설정값을 다시 고정하고 확인합니다.

```bash
gcloud config set project "$GCP_PROJECT_ID"
gcloud config set run/region "$GCP_REGION"
gcloud config list
gcloud auth list
```

결제가 정상 연결되었는지도 확인합니다.

```bash
gcloud beta billing projects describe "$GCP_PROJECT_ID"
```

출력에 `billingEnabled: true`가 있어야 합니다.

### 3.2 Terraform용 ADC 인증

`gcloud init` 로그인과 Terraform이 사용하는 Application Default Credentials(ADC)는
서로 다릅니다. 다음 로그인도 반드시 한 번 실행합니다.

```bash
gcloud auth application-default login
gcloud auth application-default set-quota-project "$GCP_PROJECT_ID"
```

사용자 ADC 로그인을 사용하는 동안에는 `GOOGLE_APPLICATION_CREDENTIALS` 환경 변수를
임의로 설정하지 마세요. 다른 서비스 계정 파일을 가리키고 있으면 인증 주체가 예상과
달라질 수 있습니다.

개인 프로젝트를 직접 만든 계정은 일반적으로 최초 구성에 필요한 권한을 갖습니다.
조직 프로젝트에서 권한 오류가 나면 임의로 Owner 권한을 추가하지 말고 프로젝트
관리자에게 오류 메시지에 나온 권한을 요청하세요.

## 4. Terraform 입력값 작성

저장소의 인프라 디렉터리로 이동해 예제 파일을 복사합니다.

```bash
cd /Users/samso/Desktop/qr-order-design/infra
cp terraform.tfvars.example terraform.tfvars
```

`terraform.tfvars`를 열어 staging 기준으로 수정합니다.

```hcl
project_id          = "caucse-qr-order"
region              = "asia-northeast3"
environment         = "staging"
container_image     = "us-docker.pkg.dev/cloudrun/container/hello:latest"
bootstrap_mode      = true
allowed_origins     = "https://deploy-preview-1--your-site.netlify.app"
frontend_base_url   = "https://deploy-preview-1--your-site.netlify.app"
deletion_protection = false
```

각 값의 의미는 다음과 같습니다.

- `project_id`: 실제 GCP 프로젝트 ID
- `environment`: 첫 배포에서는 `staging`
- `container_image`: 첫 적용에서만 Google 공개 hello 이미지 사용
- `bootstrap_mode`: Secret 버전이 아직 없으므로 첫 적용에서만 `true`
- `allowed_origins`: API 호출을 허용할 Netlify origin. 여러 개면 쉼표로 구분
- `frontend_base_url`: QR URL을 만들 때 사용할 프런트엔드 주소
- `deletion_protection`: staging은 삭제할 수 있게 `false`, 운영은 `true`

origin은 경로와 마지막 `/` 없이 `https://사이트주소` 형태로 적습니다. `*`를 사용하지
말고 실제 운영 origin과 허용할 preview origin만 명시하세요.

`terraform.tfvars`에는 Secret 값을 넣지 않습니다. 이 파일은 `.gitignore`로 제외되며,
공유가 필요한 기본값만 `terraform.tfvars.example`에 반영합니다.

> 현재 구성은 로컬 Terraform state를 사용합니다. staging을 적용한 동일 state에서
> `environment = "prod"`로만 바꾸면 staging 리소스를 운영 리소스로 교체하려 할 수
> 있습니다. 운영 전환 때는 운영용 별도 GCP 프로젝트와 원격 state 구성을 먼저
> 마련하세요.

## 5. Terraform 부트스트랩 적용

첫 적용은 API 활성화, Artifact Registry, Cloud SQL, 빈 Secret, 서비스 계정과 임시
Cloud Run 리비전을 만듭니다. Cloud SQL 생성 때문에 수 분 이상 걸릴 수 있습니다.

```bash
cd /Users/samso/Desktop/qr-order-design/infra
terraform init
terraform fmt -check
terraform validate
terraform plan -out staging.tfplan
terraform apply staging.tfplan
```

`plan`에서 예상치 못한 다른 프로젝트나 삭제 항목이 보이면 적용하지 말고
`terraform.tfvars`와 `gcloud config get-value project`를 다시 확인합니다.

완료 후 주요 값을 확인합니다.

```bash
terraform output
```

다음 항목이 출력되어야 합니다.

- `artifact_repository`
- `cloud_run_url`
- `cloud_sql_connection_name`
- `runtime_service_account`
- `secret_ids`

## 6. Secret 값과 DB 사용자 등록

Secret 리소스의 빈 그릇은 Terraform이 만들지만 실제 값은 Terraform 밖에서
등록합니다. 그래야 비밀번호가 Terraform state에 저장되지 않습니다.

### 6.1 값 준비

DB 비밀번호와 staff token 서명키는 새로 생성합니다.

```bash
export DB_PASSWORD="$(openssl rand -base64 36 | tr -d '\n')"
export STAFF_TOKEN_SECRET="$(openssl rand -hex 32)"
```

기존 인쇄 QR을 유지하려면 Apps Script에서 사용하던 `TOKEN_PEPPER`를 **한 글자도
바꾸지 않고** 입력합니다. 입력값은 화면에 표시되지 않습니다.

```bash
printf '기존 TOKEN_PEPPER 입력: '
read -s TOKEN_PEPPER
printf '\n'
export TOKEN_PEPPER
```

기존 `STAFF_PASSCODE_HASH`를 확보했다면 같은 방식으로 입력합니다.

```bash
printf '기존 STAFF_PASSCODE_HASH 입력: '
read -s STAFF_PASSCODE_HASH
printf '\n'
export STAFF_PASSCODE_HASH
```

기존 hash가 없고 새 passcode를 만들 경우에만 다음처럼 계산합니다. 애플리케이션은
`SHA-256(TOKEN_PEPPER + ":" + passcode)` 형식을 사용합니다.

```bash
printf '새 운영진 passcode 입력: '
read -s STAFF_PASSCODE
printf '\n'
export STAFF_PASSCODE_HASH="$(printf '%s' "${TOKEN_PEPPER}:${STAFF_PASSCODE}" | shasum -a 256 | awk '{print $1}')"
unset STAFF_PASSCODE
```

### 6.2 Secret Manager에 버전 추가

아래 명령은 값 뒤에 불필요한 줄바꿈을 붙이지 않습니다.

```bash
printf '%s' "$DB_PASSWORD" | gcloud secrets versions add qr-order-staging-db-password --data-file=-
printf '%s' "$TOKEN_PEPPER" | gcloud secrets versions add qr-order-staging-token-pepper --data-file=-
printf '%s' "$STAFF_PASSCODE_HASH" | gcloud secrets versions add qr-order-staging-staff-passcode-hash --data-file=-
printf '%s' "$STAFF_TOKEN_SECRET" | gcloud secrets versions add qr-order-staging-staff-token-secret --data-file=-
```

각 secret에 활성 버전이 생겼는지 확인합니다. 값 자체는 출력하지 않습니다.

```bash
for secret_id in \
  qr-order-staging-db-password \
  qr-order-staging-token-pepper \
  qr-order-staging-staff-passcode-hash \
  qr-order-staging-staff-token-secret
do
  gcloud secrets versions list "$secret_id" --limit=1
done
```

### 6.3 Cloud SQL 애플리케이션 사용자 생성

Secret에 넣은 것과 동일한 DB 비밀번호를 사용합니다.

```bash
gcloud sql users create qr_order \
  --instance=qr-order-staging \
  --password="$DB_PASSWORD"
```

이미 사용자가 존재한다는 오류가 나오면 생성 대신 비밀번호를 맞춥니다.

```bash
gcloud sql users set-password qr_order \
  --instance=qr-order-staging \
  --password="$DB_PASSWORD"
```

## 7. Cloud Build 배포 권한 설정

새 GCP 프로젝트는 생성 시점과 조직 정책에 따라 Cloud Build 기본 서비스 계정이
다릅니다. 이메일을 추측하지 말고 API가 실제로 사용할 계정을 조회합니다.

```bash
export BUILD_SA="$(gcloud builds get-default-service-account \
  --project="$GCP_PROJECT_ID" \
  --format='value(serviceAccountEmail)')"
export RUNTIME_SA="$(terraform -chdir=/Users/samso/Desktop/qr-order-design/infra \
  output -raw runtime_service_account)"
printf 'Cloud Build SA: %s\nCloud Run SA: %s\n' "$BUILD_SA" "$RUNTIME_SA"
```

`BUILD_SA`가 비어 있으면 Cloud Build API 활성화가 아직 전파 중일 수 있습니다. 잠시
후 다시 실행합니다. 값이 확인되면 이미지 push와 Cloud Run 배포 권한을 부여합니다.

```bash
gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \
  --member="serviceAccount:${BUILD_SA}" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \
  --member="serviceAccount:${BUILD_SA}" \
  --role="roles/run.admin"

gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member="serviceAccount:${BUILD_SA}" \
  --role="roles/iam.serviceAccountUser"
```

마지막 권한은 Cloud Build가 기존 Cloud Run 런타임 서비스 계정을 연결한 새 리비전을
배포할 수 있게 합니다.

## 8. 첫 백엔드 이미지 빌드

Terraform이 만든 Artifact Registry로 첫 Spring Boot 이미지를 원격 빌드합니다.

```bash
cd /Users/samso/Desktop/qr-order-design
export IMAGE_URL="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/qr-order/backend:bootstrap"
gcloud builds submit qr-order-backend --tag "$IMAGE_URL"
```

빌드가 성공하면 `infra/terraform.tfvars`의 두 값을 바꿉니다.

```hcl
container_image = "asia-northeast3-docker.pkg.dev/caucse-qr-order/qr-order/backend:bootstrap"
bootstrap_mode  = false
```

위 이미지 경로의 `caucse-qr-order`는 실제 프로젝트 ID로 바꿔야 합니다.

## 9. 실제 애플리케이션으로 최종 적용

이제 Cloud Run이 네 개의 Secret과 실제 백엔드 이미지를 사용하도록 다시 적용합니다.

```bash
cd /Users/samso/Desktop/qr-order-design/infra
terraform plan -out staging.tfplan
terraform apply staging.tfplan
```

애플리케이션 시작 시 Flyway가 PostgreSQL schema와 seed 데이터를 생성합니다. 여러
인스턴스가 동시에 시작해도 PostgreSQL 잠금으로 같은 migration의 중복 적용을
방지합니다.

배포가 끝났으면 터미널에 남은 평문 값을 제거합니다.

```bash
unset DB_PASSWORD TOKEN_PEPPER STAFF_PASSCODE_HASH STAFF_TOKEN_SECRET
```

## 10. 첫 배포 검증

### 10.1 상태 확인

```bash
export SERVICE_URL="$(terraform -chdir=/Users/samso/Desktop/qr-order-design/infra \
  output -raw cloud_run_url)"
printf '%s\n' "$SERVICE_URL"
curl --fail-with-body "$SERVICE_URL/actuator/health/readiness"
```

정상이면 health 응답의 status가 `UP`입니다.

staging에서만 Swagger/OpenAPI가 열립니다.

```bash
open "$SERVICE_URL/swagger-ui/index.html"
curl --fail-with-body "$SERVICE_URL/v3/api-docs/customer" >/dev/null
curl --fail-with-body "$SERVICE_URL/v3/api-docs/staff" >/dev/null
curl --fail-with-body "$SERVICE_URL/v3/api-docs/staff-auth" >/dev/null
```

`environment = "prod"`에서는 보안을 위해 Swagger UI와 `/v3/api-docs/**`가 모두
비활성화됩니다.

### 10.2 로그와 리비전 확인

```bash
gcloud run services describe qr-order-staging \
  --region="$GCP_REGION" \
  --format='yaml(status.url,status.latestReadyRevisionName,status.conditions)'

gcloud run services logs read qr-order-staging \
  --region="$GCP_REGION" \
  --limit=100
```

Flyway 오류, DB 인증 오류 또는 health check 실패가 없어야 합니다.

## 11. 기존 Tables CSV 가져오기

이 작업은 주문, 호출 또는 테이블 세션이 하나라도 생기기 전에 한 번만 실행합니다.
CSV의 `token_hash`는 기존 `TOKEN_PEPPER`와 짝이 맞아야 기존 QR이 계속 동작합니다.

CSV는 다음 열로 시작해야 합니다. 기존 `created_at`, `updated_at` 열이 뒤에 있으면
무시됩니다.

```text
table_id,display_name,token_hash,token_version,active,sort_order
```

staging 프런트에서 `/staff/login`으로 로그인한 뒤 브라우저 로컬 스토리지의 Bearer
token을 복사하거나, 로그인 API 응답의 `data.staffToken`을 사용합니다. 토큰을 터미널에
입력할 때 화면에 표시하지 않으려면 다음처럼 실행합니다.

```bash
printf 'staff token 입력: '
read -s STAFF_TOKEN
printf '\n'
export STAFF_TOKEN

cd /Users/samso/Desktop/qr-order-design
./scripts/import-tables.sh "$SERVICE_URL" "$STAFF_TOKEN" /absolute/path/to/Tables.csv
unset STAFF_TOKEN
```

import가 성공하면 운영 관리 화면의 테이블 목록과 기존 인쇄 QR 하나 이상을 반드시
확인합니다.

## 12. Netlify 프런트엔드 연결

Netlify의 staging 사이트 설정에서 환경 변수를 다음처럼 지정하고 다시 배포합니다.

```text
VITE_API_BASE_URL=https://Cloud-Run에서-받은-주소
```

Cloud Run URL은 다음 명령으로 다시 확인할 수 있습니다.

```bash
terraform -chdir=/Users/samso/Desktop/qr-order-design/infra output -raw cloud_run_url
```

Netlify 주소가 `allowed_origins`와 정확히 일치해야 합니다. preview URL을 추가하거나
주소가 바뀌면 `infra/terraform.tfvars`의 `allowed_origins`를 고치고 Terraform을 다시
적용합니다.

연결 후 다음 순서로 smoke test를 수행합니다.

1. 기존 QR로 고객 화면 진입
2. 메뉴와 옵션 표시 확인
3. 고객 주문 생성
4. 운영 화면에 주문 즉시 표시 확인
5. 주문 상태 변경이 고객 화면에 1초 안에 반영되는지 확인
6. 직원 호출과 확인 처리
7. 결제 예상 금액 확인 및 결제 확정

## 13. 이후 일반 배포

최초 부트스트랩이 끝난 뒤에는 루트의 `cloudbuild.yaml`로 테스트, 프런트 검증,
이미지 빌드·push, Cloud Run 배포, health smoke test를 한 번에 실행합니다.

수동 실행에서는 Git trigger와 달리 `SHORT_SHA`가 자동으로 없을 수 있으므로 명시합니다.

```bash
cd /Users/samso/Desktop/qr-order-design
gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions="_ENVIRONMENT=staging,_SERVICE=qr-order-staging,SHORT_SHA=$(git rev-parse --short HEAD)" \
  .
```

빌드 상태와 로그는 Cloud Console의 **Cloud Build > 기록**에서도 확인할 수 있습니다.

## 14. 테스트 리소스 삭제

더 이상 staging을 사용하지 않으면 비용이 계속 발생하지 않도록 Terraform으로
삭제합니다. 삭제 대상 프로젝트 ID와 `deletion_protection = false`를 먼저 확인합니다.

```bash
cd /Users/samso/Desktop/qr-order-design/infra
gcloud config get-value project
terraform plan -destroy
terraform destroy
```

운영 환경에서 `deletion_protection = true`인 경우에는 먼저 그 값을 `false`로 바꾸고
`terraform apply`해야 삭제할 수 있습니다. 운영 DB 삭제는 복구에 영향을 주므로
백업과 대상 프로젝트를 재확인한 뒤 별도 변경으로 진행합니다.

## 15. 롤백

애플리케이션 배포 직후 문제가 생기면 Apps Script로 쓰기 트래픽을 되돌리지 않고 이전
Cloud Run 리비전으로 100% 트래픽을 돌립니다.

```bash
gcloud run revisions list \
  --service=qr-order-staging \
  --region="$GCP_REGION"

gcloud run services update-traffic qr-order-staging \
  --region="$GCP_REGION" \
  --to-revisions="이전-정상-리비전=100"
```

DB migration은 add-first 하위 호환 방식이므로 이전 리비전이 새 schema에서도 동작해야
합니다. 이미 적용된 Flyway migration 파일은 수정하거나 삭제하지 않습니다.

## 16. 자주 발생하는 오류

### `gcloud: command not found`

터미널을 새로 열거나 다음 PATH를 현재 shell에 추가합니다.

```bash
export PATH="/opt/homebrew/share/google-cloud-sdk/bin:$PATH"
```

### Terraform의 `could not find default credentials`

ADC 로그인을 다시 실행합니다.

```bash
gcloud auth application-default login
gcloud auth application-default set-quota-project "$GCP_PROJECT_ID"
```

### `API has not been used` 또는 API 비활성 오류

첫 `terraform apply`가 필요한 API를 활성화합니다. 활성화 직후에는 권한 전파에 잠시
시간이 걸릴 수 있으므로 같은 plan을 확인한 뒤 다시 적용합니다.

### Cloud Build의 Artifact Registry `Permission denied`

7단계에서 조회한 실제 `BUILD_SA`에 `roles/artifactregistry.writer`가 부여되었는지
확인합니다.

### Cloud Build의 `iam.serviceAccounts.actAs` 오류

`BUILD_SA`가 `RUNTIME_SA`에 `roles/iam.serviceAccountUser`를 가지고 있는지 확인합니다.

### Cloud Run이 준비 상태가 되지 않음

먼저 로그에서 원인을 확인합니다.

```bash
gcloud run services logs read qr-order-staging \
  --region="$GCP_REGION" \
  --limit=200
```

- DB 인증 실패: Secret의 DB 비밀번호와 `qr_order` 사용자 비밀번호가 같은지 확인
- secret version 오류: 네 secret 모두 활성 버전이 있는지 확인
- Flyway 오류: migration 오류 직전의 PostgreSQL 메시지 확인
- health check 오류: 앱이 8080 포트에서 시작했는지 확인

### 브라우저에서 CORS 오류

브라우저 주소창의 origin과 `allowed_origins`가 프로토콜, 호스트, 포트까지 정확히
일치하는지 확인합니다. 수정 후 `terraform apply`로 새 Cloud Run 리비전을 만듭니다.

### `./gradlew bootRun`에서 숫자 `26`만 출력되며 실패

IDE 또는 shell이 JDK 26을 사용하고 있는 경우입니다. 프로젝트 SDK와 Gradle JVM을
Temurin 21로 바꾸고 다시 실행합니다.

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
java -version
./qr-order-backend/gradlew -p qr-order-backend bootRun
```

## 공식 문서

- [Google Cloud 프로젝트 만들기](https://docs.cloud.google.com/resource-manager/docs/creating-managing-projects)
- [프로젝트 결제 연결](https://docs.cloud.google.com/billing/docs/how-to/modify-project)
- [예산 및 예산 알림](https://docs.cloud.google.com/billing/docs/how-to/budgets)
- [Google Cloud CLI 설치](https://docs.cloud.google.com/sdk/docs/install-sdk)
- [로컬 ADC 인증](https://docs.cloud.google.com/docs/authentication/set-up-adc-local-dev-environment)
- [Terraform 설치](https://developer.hashicorp.com/terraform/install)
- [Cloud Build 기본 서비스 계정](https://docs.cloud.google.com/build/docs/securing-builds/configure-access-for-cloud-build-service-account)
- [Cloud Run과 Cloud SQL 연결](https://docs.cloud.google.com/sql/docs/postgres/connect-run)
- [Cloud Run 롤백과 트래픽 전환](https://cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration)
