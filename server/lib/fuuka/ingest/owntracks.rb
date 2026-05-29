# frozen_string_literal: true

require 'time'
require 'fuuka/location'

module Fuuka
  module Ingest
    # Parses OwnTracks' HTTP payload.
    #
    # OwnTracks POSTs a single MQTT-style JSON object. Only `_type == "location"`
    # carries a position; other types (e.g. transition, waypoints) are ignored.
    # The app expects a JSON array in response (we return `[]`).
    module OwnTracks
      BATTERY_STATES = { 0 => 'unknown', 1 => 'unplugged', 2 => 'charging', 3 => 'full' }.freeze

      module_function

      # @return [Array<Fuuka::Location>]
      def parse(payload)
        return [] unless payload.is_a?(Hash) && payload['_type'] == 'location'

        [parse_location(payload)]
      end

      def parse_location(params)
        Location.new(
          lat: params.fetch('lat'),
          lon: params.fetch('lon'),
          timestamp: normalize_timestamp(params['tst']),
          battery: params['batt'],
          battery_state: BATTERY_STATES[params['bs']],
          speed: kmh_to_ms(params['vel']),
          altitude: params['alt'],
          accuracy: params['acc'],
          vertical_accuracy: params['vac'],
          course: params['cog'],
          source: 'owntracks',
          raw: params,
        )
      end

      # OwnTracks reports velocity in km/h; normalize to m/s.
      def kmh_to_ms(vel)
        return nil if vel.nil?

        (vel.to_f / 3.6).round(2)
      end

      # `tst` is unix epoch seconds.
      def normalize_timestamp(tst)
        return nil if tst.nil?

        Time.at(tst.to_i).utc.iso8601
      end
    end
  end
end
