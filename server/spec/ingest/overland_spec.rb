# frozen_string_literal: true

require 'spec_helper'
require 'fuuka/ingest/overland'

RSpec.describe Fuuka::Ingest::Overland do
  let(:payload) do
    {
      'locations' => [
        {
          'type' => 'Feature',
          'geometry' => { 'type' => 'Point', 'coordinates' => [139.7, 35.68] },
          'properties' => {
            'timestamp' => '2026-05-29T10:30:00Z',
            'battery_level' => 0.75,
            'battery_state' => 'charging',
            'speed' => 12.5,
            'altitude' => 30.0,
            'horizontal_accuracy' => 5.0,
            'vertical_accuracy' => 2.0,
            'course' => 90.0,
          },
        },
      ],
    }
  end

  it 'maps a feature to a normalized location' do
    location = described_class.parse(payload).first

    expect(location.lat).to eq(35.68)
    expect(location.lon).to eq(139.7)
    expect(location.timestamp).to eq('2026-05-29T10:30:00Z')
    expect(location.battery).to eq(75)
    expect(location.battery_state).to eq('charging')
    expect(location.speed).to eq(12.5)
    expect(location.altitude).to eq(30.0)
    expect(location.accuracy).to eq(5.0)
    expect(location.vertical_accuracy).to eq(2.0)
    expect(location.course).to eq(90.0)
    expect(location.source).to eq('overland')
  end

  it 'returns an empty array when there are no locations' do
    expect(described_class.parse({})).to eq([])
  end

  it 'handles missing battery level' do
    payload['locations'][0]['properties'].delete('battery_level')
    expect(described_class.parse(payload).first.battery).to be_nil
  end
end
