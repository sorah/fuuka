resource "aws_lambda_function" "fuuka" {
  function_name = "${var.name_prefix}-server"

  package_type  = "Image"
  image_uri     = local.image_uri
  architectures = var.architectures

  role = aws_iam_role.Lambda.arn

  memory_size = var.lambda_memory_size
  timeout     = 20

  environment {
    variables = {
      FUUKA_DYNAMODB_TABLE = var.dynamodb_table_name
      FUUKA_INGEST_TOKEN   = var.ingest_token
      MAPBOX_TOKEN         = var.mapbox_token
    }
  }

  depends_on = [null_resource.build_push]
}

resource "aws_lambda_function_url" "fuuka" {
  function_name      = aws_lambda_function.fuuka.function_name
  authorization_type = "NONE"
}
