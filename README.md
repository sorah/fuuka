# Fuuka

Realtime location sharing. Mobile apps (Overland / OwnTracks) publish location to a
simple authed API; a web map plots every user's latest position and refreshes every
second. Location history is collected to DynamoDB.

## Layout

- `server/` — Ruby gem: Sinatra API + DynamoDB storage. Runs locally under Puma,
  deploys to AWS Lambda (container image) behind a Function URL via `apigatewayv2_rack`.
- `ui/` — React Router (Vite) SPA, TypeScript, useSWR, Mapbox GL. Built to static
  assets and served from S3.
- `tf/` — reusable Terraform **module** (ECR + image build/push, IAM, Lambda + Function
  URL, DynamoDB, S3, unified CloudFront). Consumed from your own root config, which passes
  variables in and re-exports its outputs — not applied directly.
- `utils/` — helper scripts: `deploy.rb` (build → S3 + CloudFront invalidation),
  `emulated_overland.rb` (simulated location feed for development).

## API

| Method | Path             | Auth        | Notes                                                  |
| ------ | ---------------- | ----------- | ------------------------------------------------------ |
| GET    | `/api/locations` | none        | All users' latest location. `Cache-Control: max-age=0, s-maxage=1`. |
| GET    | `/api/config`    | none        | `{ mapboxToken }` for the frontend.                    |
| POST   | `/api/overland`  | bearer token| Overland batch ingest. `?name=` selects the user. Returns `{"result":"ok"}`. |
| POST   | `/api/owntracks` | bearer token| OwnTracks ingest. `?name=` selects the user. Returns `[]`. |

The ingest token (`FUUKA_INGEST_TOKEN`) is sent as `Authorization: Bearer <token>` or
`?token=<token>`. The user is identified by the unprotected `?name=` query parameter;
`userid = base64url(sha256(name))`. An optional `?github=<login>` attaches a GitHub
login whose avatar is shown on the map.

### DynamoDB schema

Single table (hash `pk` / range `sk`) plus GSI `inverted` (`sk`/`pk`):

- Latest: `pk="latest:#{userid}"`, `sk="latest"`
- History: `pk="history:#{userid}"`, `sk="history:#{userid}:#{iso8601}"` (kept indefinitely)

`GET /api/locations` queries the `inverted` index for `sk="latest"`.

## Local development

Requires [portless](https://www.npmjs.com/package/portless), [overmind](https://github.com/DarthSim/overmind),
Ruby, and pnpm. AWS credentials with access to the DynamoDB table must be available.

```bash
# one-time
(cd server && bundle install)
(cd ui && pnpm install)

# configure env (gitignored). See the keys below.
cp .env.local .env   # then add AWS_REGION / FUUKA_DYNAMODB_TABLE / FUUKA_INGEST_TOKEN

overmind start
```

- Frontend: <http://fuuka.localhost:1355>
- Server:   <http://fuuka-server.localhost:1355> (Vite proxies `/api/*` here)

Required env (`.env`, loaded by overmind):

```
AWS_REGION=ap-northeast-1
FUUKA_DYNAMODB_TABLE=fuuka-dev
FUUKA_INGEST_TOKEN=dev-local-token
MAPBOX_TOKEN=pk....
```

### Tests

```bash
cd server && bundle exec rspec
cd ui && pnpm typecheck && pnpm build
```

## Deploy

Prerequisites: AWS credentials, Docker (for the Lambda image build), Terraform, Ruby,
and pnpm.

### 1. Backend + infrastructure (the `tf/` module)

`tf/` is a Terraform module. Reference it from your own root configuration and pass the
required variables; the module builds the `server/` Docker image, pushes it to ECR, and
provisions DynamoDB, IAM, the image-based Lambda + Function URL, the S3 bucket, and a
single CloudFront distribution.

```hcl
# e.g. your-infra/fuuka.tf
module "fuuka" {
  source = "../fuuka/tf" # local path (or a git ref); the module reaches `server/` for the image build

  frontend_bucket_name = "fuuka-prd-frontend"
  ingest_token         = var.fuuka_ingest_token
  mapbox_token         = var.fuuka_mapbox_token

  # optional
  # aliases         = ["fuuka.example.com"]
  # certificate_arn = data.aws_acm_certificate.fuuka.arn
  # server_dir      = "${path.module}/../fuuka/server" # if the default ../server is not adjacent
}

# Re-export what the frontend deploy needs:
output "fuuka_frontend_bucket"            { value = module.fuuka.frontend_bucket }
output "fuuka_cloudfront_distribution_id" { value = module.fuuka.cloudfront_distribution_id }
output "fuuka_cloudfront_domain"          { value = module.fuuka.cloudfront_distribution_domain_name }
```

```bash
# in your root config
terraform init
terraform apply
```

Editing `server/` sources changes the image tag (a content hash), so the next `apply`
rebuilds and redeploys the Lambda automatically. Module outputs: `frontend_bucket`,
`cloudfront_distribution_id`, `cloudfront_distribution_domain_name`, `lambda_function_url`,
`ecr_repository_url`.

### 2. Frontend (`utils/deploy.rb`)

Build the SPA and publish it to S3 + invalidate CloudFront:

```bash
(cd ui && pnpm build)

# pass the bucket + distribution id explicitly:
utils/deploy.rb fuuka-prd-frontend E123ABCDEF456

# …or omit them to read `terraform output` from your root config:
FUUKA_TF_DIR=path/to/your-infra utils/deploy.rb
# (FUUKA_TF_DIR defaults to the current directory)
```

`deploy.rb` uploads `ui/build/client` to the bucket root with correct content types and
cache headers (content-hashed `assets/*` are immutable; `index.html` always revalidates),
then issues a `/*` CloudFront invalidation and waits for it. Set `DRY_RUN=1` to preview
the planned uploads without touching AWS. (First run installs its gems via `bundler/inline`.)

CloudFront serves the SPA from S3 (default origin) and routes `/api/*` to the Lambda
Function URL origin (same-origin, no CORS), honoring `s-maxage` at the edge.

### Client app configuration

- **Overland**: Receiver Endpoint `https://<domain>/api/overland?name=<you>`, and set the
  **Access Token** to the ingest token (Overland sends it as `Authorization: Bearer`).
  Alternatively bake it into the URL as `&token=<ingest-token>`.
- **OwnTracks** (HTTP mode): URL `https://<domain>/api/owntracks?name=<you>`, with the
  ingest token as `Authorization: Bearer <token>` or `?token=<token>`.
