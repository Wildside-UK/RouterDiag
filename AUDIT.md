# Porting Audit: router-diag (MF286D to Xunison D50)

This audit identifies risks and required changes for porting the `router-diag` daemon from the ZTE MF286D (MIPS/ZTE Modem) to the Xunison D50 (ARM/Quectel Modem).

## Subprocess hang risks
The following external command invocations lack wall-clock timeouts, risking a complete wedge of the `daemon_loop` if the network stack, modem, or a specific service hangs.

| Line | Function | Command | Severity | Note |
|------|----------|---------|----------|------|
| 125 | `at_cmd` | `$SMS_TOOL -d "$AT_PORT" at "$cmd"` | **HIGH** | Used every cycle. Modem hang = daemon hang. |
| 146 | `send_email` | `msmtp "$EMAIL_TO"` | **MEDIUM** | Can hang on DNS resolution or slow SMTP server. |
| 421 | `mount_usb` | `mount "$USB_DEVICE" "$USB_MOUNT"` | **LOW** | Setup only, but can hang on corrupted filesystems. |
| 587 | `cmd_setup` | `curl -s -w ...` | **LOW** | No `--max-time`. Setup phase. |
| 925 | `collect_latency`| `ping -c 3 -W 2 "$target"` | **HIGH** | `-W 2` may not prevent indefinite hang in all busybox versions. |
| 1235 | `reset_modem` | `ifdown "$MODEM_IFACE"` | **MEDIUM** | Network stack hangs can block this indefinitely. |
| 2208 | `attempt_fix_interface` | `ifdown "$iface"` | **MEDIUM** | Same as above. |
| 2244 | `attempt_fix_wifi` | `iwinfo 2>/dev/null` | **MEDIUM** | If radio is wedged, `iwinfo` can hang. |
| 2248 | `attempt_fix_wifi` | `wifi down` | **MEDIUM** | Can block during radio re-init or CAC. |
| 2336 | `attempt_fix_dns` | `nslookup google.com 127.0.0.1` | **MEDIUM** | No timeout. |
| 2379 | `check_health` | `nft list ruleset` | **MEDIUM** | Large rulesets or nftables hang. |

**Recommendation:** Wrap critical calls in `timeout 15 ...` and ensure all `curl` calls use `--max-time`.

---

## ZTE-specific code paths
Existing code heavily assumes ZTE AT command syntax or `modemband.sh` behavior tailored for ZTE.

| Line | Function | Implementation | Quectel Equivalent | Fallback Status |
|------|----------|----------------|---------------------|-----------------|
| 778 | `collect_bands` | `AT+ZCAINFO?` | `AT+QCAINFO` | **Works** (has explicit fallback) |
| 887 | `collect_signal`| `AT+ZRSSI` | `AT+QCSQ` | **Works** (has explicit fallback) |
| 1219 | `reset_modem` | `AT+ZLOCKCELL=0` | `AT+QNWLOCK="release",1` (approx) | **Broken** (No Quectel path) |
| 1856 | `apply_action` | `modemband.sh setbands "$bands"` | `modemband.sh setbands ...` | **Risky** (Format of "$bands" differs) |
| 2984 | `daemon_loop` | `modemband.sh setbands "$PREFERRED_BANDS"` | See above | **Risky** |
| 2985 | `daemon_loop` | `AT+ZLOCKCELL=$PREFERRED_CELL` | `AT+QNWLOCK="common/4g",...` | **Broken** (No Quectel path) |

**Key Issue:** `PREFERRED_CELL` restoration (L2985) is strictly ZTE-only. On D50, this will likely return an error or hang if `sms_tool` doesn't handle the failure gracefully.

---

## qcawifi / wifi-stack assumptions
The script has some hardcoded assumptions about WiFi interface naming and behavior.

