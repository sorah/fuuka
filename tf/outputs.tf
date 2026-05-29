output "cloudfront_distribution_domain_name" {
  value = aws_cloudfront_distribution.fuuka.domain_name
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.fuuka.id
}

output "cloudfront_distribution_hosted_zone_id" {
  value = aws_cloudfront_distribution.fuuka.hosted_zone_id
}

output "lambda_function_url" {
  value = aws_lambda_function_url.fuuka.function_url
}

output "ecr_repository_url" {
  value = aws_ecr_repository.repo.repository_url
}

output "frontend_bucket" {
  value = aws_s3_bucket.frontend.bucket
}
