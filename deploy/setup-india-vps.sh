#!/usr/bin/env bash
# Chaos Arena match server on a VPS in India (fresh Ubuntu 22.04 / 24.04; x86 or Arm, e.g. Oracle Cloud's
# free Ampere A1 in Mumbai or Hyderabad, or a paid Bangalore droplet). Run as root:
#
#   ORIGIN=https://pokemon-gules-delta.vercel.app BRANCH=master bash setup-india-vps.sh
#
# Optional: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (the same values as on Render, so the
# leaderboard and wallets are shared), REPO. It installs Node 20 and Caddy (automatic HTTPS), runs the
# server as an unprivileged systemd service, and prints the wss:// address to give Vercel.
# The HTTPS name is <ip>.sslip.io, a free DNS service, so no domain is needed; swap in your own later
# by editing /etc/caddy/Caddyfile.
set -euo pipefail
: "${ORIGIN:?set ORIGIN to the address of the game, e.g. https://pokemon-gules-delta.vercel.app}"
BRANCH=${BRANCH:-master}
REPO=${REPO:-https://github.com/Navaneeth77/Pokemon.git}
IP=$(curl -4 -fsS https://api.ipify.org)
HOST="${IP//./-}.sslip.io"

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt-get update -y
apt-get install -y caddy

id -u chaos >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin chaos
if [ -d /home/chaos/app/.git ]; then
  sudo -u chaos git -C /home/chaos/app fetch --depth 1 origin "$BRANCH"
  sudo -u chaos git -C /home/chaos/app checkout -q -B "$BRANCH" FETCH_HEAD
else
  sudo -u chaos git clone --depth 1 --branch "$BRANCH" "$REPO" /home/chaos/app
fi
(cd /home/chaos/app && sudo -u chaos npm ci --omit=dev)

umask 077
cat > /etc/chaos-arena.env <<ENV
PORT=8787
ALLOWED_ORIGINS=$ORIGIN
UPSTASH_REDIS_REST_URL=${UPSTASH_REDIS_REST_URL:-}
UPSTASH_REDIS_REST_TOKEN=${UPSTASH_REDIS_REST_TOKEN:-}
ENV
umask 022

cat > /etc/systemd/system/chaos-arena.service <<'UNIT'
[Unit]
Description=Chaos Arena match server
After=network-online.target
Wants=network-online.target

[Service]
User=chaos
WorkingDirectory=/home/chaos/app
EnvironmentFile=/etc/chaos-arena.env
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
UNIT

printf '%s {\n\treverse_proxy 127.0.0.1:8787\n}\n' "$HOST" > /etc/caddy/Caddyfile
command -v ufw >/dev/null && ufw status | grep -q active && ufw allow 80,443/tcp || true
# Oracle Cloud's Ubuntu images reject everything but SSH in iptables: open the web ports before that rule.
if command -v iptables >/dev/null && iptables -S INPUT 2>/dev/null | grep -q -- '-j REJECT'; then
  for port in 80 443; do
    iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null && continue
    n=$(iptables -L INPUT --line-numbers -n | awk '/REJECT/{print $1; exit}')
    iptables -I INPUT "$n" -p tcp --dport "$port" -j ACCEPT
  done
  command -v netfilter-persistent >/dev/null && netfilter-persistent save || true
fi
systemctl daemon-reload
systemctl enable --now chaos-arena
systemctl restart caddy

echo
echo "Done. Check:   https://$HOST/health   (should show \"ok\":true)"
echo "Then in Vercel set  VITE_MATCH_SERVER_URL=wss://$HOST  and redeploy."
echo "Logs:          journalctl -u chaos-arena -f"
echo "If /health doesn't load, open ports 80 and 443 in the provider's firewall."
