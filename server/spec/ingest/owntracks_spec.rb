# frozen_string_literal: true

require 'spec_helper'
require 'fuuka/ingest/owntracks'

RSpec.describe Fuuka::Ingest::OwnTracks do
  let(:payload) do
    {
      '_type' => 'location',
      'lat' => 35.68,
      'lon' => 139.7,
      'tst' => 1_748_513_400,
      'batt' => 87,
      'bs' => 2,
      'vel' => 36, # km/h
      'alt' => 30,
      'acc' => 10,
      'vac' => 5,
      'cog' => 45,
    }
  end

  it 'maps a location message to a normalized location' do
    location = described_class.parse(payload).first

    expect(location.lat).to eq(35.68)
    expect(location.lon).to eq(139.7)
    expect(location.timestamp).to eq(Time.at(1_748_513_400).utc.iso8601)
    expect(location.battery).to eq(87)
    expect(location.battery_state).to eq('charging')
    expect(location.speed).to eq(10.0) # 36 km/h -> 10 m/s
    expect(location.altitude).to eq(30)
    expect(location.accuracy).to eq(10)
    expect(location.vertical_accuracy).to eq(5)
    expect(location.course).to eq(45)
    expect(location.source).to eq('owntracks')
  end

  it 'ignores non-location message types' do
    expect(described_class.parse({ '_type' => 'transition' })).to eq([])
  end
end
