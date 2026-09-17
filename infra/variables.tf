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
  description = "Comma-separated frontend production and preview origins."
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

variable "service_min_instances" {
  description = "Warm service instances; temporarily increase before a reservation after capacity verification."
  type        = number
  default     = 1
  validation {
    condition     = var.service_min_instances >= 0 && var.service_min_instances <= 5 && floor(var.service_min_instances) == var.service_min_instances
    error_message = "service_min_instances must be an integer from 0 through 5."
  }
}

variable "service_max_instances" {
  description = "Service instance ceiling; increasing beyond 5 requires a new DB connection budget."
  type        = number
  default     = 5
  validation {
    condition     = var.service_max_instances >= 1 && var.service_max_instances <= 5 && floor(var.service_max_instances) == var.service_max_instances
    error_message = "service_max_instances must be an integer from 1 through 5."
  }
}

variable "revision_max_instances" {
  description = "Revision ceiling; must not constrain the service ceiling."
  type        = number
  default     = 5
  validation {
    condition     = var.revision_max_instances >= 1 && var.revision_max_instances <= 5 && floor(var.revision_max_instances) == var.revision_max_instances
    error_message = "revision_max_instances must be an integer from 1 through 5."
  }
}

variable "request_concurrency" {
  description = "Maximum simultaneous HTTP requests per instance, including SSE; not an order throughput guarantee."
  type        = number
  default     = 100
  validation {
    condition     = var.request_concurrency >= 1 && var.request_concurrency <= 1000 && floor(var.request_concurrency) == var.request_concurrency
    error_message = "request_concurrency must be an integer from 1 through 1000."
  }
}
