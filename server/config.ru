# frozen_string_literal: true

$LOAD_PATH.unshift(File.join(__dir__, 'lib'))

require 'fuuka'

storage = Fuuka::Storage.new(table_name: ENV.fetch('FUUKA_DYNAMODB_TABLE'))

run Fuuka::App.rack(storage:)
