#!/usr/bin/env bash
# Deletes the root data/ directory using a Docker container to bypass root-owned file permissions.
# Does NOT touch server/data/.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ ! -d "$SCRIPT_DIR/data" ]; then
  echo "Nothing to clean — data/ does not exist."
  exit 0
fi

echo "Deleting $SCRIPT_DIR/data via Docker..."
docker run --rm -v "$SCRIPT_DIR:/workspace" alpine sh -c "rm -rf /workspace/data"

echo "Done."
