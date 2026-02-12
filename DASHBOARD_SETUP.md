# Bitcoin Node Status Dashboard - Setup Guide

## Overview
This setup adds a web dashboard to monitor your Bitcoin node's sync status via your public IP in MikroTik.

## Components Added

### 1. Web Dashboard Service (`web-dashboard/`)
- **app.js**: Node.js Express server that queries Bitcoin RPC
- **package.json**: Dependencies (express, axios)
- **Dockerfile**: Container configuration for the dashboard

### 2. Updated Files
- **docker-compose.yml**: Added web-dashboard service and network configuration
- **Dockerfile2**: Improved with better RPC exposure comments

## Setup Steps

### Step 1: Update RPC Credentials
Edit `bitcoin.conf` and change the default password:
```
rpcuser=bitcoinuser
rpcpassword=CHANGE_THIS_TO_A_STRONG_PASSWORD  ← Change this!
```

### Step 2: Update Docker Compose
If you changed the password in bitcoin.conf, also update it in docker-compose.yml:
```yaml
environment:
  BITCOIN_PASSWORD: YOUR_STRONG_PASSWORD  ← Must match bitcoin.conf
```

### Step 3: Start Services
```bash
docker-compose up -d
```

This will build and run:
- Bitcoin node on port 8332 (RPC) and 8333 (P2P)
- Web dashboard on port 3000

### Step 4: Configure MikroTik Port Forwarding

#### For Dashboard Access (Recommended)
Forward your public IP → Port 3000 to your Docker host:
1. Open MikroTik WebFig
2. Go to **IP → Firewall → NAT**
3. Add rule:
   - **Chain**: dstnat
   - **Dst. Address**: Your public IP
   - **Dst. Port**: 3000
   - **Protocol**: tcp
   - **Action**: dst-nat
   - **To Addresses**: Your Docker host internal IP (e.g., 192.168.1.10)
   - **To Ports**: 3000

#### For RPC Access (Optional - Advanced Users)
If you need direct RPC access:
1. Forward port 8332 similarly
2. Use: `http://YOUR_PUBLIC_IP:8332` with credentials
3. **⚠️ WARNING**: Only expose RPC if necessary. Dashboard is safer.

### Step 5: Access Dashboard
Open your browser and go to:
```
http://YOUR_PUBLIC_IP:3000
```

## Dashboard Features
- ✅ **Sync Status**: Shows blockchain verification progress
- ✅ **Block Height**: Current verified blocks
- ✅ **Block Headers**: Headers downloaded
- ✅ **Connected Peers**: Number of P2P connections
- ✅ **Difficulty**: Current network difficulty
- ✅ **Memory Usage**: RAM used by bitcoind
- ✅ **Auto-Refresh**: Updates every 30 seconds
- ✅ **Manual Refresh**: Click "🔄 Refresh" button

## Security Recommendations

1. **Change default RPC password** in bitcoin.conf
2. **Use HTTPS** in production (add nginx reverse proxy if needed)
3. **Firewall**: Only allow port 3000 from trusted IPs if possible
4. **Rate Limiting**: Consider adding rate limit to /api/status endpoint
5. **Monitor**: Check your Docker logs regularly:
   ```bash
   docker logs bitcoin-pruned-node
   docker logs bitcoin-dashboard
   ```

## Troubleshooting

### Dashboard shows "Connection Error"
```bash
# Check if services are running
docker ps

# View logs
docker logs bitcoin-dashboard
docker logs bitcoin-pruned-node

# Check network connectivity
docker exec bitcoin-dashboard ping bitcoin
```

### RPC Connection Refused
1. Verify bitcoin.conf has `server=1`
2. Check `rpcallowip=172.16.0.0/12` is set (Docker subnet)
3. Restart bitcoin: `docker restart bitcoin-pruned-node`

### Can't access from public IP
1. Verify MikroTik port forwarding is correct
2. Test locally first: `http://localhost:3000`
3. Check firewall rules on both Docker host and MikroTik
4. Verify no other service is using port 3000

## Docker Commands

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f

# Rebuild dashboard
docker-compose up -d --build web-dashboard

# Enter dashboard container
docker exec -it bitcoin-dashboard sh
```

## Optional: Nginx Reverse Proxy with HTTPS

If you want HTTPS support, add an nginx service to docker-compose.yml:
```yaml
  nginx:
    image: nginx:alpine
    container_name: bitcoin-reverse-proxy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/certs:ro
    depends_on:
      - web-dashboard
    networks:
      - bitcoin-network
```

## Notes
- Dashboard queries RPC every 30 seconds (configurable in HTML)
- Node.js dashboard is lightweight (~50MB)
- Bitcoin RPC is only accessible from Docker network (internal)
- Public access is only through the dashboard port (3000)
