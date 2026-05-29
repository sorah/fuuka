# frozen_string_literal: true

require 'spec_helper'

RSpec.describe Fuuka::Location do
  def loc(lat:, lon:)
    described_class.new(
      lat:, lon:, timestamp: '2026-05-29T10:30:00Z',
      battery: nil, battery_state: nil, speed: nil, altitude: nil,
      accuracy: nil, vertical_accuracy: nil, course: nil, source: 'test', raw: {}
    )
  end

  describe '#distance_to' do
    it 'is zero for the same coordinate' do
      a = loc(lat: 35.68, lon: 139.7)
      expect(a.distance_to(a)).to eq(0)
    end

    it 'is symmetric' do
      a = loc(lat: 35.68, lon: 139.7)
      b = loc(lat: 35.69, lon: 139.71)
      expect(a.distance_to(b)).to be_within(1e-6).of(b.distance_to(a))
    end

    it 'measures roughly 1m for a ~0.000009 degree latitude step' do
      a = loc(lat: 35.68, lon: 139.7)
      b = loc(lat: 35.68 + 0.000009, lon: 139.7)
      expect(a.distance_to(b)).to be_within(0.2).of(1.0)
    end
  end
end
