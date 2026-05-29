# frozen_string_literal: true

require 'fuuka'

module Fuuka
  # AWS Lambda Function URL entrypoint (see attendee-gate / himari).
  module Handlers
    def self.http(event:, context:)
      @app ||= begin
        require 'apigatewayv2_rack'
        storage = Fuuka::Storage.new(table_name: ENV.fetch('FUUKA_DYNAMODB_TABLE'))
        Fuuka::App.rack(storage:)
      end
      Apigatewayv2Rack.handle_request(event:, context:, app: @app)
    end
  end
end
