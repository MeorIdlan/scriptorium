#!/usr/bin/env bash
# Runs podman as the deploy user, whose rootless containers include Mongo. The
# backup scripts run as root, so they reach Mongo through this.
# Installed as /usr/local/sbin/scriptorium-container. Starts from / because
# deploy can't enter root's home, where cron runs. See docs/deployment.md.
set -euo pipefail
cd /
exec runuser -u deploy -- env "XDG_RUNTIME_DIR=/run/user/$(id -u deploy)" podman "$@"
