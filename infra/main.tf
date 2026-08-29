locals {
  name = "qr-order-${var.environment}"
  required_services = toset([
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "sqladmin.googleapis.com",
    "monitoring.googleapis.com",
  ])
  secret_ids = toset([
    "${local.name}-db-password",
    "${local.name}-token-pepper",
    "${local.name}-staff-passcode-hash",
    "${local.name}-staff-token-secret",
  ])
}

resource "google_project_service" "required" {
  for_each           = local.required_services
  service            = each.value
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "backend" {
  location      = var.region
  repository_id = "qr-order"
  format        = "DOCKER"
  description   = "QR Order Spring Boot images"
  depends_on    = [google_project_service.required]
}

resource "google_service_account" "runtime" {
  account_id   = "${local.name}-runtime"
  display_name = "QR Order ${var.environment} Cloud Run runtime"
}

resource "google_project_iam_member" "cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_secret_manager_secret" "runtime" {
  for_each  = local.secret_ids
  secret_id = each.value

  replication {
    auto {}
  }

  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_iam_member" "runtime_access" {
  for_each  = local.secret_ids
  secret_id = google_secret_manager_secret.runtime[each.key].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_sql_database_instance" "postgres" {
  name                = local.name
  region              = var.region
  database_version    = "POSTGRES_17"
  deletion_protection = var.deletion_protection

  settings {
    tier              = "db-custom-1-3840"
    availability_type = "ZONAL"
    disk_type         = "PD_SSD"
    disk_size         = 20
    disk_autoresize   = true
    edition           = "ENTERPRISE"

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "18:00"
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = 7
        retention_unit   = "COUNT"
      }
    }

    maintenance_window {
      day          = 1
      hour         = 18
      update_track = "stable"
    }

    insights_config {
      query_insights_enabled  = true
      query_string_length     = 1024
      record_application_tags = true
    }
  }

  depends_on = [google_project_service.required]
}

resource "google_sql_database" "app" {
  name     = "qr_order"
  instance = google_sql_database_instance.postgres.name
}

# The qr_order database user and its password are created out of band after the
# DB password Secret Manager version is populated. This keeps the secret value
# out of Terraform state; see infra/README.md.

resource "google_cloud_run_v2_service" "api" {
  name                = local.name
  location            = var.region
  deletion_protection = var.deletion_protection
  ingress             = "INGRESS_TRAFFIC_ALL"

  scaling {
    min_instance_count = 1
    max_instance_count = 3
  }

  template {
    service_account                  = google_service_account.runtime.email
    timeout                          = "1800s"
    max_instance_request_concurrency = 50

    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }

    containers {
      image = var.container_image

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
        cpu_idle = true
      }

      ports {
        container_port = 8080
      }

      env {
        name  = "DB_URL"
        value = "jdbc:postgresql:///qr_order?cloudSqlInstance=${google_sql_database_instance.postgres.connection_name}&socketFactory=com.google.cloud.sql.postgres.SocketFactory"
      }
      env {
        name  = "DB_USER"
        value = "qr_order"
      }
      env {
        name  = "DB_POOL_SIZE"
        value = "10"
      }
      env {
        name  = "ALLOWED_ORIGINS"
        value = var.allowed_origins
      }
      env {
        name  = "FRONTEND_BASE_URL"
        value = var.frontend_base_url
      }
      env {
        name  = "OPENAPI_ENABLED"
        value = var.environment == "staging" ? "true" : "false"
      }
      env {
        name  = "SWAGGER_UI_ENABLED"
        value = var.environment == "staging" ? "true" : "false"
      }

      dynamic "env" {
        for_each = var.bootstrap_mode ? {} : {
          DB_PASSWORD         = "${local.name}-db-password"
          TOKEN_PEPPER        = "${local.name}-token-pepper"
          STAFF_PASSCODE_HASH = "${local.name}-staff-passcode-hash"
          STAFF_TOKEN_SECRET  = "${local.name}-staff-token-secret"
        }
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }

      startup_probe {
        failure_threshold     = 18
        period_seconds        = 10
        timeout_seconds       = 3
        initial_delay_seconds = 5
        http_get {
          path = "/actuator/health/liveness"
        }
      }
      liveness_probe {
        failure_threshold = 3
        period_seconds    = 30
        timeout_seconds   = 3
        http_get {
          path = "/actuator/health/liveness"
        }
      }
    }
  }

  depends_on = [
    google_project_iam_member.cloudsql_client,
    google_secret_manager_secret_iam_member.runtime_access,
    google_sql_database.app,
  ]
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  project  = var.project_id
  location = google_cloud_run_v2_service.api.location
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_monitoring_alert_policy" "server_errors" {
  display_name          = "${local.name}: Cloud Run 5xx"
  combiner              = "OR"
  notification_channels = var.alert_notification_channels
  conditions {
    display_name = "5xx responses"
    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND resource.labels.service_name = \"${local.name}\" AND metric.type = \"run.googleapis.com/request_count\" AND metric.labels.response_code_class = \"5xx\""
      comparison      = "COMPARISON_GT"
      threshold_value = 1
      duration        = "60s"
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_RATE"
      }
    }
  }
}
