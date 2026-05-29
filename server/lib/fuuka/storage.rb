# frozen_string_literal: true

require 'aws-sdk-dynamodb'
require 'base64'
require 'digest/sha2'
require 'json'
require 'time'
require 'fuuka/location'

module Fuuka
  # DynamoDB-backed storage for latest and historical locations.
  #
  # Schema (single table with hash=pk / range=sk, plus GSI `inverted` = sk/pk):
  #   - latest:  pk="latest:#{userid}"  sk="latest"
  #   - history: pk="history:#{userid}" sk="history:#{userid}:#{iso8601}"
  # Location fields live in a `data` JSON blob; `name`/`ts` are mirrored top-level.
  class Storage
    LATEST_SK = 'latest'
    INVERTED_INDEX = 'inverted'

    # Skip recording a history entry when the new reading is within this many
    # meters of the current latest, to avoid cluttering history while stationary.
    HISTORY_MIN_DISTANCE_M = 2.0

    def initialize(table_name:, client: nil, logger: nil)
      @table_name = table_name
      @client = client
      @logger = logger
    end

    attr_reader :table_name

    def client
      @client ||= Aws::DynamoDB::Client.new(logger: @logger)
    end

    # base64url(sha256(name)) without padding.
    def self.userid(name)
      Base64.urlsafe_encode64(Digest::SHA256.digest(name), padding: false)
    end

    # Persist a reading as the user's latest location, and also as a history
    # entry unless it is within HISTORY_MIN_DISTANCE_M of the current latest.
    # `github` is optional user metadata (a GitHub login) mirrored top-level.
    def put_location(name:, location:, github: nil)
      uid = self.class.userid(name)
      data = JSON.generate(location.as_data)
      timestamp = location.timestamp || Time.now.utc.iso8601

      base = { 'name' => name, 'ts' => timestamp, 'data' => data }
      base['github'] = github if github && !github.empty?

      requests = [
        { put_request: { item: base.merge('pk' => "latest:#{uid}", 'sk' => LATEST_SK) } },
      ]
      unless near_latest?(uid:, location:)
        requests << { put_request: { item: base.merge('pk' => "history:#{uid}", 'sk' => "history:#{uid}:#{timestamp}") } }
      end

      client.batch_write_item(request_items: { table_name => requests })
      nil
    end

    # Current latest reading for a user, or nil if none recorded yet.
    def latest(uid:)
      resp = client.get_item(
        table_name:,
        key: { 'pk' => "latest:#{uid}", 'sk' => LATEST_SK },
      )
      item = resp.item
      return nil if item.nil? || item.empty?

      Location.from_data(JSON.parse(item.fetch('data')))
    end

    # All users' latest locations, via the inverted GSI (sk="latest").
    # @return [Array<Hash>] each {userid:, name:, location: Fuuka::Location}
    def all_latest
      items = []
      last_key = nil
      loop do
        resp = client.query(
          table_name:,
          index_name: INVERTED_INDEX,
          key_condition_expression: 'sk = :sk',
          expression_attribute_values: { ':sk' => LATEST_SK },
          exclusive_start_key: last_key,
        )
        items.concat(resp.items)
        last_key = resp.last_evaluated_key
        break unless last_key
      end

      items.map do |item|
        {
          userid: item.fetch('pk').delete_prefix('latest:'),
          name: item['name'],
          github: item['github'],
          location: Location.from_data(JSON.parse(item.fetch('data'))),
        }
      end
    end

    # Historical readings for a user, oldest first.
    def history(name:, limit: 100)
      uid = self.class.userid(name)
      resp = client.query(
        table_name:,
        key_condition_expression: 'pk = :pk AND begins_with(sk, :prefix)',
        expression_attribute_values: {
          ':pk' => "history:#{uid}",
          ':prefix' => "history:#{uid}:",
        },
        limit:,
      )
      resp.items.map { |item| Location.from_data(JSON.parse(item.fetch('data'))) }
    end

    private

    # Whether `location` is close enough to the current latest that recording a
    # new history entry would be redundant.
    def near_latest?(uid:, location:)
      current = latest(uid:)
      return false unless current

      current.distance_to(location) < HISTORY_MIN_DISTANCE_M
    end
  end
end
