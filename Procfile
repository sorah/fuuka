server: cd server && portless fuuka-server watchexec -o restart -e rb,ru -w lib -w config.ru -w config -- bundle exec puma
ui: cd ui && portless fuuka pnpm dev
client: sleep 5; ruby utils/emulated_overland.rb http://fuuka-server.localhost:1355
