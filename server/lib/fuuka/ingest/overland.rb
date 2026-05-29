# frozen_string_literal: true

require 'time'
require 'fuuka/location'

module Fuuka
  module Ingest
    # Parses Overland's batch payload.
    #
    # Overland POSTs `{"locations": [GeoJSON Feature, ...]}` where each feature is
    # a Point with `geometry.coordinates = [lon, lat]` and a `properties` hash.
    # It expects `{"result":"ok"}` in response.
    module Overland
      module_function

      # @return [Array<Fuuka::Location>]
      def parse(payload)
        features = payload.fetch('locations', [])
        features.filter_map { |feature| parse_feature(feature) }
      end

      def parse_feature(feature)
        geometry = feature.fetch('geometry', nil)
        return nil unless geometry

        lon, lat = geometry.fetch('coordinates')
        props = feature.fetch('properties', {})

        Location.new(
          lat:,
          lon:,
          timestamp: normalize_timestamp(props['timestamp']),
          battery: battery_percent(props['battery_level']),
          battery_state: props['battery_state'],
          speed: props['speed'],
          altitude: props['altitude'],
          accuracy: props['horizontal_accuracy'],
          vertical_accuracy: props['vertical_accuracy'],
          course: props['course'],
          source: 'overland',
          raw: feature,
        )
      end

      # Overland sends battery_level as a 0.0-1.0 float; normalize to 0-100.
      def battery_percent(level)
        return nil if level.nil?

        (level.to_f * 100).round
      end

      def normalize_timestamp(value)
        return nil if value.nil?

        Time.parse(value.to_s).utc.iso8601
      end
    end
  end
end
