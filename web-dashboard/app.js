const express = require('express');
const axios = require('axios');
const app = express();

// Bitcoin RPC Configuration
const BITCOIN_RPC = {
  host: process.env.BITCOIN_HOST || 'bitcoin',
  port: process.env.BITCOIN_PORT || 8332,
  user: process.env.BITCOIN_USER || 'bitcoinuser',
  password: process.env.BITCOIN_PASSWORD || 'CHANGE_THIS_TO_A_STRONG_PASSWORD'
};

// State for tracking metrics
let startTime = Date.now();
let previousBlockCount = 0;
let blockCheckTime = Date.now();

// Make RPC calls
async function callBitcoinRpc(method, params = []) {
  try {
    const response = await axios.post(
      `http://${BITCOIN_RPC.host}:${BITCOIN_RPC.port}/`,
      {
        jsonrpc: '1.0',
        id: 'webhook',
        method: method,
        params: params
      },
      {
        auth: {
          username: BITCOIN_RPC.user,
          password: BITCOIN_RPC.password
        },
        timeout: 10000
      }
    );
    
    return response.data.result;
  } catch (error) {
    console.error(`RPC Error calling ${method}:`, error.message);
    throw error;
  }
}

// Serve static HTML with enhanced dashboard
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Bitcoin Node Dashboard</title>
      <style>
        :root {
          --bg-primary: #ffffff;
          --bg-secondary: #f5f5f5;
          --bg-tertiary: #efefef;
          --text-primary: #1a1a1a;
          --text-secondary: #666666;
          --text-tertiary: #999999;
          --border-color: #e0e0e0;
          --accent-primary: #667eea;
          --accent-secondary: #764ba2;
          --success: #4caf50;
          --warning: #ff9800;
          --danger: #f44336;
          --info: #2196f3;
        }

        html.dark-mode {
          --bg-primary: #1e1e1e;
          --bg-secondary: #2d2d2d;
          --bg-tertiary: #3d3d3d;
          --text-primary: #e0e0e0;
          --text-secondary: #b0b0b0;
          --text-tertiary: #808080;
          --border-color: #404040;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          background: linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%);
          min-height: 100vh;
          padding: 12px;
          color: var(--text-primary);
          transition: background 0.3s ease;
        }

        html.dark-mode body {
          background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
        }

        .wrapper {
          max-width: 1200px;
          margin: 0 auto;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          flex-wrap: wrap;
          gap: 10px;
        }

        .title {
          font-size: 24px;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 8px;
          color: white;
        }

        .controls {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .btn {
          padding: 8px 16px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .btn-refresh {
          background: rgba(255,255,255,0.2);
          color: white;
          backdrop-filter: blur(10px);
        }

        .btn-refresh:hover {
          background: rgba(255,255,255,0.3);
        }

        .btn-theme {
          background: rgba(255,255,255,0.2);
          color: white;
          backdrop-filter: blur(10px);
        }

        .btn-theme:hover {
          background: rgba(255,255,255,0.3);
        }

        .dashboard {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 16px;
          margin-bottom: 20px;
        }

        .card {
          background: var(--bg-primary);
          border-radius: 12px;
          padding: 20px;
          box-shadow: 0 4px 15px rgba(0,0,0,0.1);
          transition: all 0.3s ease;
          border-left: 4px solid var(--accent-primary);
        }

        html.dark-mode .card {
          box-shadow: 0 4px 15px rgba(0,0,0,0.4);
        }

        .card:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0,0,0,0.15);
        }

        .card-label {
          font-size: 12px;
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
          font-weight: 600;
        }

        .card-value {
          font-size: 24px;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 8px;
          word-break: break-word;
        }

        .card-unit {
          font-size: 12px;
          color: var(--text-secondary);
          font-weight: 500;
        }

        .card-progress {
          width: 100%;
          height: 6px;
          background: var(--bg-secondary);
          border-radius: 3px;
          overflow: hidden;
          margin-top: 8px;
        }

        .card-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--accent-primary), var(--accent-secondary));
          border-radius: 3px;
          transition: width 0.4s ease;
        }

        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 12px;
          background: var(--bg-secondary);
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          margin-top: 8px;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          animation: pulse 2s infinite;
        }

        .status-dot.synced { background: var(--success); }
        .status-dot.syncing { background: var(--warning); animation: pulse 1s infinite; }
        .status-dot.offline { background: var(--danger); }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .grid-2 {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 16px;
        }

        .error-box {
          background: var(--danger);
          color: white;
          padding: 16px;
          border-radius: 8px;
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .loading {
          text-align: center;
          color: var(--text-secondary);
          font-style: italic;
          padding: 40px 20px;
        }

        .stats-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 12px;
          margin-top: 12px;
        }

        .stat-mini {
          background: var(--bg-secondary);
          padding: 10px;
          border-radius: 6px;
          text-align: center;
        }

        .stat-mini-value {
          font-size: 16px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .stat-mini-label {
          font-size: 10px;
          color: var(--text-tertiary);
          margin-top: 4px;
          text-transform: uppercase;
        }

        .timestamp {
          font-size: 12px;
          color: var(--text-tertiary);
          margin-top: 12px;
          text-align: right;
        }

        @media (max-width: 640px) {
          body {
            padding: 8px;
          }

          .header {
            flex-direction: column;
            align-items: flex-start;
          }

          .title {
            font-size: 20px;
            width: 100%;
          }

          .controls {
            width: 100%;
            gap: 8px;
          }

          .btn {
            flex: 1;
            padding: 10px 12px;
            font-size: 12px;
          }

          .dashboard {
            grid-template-columns: 1fr;
            gap: 12px;
          }

          .card {
            padding: 16px;
          }

          .card-value {
            font-size: 20px;
          }

          .stats-row {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        .card.accent-1 { border-left-color: #667eea; }
        .card.accent-2 { border-left-color: #764ba2; }
        .card.accent-3 { border-left-color: #f093fb; }
        .card.accent-4 { border-left-color: #4facfe; }
        .card.accent-5 { border-left-color: #43e97b; }
        .card.accent-6 { border-left-color: #fa709a; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="header">
          <div class="title">🪙 Bitcoin Node Dashboard</div>
          <div class="controls">
            <button class="btn btn-refresh" onclick="loadStatus()">🔄 Refresh</button>
            <button class="btn btn-theme" onclick="toggleTheme()">🌙 Theme</button>
          </div>
        </div>

        <div id="content">
          <div class="loading">Loading dashboard...</div>
        </div>
      </div>

      <script>
        // Theme management
        function initTheme() {
          const saved = localStorage.getItem('theme');
          if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.documentElement.classList.add('dark-mode');
          }
        }

        function toggleTheme() {
          document.documentElement.classList.toggle('dark-mode');
          const isDark = document.documentElement.classList.contains('dark-mode');
          localStorage.setItem('theme', isDark ? 'dark' : 'light');
        }

        function formatNumber(num) {
          return new Intl.NumberFormat('en-US').format(Math.floor(num));
        }

        function formatBytes(bytes) {
          if (bytes === 0) return '0 B';
          const k = 1024;
          const sizes = ['B', 'KB', 'MB', 'GB'];
          const i = Math.floor(Math.log(bytes) / Math.log(k));
          return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
        }

        function getBlockTime(data) {
          if (data.localblockcount && data.headers) {
            const blocksPerHour = 6; // ~10 minutes per block
            const hoursRemaining = (data.headers - data.localblockcount) / blocksPerHour;
            const daysRemaining = hoursRemaining / 24;
            if (daysRemaining > 1) return daysRemaining.toFixed(1) + ' days';
            if (hoursRemaining > 1) return hoursRemaining.toFixed(1) + ' hours';
            return 'Synced';
          }
          return 'N/A';
        }

        async function loadStatus() {
          const content = document.getElementById('content');
          
          try {
            const response = await fetch('/api/status');
            const data = await response.json();
            
            if (data.error) {
              content.innerHTML = \`<div class="error-box">❌ Connection Error: \${data.error}</div>\`;
              return;
            }

            const blockchain = data.blockchain;
            const syncPercent = (blockchain.verificationprogress * 100);
            const isSynced = syncPercent >= 99.99;
            const syncStatus = isSynced ? 'synced' : 'syncing';
            
            content.innerHTML = \`
              <div class="dashboard">
                <!-- Sync Status Card -->
                <div class="card accent-1">
                  <div class="card-label">Sync Status</div>
                  <div class="card-value">\${syncPercent.toFixed(2)}%</div>
                  <div class="card-progress">
                    <div class="card-progress-fill" style="width: \${Math.min(syncPercent, 100)}%"></div>
                  </div>
                  <div class="status-badge">
                    <span class="status-dot \${syncStatus}"></span>
                    \${syncPercent >= 99.99 ? '✓ Fully Synced' : '⟳ Syncing'}
                  </div>
                </div>

                <!-- Block Height Card -->
                <div class="card accent-2">
                  <div class="card-label">Block Height</div>
                  <div class="card-value">\${formatNumber(blockchain.blocks)}</div>
                  <div class="stat-mini-label">Current Block</div>
                  <div class="stats-row">
                    <div class="stat-mini">
                      <div class="stat-mini-value">\${formatNumber(blockchain.headers)}</div>
                      <div class="stat-mini-label">Headers</div>
                    </div>
                    <div class="stat-mini">
                      <div class="stat-mini-value">\${formatNumber(blockchain.headers - blockchain.blocks)}</div>
                      <div class="stat-mini-label">Behind</div>
                    </div>
                  </div>
                </div>

                <!-- Network Status Card -->
                <div class="card accent-3">
                  <div class="card-label">Network Status</div>
                  <div class="card-value">\${data.peers}</div>
                  <div class="card-unit">Connected Peers</div>
                  <div class="stats-row">
                    <div class="stat-mini">
                      <div class="stat-mini-value">\${data.networkInfo.connections}</div>
                      <div class="stat-mini-label">Connections</div>
                    </div>
                    <div class="stat-mini">
                      <div class="stat-mini-value">\${data.networkInfo.version}</div>
                      <div class="stat-mini-label">Version</div>
                    </div>
                  </div>
                </div>

                <!-- Difficulty Card -->
                <div class="card accent-4">
                  <div class="card-label">Network Difficulty</div>
                  <div class="card-value">\${blockchain.difficulty.toExponential(2)}</div>
                  <div class="card-unit">Current Difficulty</div>
                  <div class="stats-row">
                    <div class="stat-mini">
                      <div class="stat-mini-value">\${blockchain.chain}</div>
                      <div class="stat-mini-label">Chain</div>
                    </div>
                    <div class="stat-mini">
                      <div class="stat-mini-value">\${blockchain.blocks > 0 ? (blockchain.blocks / 144).toFixed(0) : 0}</div>
                      <div class="stat-mini-label">Days Active</div>
                    </div>
                  </div>
                </div>

                <!-- Memory & Performance Card -->
                <div class="card accent-5">
                  <div class="card-label">System Resources</div>
                  <div class="card-value">\${data.memory.toFixed(1)}</div>
                  <div class="card-unit">MB Memory Used</div>
                  <div class="stats-row">
                    <div class="stat-mini">
                      <div class="stat-mini-value">\${data.mempool || 0}</div>
                      <div class="stat-mini-label">Mempool TX</div>
                    </div>
                    <div class="stat-mini">
                      <div class="stat-mini-value">\${data.uptime}</div>
                      <div class="stat-mini-label">Uptime</div>
                    </div>
                  </div>
                </div>

                <!-- Chain State Card -->
                <div class="card accent-6">
                  <div class="card-label">ChainState Size</div>
                  <div class="card-value">\${formatBytes(data.chainstatesize)}</div>
                  <div class="card-unit">On Disk</div>
                  <div class="stats-row">
                    <div class="stat-mini">
                      <div class="stat-mini-value">\${getBlockTime(blockchain)}</div>
                      <div class="stat-mini-label">Time to Sync</div>
                    </div>
                    <div class="stat-mini">
                      <div class="stat-mini-value">\${blockchain.initialblockdownload ? 'IBD' : 'Done'}</div>
                      <div class="stat-mini-label">Status</div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="timestamp">Last updated: \${new Date().toLocaleTimeString()}</div>
            \`;
          } catch (error) {
            content.innerHTML = \`<div class="error-box">❌ Error: \${error.message}</div>\`;
          }
        }

        // Initialize
        initTheme();
        loadStatus();
        setInterval(loadStatus, 30000);
      </script>
    </body>
    </html>
  `);
});

// API endpoint for status
app.get('/api/status', async (req, res) => {
  try {
    // Get blockchain info
    const blockchainInfo = await callBitcoinRpc('getblockchaininfo');
    
    // Get network info
    const netInfo = await callBitcoinRpc('getnetworkinfo');
    const peers = netInfo.connections || 0;
    
    // Get memory info
    const memInfo = await callBitcoinRpc('getmemoryinfo');
    const memory = memInfo.locked ? memInfo.locked.used : 0;
    
    // Get mempool info
    let mempoolSize = 0;
    try {
      const mempoolInfo = await callBitcoinRpc('getmempoolinfo');
      mempoolSize = mempoolInfo.size || 0;
    } catch (e) {
      console.log('Mempool info not available');
    }
    
    // Get uptime
    let uptime = 'N/A';
    try {
      const uptimeSeconds = await callBitcoinRpc('uptime');
      if (uptimeSeconds) {
        const days = Math.floor(uptimeSeconds / 86400);
        const hours = Math.floor((uptimeSeconds % 86400) / 3600);
        uptime = days > 0 ? `${days}d ${hours}h` : `${hours}h`;
      }
    } catch (e) {
      console.log('Uptime not available');
    }

    // Get chainstate size estimate
    let chainstatesize = 0;
    try {
      const chainsstats = await callBitcoinRpc('getchainsstats', [1]);
      chainstatesize = chainsstats ? chainsstats.bytes_serialized : 0;
    } catch (e) {
      console.log('Chainstate size not available');
    }

    res.json({
      blockchain: blockchainInfo,
      peers: peers,
      memory: memory / (1024 * 1024), // Convert to MB
      networkInfo: {
        version: netInfo.version || 'Unknown',
        connections: netInfo.connections || 0,
        inbound: netInfo.connections_in || 0,
        outbound: netInfo.connections_out || 0
      },
      mempool: mempoolSize,
      uptime: uptime,
      chainstatesize: chainstatesize,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching status:', error.message);
    res.json({
      error: error.message,
      message: 'Unable to connect to Bitcoin RPC'
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Bitcoin Node Dashboard listening on port ${PORT}`);
});
