# frozen_string_literal: true

require 'spec_helper'

RSpec.describe Fuuka::Storage do
  let(:client) { Aws::DynamoDB::Client.new(stub_responses: true, region: 'us-east-1') }
  let(:storage) { described_class.new(table_name: 'fuuka-test', client:) }

  let(:location) do
    Fuuka::Location.new(
      lat: 35.68, lon: 139.7, timestamp: '2026-05-29T10:30:00Z',
      battery: 75, battery_state: 'charging', speed: 1.0, altitude: 30.0,
      accuracy: 5.0, vertical_accuracy: 2.0, course: 90.0, source: 'overland', raw: {}
    )
  end

  describe '.userid' do
    it 'is base64url(sha256(name)) without padding' do
      expect(described_class.userid('alice')).to eq(
        Base64.urlsafe_encode64(Digest::SHA256.digest('alice'), padding: false)
      )
      expect(described_class.userid('alice')).not_to include('=')
    end
  end

  describe '#put_location' do
    it 'writes a latest item and a history item in one batch' do
      captured = nil
      client.stub_responses(:batch_write_item, lambda { |ctx|
        captured = ctx.params
        {}
      })

      storage.put_location(name: 'alice', location:, github: 'octocat')

      requests = captured[:request_items]['fuuka-test']
      # The stubbed client marshals attribute values into { s: "..." } form.
      items = requests.map { |r| r[:put_request][:item].transform_values { |v| v[:s] } }
      uid = described_class.userid('alice')

      latest = items.find { |i| i['sk'] == 'latest' }
      history = items.find { |i| i['sk'].start_with?('history:') }

      expect(latest['pk']).to eq("latest:#{uid}")
      expect(history['pk']).to eq("history:#{uid}")
      expect(history['sk']).to eq("history:#{uid}:2026-05-29T10:30:00Z")
      expect(latest['github']).to eq('octocat')
      expect(JSON.parse(latest['data'])['lat']).to eq(35.68)
    end

    it 'skips the history item when within 2m of the current latest' do
      uid = described_class.userid('alice')
      # Current latest ~1m north of the new reading.
      current = location.with(lat: location.lat + 0.000009)
      client.stub_responses(:get_item, {
        item: { 'pk' => "latest:#{uid}", 'sk' => 'latest', 'data' => JSON.generate(current.as_data) },
      })

      captured = nil
      client.stub_responses(:batch_write_item, lambda { |ctx|
        captured = ctx.params
        {}
      })

      storage.put_location(name: 'alice', location:)

      requests = captured[:request_items]['fuuka-test']
      sks = requests.map { |r| r[:put_request][:item]['sk'][:s] }
      expect(sks).to eq(['latest'])
    end

    it 'writes the history item when the current latest is far away' do
      uid = described_class.userid('alice')
      far = location.with(lat: location.lat + 0.001) # ~100m
      client.stub_responses(:get_item, {
        item: { 'pk' => "latest:#{uid}", 'sk' => 'latest', 'data' => JSON.generate(far.as_data) },
      })

      captured = nil
      client.stub_responses(:batch_write_item, lambda { |ctx|
        captured = ctx.params
        {}
      })

      storage.put_location(name: 'alice', location:)

      requests = captured[:request_items]['fuuka-test']
      sks = requests.map { |r| r[:put_request][:item]['sk'][:s] }
      expect(sks).to contain_exactly('latest', "history:#{uid}:2026-05-29T10:30:00Z")
    end

    it 'omits github when not given' do
      captured = nil
      client.stub_responses(:batch_write_item, lambda { |ctx|
        captured = ctx.params
        {}
      })

      storage.put_location(name: 'alice', location:)

      item = captured[:request_items]['fuuka-test'].first[:put_request][:item]
      expect(item).not_to have_key('github')
    end
  end

  describe '#history' do
    it 'queries the user partition from the since lower bound and parses items oldest-first' do
      uid = described_class.userid('alice')
      captured = nil
      client.stub_responses(:query, lambda { |ctx|
        captured = ctx.params
        {
          items: [
            { 'pk' => "history:#{uid}", 'sk' => "history:#{uid}:2026-05-29T10:30:00Z",
              'data' => JSON.generate(location.as_data) },
          ],
          last_evaluated_key: nil,
        }
      })

      result = storage.history(uid:, since: '2026-05-29T10:00:00Z')

      expect(captured[:key_condition_expression]).to eq('pk = :pk AND sk >= :start')
      # The stubbed client marshals attribute values into { s: "..." } form.
      expect(captured[:expression_attribute_values].transform_values { |v| v[:s] }).to eq(
        ':pk' => "history:#{uid}",
        ':start' => "history:#{uid}:2026-05-29T10:00:00Z"
      )
      expect(result.map(&:lat)).to eq([35.68])
    end

    it 'defaults to the whole partition when no since is given' do
      uid = described_class.userid('alice')
      captured = nil
      client.stub_responses(:query, lambda { |ctx|
        captured = ctx.params
        { items: [], last_evaluated_key: nil }
      })

      storage.history(uid:)

      expect(captured[:expression_attribute_values][':start'][:s]).to eq("history:#{uid}:")
    end

    it 'follows pagination across pages' do
      uid = described_class.userid('alice')
      page = 0
      client.stub_responses(:query, lambda { |_ctx|
        page += 1
        if page == 1
          { items: [{ 'data' => JSON.generate(location.as_data) }], last_evaluated_key: { 'pk' => 'x' } }
        else
          { items: [{ 'data' => JSON.generate(location.with(lat: 40.0).as_data) }], last_evaluated_key: nil }
        end
      })

      result = storage.history(uid:)
      expect(result.map(&:lat)).to eq([35.68, 40.0])
    end
  end

  describe '#all_latest' do
    it 'queries the inverted index and parses items' do
      uid = described_class.userid('alice')
      client.stub_responses(:query, {
        items: [{
          'pk' => "latest:#{uid}", 'sk' => 'latest', 'name' => 'alice', 'github' => 'octocat',
          'ts' => '2026-05-29T10:30:00Z', 'data' => JSON.generate(location.as_data)
        }],
        last_evaluated_key: nil,
      })

      result = storage.all_latest
      expect(result.size).to eq(1)
      expect(result.first[:userid]).to eq(uid)
      expect(result.first[:name]).to eq('alice')
      expect(result.first[:github]).to eq('octocat')
      expect(result.first[:location].lat).to eq(35.68)
    end
  end
end
