output "artifact_repository" { value = google_artifact_registry_repository.backend.name }
output "cloud_run_url" { value = google_cloud_run_v2_service.api.uri }
output "cloud_sql_connection_name" { value = google_sql_database_instance.postgres.connection_name }
output "runtime_service_account" { value = google_service_account.runtime.email }
output "secret_ids" { value = sort(tolist(local.secret_ids)) }
