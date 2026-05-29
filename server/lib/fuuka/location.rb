# frozen_string_literal: true

require 'json'
require 'time'

module Fuuka
  # Normalized location reading, common to all ingest sources.
  #
  # `timestamp` is an ISO8601 string. `speed` is m/s, `altitude`/`accuracy`/
  # `vertical_accuracy` are meters, `course` is degrees, `battery` is 0-100.
  # `raw` holds the original provider payload for the reading.
  Location = Data.define(
    :lat,
    :lon,
    :timestamp,
    :battery,
    :battery_state,
    :speed,
    :altitude,
    :accuracy,
    :vertical_accuracy,
    :course,
    :source,
    :raw
  ) do
    # Hash stored as the `data` JSON blob in DynamoDB.
    def as_data
      {
        lat:,
        lon:,
        timestamp:,
        battery:,
        battery_state:,
        speed:,
        altitude:,
        accuracy:,
        vertical_accuracy:,
        course:,
        source:,
        raw:,
      }
    end

    def self.from_data(hash)
      h = hash.transform_keys(&:to_sym)
      new(
        lat: h[:lat],
        lon: h[:lon],
        timestamp: h[:timestamp],
        battery: h[:battery],
        battery_state: h[:battery_state],
        speed: h[:speed],
        altitude: h[:altitude],
        accuracy: h[:accuracy],
        vertical_accuracy: h[:vertical_accuracy],
        course: h[:course],
        source: h[:source],
        raw: h[:raw],
      )
    end

    # Shape returned by GET /api/locations for a single user.
    def as_api(userid:, name:, github: nil)
      {
        userid:,
        name:,
        github:,
        timestamp:,
        latitude: lat,
        longitude: lon,
        battery:,
        batteryState: battery_state,
        speed:,
        altitude:,
        accuracy:,
        verticalAccuracy: vertical_accuracy,
        course:,
        source:,
      }
    end
  end
end
