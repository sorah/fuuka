resource "aws_iam_role" "Lambda" {
  name               = "${var.iam_role_prefix}Lambda"
  description        = "fuuka ${var.name_prefix} Lambda (tf/iam.tf)"
  assume_role_policy = data.aws_iam_policy_document.Lambda-trust.json
}

data "aws_iam_policy_document" "Lambda-trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy_attachment" "Lambda-AWSLambdaBasicExecutionRole" {
  role       = aws_iam_role.Lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "Lambda-dynamodb" {
  role   = aws_iam_role.Lambda.name
  policy = data.aws_iam_policy_document.Lambda-dynamodb.json
}

data "aws_iam_policy_document" "Lambda-dynamodb" {
  statement {
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:Query",
      "dynamodb:PutItem",
      "dynamodb:BatchWriteItem",
    ]
    resources = [
      local.dynamodb_table_arn,
      "${local.dynamodb_table_arn}/index/*",
    ]
  }
}
