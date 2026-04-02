#!/usr/bin/env bash
# =============================================================================
# Claude Code /buddy Salt Patcher
#
# Usage:
#   ./buddy-patch.sh <new-salt>
#   ./buddy-patch.sh --restore
#   ./buddy-patch.sh --verify
#
# The new salt MUST be exactly 15 characters (same length as "friend-2026-401")
# =============================================================================

set -euo pipefail

ORIGINAL_SALT="friend-2026-401"
SALT_LEN=${#ORIGINAL_SALT}  # 15
BINARY_DIR="$HOME/.local/share/claude/versions"
BACKUP_SUFFIX=".buddy-bak"

# Find the current Claude Code binary
find_binary() {
  local latest
  latest=$(ls -t "$BINARY_DIR" 2>/dev/null | head -1)
  if [[ -z "$latest" ]]; then
    echo "ERROR: No Claude Code binary found in $BINARY_DIR" >&2
    return 1
  fi
  echo "$BINARY_DIR/$latest"
}

# Verify salt is present in binary (by raw byte match, not variable name)
verify_salt() {
  local binary="$1" salt="$2"
  local count
  count=$(grep -c --binary-files=binary -F "$salt" "$binary" || true)
  echo "$count"
}

# Patch the binary
do_patch() {
  local new_salt="$1"

  if [[ ${#new_salt} -ne $SALT_LEN ]]; then
    echo "ERROR: Salt must be exactly $SALT_LEN characters. Got ${#new_salt}: '$new_salt'" >&2
    exit 1
  fi

  local binary
  binary=$(find_binary)
  echo "Binary: $binary"

  # Check original salt is present
  local orig_count
  orig_count=$(verify_salt "$binary" "$ORIGINAL_SALT")
  local new_count
  new_count=$(verify_salt "$binary" "$new_salt")

  if [[ "$orig_count" -eq 0 && "$new_count" -eq 0 ]]; then
    echo "ERROR: Neither original nor new salt found in binary. Already patched with something else?" >&2
    exit 1
  fi

  if [[ "$new_count" -gt 0 ]]; then
    echo "Binary already patched with '$new_salt' ($new_count occurrences)"
    exit 0
  fi

  echo "Found original salt ($orig_count occurrences)"

  # Backup
  local backup="${binary}${BACKUP_SUFFIX}"
  if [[ ! -f "$backup" ]]; then
    echo "Creating backup: $backup"
    cp "$binary" "$backup"
  else
    echo "Backup already exists: $backup"
  fi

  # Patch using perl (safer than sed for binary files)
  echo "Patching: '$ORIGINAL_SALT' -> '$new_salt'"
  perl -pi -e "s/\Qfriend-2026-401\E/$new_salt/g" "$binary"

  # Verify patch content
  local after_count
  after_count=$(verify_salt "$binary" "$new_salt")
  if [[ "$after_count" -eq 0 ]]; then
    echo "ERROR: Patch verification failed. Restoring backup..."
    cp "$backup" "$binary"
    exit 1
  fi

  echo "Patched $after_count occurrences"

  # Re-sign with ad-hoc signature (macOS only -- Linux doesn't need codesign)
  if command -v codesign &>/dev/null; then
    echo "Re-signing binary (ad-hoc)..."
    codesign --remove-signature "$binary" 2>/dev/null || true
    codesign -s - -f --preserve-metadata=entitlements "$binary" 2>&1
    if [[ $? -ne 0 ]]; then
      echo "WARNING: Re-sign failed, binary may not launch. Restoring..."
      cp "$backup" "$binary"
      exit 1
    fi
  else
    echo "Skipping codesign (not macOS)"
  fi

  echo "SUCCESS: Patched"

  echo ""
  echo "Next steps:"
  echo "  1. Run: bun /Users/miyago/Downloads/buddy-verify.ts '$new_salt'"
  echo "  2. Start Claude Code and run /buddy"
  echo ""
  echo "To restore: $0 --restore"
}

# Restore from backup
do_restore() {
  local binary
  binary=$(find_binary)
  local backup="${binary}${BACKUP_SUFFIX}"

  if [[ ! -f "$backup" ]]; then
    echo "ERROR: No backup found at $backup" >&2
    exit 1
  fi

  echo "Restoring: $backup -> $binary"
  cp "$backup" "$binary"

  local count
  count=$(verify_salt "$binary" "$ORIGINAL_SALT")
  echo "Restored. Original salt found: $count occurrences"
}

# Verify current state
do_verify() {
  local binary
  binary=$(find_binary)
  echo "Binary: $binary"

  local orig_count
  orig_count=$(verify_salt "$binary" "$ORIGINAL_SALT")
  echo "Original salt ('$ORIGINAL_SALT'): $orig_count occurrences"

  local backup="${binary}${BACKUP_SUFFIX}"
  if [[ -f "$backup" ]]; then
    echo "Backup exists: $backup"
  else
    echo "No backup found"
  fi

  # Try to detect any patched salt
  echo ""
  echo "Raw salt occurrences:"
  grep -boa "$ORIGINAL_SALT" "$binary" | head -5 || echo "(none)"
}

# Main
case "${1:-}" in
  --restore)
    do_restore
    ;;
  --verify)
    do_verify
    ;;
  "")
    echo "Usage:"
    echo "  $0 <new-15-char-salt>   Patch the binary"
    echo "  $0 --restore            Restore from backup"
    echo "  $0 --verify             Check current state"
    echo ""
    echo "Examples (legendary picks for Miyago):"
    echo "  $0 'friend-2026-ad5'    # legendary blob + propeller"
    echo "  $0 'friend-2026-agk'    # legendary ghost + beanie, DEB/PAT 100"
    echo "  $0 'friend-2026-aia'    # legendary duck + tinyduck, WIS/SNK 100"
    echo "  $0 'friend-2026-aip'    # legendary dragon + beanie"
    echo "  $0 'friend-2026-dhz'    # legendary cat + crown"
    ;;
  *)
    do_patch "$1"
    ;;
esac
