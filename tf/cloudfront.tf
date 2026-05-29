data "aws_cloudfront_cache_policy" "Managed-CachingOptimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "Managed-CachingDisabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "Managed-AllViewerExceptHostHeader" {
  name = "Managed-AllViewerExceptHostHeader"
}

resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${var.name_prefix}-frontend"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Honor the origin's `s-maxage` (e.g. /api/locations sets s-maxage=1) while not
# splitting the cache on query/headers/cookies.
resource "aws_cloudfront_cache_policy" "api" {
  name        = "${var.name_prefix}-api"
  default_ttl = 0
  min_ttl     = 0
  max_ttl     = 31536000

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
  }
}

resource "aws_cloudfront_distribution" "fuuka" {
  enabled             = true
  is_ipv6_enabled     = true
  http_version        = "http2and3"
  comment             = "fuuka/${var.name_prefix}"
  aliases             = var.aliases
  price_class         = var.cloudfront_price_class
  default_root_object = "index.html"

  origin {
    origin_id                = "s3-frontend"
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  origin {
    origin_id   = "lambda-api"
    domain_name = replace(replace(aws_lambda_function_url.fuuka.function_url, "https://", ""), "/", "")


    custom_header {
      name  = "X-Forwarded-Host"
      value = var.aliases[0] != "" ? var.aliases[0] : replace(replace(aws_lambda_function_url.fuuka.function_url, "https://", ""), "/", "")
    }
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = "s3-frontend"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.Managed-CachingOptimized.id
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
  }

  # Read-only locations endpoint: cacheable (honors origin s-maxage=1). Listed
  # before /api/* so it matches first.
  ordered_cache_behavior {
    path_pattern             = "/api/locations"
    target_origin_id         = "lambda-api"
    allowed_methods          = ["GET", "HEAD", "OPTIONS"]
    cached_methods           = ["GET", "HEAD", "OPTIONS"]
    cache_policy_id          = aws_cloudfront_cache_policy.api.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.Managed-AllViewerExceptHostHeader.id
    viewer_protocol_policy   = "redirect-to-https"
    compress                 = true
  }

  # Ingest and other dynamic endpoints: never cache, forward everything except
  # the Host header (so Authorization / query reach the Lambda).
  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = "lambda-api"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.Managed-CachingDisabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.Managed-AllViewerExceptHostHeader.id
    viewer_protocol_policy   = "redirect-to-https"
    compress                 = true
  }

  viewer_certificate {
    cloudfront_default_certificate = length(var.aliases) == 0
    acm_certificate_arn            = length(var.aliases) > 0 ? var.certificate_arn : null
    ssl_support_method             = length(var.aliases) > 0 ? "sni-only" : null
    minimum_protocol_version       = length(var.aliases) > 0 ? "TLSv1.2_2021" : "TLSv1"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
}
