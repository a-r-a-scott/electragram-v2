#!/bin/sh
# entrypoint.sh — load JWT keys from PEM files into environment variables
# before handing off to the actual service command.
#
# This allows keys to be stored as files (never embedded in .env) while
# still satisfying services that read JWT_PRIVATE_KEY / JWT_PUBLIC_KEY
# from the environment.

if [ -n "$JWT_PRIVATE_KEY_FILE" ] && [ -f "$JWT_PRIVATE_KEY_FILE" ] && [ -z "$JWT_PRIVATE_KEY" ]; then
  JWT_PRIVATE_KEY=$(cat "$JWT_PRIVATE_KEY_FILE")
  export JWT_PRIVATE_KEY
fi

if [ -n "$JWT_PUBLIC_KEY_FILE" ] && [ -f "$JWT_PUBLIC_KEY_FILE" ] && [ -z "$JWT_PUBLIC_KEY" ]; then
  JWT_PUBLIC_KEY=$(cat "$JWT_PUBLIC_KEY_FILE")
  export JWT_PUBLIC_KEY
fi

exec "$@"
