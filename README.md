# RouterDiag

AI-Powered Router Diagnostics for OpenWrt (specifically designed for Xunison Exigo D50 5G (Qualcomm ipq50xx, Quectel RM500Q-AE modem, mainline ath11k WiFi)).

## Overview

`RouterDiag` is a lightweight diagnostic and monitoring tool that continuously tracks LTE signal performance, network stability, and system health. It leverages the Google Gemini AI (e.g., `gemini-2.5-flash`) to analyse telemetry data and provide actionable recommendations for network optimisation.

## Key Features

- **Dynamic Sensor Monitoring:** Automatically detects and allows selection of multiple hardware temperature sensors (CPU, WiFi, UBI, etc.).
- **Per-Sensor Thresholds:** Customisable warning and critical temperature ranges for each individual sensor.
- **Signal & System Telemetry:** Tracks RSRP, RSRQ, RSSI, SNR, Carrier Aggregation status, CPU load, and memory usage.
- **LuCI Web Interface:** Integrated dashboard for real-time monitoring and easy configuration of all parameters including sensors.
- **AI-Powered Analysis:** Sends collected metrics to Gemini for expert diagnosis.
- **Email Alerts:** Automated notifications via `msmtp` for critical events (e.g., low signal, high temperature).
- **Auto-Fix Capabilities:** Automatically attempts to restart services or reload the firewall if issues are detected.
- **External Logging:** Stores history on USB storage to protect internal flash memory.

## Project Structure

- `usr/bin/router-diag`: The main diagnostic script.
- `etc/init.d/router-diag`: OpenWrt procd init script for automatic startup.

## Requirements

- OpenWrt 21.x, 22.x, 23.x, or SNAPSHOT.
- `sms_tool` for modem communication.
- `msmtp` for email notifications.
- `curl` for AI API interactions.
- A valid Google Gemini API Key.

## Installation (Manual)

1. Copy `usr/bin/router-diag` to `/usr/bin/`.
2. Copy `etc/init.d/router-diag` to `/etc/init.d/`.
3. Make both scripts executable: `chmod +x /usr/bin/router-diag /etc/init.d/router-diag`.
4. Enable the service: `/etc/init.d/router-diag enable`.
5. Run the setup: `router-diag setup`.

## Usage

```bash
router-diag {setup|start|stop|status|analyze|history|log|config}
```

---
*Created by Steve Meek*
