# frozen_string_literal: true

require 'spec_helper'
require 'rack/test'

RSpec.describe Fuuka::App do
  include Rack::Test::Methods

  let(:storage) { instance_double(Fuuka::Storage) }

  def app
    Fuuka::App.rack(storage:)
  end

  around do |example|
    ENV['FUUKA_INGEST_TOKEN'] = 'secret-token'
    ENV['MAPBOX_TOKEN'] = 'pk.test'
    example.run
    ENV.delete('FUUKA_INGEST_TOKEN')
    ENV.delete('MAPBOX_TOKEN')
  end

  describe 'GET /api/locations' do
    it 'returns all users with s-maxage cache header' do
      location = Fuuka::Location.new(
        lat: 1.0, lon: 2.0, timestamp: '2026-05-29T10:30:00Z', battery: 50,
        battery_state: 'unplugged', speed: nil, altitude: nil, accuracy: 3.0,
        vertical_accuracy: nil, course: nil, source: 'owntracks', raw: {}
      )
      allow(storage).to receive(:all_latest).and_return(
        [{ userid: 'uid1', name: 'alice', github: 'octocat', location: }]
      )

      get '/api/locations'

      expect(last_response.status).to eq(200)
      expect(last_response.headers['Cache-Control']).to eq('max-age=0, s-maxage=1')
      body = JSON.parse(last_response.body)
      expect(body['users'].first).to include(
        'userid' => 'uid1', 'name' => 'alice', 'github' => 'octocat',
        'latitude' => 1.0, 'longitude' => 2.0
      )
    end
  end

  describe 'GET /api/config' do
    it 'returns the mapbox token' do
      get '/api/config'
      expect(JSON.parse(last_response.body)['mapboxToken']).to eq('pk.test')
    end
  end

  describe 'POST /api/overland' do
    let(:body) do
      JSON.generate(locations: [{
        geometry: { coordinates: [139.7, 35.68] },
        properties: { timestamp: '2026-05-29T10:30:00Z', battery_level: 0.5 },
      }])
    end

    it 'rejects requests without a valid token' do
      post '/api/overland?name=alice', body, 'CONTENT_TYPE' => 'application/json'
      expect(last_response.status).to eq(401)
    end

    it 'requires a name' do
      header 'Authorization', 'Bearer secret-token'
      post '/api/overland', body, 'CONTENT_TYPE' => 'application/json'
      expect(last_response.status).to eq(400)
    end

    it 'ingests locations and returns result ok' do
      expect(storage).to receive(:put_location).with(name: 'alice', location: kind_of(Fuuka::Location), github: nil)
      header 'Authorization', 'Bearer secret-token'
      post '/api/overland?name=alice', body, 'CONTENT_TYPE' => 'application/json'

      expect(last_response.status).to eq(200)
      expect(JSON.parse(last_response.body)).to eq('result' => 'ok')
    end

    it 'forwards the github login from the query parameter' do
      expect(storage).to receive(:put_location).with(name: 'alice', location: kind_of(Fuuka::Location), github: 'octocat')
      header 'Authorization', 'Bearer secret-token'
      post '/api/overland?name=alice&github=octocat', body, 'CONTENT_TYPE' => 'application/json'

      expect(last_response.status).to eq(200)
    end

    it 'accepts the token via query parameter' do
      allow(storage).to receive(:put_location)
      post '/api/overland?name=alice&token=secret-token', body, 'CONTENT_TYPE' => 'application/json'
      expect(last_response.status).to eq(200)
    end
  end

  describe 'POST /api/owntracks' do
    let(:body) { JSON.generate(_type: 'location', lat: 35.68, lon: 139.7, tst: 1_748_513_400) }

    it 'ingests and returns an empty array' do
      expect(storage).to receive(:put_location).with(name: 'bob', location: kind_of(Fuuka::Location), github: nil)
      header 'Authorization', 'Bearer secret-token'
      post '/api/owntracks?name=bob', body, 'CONTENT_TYPE' => 'application/json'

      expect(last_response.status).to eq(200)
      expect(JSON.parse(last_response.body)).to eq([])
    end
  end
end
