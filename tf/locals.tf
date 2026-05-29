locals {
  server_dir = "${path.module}/${var.server_dir}"

  # Hash of server sources so edits rebuild the image. The build context is the
  # committed gem source; bundle artifacts (vendor/) are produced inside Docker.
  source_files = fileset(local.server_dir, "**")
  source_hash  = substr(sha1(join("", [for f in local.source_files : filesha1("${local.server_dir}/${f}")])), 0, 16)

  image_tag = var.image_tag != "" ? var.image_tag : "source-${local.source_hash}"
  image_uri = "${aws_ecr_repository.repo.repository_url}:${local.image_tag}"

  dynamodb_table_arn = aws_dynamodb_table.table.arn
}
