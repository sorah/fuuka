resource "aws_ecr_repository" "repo" {
  name = var.ecr_repository_name
}

resource "aws_ecr_repository_policy" "repo-lambda" {
  repository = aws_ecr_repository.repo.name
  policy     = data.aws_iam_policy_document.repo-lambda.json
}

data "aws_iam_policy_document" "repo-lambda" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
    actions = [
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
    ]
  }
}

resource "aws_ecr_lifecycle_policy" "repo" {
  repository = aws_ecr_repository.repo.name
  policy = jsonencode({
    rules = [{
      rulePriority = 10
      description  = "expire old images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

# Build the server image and push it to ECR. Re-runs when the resolved image
# tag (source hash by default) changes.
resource "null_resource" "build_push" {
  triggers = {
    image_uri = local.image_uri
  }

  provisioner "local-exec" {
    command = "${path.module}/build.sh"
    environment = {
      AWS_REGION     = data.aws_region.current.name
      REPOSITORY_URL = aws_ecr_repository.repo.repository_url
      IMAGE_TAG      = local.image_tag
      SERVER_DIR     = local.server_dir
      PLATFORM       = contains(var.architectures, "arm64") ? "linux/arm64" : "linux/amd64"
    }
  }
}
