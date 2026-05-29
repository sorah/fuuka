#!/usr/bin/env ruby
# frozen_string_literal: true

# Emulates the Overland app publishing realtime location data, so you can watch
# the frontend update live.
#
# Usage:
#   FUUKA_INGEST_TOKEN=... utils/emulated_overland.rb SERVER_URL
#
# SERVER_URL is the server base, e.g. http://fuuka-server.localhost:1355
# (or http://fuuka.localhost:1355 to go through the Vite proxy).
#
# Optional env:
#   USERS=alice,bob         names to simulate (default: alice,bob)
#   GITHUB=alice=login,...  map names to GitHub logins for avatars
#                           (default: alice=webkit-early-warning-system,bob=k8s-ci-robot)
#   INTERVAL=1.0            seconds between updates (default: 1.0)
#   LAT=35.681 LON=139.767  starting center (default: Tokyo Station)

require 'net/http'
require 'json'
require 'uri'
require 'time'

server_url = ARGV[0]
token = ENV['FUUKA_INGEST_TOKEN']

abort "usage: FUUKA_INGEST_TOKEN=... #{$PROGRAM_NAME} SERVER_URL" if server_url.nil? || server_url.empty?
abort 'FUUKA_INGEST_TOKEN is required' if token.nil? || token.empty?

endpoint = URI.join("#{server_url.chomp('/')}/", 'api/overland')
names = (ENV['USERS'] || 'alice,bob').split(',').map(&:strip).reject(&:empty?)
githubs = (ENV['GITHUB'] || 'alice=webkit-early-warning-system,bob=k8s-ci-robot')
          .split(',').map { |pair| pair.split('=', 2).map(&:strip) }.to_h
interval = Float(ENV.fetch('INTERVAL', '1.0'))
center_lat = Float(ENV.fetch('LAT', '35.681'))
center_lon = Float(ENV.fetch('LON', '139.767'))

EARTH_RADIUS_M = 6_378_137.0

# Per-user simulation state: position, heading, speed (m/s), battery.
walkers = names.each_with_index.map do |name, i|
  angle = (2 * Math::PI / names.size) * i
  {
    name: name,
    github: githubs[name],
    device_id: "emu-#{name}",
    lat: center_lat + 0.01 * Math.sin(angle),
    lon: center_lon + 0.01 * Math.cos(angle),
    heading: rand * 2 * Math::PI,
    speed: 3.0 + rand * 9.0, # ~11-43 km/h
    battery: 0.6 + rand * 0.4,
    altitude: 10.0 + rand * 40.0,
  }
end

http = Net::HTTP.new(endpoint.host, endpoint.port)
http.use_ssl = endpoint.scheme == 'https'
http.open_timeout = 5
http.read_timeout = 5

def advance!(w, dt)
  # Random-walk: nudge heading, step forward, drift battery/altitude.
  w[:heading] += (rand - 0.5) * 0.6
  w[:speed] = [[w[:speed] + (rand - 0.5) * 2.0, 0.5].max, 25.0].min
  distance = w[:speed] * dt

  d_lat = (distance * Math.cos(w[:heading]) / EARTH_RADIUS_M) * (180 / Math::PI)
  d_lon = (distance * Math.sin(w[:heading]) / (EARTH_RADIUS_M * Math.cos(w[:lat] * Math::PI / 180))) * (180 / Math::PI)
  w[:lat] += d_lat
  w[:lon] += d_lon

  w[:altitude] += (rand - 0.5) * 5.0
  w[:battery] = [w[:battery] - 0.0005, 0.05].max
end

def payload_for(w)
  {
    locations: [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [w[:lon], w[:lat]] },
      properties: {
        timestamp: Time.now.utc.iso8601,
        device_id: w[:device_id],
        battery_level: w[:battery].round(3),
        battery_state: w[:battery] > 0.95 ? 'full' : 'unplugged',
        speed: w[:speed].round(2),
        altitude: w[:altitude].round(1),
        horizontal_accuracy: (5 + rand * 25).round(1),
        vertical_accuracy: (3 + rand * 8).round(1),
        course: (w[:heading] * 180 / Math::PI % 360).round(1),
        motion: ['walking'],
      },
    }],
  }
end

def post(http, endpoint, token, walker, body)
  query = { name: walker[:name] }
  query[:github] = walker[:github] if walker[:github]
  req = Net::HTTP::Post.new(endpoint.dup.tap { |u| u.query = URI.encode_www_form(query) })
  req['Authorization'] = "Bearer #{token}"
  req['Content-Type'] = 'application/json'
  req.body = JSON.generate(body)
  http.request(req)
end

puts "Emulating #{walkers.size} user(s) -> #{endpoint} every #{interval}s"
puts "Users: #{names.join(', ')}  (Ctrl-C to stop)"

trap('INT') do
  puts "\nstopping"
  exit 0
end

loop do
  walkers.each do |w|
    advance!(w, interval)
    begin
      res = post(http, endpoint, token, w, payload_for(w))
      status = res.is_a?(Net::HTTPSuccess) ? 'ok' : "HTTP #{res.code} #{res.body}"
    rescue StandardError => e
      status = "error: #{e.class}: #{e.message}"
    end
    printf("%-10s %.5f,%.5f  %4.1f km/h  batt %3d%%  -> %s\n",
           w[:name], w[:lat], w[:lon], w[:speed] * 3.6, (w[:battery] * 100).round, status)
  end
  sleep interval
end
