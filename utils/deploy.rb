#!/usr/bin/env ruby
# frozen_string_literal: true

# Deploy the built frontend (ui/build/client) to S3 and invalidate CloudFront.
# Modeled on publikes' ui/deploy.rb.
#
# Usage:
#   (cd ui && pnpm build)
#   utils/deploy.rb [BUCKET] [CLOUDFRONT_DISTRIBUTION_ID]
#
# `tf/` is a Terraform module consumed by your own root config; its outputs
# (frontend_bucket, cloudfront_distribution_id) must be re-exported there. When
# the arguments are omitted, they are read via `terraform output` run in your
# Terraform root — the current directory, or FUUKA_TF_DIR if set.
# Set DRY_RUN=1 to print the planned uploads without touching AWS.

require 'bundler/inline'

gemfile do
  source 'https://rubygems.org'
  gem 'aws-sdk-s3'
  gem 'aws-sdk-cloudfront'
  gem 'rexml'
end

require 'logger'
require 'securerandom'
require 'shellwords'

$stdout.sync = true

ROOT = File.expand_path('..', __dir__)
SRCDIR = File.join(ROOT, 'ui', 'build', 'client')
# `tf/` is a module, not a root state — read outputs from the caller's root.
TFDIR = ENV['FUUKA_TF_DIR'] || Dir.pwd

CONTENT_TYPES = {
  '.html' => 'text/html; charset=utf-8',
  '.js' => 'text/javascript; charset=utf-8',
  '.css' => 'text/css; charset=utf-8',
  '.json' => 'application/json; charset=utf-8',
  '.map' => 'application/json; charset=utf-8',
  '.svg' => 'image/svg+xml',
  '.png' => 'image/png',
  '.jpg' => 'image/jpeg',
  '.jpeg' => 'image/jpeg',
  '.webp' => 'image/webp',
  '.gif' => 'image/gif',
  '.ico' => 'image/x-icon',
  '.woff2' => 'font/woff2',
  '.woff' => 'font/woff',
  '.ttf' => 'font/ttf',
  '.txt' => 'text/plain; charset=utf-8',
  '.webmanifest' => 'application/manifest+json',
}.freeze

DRY_RUN = ENV['DRY_RUN'] == '1'

def terraform_output(name)
  value = `terraform -chdir=#{TFDIR.shellescape} output -raw #{name} 2>/dev/null`.strip
  value.empty? ? nil : value
end

bucket = ARGV[0] || terraform_output('frontend_bucket')
distribution_id = ARGV[1] || terraform_output('cloudfront_distribution_id')

abort "usage: #{$PROGRAM_NAME} [bucket] [cloudfront_distribution_id]" unless bucket
abort "build output not found: #{SRCDIR} (run `cd ui && pnpm build`)" unless Dir.exist?(SRCDIR)

# Content-hashed assets are immutable; the SPA shell must always revalidate.
def cache_control_for(key)
  return 'public, max-age=31536000, immutable' if key.start_with?('assets/')

  'public, max-age=0, must-revalidate'
end

logger = Logger.new($stdout)
s3 = Aws::S3::Client.new(logger:) unless DRY_RUN

Dir[File.join(SRCDIR, '**', '*')].sort.each do |path|
  next if File.directory?(path)

  key = path[(SRCDIR.size + 1)..].split(File::SEPARATOR).join('/')
  content_type = CONTENT_TYPES.fetch(File.extname(path).downcase, 'application/octet-stream')
  cache_control = cache_control_for(key)

  puts "upload #{key} (#{content_type}, #{cache_control})"
  next if DRY_RUN

  File.open(path, 'rb') do |io|
    s3.put_object(
      bucket:,
      key:,
      body: io,
      content_type:,
      cache_control:,
    )
  end
end

if distribution_id
  puts "invalidate #{distribution_id} /*"
  unless DRY_RUN
    cf = Aws::CloudFront::Client.new(region: 'us-east-1', logger:)
    resp = cf.create_invalidation(
      distribution_id:,
      invalidation_batch: {
        paths: { quantity: 1, items: ['/*'] },
        caller_reference: SecureRandom.hex(10),
      },
    )
    cf.wait_until(:invalidation_completed, { distribution_id:, id: resp.invalidation.id })
  end
end

puts 'done'
