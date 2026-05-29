#!/bin/bash -xe
# Build the fuuka server image and push it to ECR.
# Invoked by null_resource.build_push with REPOSITORY_URL / IMAGE_TAG / SERVER_DIR / PLATFORM / AWS_REGION.

aws ecr get-login-password --region "${AWS_REGION}" | docker login --username AWS --password-stdin "${REPOSITORY_URL}"
docker build --load --platform "${PLATFORM}" -t "${REPOSITORY_URL}:${IMAGE_TAG}" "${SERVER_DIR}"
docker push "${REPOSITORY_URL}:${IMAGE_TAG}"
