# Bitcoin Node Dashboard - Quick Reference

## 🚀 Quick Start
```bash
# 1. Build and start all services
docker-compose up -d

# 2. Check status
docker-compose ps

# 3. View logs
docker-compose logs -f
```

## 🌐 Access Dashboard
- **Local**: http://localhost:3000
- **Public IP**: http://YOUR_PUBLIC_IP:3000

## 📊 What You'll See
- Bitcoin blocks synced (%)
- Current block height
- Connected peers
- Network difficulty
- Memory usage
- Node version

## ⚙️ Services

### Bitcoin Node (bitcoind)
- Port 8333: P2P network (external)
- Port 8332: RPC (internal to Docker only)
- Volume: ./bitcoin-data/blocks (blockchain data)

### Web Dashboard (web-dashboard)
- Port 3000: API + web interface
- Queries Bitcoin RPC every 30 seconds
- Pure Node.js + Express (minimal dependencies)

## 🔑 Configuration

### bitcoin.conf Key Settings
```properties
server=1                          # Enable RPC
rpcbind=0.0.0.0                   # Listen on all interfaces
rpcallowip=172.16.0.0/12          # Allow Docker subnet
rpcuser=bitcoinuser
rpcpassword=CHANGE_THIS!
```

### docker-compose.yml Environment
```yaml
BITCOIN_HOST: bitcoin             # Service name (DNS resolution)
BITCOIN_PORT: 8332                # RPC port
BITCOIN_USER: bitcoinuser         # Must match bitcoin.conf
BITCOIN_PASSWORD: CHANGE_THIS!    # Must match bitcoin.conf
```

## 🔧 Common Tasks

### Restart Bitcoin Node
```bash
docker-compose restart bitcoin
```

### Rebuild Dashboard
```bash
docker-compose up -d --build web-dashboard
```

### View Bitcoin Logs
```bash
docker-compose logs -f bitcoin
```

### Stop Everything
```bash
docker-compose down
```

### Check Network Stats
```bash
docker exec bitcoin-pruned-node bitcoin-cli -conf=/home/bitcoin/.bitcoin/bitcoin.conf getnetworkinfo
docker exec bitcoin-pruned-node bitcoin-cli -conf=/home/bitcoin/.bitcoin/bitcoin.conf getblockchaininfo
```

## 🔒 Security Checklist
- [ ] Changed RPC password in bitcoin.conf
- [ ] Updated password in docker-compose.yml
- [ ] Configured MikroTik port forwarding for port 3000
- [ ] Dashboard is accessible, NOT raw RPC
- [ ] Firewall allows only necessary ports

## 📱 MikroTik Setup

### Port Forwarding (Natting)
```
In: Choose WAN interface
Protocol: tcp
Dst. Port: 3000
Action: dst-nat → to 192.168.1.X:3000  (your Docker host)
```

### Testing
```bash
# From your computer
curl http://YOUR_PUBLIC_IP:3000

# Should return HTML
```

## 🐛 Debugging

### Test Bitcoin RPC
```bash
docker exec bitcoin-pruned-node bitcoin-cli -conf=/home/bitcoin/.bitcoin/bitcoin.conf getblockchaininfo
```

### Test Dashboard
```bash
curl http://localhost:3000/api/status
# Should return JSON with blockchain info
```

### Check Docker Network
```bash
docker network ls
docker network inspect bitcoin_bitcoin-network
```

## 📈 Performance Tips
- Increase `dbcache` in bitcoin.conf for faster sync
- Use SSD for blockchain storage
- Allocate 2GB+ RAM to Docker
- Monitor with: `docker stats`

## 🆘 Still Having Issues?
Try these in order:
1. Check logs: `docker-compose logs -f`
2. Restart services: `docker-compose down && docker-compose up -d`
3. Check firewall on both Docker host and MikroTik
4. Verify bitcoin.conf is in ./bitcoin-data/ directory
5. Ensure RPC credentials match in both files

## 📝 Files Overview
```
.
├── docker-compose.yml          ← Main configuration (updated)
├── Dockerfile2                 ← Bitcoin image (updated)
├── bitcoin.conf                ← Bitcoin settings (update password!)
├── web-dashboard/
│   ├── Dockerfile              ← Dashboard image
│   ├── package.json            ← Node dependencies
│   ├── app.js                  ← Main app (queries RPC)
│   └── .dockerignore
├── bitcoin-data/               ← Blockchain data (mounted volume)
├── DASHBOARD_SETUP.md          ← Detailed setup guide
└── QUICK_REFERENCE.md          ← This file
```
