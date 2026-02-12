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

const bitcoinRpc = axios.create({
  baseURL: `http://${BITCOIN_RPC.user}:${BITCOIN_RPC.password}@${BITCOIN_RPC.host}:${BITCOIN_RPC.port}`,
  auth: {
    username: BITCOIN_RPC.user,
    password: BITCOIN_RPC.password
  }
});

// Function to make RPC calls
async function bitcoinCall(method, params = []) {
  try {
    const response = await bitcoinCall.post('/', {
      jsonrpc: '1.0',
      id: 'webhook',
      method: method,
      params: params
    });
    return response.data.result;
  } catch (error) {
    console.error(`RPC Error: ${method}`, error.message);
    throw error;
  }
}

// Alternative: Use direct HTTP POST
async function callBitcoinRpc(method, params = []) {
  try {
    const options = {
      method: 'POST',
      url: `http://${BITCOIN_RPC.host}:${BITCOIN_RPC.port}/`,
      auth: {
        user: BITCOIN_RPC.user,
        pass: BITCOIN_RPC.password
      },
      json: true,
      body: {
        jsonrpc: '1.0',
        id: 'webhook',
        method: method,
        params: params
      }
    };
    
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
        }
      }
    );
    
    return response.data.result;
  } catch (error) {
    console.error(`RPC Error calling ${method}:`, error.message);
    throw error;
  }
}

// Serve static HTML
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Bitcoin Node Status</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 20px;
        }
        .container {
          background: white;
          border-radius: 10px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.3);
          padding: 40px;
          max-width: 600px;
          width: 100%;
        }
        h1 {
          color: #333;
          margin-bottom: 30px;
          text-align: center;
          font-size: 28px;
        }
        .status-grid {
          display: grid;
          gap: 15px;
        }
        .status-item {
          background: #f5f5f5;
          padding: 15px;
          border-radius: 8px;
          border-left: 4px solid #667eea;
        }
        .status-item label {
          display: block;
          color: #666;
          font-size: 12px;
          text-transform: uppercase;
          margin-bottom: 5px;
        }
        .status-item .value {
          font-size: 18px;
          font-weight: bold;
          color: #333;
          word-break: break-all;
        }
        .sync-bar {
          width: 100%;
          height: 8px;
          background: #e0e0e0;
          border-radius: 4px;
          overflow: hidden;
          margin-top: 10px;
        }
        .sync-fill {
          height: 100%;
          background: linear-gradient(90deg, #667eea, #764ba2);
          border-radius: 4px;
          transition: width 0.3s;
        }
        .status-indicator {
          display: inline-block;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          margin-right: 8px;
        }
        .online {
          background: #4caf50;
        }
        .syncing {
          background: #ff9800;
        }
        .offline {
          background: #f44336;
        }
        .error {
          background: #ff5252;
          color: white;
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 20px;
        }
        .refresh-btn {
          width: 100%;
          padding: 12px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          cursor: pointer;
          margin-top: 20px;
          transition: background 0.3s;
        }
        .refresh-btn:hover {
          background: #764ba2;
        }
        .refresh-btn:active {
          transform: scale(0.98);
        }
        .loading {
          text-align: center;
          color: #999;
          font-style: italic;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🪙 Bitcoin Node Status</h1>
        <div id="content">
          <p class="loading">Loading...</p>
        </div>
        <button class="refresh-btn" onclick="loadStatus()">🔄 Refresh</button>
      </div>

      <script>
        async function loadStatus() {
          const content = document.getElementById('content');
          content.innerHTML = '<p class="loading">Loading...</p>';
          
          try {
            const response = await fetch('/api/status');
            const data = await response.json();
            
            if (data.error) {
              content.innerHTML = '<div class="error">❌ Error: ' + data.error + '</div>';
              return;
            }
            
            const info = data.blockchain;
            const peers = data.peers;
            const memory = data.memory;
            const version = data.version;
            
            const syncPercent = (info.verificationprogress * 100).toFixed(2);
            const syncClass = syncPercent >= 99.99 ? 'online' : 'syncing';
            const syncIndicator = syncPercent >= 99.99 ? '✓' : '⟳';
            
            content.innerHTML = \`
              <div class="status-grid">
                <div class="status-item">
                  <label>Status</label>
                  <div class="value">
                    <span class="status-indicator \${syncClass}"></span>
                    \${syncIndicator} \${syncPercent}% Synced
                  </div>
                </div>
                
                <div class="status-item">
                  <label>Block Height</label>
                  <div class="value">\${info.blocks.toLocaleString()}</div>
                </div>
                
                <div class="status-item">
                  <label>Headers</label>
                  <div class="value">\${info.headers.toLocaleString()}</div>
                </div>
                
                <div class="status-item">
                  <label>Connected Peers</label>
                  <div class="value">\${peers}</div>
                </div>
                
                <div class="status-item">
                  <label>Difficulty</label>
                  <div class="value">\${info.difficulty.toExponential(2)}</div>
                </div>
                
                <div class="status-item">
                  <label>Chain Work</label>
                  <div class="value">\${info.chainwork.substring(0, 16)}...</div>
                </div>
                
                <div class="status-item">
                  <label>Memory Used (MB)</label>
                  <div class="value">\${memory.toFixed(2)}</div>
                </div>
                
                <div class="status-item">
                  <label>Version</label>
                  <div class="value">\${version}</div>
                </div>
              </div>
            \`;
          } catch (error) {
            content.innerHTML = '<div class="error">❌ Connection Error: ' + error.message + '</div>';
          }
        }
        
        // Load status on page load
        loadStatus();
        
        // Auto-refresh every 30 seconds
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
    
    // Get peer count
    const netInfo = await callBitcoinRpc('getnetworkinfo');
    const peers = netInfo.connections || 0;
    
    // Get memory info
    const memInfo = await callBitcoinRpc('getmemoryinfo');
    const memory = memInfo.locked ? memInfo.locked.used : 0;
    
    // Get version
    const version = netInfo.version || 'Unknown';
    
    res.json({
      blockchain: blockchainInfo,
      peers: peers,
      memory: memory / (1024 * 1024), // Convert to MB
      version: version
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