- **Interface Naming:** `check_wifi_thrashing` (L2903) uses `grep -oE 'wlan[0-9][-_]?[0-9]*'`. This is safer than `athX` but may miss D50-style `phy0-ap0` if not carefully tested.
- **CAC Awareness:** On the D50, 5GHz DFS channels (e.g., ch128) require a 600s (10-minute) CAC. `attempt_fix_wifi` (L2248-L2255) waits only 10 seconds before checking SSIDs. This will trigger a "Fix failed" false positive every time if 5GHz is on a DFS channel.
- **Auto-Fix Bounce:** Any `wifi reload` or `wifi up` on D50 will drop WiFi for 10 minutes if DFS is involved. The daemon needs to detect `Channel Availability Check (CAC)` state (via `ubus call network.wireless status`) before assuming failure.

---

## USB / persistence assumptions
D50 has no functional USB port. The script's persistence logic is heavily biased toward USB.

- **Device Scan:** `find_usb_device` (L374) scans `/dev/sd*`. D50 will return nothing.
- **Config Location:** `DIAG_DIR` selection (L20-L33) defaults to internal flash if no USB is found, which is correct, but `FLASH_SAFE_MODE=1` (L61) must be enforced to prevent wearing out the D50's SPI/eMMC.
- **Setup Wizard:** `cmd_setup` (L515) spends significant logic on formatting and mounting USB. This should be skipped or warned about on D50.

---

## procd / lifecycle
- **Fork-and-Exit:** `cmd_start` (L3168) backgrounds the `daemon_loop` using a subshell and returns. This breaks `procd` management. `procd` sees the parent exit and, due to `respawn`, will restart the script repeatedly. Each restart will attempt to kill the "stale" PID (L3158) and start a new background subshell.
- **Stdout/Stderr:** `procd` redirects stdout to the system log (L13 in init), but `log_msg` (L101) already calls `logger`. This causes double-logging if `echo` is used in the daemon.
- **Zombie Risks:** Backgrounding a subshell `( daemon_loop ) &` without proper signal handling in the shell script can leave orphan processes if the parent is killed.

---

## Stability watch + auto-fix loops
- **Restoration Loop:** In `daemon_loop` (L2972-2988), if `PREFERRED_BANDS` restoration fails or causes a modem re-init, the daemon might trigger it every cycle.
- **WiFi Thrashing:** `check_wifi_thrashing` (L2912) suggests `hostapd_cli` commands. D50 uses `hostapd` for mainline ath11k, so these are correct, but the interface name `$iface` must be accurate.
- **CAC False Positives:** As noted in the WiFi section, `attempt_fix_wifi` will repeatedly fail during a 10-minute CAC, potentially hitting the daily cap (L2072) prematurely.

---

## Config schema changes needed
- **`MODEM_IFACE`**: Default "modem" (L52) is correct if the UCI interface is named so, but the fallback `rmnet_mhi0.1` (L937) is specific to certain Quectel/ZTE integrations. D50 mainline usually uses `wwan0`.
- **`AT_PORT`**: Default `/dev/ttyUSB2` (L92) is ZTE-standard. RM500Q-AE on D50 might expose different ports (e.g., `/dev/ttyUSB3` or `/dev/mhi_uci_AT`).
- **`SENSORS`**: MF286D paths in defaults must be replaced with D50 paths (e.g., `thermal_zone0` for CPU).

---

## Other D50-specific issues
- **Architecture:** D50 is aarch64 (ARM), MF286D is MIPS. Busybox applets might have slight variations (e.g. `ping` arguments).
- **Memory:** D50 has more RAM, so `MEM_LOW_KB=20480` (20MB) is safe but could be increased.
- **Binary Dependencies:** Ensure `sms_tool`, `curl`, and `jsonfilter` are present in the D50 build. `modemband.sh` MUST be checked for Quectel support.
- **Shell:** The script uses `#!/bin/sh` (ash), which is correct for OpenWrt. No major bashisms found except here-strings (`<<<`) which `ash` supports in recent versions, but `<< METRICS` (L2933) is used here (standard here-doc).
