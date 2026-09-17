# 메뉴 이미지 운영

Firebase Hosting의 고객 앱이 Cloud Run에서 받은 `imageUrl`로 Cloud Storage의 공개 이미지를
직접 읽습니다. DB에는 기존 `menus.image_url`만 사용하며 이미지 바이너리를 저장하지 않습니다.
Cloud Run의 서비스 계정에는 이미지 버킷 권한을 추가하지 않습니다.

## 현재 배포 설정

- 프로젝트: `qr-order-507407`, 환경: `staging` (현재 `caucse.shop`이 사용하는 API).
- 버킷: `qr-order-507407-staging-menu-assets`, 서울 `asia-northeast3`, Standard.
- Uniform bucket-level access, Public access prevention `inherited`.
- 이미지 전용 버킷에 `allUsers`의 `roles/storage.objectViewer`만 부여합니다. 이 역할은 목록 읽기도 허용합니다.
- 쓰기는 기존 배포 운영자 권한을 사용합니다. 고객에게 쓰기 권한을 부여하지 않습니다.
- `Content-Type: image/webp`, `Cache-Control: public,max-age=31536000,immutable`.
- URL: `https://storage.googleapis.com/<bucket>/menus/<menuId>/<hash>.webp`.
- 일반 `<img>` 표시에는 별도 CORS 설정이 필요하지 않습니다. 향후 브라우저 직접 업로드나 canvas 처리를
  추가할 때 해당 origin과 method로 제한해 설정합니다.
- 별도 Cloud CDN, 로드밸런서, Firebase Storage SDK, signed download URL은 사용하지 않습니다.

조직의 Public access prevention 강제 정책이 있으면 공개 IAM 설정은 실패합니다.
프로젝트 전체의 정책을 완화하지 말고 배포 구성을 먼저 검토합니다.

## 이미지 준비

저장소 루트에서 실행합니다. Python 3.11 이상을 권장합니다.

```bash
python3 -m venv .local-data/menu-images-venv
.local-data/menu-images-venv/bin/pip install -r scripts/menu-images/requirements.txt
.local-data/menu-images-venv/bin/python scripts/menu-images/prepare.py '/path/to/메뉴판(최종)'
```

`prepare.py`는 NFC/NFD 한글 파일명을 정규화하고 명시적으로 매핑한 메뉴 중 해당 폴더에 있는 이미지를 처리합니다.
자르기·확대 없이 WebP로 인코딩하고 크기와 알파 채널을 검증합니다.
현재 파일은 `assets/menu/manifest.json`에 기록하고 이전 WebP와 이번에 처리하지 않은 메뉴 매핑은 남깁니다.

추가 이미지 두 개만 처리하려면 메뉴 ID로 범위를 지정합니다. 지정한 파일이 없으면 중단합니다.

```bash
.local-data/menu-images-venv/bin/python scripts/menu-images/prepare.py /path/to/images --menus soju beer
```

## GCP 배포

리소스 정의는 `infra/menu-images.tf`입니다. 일반적으로 전체 Terraform plan을 검토한 뒤 적용합니다.
2026-09-16 최초 배포는 실제 Cloud Run 이미지가 `backend:d035f8d`인데 로컬 `container_image`가
`backend:bootstrap`이어서, 서버 롤백을 피하기 위해 아래와 같이 메뉴 이미지 리소스만 적용했습니다.
이는 기존 인프라 드리프트 때문에 사용한 제한 적용이며, 전체 인프라가 동기화되었다는 의미가 아닙니다.

```bash
terraform -chdir=infra validate
terraform -chdir=infra plan \
  -target=google_storage_bucket_iam_member.menu_assets_public \
  -target=google_storage_bucket_object.menu_images \
  -out=menu-images.tfplan
terraform -chdir=infra show menu-images.tfplan
terraform -chdir=infra apply menu-images.tfplan
```

