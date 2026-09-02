# GCP deployment

Terraform owns resource configuration but deliberately does not put secret
values or the database password in Terraform state.

## 1. Bootstrap resources

Copy `terraform.tfvars.example`, choose `staging`, and apply once with
`bootstrap_mode = true`. This first revision uses Google's public hello image
and deliberately has no secret references, so secrets and Artifact Registry
can be created without a circular dependency. The workstation needs Terraform
>= 1.8 and an authenticated Google Cloud CLI.

```bash
terraform init
terraform plan -out plan.tfplan
terraform apply plan.tfplan
```

## 2. Add secret versions

Populate these four secrets out of band. For existing printed QR codes,
`TOKEN_PEPPER` must be byte-for-byte identical to the Apps Script property.

```bash
printf '%s' "$DB_PASSWORD" | gcloud secrets versions add qr-order-staging-db-password --data-file=-
printf '%s' "$TOKEN_PEPPER" | gcloud secrets versions add qr-order-staging-token-pepper --data-file=-
printf '%s' "$STAFF_PASSCODE_HASH" | gcloud secrets versions add qr-order-staging-staff-passcode-hash --data-file=-
printf '%s' "$STAFF_TOKEN_SECRET" | gcloud secrets versions add qr-order-staging-staff-token-secret --data-file=-
```

Create the DB user with the same password without echoing it to logs:

```bash
gcloud sql users create qr_order --instance qr-order-staging --password "$DB_PASSWORD"
```

## 3. Build and deploy

Build the first backend image, then set `container_image` to that image and
`bootstrap_mode = false` in the tfvars file and apply again:

```bash
gcloud builds submit qr-order-backend \
  --tag asia-northeast3-docker.pkg.dev/$GOOGLE_CLOUD_PROJECT/qr-order/backend:bootstrap
terraform plan -out plan.tfplan
terraform apply plan.tfplan
```

After bootstrap, connect the repository to Cloud Build or submit the normal
test/build/deploy pipeline manually:

```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_ENVIRONMENT=staging,_SERVICE=qr-order-staging
```

The application runs Flyway before it becomes ready; Flyway's PostgreSQL lock
prevents concurrent revisions from applying the same migration twice.

Terraform enables `/swagger-ui.html` and `/v3/api-docs/**` only when
`environment = "staging"`. Both are disabled in `prod`; this is enforced with
the `OPENAPI_ENABLED` and `SWAGGER_UI_ENABLED` Cloud Run environment variables.

## 4. Import existing table hashes

Sign in to the staging staff app, copy its bearer token from local storage,
then use `scripts/import-tables.sh`. The import refuses to run after any order,
call, or table session exists.

The CSV must begin with these columns (the original `created_at` and
`updated_at` columns may follow and are ignored):

```text
table_id,display_name,token_hash,token_version,active,sort_order
```

After the smoke flow passes, set Netlify `VITE_API_BASE_URL` to the Cloud Run
URL and redeploy the site. Production rollback uses a previous Cloud Run
revision; do not switch writes back to Apps Script after the event opens.
