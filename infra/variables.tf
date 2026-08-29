variable "project_id" {
  description = "GCP project that owns the QR order stack."
  type        = string
}

variable "region" {
  description = "Cloud Run, Artifact Registry and Cloud SQL region."
  type        = string
  default     = "asia-northeast3"
}

variable "environment" {
  description = "Environment suffix used in resource names."
  type        = string
  default     = "prod"
  validation {
    condition     = contains(["staging", "prod"], var.environment)
    error_message = "environment must be staging or prod."
  }
}

variable "container_image" {
  description = "Immutable backend image digest or tag deployed to Cloud Run."
  type        = string
}

variable "bootstrap_mode" {
  description = "Create the first Cloud Run revision without secret references; disable after secret versions and the backend image exist."
  type        = bool
  default     = false
}

variable "allowed_origins" {
  description = "Comma-separated Netlify production and preview origins."
  type        = string
  default     = "https://caucse.shop"
}

variable "frontend_base_url" {
  type    = string
  default = "https://caucse.shop"
}

variable "deletion_protection" {
  type    = bool
  default = true
}

variable "alert_notification_channels" {
  description = "Existing Cloud Monitoring notification channel resource names."
  type        = list(string)
  default     = []
}
