#!/usr/bin/env bash
# =============================================================================
# Claude Code /buddy Bones Override Patcher
#
# Instead of patching the salt, this reverses the spread order in zC() so that
# bones stored in ~/.claude.json take precedence over recalculated ones.
#
# Strategy:
#   Original: return{...companion, ...bones}  -> bones wins (recalculated)
#   Patched:  return{...bones, ...companion}  -> companion JSON wins (our data)
#
# Uses stable anchors (property names, keywords) that survive minification.
# Only single-char variable names change across versions.
#
# Usage:
#   ./buddy-bones-patch.sh patch              Reverse spread in zC()
#   ./buddy-bones-patch.sh inject <json>      Inject bones into ~/.claude.json
#   ./buddy-bones-patch.sh restore            Restore from backup
#   ./buddy-bones-patch.sh verify             Check current state
#
# After patching, store desired bones in companion JSON:
#   ./buddy-bones-patch.sh inject '{"rarity":"legendary","species":"cat",...}'
# =============================================================================

set -euo pipefail

BINARY_DIR="$HOME/.local/share/claude/versions"
BACKUP_SUFFIX=".bones-bak"

find_binary() {
  local latest
  latest=$(ls -t "$BINARY_DIR" 2>/dev/null | head -1)
  if [[ -z "$latest" ]]; then
    echo "ERROR: No Claude Code binary found in $BINARY_DIR" >&2
    return 1
  fi
  echo "$BINARY_DIR/$latest"
}

do_patch() {
  local binary
  binary=$(find_binary)
  echo "Binary: $binary"

  # Find the stable pattern and extract variable names
  # Pattern: .companion;if(!X)return;let{bones:Y}=...(..());return{...X,...Y}}
  local match
  match=$(perl -0777 -ne '
    while (/\.companion;if\(!(\w)\)return;let\{bones:(\w)\}=\w+\(\w+\(\)\);return\{\.\.\.\1,\.\.\.(\2)\}\}/g) {
      print "$1,$2\n";
    }
  ' <(strings "$binary") | head -1)

  if [[ -z "$match" ]]; then
    # Check if already patched (reversed order)
    local rev_match
    rev_match=$(perl -0777 -ne '
      while (/\.companion;if\(!(\w)\)return;let\{bones:(\w)\}=\w+\(\w+\(\)\);return\{\.\.\.\2,\.\.\.\1\}\}/g) {
        print "reversed\n";
      }
    ' <(strings "$binary") | head -1)
    if [[ "$rev_match" == "reversed" ]]; then
      echo "Already patched (spread order reversed)"
      exit 0
    fi
    echo "ERROR: Could not find zC() pattern in binary" >&2
    exit 1
  fi

  local var_comp="${match%%,*}"
  local var_bones="${match##*,}"
  echo "Found zC(): companion=\$$var_comp, bones=\$$var_bones"

  # Build the exact search and replace strings
  local search="return{...${var_comp},...${var_bones}}}"
  local replace="return{...${var_bones},...${var_comp}}}"
  echo "Patch: '$search' -> '$replace'"

  # Count occurrences
  local count
  count=$(grep -c --binary-files=binary -F "$search" "$binary" || true)
  echo "Found $count occurrences"

  if [[ "$count" -eq 0 ]]; then
    echo "ERROR: Pattern not found in binary" >&2
    exit 1
  fi

  # Backup
  local backup="${binary}${BACKUP_SUFFIX}"
  if [[ ! -f "$backup" ]]; then
    echo "Creating backup: $backup"
    cp "$binary" "$backup"
  else
    echo "Backup already exists: $backup"
  fi

  # Patch (same length, safe for binary)
  perl -pi -e "s/\Q$search\E/$replace/g" "$binary"

  # Verify
  local after
  after=$(grep -c --binary-files=binary -F "$replace" "$binary" || true)
  if [[ "$after" -eq 0 ]]; then
    echo "ERROR: Patch verification failed. Restoring..."
    cp "$backup" "$binary"
    exit 1
  fi
  echo "Patched $after occurrences"

  # Re-sign (macOS only)
  if command -v codesign &>/dev/null; then
    echo "Re-signing binary (ad-hoc)..."
    codesign --remove-signature "$binary" 2>/dev/null || true
    codesign -s - -f --preserve-metadata=entitlements "$binary" 2>&1
    if [[ $? -ne 0 ]]; then
      echo "WARNING: Re-sign failed. Restoring..."
      cp "$backup" "$binary"
      exit 1
    fi
  else
    echo "Skipping codesign (not macOS)"
  fi

  echo "SUCCESS"
  echo ""
  echo "Next: inject bones into companion JSON:"
  echo "  $0 inject '{\"rarity\":\"legendary\",\"species\":\"cat\",\"eye\":\"@\",\"hat\":\"tinyduck\",\"shiny\":true,\"stats\":{...}}'"
}

