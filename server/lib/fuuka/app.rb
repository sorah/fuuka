# frozen_string_literal: true

require 'json'
require 'time'
require 'sinatra/base'
require 'rack/utils'
require 'fuuka/storage'
require 'fuuka/ingest/overland'
require 'fuuka/ingest/owntracks'

module Fuuka
  class App < Sinatra::Base
    STORAGE_ENV = 'fuuka.storage'

    configure do
      set :show_exceptions, false
      set :raise_errors, false
      disable :logging
      # Behind CloudFront / portless the Host header varies; the function is not
      # origin-locked to a single hostname.
      set :host_authorization, permitted_hosts: []
    end

    # Build a Rack app with dependencies injected via env (see attendee-gate).
    def self.rack(storage:)
      app = self
      lambda do |env|
        env[STORAGE_ENV] = storage
        app.call(env)
      end
    end

    helpers do
      def storage
        env.fetch(STORAGE_ENV)
      end

      def json(data, cache: nil)
        content_type :json
        headers['Cache-Control'] = cache if cache
        JSON.generate(data)
      end

      def request_body
        @request_body ||= begin
          request.body.rewind
          raw = request.body.read
          raw.empty? ? {} : JSON.parse(raw)
        end
      end

      def required_name
        name = params['name']
        halt 400, json({ error: 'name query parameter is required' }) if name.nil? || name.empty?
        name
      end

      # Static bearer token. Both Overland and OwnTracks send it as
      # `Authorization: Bearer`; `?token=` is also accepted as a convenience.
      def authorize_ingest!
        expected = ENV['FUUKA_INGEST_TOKEN']
        halt 503, json({ error: 'ingest token not configured' }) if expected.nil? || expected.empty?

        given = bearer_token || params['token']
        unless given && Rack::Utils.secure_compare(expected, given)
          halt 401, json({ error: 'unauthorized' })
        end
      end

      def bearer_token
        header = request.env['HTTP_AUTHORIZATION']
        return nil unless header

        scheme, value = header.split(' ', 2)
        value if scheme&.casecmp?('bearer')
      end

      def ingest(locations, name:, github: nil)
        locations.each { |location| storage.put_location(name:, location:, github:) }
      end
    end

    get '/api/locations' do
      users = storage.all_latest.map do |entry|
        entry[:location].as_api(userid: entry[:userid], name: entry[:name], github: entry[:github])
      end
      json({ users: }, cache: 'max-age=0, s-maxage=1')
    end

    get '/api/history/:userid/day' do
      since = (Time.now.utc - 86_400).iso8601
      points = storage.history(uid: params['userid'], since:).map(&:as_point)
      json({ userid: params['userid'], points: }, cache: 'max-age=60, s-maxage=60')
    end

    get '/api/history/:userid/recent' do
      since = (Time.now.utc - 120).iso8601
      points = storage.history(uid: params['userid'], since:).map(&:as_point)
      json({ userid: params['userid'], points: }, cache: 'max-age=5, s-maxage=5')
    end

    get '/api/config' do
      token = ENV['MAPBOX_TOKEN'] || ENV['FUUKA_MAPBOX_TOKEN']
      json({ mapboxToken: token }, cache: 'max-age=0, s-maxage=60')
    end

    post '/api/overland' do
      authorize_ingest!
      name = required_name
      ingest(Ingest::Overland.parse(request_body), name:, github: params['github'])
      json({ result: 'ok' })
    end

    post '/api/owntracks' do
      authorize_ingest!
      name = required_name
      ingest(Ingest::OwnTracks.parse(request_body), name:, github: params['github'])
      json([])
    end

    get '/api/health' do
      json({ ok: true })
    end

    error JSON::ParserError do
      json({ error: 'invalid JSON body' }).tap { status 400 }
    end

    not_found do
      json({ error: 'not found' })
    end
  end
end
