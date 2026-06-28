#!/bin/bash
# The official ruby-lsp plugin invokes the bare `ruby-lsp` command. Run the
# server from the project's own bundle (`bundle exec`) when a Gemfile is present,
# so it uses the bundled ruby-lsp (fast: ~14s to index + resolve on rails) instead
# of ruby-lsp's slow on-the-fly "composed bundle" setup. rails' lsp warm adds
# `gem "ruby-lsp"` to the Gemfile + `bundle install --path vendor/bundle`.
if [ -f Gemfile ] && bundle exec ruby-lsp --version >/dev/null 2>&1; then
  exec bundle exec ruby-lsp "$@"
fi
exec /usr/local/bin/ruby-lsp.real "$@"
