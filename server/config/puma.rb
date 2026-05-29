# frozen_string_literal: true

# Bind to the host/port portless injects (PORT/HOST env), defaulting to a fixed
# local port otherwise. Puma does not read PORT on its own.
bind "tcp://#{ENV.fetch('HOST', '0.0.0.0')}:#{ENV.fetch('PORT', '9292')}"
