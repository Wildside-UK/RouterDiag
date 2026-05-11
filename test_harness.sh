#!/bin/bash
# RouterDiag Local Test Harness
# This script simulates the router environment using a snapshot

SNAPSHOT_FILE="/home/wner/.gemini/tmp/owner/router_snapshot.txt"
PROJECT_DIR="/mnt/c/Users/Owner/Documents/Github/RouterDiag"
FAKE_ROOT="/tmp/router-diag-test"

# Helper to extract from snapshot
get_snap() {
    sed -n "/\[$1\]/,/\[/p" "$SNAPSHOT_FILE" | grep -v "\[" | grep -v "^$"
}

# Setup fake environment
rm -rf "$FAKE_ROOT"
mkdir -p "$FAKE_ROOT/proc" "$FAKE_ROOT/sys/class/thermal" "$FAKE_ROOT/tmp" "$FAKE_ROOT/mnt/usb/router-diag"
mkdir -p "$FAKE_ROOT/usr/share/router-diag"

# Create dummy files from snapshot
get_snap "FILE_EXISTS" | while read -r f; do
    mkdir -p "$FAKE_ROOT$(dirname "$f")"
    touch "$FAKE_ROOT$f"
done

# Mock Files
get_snap "LOADAVG" > "$FAKE_ROOT/proc/loadavg"
get_snap "MEMINFO" > "$FAKE_ROOT/proc/meminfo"
get_snap "NETDEV" > "$FAKE_ROOT/proc/netdev"

# Thermal mocking
get_snap "THERMAL" | while read -r line; do
    type=$(echo "$line" | cut -d: -f1)
    path=$(echo "$line" | cut -d: -f2 | sed 's|^/|'"$FAKE_ROOT"'/|')
    val=$(echo "$line" | cut -d: -f3)
    mkdir -p "$(dirname "$path")"
    echo "$val" > "$path"
done

# Override core paths in the script via environment
export USB_MOUNT="$FAKE_ROOT/mnt/usb"
export DIAG_DIR="$FAKE_ROOT/mnt/usb/router-diag"
export CONFIG_FILE="$DIAG_DIR/config.conf"
export METRICS_PATH="$DIAG_DIR/metrics.csv"
export ACTIVE_METRICS_FILE="$FAKE_ROOT/tmp/router-diag-active.csv"
export PID_FILE="$FAKE_ROOT/tmp/router-diag.pid"

# Mock core utilities
at_cmd() {
    case "$1" in
        AT+ZRSSI)    get_snap "ZRSSI" ;;
        AT+ZCAINFO?) get_snap "ZCAINFO" ;;
        AT+QCSQ)     get_snap "QCSQ" ;;
        AT+QCAINFO)  get_snap "QCAINFO" ;;
        AT+CSQ)      get_snap "CSQ" ;;
        *) echo "MOCK AT: $1" ;;
    esac
}
export -f at_cmd

pgrep() {
    get_snap "SERVICES" | grep -iq "$2" && echo "1234" || return 1
}
export -f pgrep

uci() {
    case "$1" in
        show) get_snap "${2^^}" ;;
        get)  get_snap "${2^^}" | grep "$2" | cut -d"'" -f2 | head -1 ;;
        *) echo "" ;;
    esac
}
export -f uci

nft() {
    get_snap "NFT"
}
export -f nft

modemband.sh() {
    get_snap "MODEMBAND"
}
export -f modemband.sh

jsonfilter() {
    if command -v jq >/dev/null 2>&1; then
        local pattern
        pattern=$(echo "$2" | sed 's/@.//; s/\[0\]//g')
        # Return empty if key not found to avoid triggering error checks in script
        jq -r ".$pattern // empty"
    else
        echo ""
    fi
}
export -f jsonfilter

# Mock curl to capture payload
curl() {
    local args=("$@")
    local i=0
    while [ $i -lt ${#args[@]} ]; do
        if [ "${args[$i]}" = "-d" ]; then
            local payload="${args[$((i+1))]}"
            echo "$payload" > "$FAKE_ROOT/tmp/last_payload.json"
            # Verify JSON if jq is available
            if command -v jq >/dev/null 2>&1; then
                if ! echo "$payload" | jq . >/dev/null 2>&1; then
                    echo "ERROR: Invalid JSON payload detected!" >&2
                    echo "$payload" >&2
                else
                    echo "SUCCESS: Valid JSON payload captured." >&2
                fi
            fi
            # Return a mock successful response
            echo '{"candidates":[{"content":{"parts":[{"text":"STATUS: GOOD\nDIAGNOSIS: Everything looks fine.\nRECOMMENDATIONS:\n- none\nACTION: none"}]}}]}'
            return 0
        fi
        i=$((i+1))
    done
    # If not a POST request, just return success
    return 0
}
export -f curl

# Mock logger
logger() {
    echo "LOGGER: $*"
}
export -f logger

# Load the real script
# We need to bypass the 'die' on missing config for some tests
source "$PROJECT_DIR/usr/bin/router-diag" --no-exec
GEMINI_API_KEY="mock_key"
GEMINI_MODEL="gemini-1.5-flash"

# --- RUN TEST ---
echo "--- TEST: LuCI JSON Output ---"
cmd_luci_json > /dev/null && echo "LuCI JSON generated successfully."

echo ""
echo "--- TEST: Prompt Generation & Gemini Request ---"
# Test with a prompt containing / and " to ensure escaping works
metrics="2026-05-10 15:00:00,-112,-8,-80,5,30,100,200,0.50,250000,60,61"
prompt="Test prompt with / and \"quotes\""
echo "Sending mock request with special characters..."
gemini_request "$prompt" > /dev/null

if [ -f "$FAKE_ROOT/tmp/last_payload.json" ]; then
    echo "Captured payload size: $(wc -c < "$FAKE_ROOT/tmp/last_payload.json") bytes"
    echo "Verifying escaping of special characters in payload..."
    if grep -q "Test prompt with / and \\\\\"quotes\\\\\"" "$FAKE_ROOT/tmp/last_payload.json"; then
        echo "SUCCESS: Special characters properly escaped."
    else
        echo "ERROR: Escaping failed!"
        cat "$FAKE_ROOT/tmp/last_payload.json"
    fi
fi