최초 plan은 이미지 13개, API 등록, 버킷, 공개 읽기 IAM의 총 16개 생성만 포함했습니다.
Cloud SQL·Cloud Run 변경은 없습니다. 삭제 방지를 위해 버킷 `force_destroy=false`를 사용합니다.

## 기존 메뉴에 연결

배포 운영자의 ADC로 Cloud SQL에 연결하고 기존 Secret Manager의 DB 비밀번호를 메모리에서 읽습니다.
서비스 계정 키나 직원 로그인 토큰을 생성하지 않습니다. 모든 이미지에 대해 익명 GET,
Content-Type, SHA-256 검증을 먼저 수행합니다.

```bash
# 계획만 출력합니다. DB 쓰기 없음.
.local-data/menu-images-venv/bin/python scripts/menu-images/link.py \
  --project qr-order-507407 --environment staging

# 검토한 매핑 적용
.local-data/menu-images-venv/bin/python scripts/menu-images/link.py \
  --project qr-order-507407 --environment staging --apply
```

manifest에 포함된 메뉴의 존재를 확인한 뒤 한 transaction에서 `image_url`, `updated_at`만 바꿉니다.
`--menus soju beer`를 붙이면 해당 메뉴만 검증하고 연결하며, 등록되지 않은 ID는 거부합니다.
감사 로그와 기존 `menu.updated` 이벤트를 기록하고 `pg_notify`로 열린 고객 화면에 재조회를 알립니다.
같은 URL이면 아무것도 쓰지 않으며, 해당 버킷 외부의 기존 URL이 있으면 덮어쓰지 않고 중단합니다.
lock timeout 5초, statement timeout 30초이며 실패하면 전체 rollback합니다.
변경 전 URL은 `.local-data/menu-images-<UTC timestamp>.json`에 보관합니다.

가격·판매 상태·카테고리·엽전 가격 등은 수정하지 않습니다. 일반적인 이후 URL 교체는 관리자 화면의
기존 이미지 URL 필드로도 가능합니다.

## 화면과 Hosting 배포

목록·상세·장바구니·이벤트 메뉴는 `MenuImage`를 공유합니다. `object-contain`과 여백으로
그림을 온전히 표시하고, 이미지가 없거나 실패하면 식기 아이콘으로 대체합니다.
URL이 바뀌면 실패 상태를 초기화합니다. 목록·장바구니·이벤트는 lazy loading,
상세의 주 이미지는 eager loading입니다. 고정된 외부 영역으로 이미지 로딩 중 레이아웃 이동을 방지합니다.

```bash
npm --prefix qr-order-frontend run lint
npm --prefix qr-order-frontend run test
VITE_API_BASE_URL=https://qr-order-staging-etxejs37pq-du.a.run.app \
  npm --prefix qr-order-frontend run build
firebase deploy --only hosting --project qr-order-507407
```

## 교체와 롤백

- 그림 교체는 새 hash 파일 업로드 → 새 URL 저장 순서입니다. 기존 URL에 다른 그림을 덮어쓰지 않습니다.
- 이전 그림으로 복원할 때는 남아 있는 이전 파일의 URL을 관리자 메뉴 설정에 저장합니다.
- 최초 연결을 되돌릴 때는 `.local-data`의 변경 전 URL을 참고해 해당 메뉴의 이미지 URL을 비웁니다.
- 프런트엔드는 Firebase Hosting의 이전 release로 복원할 수 있습니다.
- 이미지 자동 삭제 lifecycle은 설정하지 않았습니다. 오래된 파일 정리는 현재 DB 참조와 캐시·롤백 기간을 확인한 뒤 진행합니다.

## 공식 참고

- [Cloud Storage 공개 접근](https://docs.cloud.google.com/storage/docs/access-control/making-data-public)
- [Cloud Storage 캐시](https://docs.cloud.google.com/storage/docs/caching)
- [Cloud SQL Python Connector](https://github.com/GoogleCloudPlatform/cloud-sql-python-connector)
