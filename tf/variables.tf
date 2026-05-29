variable "name_prefix" {
  type    = string
  default = "fuuka"
}

variable "iam_role_prefix" {
  type    = string
  default = "Fuuka"
}

variable "dynamodb_table_name" {
  type    = string
  default = "fuuka"
}

variable "ecr_repository_name" {
  type    = string
  default = "fuuka"
}

# Container image tag to deploy. When empty, a content hash of the server/
# directory is used, so changes to the server source trigger a rebuild.
variable "image_tag" {
  type    = string
  default = ""
}

variable "server_dir" {
  type        = string
  default     = "../server"
  description = "Path to the server gem (docker build context), relative to this module"
}

variable "architectures" {
  type    = list(string)
  default = ["x86_64"]
}

variable "lambda_memory_size" {
  type    = number
  default = 256
}

variable "ingest_token" {
  type        = string
  sensitive   = true
  description = "Static bearer token clients use to publish locations"
}

variable "mapbox_token" {
  type        = string
  sensitive   = true
  description = "Mapbox public access token served to the frontend via /api/config"
}

variable "frontend_bucket_name" {
  type        = string
  description = "S3 bucket name hosting the built frontend"
}

variable "aliases" {
  type        = list(string)
  default     = []
  description = "CloudFront alternate domain names (CNAMEs)"
}

variable "certificate_arn" {
  type        = string
  default     = ""
  description = "ACM certificate (us-east-1) for the aliases. Required when aliases are set"
}

variable "cloudfront_price_class" {
  type    = string
  default = "PriceClass_200"
}
