locals {
  menu_assets_directory = "${path.module}/../assets/menu"
}

resource "google_project_service" "menu_storage" {
  service            = "storage.googleapis.com"
  disable_on_destroy = false
}

# This bucket contains only artwork intended for the public menu.
resource "google_storage_bucket" "menu_assets" {
  name                        = "${var.project_id}-${var.environment}-menu-assets"
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "inherited"
  force_destroy               = false

  depends_on = [google_project_service.menu_storage]
}

resource "google_storage_bucket_iam_member" "menu_assets_public" {
  bucket = google_storage_bucket.menu_assets.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

# Keep older content-addressed files in assets/menu when replacing an image.
# Existing URLs remain valid for cached catalogs and rollback.
resource "google_storage_bucket_object" "menu_images" {
  for_each = fileset(local.menu_assets_directory, "**/*.webp")

  bucket         = google_storage_bucket.menu_assets.name
  name           = "menus/${each.value}"
  source         = "${local.menu_assets_directory}/${each.value}"
  detect_md5hash = filemd5("${local.menu_assets_directory}/${each.value}")
  content_type   = "image/webp"
  cache_control  = "public,max-age=31536000,immutable"
}

output "menu_assets_bucket" {
  value = google_storage_bucket.menu_assets.name
}

output "menu_assets_base_url" {
  value = "https://storage.googleapis.com/${google_storage_bucket.menu_assets.name}/menus"
}
