#!/bin/bash
set -e

# Ensure .bitcoin directory exists and has correct permissions
mkdir -p /home/bitcoin/.bitcoin
chmod 700 /home/bitcoin/.bitcoin

# If bitcoin.conf doesn't exist in the mounted volume, copy it from the image
if [ ! -f /home/bitcoin/.bitcoin/bitcoin.conf ]; then
    echo "bitcoin.conf not found, copying from image..."
    cp /etc/bitcoin.conf /home/bitcoin/.bitcoin/bitcoin.conf 2>/dev/null || true
fi

# Ensure correct ownership and permissions
chown -R bitcoin:bitcoin /home/bitcoin/.bitcoin
chmod 600 /home/bitcoin/.bitcoin/bitcoin.conf 2>/dev/null || true

# Switch to bitcoin user and execute the command
exec su -s /bin/bash bitcoin -c "$*"
