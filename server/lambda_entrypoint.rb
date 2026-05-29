# frozen_string_literal: true

# Top-level Lambda handler file. BUNDLE_GEMFILE is set in the Dockerfile; the
# fuuka gem is a path gem, so bundler/setup puts lib/ on the load path.
require 'bundler/setup'
require 'fuuka/lambda_handler'
