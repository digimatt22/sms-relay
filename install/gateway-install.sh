#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="/opt/relayhub-gateway"
CONFIG_DIR="/etc/relayhub"
CONFIG_FILE="$CONFIG_DIR/gateway.env"
SERVICE_FILE="/etc/systemd/system/relayhub-gateway.service"
PACKAGE_URL="${RELAYHUB_GATEWAY_PACKAGE_URL:-https://sns.digicolony.net/gateway.tar.gz}"

prompt_value() {
  local variable_name="$1"
  local prompt="$2"
  local default_value="${3:-}"
  local required="${4:-false}"
  local value="${!variable_name:-}"

  if [[ -z "$value" ]]; then
    if [[ -n "$default_value" ]]; then
      read -r -p "$prompt [$default_value]: " value </dev/tty
      value="${value:-$default_value}"
    else
      read -r -p "$prompt: " value </dev/tty
    fi
  fi

  if [[ "$required" == "true" && -z "$value" ]]; then
    echo "$prompt is required"
    exit 1
  fi

  printf -v "$variable_name" "%s" "$value"
}

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: curl https://sns.digicolony.net/install | sudo bash"
  exit 1
fi

HUB_URL="${RELAYHUB_HUB_URL:-}"
GATEWAY_KEY="${RELAYHUB_GATEWAY_KEY:-}"
APN="${RELAYHUB_APN:-}"
CARRIER="${RELAYHUB_CARRIER:-}"
MODEM_MODE="${RELAYHUB_MODEM_MODE:-}"
SERIAL_DEVICE="${RELAYHUB_SERIAL_DEVICE:-}"
SERIAL_BAUD_RATE="${RELAYHUB_SERIAL_BAUD_RATE:-}"
POWER_KEY_GPIO="${RELAYHUB_POWER_KEY_GPIO:-}"
SIMCOM_CNMP="${RELAYHUB_SIMCOM_CNMP:-}"
SIMCOM_CMNB="${RELAYHUB_SIMCOM_CMNB:-}"

prompt_value HUB_URL "RelayHub server URL" "https://sns.digicolony.net" true
prompt_value GATEWAY_KEY "Gateway API key" "" true
prompt_value APN "Carrier APN for cellular data fallback (blank for SMS-only Wi-Fi backhaul)" "" false
prompt_value CARRIER "Carrier name" "Tello" false
prompt_value MODEM_MODE "Modem mode" "sim7070" false
prompt_value SERIAL_DEVICE "Serial device" "/dev/serial0" false
prompt_value SERIAL_BAUD_RATE "Serial baud rate" "115200" false
prompt_value POWER_KEY_GPIO "Power-key GPIO BCM pin" "4" false
prompt_value SIMCOM_CNMP "SIMCom CNMP network mode" "2" false
prompt_value SIMCOM_CMNB "SIMCom CMNB LTE-M/NB mode" "1" false

apt-get update
apt-get install -y curl ca-certificates xz-utils

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

mkdir -p "$INSTALL_DIR" "$CONFIG_DIR"

if [[ -f ./gateway.tar.gz ]]; then
  tar -xzf ./gateway.tar.gz -C "$INSTALL_DIR" --strip-components=1
else
  curl -fsSL "$PACKAGE_URL" | tar -xz -C "$INSTALL_DIR" --strip-components=1
fi

npm --prefix "$INSTALL_DIR" install --omit=dev

cat > "$CONFIG_FILE" <<EOF
RELAYHUB_HUB_URL="$HUB_URL"
RELAYHUB_GATEWAY_KEY="$GATEWAY_KEY"
RELAYHUB_APN="$APN"
RELAYHUB_CARRIER="$CARRIER"
RELAYHUB_MODEM_MODE="$MODEM_MODE"
RELAYHUB_SERIAL_DEVICE="$SERIAL_DEVICE"
RELAYHUB_SERIAL_BAUD_RATE="$SERIAL_BAUD_RATE"
RELAYHUB_POWER_KEY_GPIO="$POWER_KEY_GPIO"
RELAYHUB_SIMCOM_CNMP="$SIMCOM_CNMP"
RELAYHUB_SIMCOM_CMNB="$SIMCOM_CMNB"
RELAYHUB_HEARTBEAT_SECONDS="180"
RELAYHUB_POLL_SECONDS="10"
RELAYHUB_INBOUND_POLL_SECONDS="60"
RELAYHUB_MODEM_RESET_FAILURE_THRESHOLD="5"
RELAYHUB_PROCESS_RESTART_FAILURE_THRESHOLD="10"
RELAYHUB_RESET_MODEM_AFTER_SEND="${RELAYHUB_RESET_MODEM_AFTER_SEND:-false}"
RELAYHUB_MODEM_TRACE="${RELAYHUB_MODEM_TRACE:-false}"
RELAYHUB_LOG_LEVEL="info"
EOF

chmod 600 "$CONFIG_FILE"

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=RelayHub SMS Gateway
After=network-online.target
Wants=network-online.target
StartLimitBurst=20
StartLimitIntervalSec=300

[Service]
Type=simple
EnvironmentFile=$CONFIG_FILE
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/node $INSTALL_DIR/dist/index.js
Restart=always
RestartSec=10
TimeoutStartSec=90
User=root

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable relayhub-gateway
systemctl restart relayhub-gateway

echo "RelayHub gateway installed and started."