do_inject() {
  local input="$1"
  local config="$HOME/.claude.json"
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  local presets_file="$script_dir/buddy-presets.json"

  if [[ ! -f "$config" ]]; then
    echo "ERROR: $config not found" >&2
    exit 1
  fi

  python3 -c "
import json, sys, os

input_str = sys.argv[1]
config_path = sys.argv[2]
presets_path = sys.argv[3]

# Try as preset name first
bones = None
if not input_str.startswith('{'):
    if os.path.exists(presets_path):
        with open(presets_path) as f:
            presets = json.load(f)
        if input_str in presets:
            bones = presets[input_str]
            bones.pop('_salt', None)
            bones.pop('_score', None)
            print(f'Using preset: {input_str}')
        else:
            print(f'Available presets: {\"  \".join(sorted(presets.keys()))}', file=sys.stderr)
            sys.exit(1)
    else:
        print(f'ERROR: Presets file not found: {presets_path}', file=sys.stderr)
        sys.exit(1)
else:
    bones = json.loads(input_str)

with open(config_path) as f:
    cfg = json.load(f)

if 'companion' not in cfg:
    print('ERROR: No companion in config. Run /buddy first.', file=sys.stderr)
    sys.exit(1)

for k in ('rarity','species','eye','hat','shiny','stats'):
    if k in bones:
        cfg['companion'][k] = bones[k]

with open(config_path, 'w') as f:
    json.dump(cfg, f, indent=2, ensure_ascii=False)

sh = ' SHINY' if bones.get('shiny') else ''
total = sum(bones['stats'].values()) if 'stats' in bones else '?'
print(f\"Injected: {bones.get('rarity','')} {bones.get('species','')} {bones.get('eye','')} {bones.get('hat','')}{sh} (total={total})\")
" "$input" "$config" "$presets_file"
}

do_restore() {
  local binary
  binary=$(find_binary)
  local backup="${binary}${BACKUP_SUFFIX}"

  if [[ ! -f "$backup" ]]; then
    echo "ERROR: No backup found at $backup" >&2
    exit 1
  fi

  cp "$backup" "$binary"

  # Re-sign
  if command -v codesign &>/dev/null; then
    codesign --remove-signature "$binary" 2>/dev/null || true
    codesign -s - -f --preserve-metadata=entitlements "$binary" 2>&1
  fi

  echo "Restored from backup"
}

do_verify() {
  local binary
  binary=$(find_binary)
  echo "Binary: $binary"

  local orig
  orig=$(perl -0777 -ne '
    while (/\.companion;if\(!(\w)\)return;let\{bones:(\w)\}=\w+\(\w+\(\)\);return\{\.\.\.\1,\.\.\.\2\}\}/g) {
      print "original\n";
    }
  ' <(strings "$binary") | head -1)

  local rev
  rev=$(perl -0777 -ne '
    while (/\.companion;if\(!(\w)\)return;let\{bones:(\w)\}=\w+\(\w+\(\)\);return\{\.\.\.\2,\.\.\.\1\}\}/g) {
      print "reversed\n";
    }
  ' <(strings "$binary") | head -1)

  if [[ "$orig" == "original" ]]; then
    echo "Status: UNPATCHED (bones override companion)"
  elif [[ "$rev" == "reversed" ]]; then
    echo "Status: PATCHED (companion overrides bones)"
  else
    echo "Status: UNKNOWN (pattern not found)"
  fi

  # Check companion JSON for stored bones
  local config="$HOME/.claude.json"
  if [[ -f "$config" ]]; then
    local has_bones
    has_bones=$(python3 -c "
import json
with open('$config') as f: c = json.load(f)
comp = c.get('companion', {})
if 'rarity' in comp:
    print(f\"Stored bones: {comp.get('rarity','')} {comp.get('species','')} shiny={comp.get('shiny','')}\")
else:
    print('No bones in companion JSON')
" 2>/dev/null)
    echo "$has_bones"
  fi

  local backup="${binary}${BACKUP_SUFFIX}"
  [[ -f "$backup" ]] && echo "Backup: $backup" || echo "No backup"
}

do_list() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  local presets_file="$script_dir/buddy-presets.json"

  if [[ ! -f "$presets_file" ]]; then
    echo "ERROR: No presets file at $presets_file" >&2
    exit 1
  fi

  python3 -c "
import json
with open('$presets_file') as f:
    presets = json.load(f)
for name, p in sorted(presets.items()):
    sh = ' SHINY' if p.get('shiny') else ''
    total = sum(p['stats'].values()) if 'stats' in p else '?'
    print(f\"  {name:<20} {p.get('species','?'):<10} {p.get('eye','?')} {p.get('hat','?'):<12} total={total}{sh}\")
"
}

case "${1:-}" in
  patch)    do_patch ;;
  inject)   do_inject "${2:-}" ;;
  list)     do_list ;;
  restore)  do_restore ;;
  verify)   do_verify ;;
  *)
    echo "Usage:"
    echo "  $0 patch                    Reverse spread order in zC()"
    echo "  $0 inject <preset-name>     Inject by preset name"
    echo "  $0 inject '<bones-json>'    Inject raw JSON"
    echo "  $0 list                     List available presets"
    echo "  $0 restore                  Restore from backup"
    echo "  $0 verify                   Check current state"
    echo ""
    echo "Examples:"
    echo "  $0 inject brineclaw"
    echo "  $0 inject dragon-shiny"
    echo "  $0 inject snail-shiny"
    ;;
esac
