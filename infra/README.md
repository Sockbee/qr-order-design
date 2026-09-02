# GCP 배포

인프라 리소스 구성은 Terraform으로 관리합니다. 단, 보안을 위해 Secret 값과
데이터베이스 비밀번호는 Terraform 상태 파일에 저장하지 않습니다.

## 1. 리소스 부트스트랩

`terraform.tfvars.example`을 복사하고 환경을 `staging`으로 선택한 다음,
`bootstrap_mode = true`로 설정하여 최초 한 번 적용합니다. 첫 Cloud Run 리비전은
Google의 공개 hello 이미지를 사용하며 Secret Manager를 참조하지 않습니다. 이를 통해
Secret과 Artifact Registry가 서로 순환 의존하지 않고 생성될 수 있습니다.

로컬 환경에는 Terraform 1.8 이상과 인증이 완료된 Google Cloud CLI가 필요합니다.

```bash
terraform init
terraform plan -out plan.tfplan
terraform apply plan.tfplan
```

## 2. Secret 값 등록

다음 네 개의 secret 값은 Terraform 외부에서 등록합니다. 기존에 인쇄된 QR 코드를
계속 사용하려면 `TOKEN_PEPPER`가 기존 Apps Script 속성과 바이트 단위까지 정확히
같아야 합니다.

```bash
printf '%s' "$DB_PASSWORD" | gcloud secrets versions add qr-order-staging-db-password --data-file=-
printf '%s' "$TOKEN_PEPPER" | gcloud secrets versions add qr-order-staging-token-pepper --data-file=-
printf '%s' "$STAFF_PASSCODE_HASH" | gcloud secrets versions add qr-order-staging-staff-passcode-hash --data-file=-
printf '%s' "$STAFF_TOKEN_SECRET" | gcloud secrets versions add qr-order-staging-staff-token-secret --data-file=-
```

로그에 비밀번호를 출력하지 않고 동일한 비밀번호로 DB 사용자를 생성합니다.

```bash
gcloud sql users create qr_order --instance qr-order-staging --password "$DB_PASSWORD"
```

## 3. 빌드 및 배포

첫 번째 백엔드 이미지를 빌드합니다. 이후 tfvars 파일의 `container_image`를 생성한
이미지로 지정하고 `bootstrap_mode = false`로 변경한 다음 Terraform을 다시 적용합니다.

```bash
gcloud builds submit qr-order-backend \
  --tag asia-northeast3-docker.pkg.dev/$GOOGLE_CLOUD_PROJECT/qr-order/backend:bootstrap
terraform plan -out plan.tfplan
terraform apply plan.tfplan
```

부트스트랩이 완료되면 저장소를 Cloud Build에 연결하거나 일반
테스트·빌드·배포 파이프라인을 수동으로 실행합니다.

```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_ENVIRONMENT=staging,_SERVICE=qr-order-staging
```

애플리케이션은 준비 상태가 되기 전에 Flyway 마이그레이션을 실행합니다. Flyway의
PostgreSQL 잠금은 여러 리비전이 동일한 마이그레이션을 동시에 중복 적용하는 것을
방지합니다.

Terraform은 `environment = "staging"`일 때만 `/swagger-ui.html`과
`/v3/api-docs/**`를 활성화합니다. `prod`에서는 두 엔드포인트가 모두 비활성화되며,
Cloud Run 환경 변수 `OPENAPI_ENABLED`와 `SWAGGER_UI_ENABLED`로 이를 강제합니다.

## 4. 기존 테이블 해시 가져오기

staging 운영 화면에 로그인하여 브라우저 로컬 스토리지에서 Bearer 토큰을 복사한 다음
`scripts/import-tables.sh`를 실행합니다. 주문, 호출 또는 테이블 세션이 하나라도
존재하는 경우 가져오기는 실행되지 않습니다.

CSV는 다음 열로 시작해야 합니다. 기존 `created_at`, `updated_at` 열이 뒤에 있는
경우 해당 열은 무시됩니다.

```text
table_id,display_name,token_hash,token_version,active,sort_order
```

스모크 테스트가 통과하면 Netlify의 `VITE_API_BASE_URL`을 Cloud Run URL로 변경하고
사이트를 다시 배포합니다. 운영 환경 롤백은 이전 Cloud Run 리비전으로
수행합니다. 행사 운영이 시작된 이후에는 쓰기 요청을 Apps Script로 되돌리지 않습니다.
