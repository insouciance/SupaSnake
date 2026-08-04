#!/usr/bin/env bash
#
# The isolated local Supabase stack, started so CI cannot lose a race with the
# kernel over its own ports.
#
# THE BUG THIS EXISTS FOR
#
# `supabase start` publishes fixed host ports taken from supabase/config.toml:
# 54321 (API), 54322 (database), 54320 (shadow database). Every one of them
# sits inside Linux's default ephemeral port range, 32768-60999 - the range the
# kernel draws from whenever any process opens an OUTBOUND connection without
# binding a source port first. GitHub's ubuntu runner images do not narrow that
# range, so the defaults apply.
#
# So on a GitHub-hosted runner - a fresh VM, with nothing left over from any
# other job or run - the multi-layer image pull that `supabase start` performs
# in the seconds before it starts the database container can be handed 54322 as
# the source port of one of its own connections to the registry. Docker then
# tries to publish 0.0.0.0:54322 for supabase_db_<project>, the bind returns
# EADDRINUSE, and the job dies:
#
#   failed to bind host port for 0.0.0.0:54322:172.18.0.2:5432/tcp:
#   address already in use
#
# Nothing leaked and nothing collided across jobs. The kernel simply lent out a
# port the stack was a quarter of a second away from claiming. That is why the
# failure is rare, unreproducible on demand, and immune to any amount of
# stop/cleanup discipline in the workflow.
#
# THE FIX, IN TWO LAYERS
#
# `reserve-ports` puts the block into net.ipv4.ip_local_reserved_ports, which
# the kernel documents as ports "reserved for known third-party applications"
# that "will not be used by automatic port assignments". Run it as early in the
# job as possible - the reservation only governs assignments made after it.
#
# `start` covers the residual window, in which a connection opened BEFORE the
# reservation still holds the port. It retries a host-port bind conflict and
# nothing else: any other failure is a real failure and exits immediately, so
# this can never mask a broken stack.
#
# Usage:
#   scripts/isolated-supabase.sh reserve-ports
#   scripts/isolated-supabase.sh start

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
config_file="$repo_root/supabase/config.toml"

# Excluded because no test drives them and every one costs pull and boot time.
excluded_services='realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor,mailpit'

if [ ! -f "$config_file" ]; then
  echo "::error::isolated-supabase: $config_file not found" >&2
  exit 1
fi

# Read the published ports out of config.toml rather than restating them, so
# the reservation can never drift from the ports actually bound.
published_ports() {
  awk -F= '
    /^[[:space:]]*(shadow_)?port[[:space:]]*=/ {
      gsub(/[^0-9]/, "", $2)
      if ($2 != "") print $2
    }
  ' "$config_file" | sort -un
}

project_id() {
  awk -F'"' '/^[[:space:]]*project_id[[:space:]]*=/ { print $2; exit }' "$config_file"
}

reserve_ports() {
  local knob=/proc/sys/net/ipv4/ip_local_reserved_ports
  local ports existing desired
  ports="$(published_ports | paste -sd, -)"

  if [ -z "$ports" ]; then
    echo "::error::isolated-supabase: no ports found in $config_file" >&2
    return 1
  fi

  if [ ! -e "$knob" ]; then
    echo "isolated-supabase: $knob absent (not Linux); nothing to reserve"
    return 0
  fi

  # Logged on every run: this is the premise the whole fix rests on, and it
  # should be visible in CI rather than asserted in a comment.
  echo "isolated-supabase: ephemeral range $(tr '\t' '-' </proc/sys/net/ipv4/ip_local_port_range)"
  echo "isolated-supabase: stack ports $ports"

  existing="$(cat "$knob")"
  if [ -n "$existing" ]; then
    desired="$existing,$ports"
  else
    desired="$ports"
  fi

  if sysctl -qw "net.ipv4.ip_local_reserved_ports=$desired" 2>/dev/null; then
    :
  elif command -v sudo >/dev/null 2>&1 &&
    sudo -n sysctl -qw "net.ipv4.ip_local_reserved_ports=$desired" 2>/dev/null; then
    :
  else
    # Not fatal. The guarded start below is the layer that actually has to
    # hold, and it holds without this.
    echo "::warning::isolated-supabase: could not reserve $ports; the guarded start still retries a bind conflict"
    return 0
  fi

  echo "isolated-supabase: reserved $(cat "$knob") against ephemeral assignment"
}

remove_project_containers() {
  local ids
  ids="$(docker ps -aq --filter "name=_$(project_id)\$" 2>/dev/null || true)"
  if [ -n "$ids" ]; then
    # shellcheck disable=SC2086
    docker rm -f $ids >/dev/null 2>&1 || true
  fi
}

start_stack() {
  local attempts=3 attempt status log
  log="$(mktemp)"

  for attempt in $(seq 1 "$attempts"); do
    set +e
    supabase start --exclude "$excluded_services" 2>&1 | tee "$log"
    status="${PIPESTATUS[0]}"
    set -e

    if [ "$status" -eq 0 ]; then
      rm -f "$log"
      return 0
    fi

    if ! grep -qiE 'failed to bind host port|address already in use|port is already allocated' "$log"; then
      echo "::error::isolated-supabase: supabase start failed for a reason unrelated to host-port binding; not retrying" >&2
      rm -f "$log"
      return "$status"
    fi

    if [ "$attempt" -eq "$attempts" ]; then
      echo "::error::isolated-supabase: lost the host-port race $attempts times" >&2
      rm -f "$log"
      return "$status"
    fi

    echo "isolated-supabase: host port still held (attempt $attempt/$attempts); clearing and retrying"
    supabase stop --no-backup >/dev/null 2>&1 || true
    remove_project_containers
    # Long enough to outlast the 60s TIME_WAIT that can hold a source port.
    sleep "$((attempt * 15))"
  done
}

case "${1:-}" in
  reserve-ports) reserve_ports ;;
  start) start_stack ;;
  *)
    echo "usage: $(basename "$0") {reserve-ports|start}" >&2
    exit 2
    ;;
esac
