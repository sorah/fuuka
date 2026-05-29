# frozen_string_literal: true

require_relative 'lib/fuuka/version'

Gem::Specification.new do |spec|
  spec.name = 'fuuka'
  spec.version = Fuuka::VERSION
  spec.authors = ['Sorah Fukumori']
  spec.email = ['sora134@gmail.com']

  spec.summary = 'Realtime location sharing server'
  spec.description = 'Sinatra API to ingest and serve realtime location data, backed by DynamoDB'
  spec.required_ruby_version = '>= 3.4.0'

  # Private/unpublished gem.
  spec.metadata['allowed_push_host'] = 'https://example.com/no-push'

  spec.files = Dir['lib/**/*.rb', 'config.ru', 'lambda_entrypoint.rb']
  spec.require_paths = ['lib']

  spec.add_dependency 'sinatra', '~> 4.0'
  spec.add_dependency 'rackup', '~> 2.1'
  spec.add_dependency 'aws-sdk-dynamodb', '~> 1.0'
  spec.add_dependency 'json'
  spec.add_dependency 'base64'
end
