#!/bin/bash
# RouterDiag Local Test Harness
# This script simulates the router environment using a snapshot

SNAPSHOT_FILE="/home/wner/.gemini/tmp/owner/router_snapshot.txt"
PROJECT_DIR="/mnt/c/Users/Owner/Documents/Github/RouterDiag"
FAKE_ROOT="/tmp/router-diag-test"

# Setup fake environment
rm -rf "$FAKE_ROOT"
mkdir -p "$FAKE_ROOT/proc" "$FAKE_ROOT/sys/class/thermal" "$FAKE_ROOT/tmp" "$FAKE_ROOT/mnt/usb/router-diag"

# Helper to extract from snapshot
get_snap() {
    sed -n "/\[$1\]/,/\[/p" "$SNAPSHOT_FILE" | grep -v "\[" | grep -v "^$"
}

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

# Load the real script FIRST
source "$PROJECT_DIR/usr/bin/router-diag" --no-exec

# --- OVERRIDE Functions AFTER sourcing ---

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

pgrep() {
    get_snap "SERVICES" | grep -iq "$2" && echo "1234" || return 1
}

ifstatus() {
    get_snap "IFSTATUS_${1^^}"
}

uci() {
    case "$1" in
        show) get_snap "${2^^}" ;;
        get)  get_snap "${2^^}" | grep "$2" | cut -d"'" -f2 | head -1 ;;
        *) echo "" ;;
    esac
}

nft() {
    get_snap "NFT"
}

modemband.sh() {
    get_snap "MODEMBAND"
}

jsonfilter() {
    if command -v jq >/dev/null 2>&1; then
        local pattern
        pattern=$(echo "$2" | sed 's/@.//; s/\[0\]//g')
        jq -r ".$pattern"
    else
        echo "MOCK_JSON_VALUE"
    fi
}

# Mock cat to use our fake root for /proc and /sys
cat() {
    local real_cat=$(which cat)
    if [[ "$1" == /proc/* ]] || [[ "$1" == /sys/* ]]; then
        $real_cat "$FAKE_ROOT$1"
    else
        $real_cat "$@"
    fi
}

# --- RUN TEST ---
echo "--- TEST: LuCI JSON Output ---"
cmd_luci_json
echo ""
echo "--- TEST: Prompt Generation ---"
build_analysis_prompt "2026-05-10 15:00:00,-112,-8,-80,5,30,100,200,0.50,250000,60,61" "test_trigger"
