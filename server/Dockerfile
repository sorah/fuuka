# Build context must be the server/ directory.
FROM public.ecr.aws/lambda/ruby:4.0 AS builder
RUN --mount=type=cache,target=/var/cache/dnf dnf update -y && dnf install -y gcc gcc-c++ make

COPY fuuka.gemspec ${LAMBDA_TASK_ROOT}/app/
COPY lib/fuuka/version.rb ${LAMBDA_TASK_ROOT}/app/lib/fuuka/version.rb
COPY Gemfile Gemfile.lock ${LAMBDA_TASK_ROOT}/app/

WORKDIR ${LAMBDA_TASK_ROOT}/app
ENV LANG=C.UTF-8
ENV BUNDLE_GEMFILE=${LAMBDA_TASK_ROOT}/app/Gemfile
ENV BUNDLE_PATH=${LAMBDA_TASK_ROOT}/vendor/bundle
ENV BUNDLE_DEPLOYMENT=1
ENV BUNDLE_JOBS=16
ENV BUNDLE_WITHOUT=development:test
RUN bundle install

FROM public.ecr.aws/lambda/ruby:4.0

COPY --from=builder ${LAMBDA_TASK_ROOT}/vendor ${LAMBDA_TASK_ROOT}/vendor
COPY . ${LAMBDA_TASK_ROOT}/app

# The runtime resolves the handler file relative to LAMBDA_TASK_ROOT.
COPY lambda_entrypoint.rb ${LAMBDA_TASK_ROOT}/lambda_entrypoint.rb

WORKDIR ${LAMBDA_TASK_ROOT}/app
ENV LANG=C.UTF-8
ENV BUNDLE_GEMFILE=${LAMBDA_TASK_ROOT}/app/Gemfile
ENV BUNDLE_PATH=${LAMBDA_TASK_ROOT}/vendor/bundle
ENV BUNDLE_DEPLOYMENT=1
ENV BUNDLE_WITHOUT=development:test

CMD [ "lambda_entrypoint.Fuuka::Handlers.http" ]
