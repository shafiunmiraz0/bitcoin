const express = require('express');
const axios = require('axios');
const os = require('os');
const { execSync } = require('child_process');
const app = express();

const BITCOIN_RPC = {
  host: process.env.BITCOIN_HOST || 'bitcoin',
  port: process.env.BITCOIN_PORT || 8332,
  user: process.env.BITCOIN_USER || 'bitcoinuser',
  password: process.env.BITCOIN_PASSWORD || 'CHANGE_THIS_TO_A_STRONG_PASSWORD'
};

// State tracking for sync and performance metrics
let lastBlockTime = 0;
let lastBlockHeight = 0;
let blockTimestamps = [];
let syncStartTime = null;
let lastUpdateTime = Date.now();

async function callBitcoinRpc(method, params = []) {
  try {
    const response = await axios.post(
      `http://${BITCOIN_RPC.host}:${BITCOIN_RPC.port}/`,
      { jsonrpc: '1.0', id: 'webhook', method, params },
      { auth: { username: BITCOIN_RPC.user, password: BITCOIN_RPC.password }, timeout: 10000 }
    );
    return response.data.result;
  } catch (error) {
    console.error(`RPC Error: ${method}`, error.message);
    throw error;
  }
}

// System metrics utilities
function getSystemMetrics() {
  const platform = os.platform();
  let cpuUsage = 0;
  let diskUsage = { used: 0, total: 0 };
  
  try {
    if (platform === 'win32') {
      // Windows CPU usage
      const cpuLines = execSync('wmic os get TotalVisibleMemorySize,FreePhysicalMemory').toString().split('\n');
      if (cpuLines.length > 1) {
        const values = cpuLines[1].trim().split(/\s+/);
        const totalMem = parseInt(values[0]) * 1024;
        const freeMem = parseInt(values[1]) * 1024;
        cpuUsage = ((totalMem - freeMem) / totalMem) * 100;
      }
      // Windows disk usage
      try {
        const diskInfo = execSync('wmic logicaldisk get name,size,freespace | findstr C:').toString().trim();
        const parts = diskInfo.split(/\s+/);
        if (parts.length >= 3) {
          diskUsage.total = parseInt(parts[2]);
          diskUsage.used = diskUsage.total - parseInt(parts[1]);
        }
      } catch (e) {}
    } else {
      // Unix CPU usage - simplified
      const freeMem = os.freemem();
      const totalMem = os.totalmem();
      cpuUsage = ((totalMem - freeMem) / totalMem) * 100;
      
      // Unix disk usage
      try {
        const df = execSync('df / | tail -1').toString().split(/\s+/);
        diskUsage.total = parseInt(df[1]) * 1024;
        diskUsage.used = parseInt(df[2]) * 1024;
      } catch (e) {}
    }
  } catch (e) {
    console.warn('System metrics error:', e.message);
  }
  
  return {
    cpuUsage: Math.min(100, Math.max(0, cpuUsage)),
    ramUsage: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100,
    ramUseMB: (os.totalmem() - os.freemem()) / (1024 * 1024),
    ramTotalMB: os.totalmem() / (1024 * 1024),
    diskUsage: diskUsage.total > 0 ? (diskUsage.used / diskUsage.total) * 100 : 0,
    diskUsedGB: diskUsage.used / (1024 * 1024 * 1024),
    diskTotalGB: diskUsage.total / (1024 * 1024 * 1024)
  };
}

app.get('/', (req, res) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bitcoin Node Explorer</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js"><\/script>
  <style>
    :root {
      --bg-primary: #ffffff;
      --bg-secondary: #f5f5f5;
      --text-primary: #1a1a1a;
      --text-secondary: #666;
      --text-tertiary: #999;
      --border: #e0e0e0;
      --accent: #667eea;
      --accent2: #764ba2;
      --success: #4caf50;
      --warning: #ff9800;
      --danger: #f44336;
    }
    html.dark-mode {
      --bg-primary: #1e1e1e;
      --bg-secondary: #2d2d2d;
      --text-primary: #e0e0e0;
      --text-secondary: #b0b0b0;
      --text-tertiary: #808080;
      --border: #404040;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, var(--accent) 0%, var(--accent2) 100%);
      min-height: 100vh;
      padding: 12px;
      color: var(--text-primary);
    }
    html.dark-mode body { background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%); }
    .wrapper { max-width: 1400px; margin: 0 auto; }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      flex-wrap: wrap;
      gap: 10px;
    }
    .title { font-size: 24px; font-weight: 700; color: white; display: flex; align-items: center; gap: 8px; }
    .controls { display: flex; gap: 8px; }
    .btn {
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
      background: rgba(255,255,255,0.2);
      color: white;
      backdrop-filter: blur(10px);
      transition: background 0.2s;
    }
    .btn:hover { background: rgba(255,255,255,0.3); }
    .nav-tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 20px;
      background: var(--bg-primary);
      padding: 12px;
      border-radius: 10px;
      flex-wrap: wrap;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .nav-tab {
      padding: 8px 16px;
      border: 2px solid transparent;
      background: var(--bg-secondary);
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
      color: var(--text-secondary);
      transition: all 0.2s;
    }
    .nav-tab.active {
      background: var(--accent);
      color: white;
      border-color: var(--accent);
    }
    .nav-tab:hover { background: var(--bg-secondary); }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
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
      border-left: 4px solid var(--accent);
      transition: all 0.3s;
    }
    html.dark-mode .card { box-shadow: 0 4px 15px rgba(0,0,0,0.4); }
    .card:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.15); }
    .card-label { font-size: 11px; color: var(--text-tertiary); text-transform: uppercase; margin-bottom: 8px; }
    .card-value { font-size: 24px; font-weight: 700; color: var(--text-primary); word-break: break-word; }
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
      background: linear-gradient(90deg, var(--accent), var(--accent2));
      transition: width 0.4s;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      background: var(--bg-secondary);
      border-radius: 20px;
      font-size: 11px;
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
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    .stat-mini {
      background: var(--bg-secondary);
      padding: 10px;
      border-radius: 6px;
      text-align: center;
      margin-top: 8px;
    }
    .stat-mini-value { font-size: 16px; font-weight: 700; }
    .stat-mini-label { font-size: 9px; color: var(--text-tertiary); margin-top: 4px; text-transform: uppercase; }
    .chart-container {
      background: var(--bg-primary);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 16px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.1);
    }
    html.dark-mode .chart-container { box-shadow: 0 4px 15px rgba(0,0,0,0.4); }
    .charts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
      gap: 16px;
      margin-top: 20px;
    }
    .search-box {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
      background: var(--bg-primary);
      padding: 16px;
      border-radius: 10px;
    }
    .search-box input {
      flex: 1;
      padding: 10px;
      border: 2px solid var(--border);
      border-radius: 6px;
      background: var(--bg-secondary);
      color: var(--text-primary);
    }
    .search-box button {
      padding: 10px 20px;
      background: var(--accent);
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
    }
    .blocks-list {
      background: var(--bg-primary);
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 4px 15px rgba(0,0,0,0.1);
    }
    .block-item {
      padding: 16px;
      border-bottom: 1px solid var(--border);
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 12px;
      transition: background 0.2s;
    }
    .block-item:hover { background: var(--bg-secondary); }
    .block-item:last-child { border-bottom: none; }
    .block-label { font-size: 10px; color: var(--text-tertiary); text-transform: uppercase; margin-bottom: 4px; }
    .block-value { font-size: 12px; color: var(--text-primary); font-family: monospace; word-break: break-all; }
    .tx-table {
      width: 100%;
      background: var(--bg-primary);
      border-radius: 10px;
      overflow: auto;
      box-shadow: 0 4px 15px rgba(0,0,0,0.1);
    }
    .tx-table table { width: 100%; border-collapse: collapse; }
    .tx-table th {
      padding: 12px;
      text-align: left;
      font-weight: 600;
      background: var(--bg-secondary);
      border-bottom: 2px solid var(--border);
      font-size: 12px;
    }
    .tx-table td {
      padding: 12px;
      border-bottom: 1px solid var(--border);
      font-size: 11px;
      font-family: monospace;
    }
    .error-box {
      background: var(--danger);
      color: white;
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 16px;
    }
    .loading { text-align: center; padding: 40px; color: var(--text-secondary); }
    .timestamp { font-size: 11px; color: var(--text-tertiary); margin-top: 12px; text-align: right; }
    .card.a1 { border-left-color: #667eea; }
    .card.a2 { border-left-color: #764ba2; }
    .card.a3 { border-left-color: #f093fb; }
    .card.a4 { border-left-color: #4facfe; }
    .card.a5 { border-left-color: #43e97b; }
    .card.a6 { border-left-color: #fa709a; }
    @media (max-width: 768px) {
      .header { flex-direction: column; align-items: flex-start; }
      .title { width: 100%; }
      .dashboard { grid-template-columns: 1fr; }
      .block-item { grid-template-columns: 1fr; }
      .charts-grid { grid-template-columns: 1fr; }
    }
  <\/style>
<\/head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="title">🪙 Bitcoin Node Explorer</div>
      <div class="controls">
        <button class="btn" onclick="refreshTab()">🔄 Refresh</button>
        <button class="btn" onclick="toggleTheme()">🌙 Theme</button>
      </div>
    </div>

    <div class="nav-tabs">
      <div class="nav-tab active" onclick="switchTab('overview')">📊 Overview</div>
      <div class="nav-tab" onclick="switchTab('health')">❤️ Health</div>
      <div class="nav-tab" onclick="switchTab('sync')">⚡ Sync</div>
      <div class="nav-tab" onclick="switchTab('mempool')">💫 Mempool</div>
      <div class="nav-tab" onclick="switchTab('network')">🌐 Network</div>
      <div class="nav-tab" onclick="switchTab('security')">🔒 Security</div>
      <div class="nav-tab" onclick="switchTab('storage')">💾 Storage</div>
      <div class="nav-tab" onclick="switchTab('blocks')">⛓️ Blocks</div>
      <div class="nav-tab" onclick="switchTab('explorer')">🔍 Explorer</div>
      <div class="nav-tab" onclick="switchTab('chainstate')">📈 ChainState</div>
    </div>

    <div id="overview" class="tab-content active">
      <div class="dashboard" id="overview-content">
        <div class="loading">Loading...</div>
      </div>
      <div class="charts-grid">
        <div class="chart-container">
          <canvas id="blockChart" height="80"><\/canvas>
        </div>
        <div class="chart-container">
          <canvas id="peersChart" height="80"><\/canvas>
        </div>
        <div class="chart-container">
          <canvas id="memoryChart" height="80"><\/canvas>
        </div>
        <div class="chart-container">
          <canvas id="syncChart" height="80"><\/canvas>
        </div>
      </div>
      <div class="timestamp" id="overview-time"><\/div>
    </div>

    <div id="health" class="tab-content">
      <div class="dashboard" id="health-content">
        <div class="loading">Loading...</div>
      </div>
      <div class="charts-grid">
        <div class="chart-container">
          <canvas id="cpuChart" height="80"><\/canvas>
        </div>
        <div class="chart-container">
          <canvas id="ramChart" height="80"><\/canvas>
        </div>
        <div class="chart-container">
          <canvas id="diskChart" height="80"><\/canvas>
        </div>
      </div>
    </div>

    <div id="sync" class="tab-content">
      <div class="dashboard" id="sync-content">
        <div class="loading">Loading...</div>
      </div>
      <div class="charts-grid">
        <div class="chart-container">
          <canvas id="syncProgressChart" height="80"><\/canvas>
        </div>
        <div class="chart-container">
          <canvas id="blockSpeedChart" height="80"><\/canvas>
        </div>
        <div class="chart-container">
          <canvas id="headerGapChart" height="80"><\/canvas>
        </div>
      </div>
    </div>

    <div id="mempool" class="tab-content">
      <div id="mempool-content"><div class="loading">Loading mempool...<\/div><\/div>
      <div class="charts-grid">
        <div class="chart-container">
          <canvas id="mempoolSizeChart" height="80"><\/canvas>
        </div>
        <div class="chart-container">
          <canvas id="feeDistributionChart" height="80"><\/canvas>
        </div>
      </div>
    </div>

    <div id="network" class="tab-content">
      <div class="dashboard" id="network-content">
        <div class="loading">Loading network...<\/div>
      </div>
      <div class="charts-grid">
        <div class="chart-container">
          <canvas id="peerClientChart" height="80"><\/canvas>
        </div>
        <div class="chart-container">
          <canvas id="bandwidthChart" height="80"><\/canvas>
        </div>
      </div>
    </div>

    <div id="security" class="tab-content">
      <div class="dashboard" id="security-content">
        <div class="loading">Loading security...<\/div>
      </div>
    </div>

    <div id="storage" class="tab-content">
      <div class="dashboard" id="storage-content">
        <div class="loading">Loading storage...<\/div>
      </div>
      <div class="charts-grid">
        <div class="chart-container">
          <canvas id="diskUsageChart" height="80"><\/canvas>
        </div>
      </div>
    </div>

    <div id="blocks" class="tab-content">
      <div class="search-box">
        <input type="text" id="block-search" placeholder="Enter block height or hash...">
        <button onclick="searchBlock()">Search<\/button>
      </div>
      <div id="blocks-content"><div class="loading">Loading blocks...<\/div><\/div>
      <div class="charts-grid">
        <div class="chart-container">
          <canvas id="blockSizeChart" height="80"><\/canvas>
        </div>
        <div class="chart-container">
          <canvas id="txPerBlockChart" height="80"><\/canvas>
        </div>
      </div>
    </div>

    <div id="explorer" class="tab-content">
      <div class="search-box">
        <input type="text" id="tx-search" placeholder="Enter transaction ID (TXID)...">
        <button onclick="searchTransaction()">Search TX<\/button>
      </div>
      <div style="display: flex; gap: 8px; margin-bottom: 16px;">
        <input type="text" id="block-height-search" placeholder="Enter block height or hash...">
        <button onclick="searchBlockExplorer()">Search Block<\/button>
      </div>
      <div id="explorer-content"><div class="loading">Enter a TXID or block height to search...<\/div><\/div>
    </div>

    <div id="chainstate" class="tab-content">
      <div class="dashboard" id="chainstate-content">
        <div class="loading">Loading chainstate...<\/div>
      </div>
    </div>
  </div>

  <script>
    let blockChart, peersChart, memoryChart, syncChart;
    let cpuChart, ramChart, diskChart;
    let syncProgressChart, blockSpeedChart, headerGapChart;
    let mempoolSizeChart, feeDistributionChart;
    let peerClientChart, bandwidthChart;
    let diskUsageChart, blockSizeChart, txPerBlockChart;
    let chartData = {
      times: [],
      blocks: [],
      peers: [],
      memory: [],
      sync: [],
      cpu: [],
      ram: [],
      disk: [],
      syncProgress: [],
      blockSpeed: [],
      headerGap: [],
      mempoolSize: [],
      diskUsage: [],
      blockSize: [],
      txPerBlock: []
    };
    const MAX_POINTS = 60;

    function initTheme() {
      if (localStorage.getItem('theme') === 'dark' || (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark-mode');
      }
    }
    function toggleTheme() {
      document.documentElement.classList.toggle('dark-mode');
      localStorage.setItem('theme', document.documentElement.classList.contains('dark-mode') ? 'dark' : 'light');
      updateChartColors();
    }
    function getChartColors() {
      const isDark = document.documentElement.classList.contains('dark-mode');
      return {
        text: isDark ? '#e0e0e0' : '#1a1a1a',
        grid: isDark ? '#404040' : '#e0e0e0',
        bg: isDark ? '#2d2d2d' : '#f5f5f5'
      };
    }
    function initCharts() {
      const colors = getChartColors();
      const chartConfig = {
        backgroundColor: 'rgba(102, 126, 234, 0.1)',
        borderColor: 'rgb(102, 126, 234)',
        borderWidth: 2,
        fill: true,
        tension: 0.4
      };

      const commonOptions = {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { labels: { color: colors.text } }
        },
        scales: {
          y: { grid: { color: colors.grid }, ticks: { color: colors.text } },
          x: { grid: { color: colors.grid }, ticks: { color: colors.text } }
        }
      };

      blockChart = new Chart(document.getElementById('blockChart'), {
        type: 'line',
        data: {
          labels: chartData.times,
          datasets: [{
            label: 'Block Height',
            data: chartData.blocks,
            ...chartConfig,
            borderColor: 'rgb(102, 126, 234)'
          }]
        },
        options: commonOptions
      });

      peersChart = new Chart(document.getElementById('peersChart'), {
        type: 'line',
        data: {
          labels: chartData.times,
          datasets: [{
            label: 'Connected Peers',
            data: chartData.peers,
            ...chartConfig,
            borderColor: 'rgb(240, 147, 251)'
          }]
        },
        options: commonOptions
      });

      memoryChart = new Chart(document.getElementById('memoryChart'), {
        type: 'line',
        data: {
          labels: chartData.times,
          datasets: [{
            label: 'Memory Usage (MB)',
            data: chartData.memory,
            ...chartConfig,
            borderColor: 'rgb(79, 172, 254)'
          }]
        },
        options: commonOptions
      });

      syncChart = new Chart(document.getElementById('syncChart'), {
        type: 'line',
        data: {
          labels: chartData.times,
          datasets: [{
            label: 'Sync Progress (%)',
            data: chartData.sync,
            ...chartConfig,
            borderColor: 'rgb(67, 233, 123)'
          }]
        },
        options: { ...commonOptions, scales: { ...commonOptions.scales, y: { ...commonOptions.scales.y, min: 0, max: 100 } } }
      });
    }
    function updateChartColors() {
      const colors = getChartColors();
      [blockChart, peersChart, memoryChart, syncChart].forEach(chart => {
        if (chart) {
          chart.options.plugins.legend.labels.color = colors.text;
          chart.options.scales.y.grid.color = colors.grid;
          chart.options.scales.y.ticks.color = colors.text;
          chart.options.scales.x.grid.color = colors.grid;
          chart.options.scales.x.ticks.color = colors.text;
          chart.update();
        }
      });
    }
    function addChartPoint(block, peers, memory, sync) {
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      chartData.times.push(now);
      chartData.blocks.push(block);
      chartData.peers.push(peers);
      chartData.memory.push(memory);
      chartData.sync.push(sync);

      if (chartData.times.length > MAX_POINTS) {
        chartData.times.shift();
        chartData.blocks.shift();
        chartData.peers.shift();
        chartData.memory.shift();
        chartData.sync.shift();
      }

      if (blockChart) {
        blockChart.data.labels = chartData.times;
        blockChart.data.datasets[0].data = chartData.blocks;
        blockChart.update('none');
      }
      if (peersChart) {
        peersChart.data.labels = chartData.times;
        peersChart.data.datasets[0].data = chartData.peers;
        peersChart.update('none');
      }
      if (memoryChart) {
        memoryChart.data.labels = chartData.times;
        memoryChart.data.datasets[0].data = chartData.memory;
        memoryChart.update('none');
      }
      if (syncChart) {
        syncChart.data.labels = chartData.times;
        syncChart.data.datasets[0].data = chartData.sync;
        syncChart.update('none');
      }
    }
    function switchTab(tab) {
      document.querySelectorAll('.tab-content').forEach(e => e.classList.remove('active'));
      document.querySelectorAll('.nav-tab').forEach(e => e.classList.remove('active'));
      document.getElementById(tab).classList.add('active');
      event.target.classList.add('active');
      loadTabContent(tab);
    }
    function fmt(n) { return new Intl.NumberFormat().format(Math.floor(n)); }
    function bytes(b) {
      if (b === 0) return '0 B';
      const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(b) / Math.log(k));
      return (b / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
    }
    function loadTabContent(tab) {
      if (tab === 'overview') loadOverview();
      else if (tab === 'health') loadHealth();
      else if (tab === 'sync') loadSync();
      else if (tab === 'blocks') loadBlocks();
      else if (tab === 'mempool') loadMempoolEnhanced();
      else if (tab === 'network') loadNetworkAnalytics();
      else if (tab === 'security') loadSecurity();
      else if (tab === 'storage') loadStorage();
      else if (tab === 'explorer') loadExplorer();
      else if (tab === 'chainstate') loadChainState();
    }
    async function loadOverview() {
      try {
        const data = await fetch('/api/status').then(r => r.json());
        if (data.error) {
          document.getElementById('overview-content').innerHTML = '<div class="error-box">❌ ' + data.error + '<\/div>';
          return;
        }
        const b = data.blockchain;
        const sync = (b.verificationprogress * 100).toFixed(2);
        const isSynced = sync >= 99.99;
        document.getElementById('overview-content').innerHTML = \`
          <div class="card a1">
            <div class="card-label">Sync Status<\/div>
            <div class="card-value">\${sync}%<\/div>
            <div class="card-progress"><div class="card-progress-fill" style="width: \${Math.min(sync, 100)}%"><\/div><\/div>
            <div class="status-badge">
              <span class="status-dot \${isSynced ? 'synced' : 'syncing'}"><\/span>
              \${isSynced ? '✓ Synced' : '⟳ Syncing'}
            <\/div>
          <\/div>
          <div class="card a2">
            <div class="card-label">Block Height<\/div>
            <div class="card-value">\${fmt(b.blocks)}<\/div>
            <div class="stat-mini">
              <div class="stat-mini-value">\${fmt(b.headers)}<\/div>
              <div class="stat-mini-label">Headers<\/div>
            <\/div>
            <div class="stat-mini">
              <div class="stat-mini-value">\${fmt(b.headers - b.blocks)}<\/div>
              <div class="stat-mini-label">Behind<\/div>
            <\/div>
          <\/div>
          <div class="card a3">
            <div class="card-label">Peers<\/div>
            <div class="card-value">\${data.peers}<\/div>
            <div class="stat-mini">
              <div class="stat-mini-value">\${data.networkInfo.inbound}<\/div>
              <div class="stat-mini-label">Inbound<\/div>
            <\/div>
            <div class="stat-mini">
              <div class="stat-mini-value">\${data.networkInfo.outbound}<\/div>
              <div class="stat-mini-label">Outbound<\/div>
            <\/div>
          <\/div>
          <div class="card a4">
            <div class="card-label">Difficulty<\/div>
            <div class="card-value">\${b.difficulty.toExponential(2)}<\/div>
            <div class="stat-mini">
              <div class="stat-mini-value">\${b.chain}<\/div>
              <div class="stat-mini-label">Chain<\/div>
            <\/div>
          <\/div>
          <div class="card a5">
            <div class="card-label">Memory<\/div>
            <div class="card-value">\${data.memory.toFixed(1)}MB<\/div>
            <div class="stat-mini">
              <div class="stat-mini-value">\${data.mempool}<\/div>
              <div class="stat-mini-label">Mempool TX<\/div>
            <\/div>
            <div class="stat-mini">
              <div class="stat-mini-value">\${data.uptime}<\/div>
              <div class="stat-mini-label">Uptime<\/div>
            <\/div>
          <\/div>
          <div class="card a6">
            <div class="card-label">ChainState<\/div>
            <div class="card-value">\${bytes(data.chainstatesize)}<\/div>
            <div class="stat-mini">
              <div class="stat-mini-value">\${b.initialblockdownload ? 'IBD' : 'Done'}<\/div>
              <div class="stat-mini-label">Status<\/div>
            <\/div>
          <\/div>
        \`;
        
        if (!blockChart && document.getElementById('blockChart')) {
          initCharts();
        }
        
        addChartPoint(b.blocks, data.peers, data.memory.toFixed(1), sync);
        
        document.getElementById('overview-time').textContent = 'Updated: ' + new Date().toLocaleTimeString();
      } catch (e) {
        document.getElementById('overview-content').innerHTML = '<div class="error-box">Error: ' + e.message + '<\/div>';
      }
    }
    async function loadChainState() {
      try {
        const data = await fetch('/api/chainstate').then(r => r.json());
        document.getElementById('chainstate-content').innerHTML = \`
          <div class="card a1">
            <div class="card-label">ChainState Size<\/div>
            <div class="card-value">\${bytes(data.size)}<\/div>
          <\/div>
          <div class="card a2">
            <div class="card-label">UTXO Count<\/div>
            <div class="card-value">\${fmt(data.utxos)}<\/div>
          <\/div>
          <div class="card a3">
            <div class="card-label">Transactions<\/div>
            <div class="card-value">\${fmt(data.transactions)}<\/div>
          <\/div>
          <div class="card a4">
            <div class="card-label">TX Serialized<\/div>
            <div class="card-value">\${bytes(data.tx_serialized)}<\/div>
          <\/div>
          <div class="card a5">
            <div class="card-label">UTXO Serialized<\/div>
            <div class="card-value">\${bytes(data.utxo_serialized)}<\/div>
          <\/div>
        \`;
      } catch (e) {
        document.getElementById('chainstate-content').innerHTML = '<div class="error-box">Error: ' + e.message + '<\/div>';
      }
    }

    // ========== NEW LOAD FUNCTIONS ==========
    
    async function loadHealth() {
      try {
        const data = await fetch('/api/health').then(r => r.json());
        if (data.error) {
          document.getElementById('health-content').innerHTML = '<div class="error-box">❌ ' + data.error + '<\/div>';
          return;
        }

        let alertsHtml = '';
        if (data.alerts.length > 0) {
          alertsHtml = '<div style="background: var(--danger); color: white; padding: 12px; border-radius: 8px; margin-bottom: 16px;">';
          data.alerts.forEach(alert => {
            alertsHtml += \`<div>⚠️ \${alert.message} (\${alert.value.toFixed(1)}%)<\/div>\`;
          });
          alertsHtml += '<\/div>';
        }

        document.getElementById('health-content').innerHTML = alertsHtml + \`
          <div class="card a1">
            <div class="card-label">CPU Usage<\/div>
            <div class="card-value">\${data.cpu.toFixed(1)}%<\/div>
            <div class="card-progress"><div class="card-progress-fill" style="width: \${Math.min(data.cpu, 100)}%; background: linear-gradient(90deg, rgb(76, 175, 80), rgb(255, 152, 0));"><\/div><\/div>
          <\/div>
          <div class="card a2">
            <div class="card-label">RAM Usage<\/div>
            <div class="card-value">\${data.ram.toFixed(1)}%<\/div>
            <div class="card-progress"><div class="card-progress-fill" style="width: \${Math.min(data.ram, 100)}%; background: linear-gradient(90deg, rgb(63, 81, 181), rgb(233, 30, 99));"><\/div><\/div>
            <div class="stat-mini">
              <div class="stat-mini-value">\${data.ramMB.toFixed(0)}MB / \${data.ramTotalMB.toFixed(0)}MB<\/div>
            <\/div>
          <\/div>
          <div class="card a3">
            <div class="card-label">Disk Usage<\/div>
            <div class="card-value">\${data.disk.toFixed(1)}%<\/div>
            <div class="card-progress"><div class="card-progress-fill" style="width: \${Math.min(data.disk, 100)}%; background: linear-gradient(90deg, rgb(244, 67, 54), rgb(233, 30, 99));"><\/div><\/div>
            <div class="stat-mini">
              <div class="stat-mini-value">\${data.diskUsedGB.toFixed(1)}GB / \${data.diskTotalGB.toFixed(1)}GB<\/div>
            <\/div>
          <\/div>
          <div class="card a4">
            <div class="card-label">Bitcoin Uptime<\/div>
            <div class="card-value" style="font-size: 16px;">\${data.bitcoindUptimeFormatted}<\/div>
            <div class="stat-mini">
              <div class="stat-mini-value">\${data.bitcoindUptime}s<\/div>
            <\/div>
          <\/div>
          <div class="card a5">
            <div class="card-label">Connections<\/div>
            <div class="card-value">\${data.connections}<\/div>
          <\/div>
        \`;

        if (!cpuChart && document.getElementById('cpuChart')) {
          initHealthCharts();
        }
        addHealthChartPoint(data.cpu, data.ram, data.disk);
      } catch (e) {
        document.getElementById('health-content').innerHTML = '<div class="error-box">Error: ' + e.message + '<\/div>';
      }
    }

    async function loadSync() {
      try {
        const data = await fetch('/api/sync-info').then(r => r.json());
        if (data.error) {
          document.getElementById('sync-content').innerHTML = '<div class="error-box">❌ ' + data.error + '<\/div>';
          return;
        }

        document.getElementById('sync-content').innerHTML = \`
          <div class="card a1">
            <div class="card-label">Sync Progress<\/div>
            <div class="card-value">\${parseFloat(data.syncPercentage).toFixed(2)}%<\/div>
            <div class="card-progress"><div class="card-progress-fill" style="width: \${Math.min(parseFloat(data.syncPercentage), 100)}%"><\/div><\/div>
            <div class="status-badge">
              <span class="status-dot \${parseFloat(data.syncPercentage) >= 99.99 ? 'synced' : 'syncing'}"><\/span>
              \${parseFloat(data.syncPercentage) >= 99.99 ? '✓ Synced' : '⟳ Syncing'}
            <\/div>
          <\/div>
          <div class="card a2">
            <div class="card-label">Block Height<\/div>
            <div class="card-value">\${fmt(data.blockHeight)}<\/div>
            <div class="stat-mini">
              <div class="stat-mini-value">\${fmt(data.headerHeight)}<\/div>
              <div class="stat-mini-label">Headers<\/div>
            <\/div>
            <div class="stat-mini">
              <div class="stat-mini-value">\${fmt(data.blocksBehind)}<\/div>
              <div class="stat-mini-label">Behind<\/div>
            <\/div>
          <\/div>
          <div class="card a3">
            <div class="card-label">Sync Speed<\/div>
            <div class="card-value">\${data.blocksPerHour}<\/div>
            <div class="stat-mini">
              <div class="stat-mini-value">\${data.blocksPerMinute}<\/div>
              <div class="stat-mini-label">Blocks/Min<\/div>
            <\/div>
          <\/div>
          <div class="card a4">
            <div class="card-label">Est. Time Remaining<\/div>
            <div class="card-value" style="font-size: 18px;">\${data.estimatedTimeRemaining}<\/div>
          <\/div>
          <div class="card a5">
            <div class="card-label">Validation Stage<\/div>
            <div class="card-value" style="font-size: 16px;">\${data.validationStage}<\/div>
            <div class="stat-mini">
              <div class="stat-mini-value">\${data.ibd ? 'IBD' : 'Done'}<\/div>
              <div class="stat-mini-label">Initial Block Download<\/div>
            <\/div>
          <\/div>
          <div class="card a6">
            <div class="card-label">Chain<\/div>
            <div class="card-value">\${data.chain}<\/div>
            <div class="stat-mini">
              <div class="stat-mini-value">\${data.difficulty.toExponential(2)}<\/div>
              <div class="stat-mini-label">Difficulty<\/div>
            <\/div>
          <\/div>
        \`;

        if (!syncProgressChart && document.getElementById('syncProgressChart')) {
          initSyncCharts();
        }
        addSyncChartPoint(parseFloat(data.syncPercentage), parseFloat(data.blocksPerHour), data.blocksBehind);
      } catch (e) {
        document.getElementById('sync-content').innerHTML = '<div class="error-box">Error: ' + e.message + '<\/div>';
      }
    }

    async function loadMempoolEnhanced() {
      try {
        const data = await fetch('/api/mempool-enhanced').then(r => r.json());
        if (data.error) {
          document.getElementById('mempool-content').innerHTML = '<div class="error-box">❌ ' + data.error + '<\/div>';
          return;
        }

        let topTxHtml = '<div class="tx-table"><table><thead><tr><th>TXID<\/th><th>Size<\/th><th>Fee<\/th><th>Fee Rate (sat/vB)<\/th><\/tr><\/thead><tbody>';
        data.topTransactions.forEach(tx => {
          topTxHtml += \`<tr><td style="word-break: break-all; font-size: 10px;">\${tx.txid.substring(0, 16)}...<\/td><td>\${tx.size}B<\/td><td>\${tx.fee} sat<\/td><td>\${tx.feeRate}<\/td><\/tr>\`;
        });
        topTxHtml += '<\/tbody><\/table><\/div>';

        document.getElementById('mempool-content').innerHTML = \`
          <div class="dashboard" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px; margin-bottom: 16px;">
            <div class="card a1">
              <div class="card-label">Transaction Count<\/div>
              <div class="card-value">\${fmt(data.transactionCount)}<\/div>
            <\/div>
            <div class="card a2">
              <div class="card-label">Mempool Size<\/div>
              <div class="card-value">\${data.mempoolMB} MB<\/div>
              <div class="stat-mini">
                <div class="stat-mini-value">\${fmt(data.mempoolBytes)}<\/div>
                <div class="stat-mini-label">Bytes<\/div>
              <\/div>
            <\/div>
            <div class="card a3">
              <div class="card-label">Average Fee<\/div>
              <div class="card-value">\${data.averageFee}<\/div>
              <div class="stat-mini">
                <div class="stat-mini-label">sat/vB<\/div>
              <\/div>
            <\/div>
            <div class="card a4">
              <div class="card-label">Oldest TX Age<\/div>
              <div class="card-value">\${data.oldestTransactionAge}m<\/div>
            <\/div>
          </div>
          
          <div class="card" style="margin-bottom: 16px;">
            <div class="card-label">Recommended Fee Tiers<\/div>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 12px;">
              <div style="background: var(--bg-secondary); padding: 12px; border-radius: 6px; text-align: center;">
                <div style="font-size: 10px; color: var(--text-tertiary); margin-bottom: 4px;">🐢 Slow<\/div>
                <div style="font-size: 18px; font-weight: 700;">\${data.feeDistribution.slow}<\/div>
                <div style="font-size: 10px; color: var(--text-tertiary);">sat/vB<\/div>
              <\/div>
              <div style="background: var(--bg-secondary); padding: 12px; border-radius: 6px; text-align: center;">
                <div style="font-size: 10px; color: var(--text-tertiary); margin-bottom: 4px;">🚗 Medium<\/div>
                <div style="font-size: 18px; font-weight: 700;">\${data.feeDistribution.medium}<\/div>
                <div style="font-size: 10px; color: var(--text-tertiary);">sat/vB<\/div>
              <\/div>
              <div style="background: var(--bg-secondary); padding: 12px; border-radius: 6px; text-align: center;">
                <div style="font-size: 10px; color: var(--text-tertiary); margin-bottom: 4px;">🚀 Fast<\/div>
                <div style="font-size: 18px; font-weight: 700;">\${data.feeDistribution.fast}<\/div>
                <div style="font-size: 10px; color: var(--text-tertiary);">sat/vB<\/div>
              <\/div>
            </div>
          </div>
          
          <div style="margin-bottom: 16px;">
            <h3 style="margin-bottom: 12px;">Top Transactions<\/h3>
            \${topTxHtml}
          </div>
        \`;

        if (!mempoolSizeChart && document.getElementById('mempoolSizeChart')) {
          initMempoolCharts();
        }
        addMempoolChartPoint(data.transactionCount, data.mempoolMB);
      } catch (e) {
        document.getElementById('mempool-content').innerHTML = '<div class="error-box">Error: ' + e.message + '<\/div>';
      }
    }

    async function loadNetworkAnalytics() {
      try {
        const data = await fetch('/api/network-analytics').then(r => r.json());
        if (data.error) {
          document.getElementById('network-content').innerHTML = '<div class="error-box">❌ ' + data.error + '<\/div>';
          return;
        }

        let clientHtml = '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">';
        Object.entries(data.clientDistribution).forEach(([client, count]) => {
          clientHtml += \`<div style="background: var(--bg-secondary); padding: 8px; border-radius: 6px;">
            <div style="font-size: 10px; color: var(--text-tertiary);">\${client.substring(0, 20)}<\/div>
            <div style="font-size: 14px; font-weight: 700;">\${count}<\/div>
          </div>\`;
        });
        clientHtml += '<\/div>';

        document.getElementById('network-content').innerHTML = \`
          <div class="card a1">
            <div class="card-label">Total Peers<\/div>
            <div class="card-value">\${data.totalPeers}<\/div>
            <div class="stat-mini">
              <div class="stat-mini-value">\${data.inbound}<\/div>
              <div class="stat-mini-label">Inbound (\${data.inboundPercent}%)<\/div>
            <\/div>
            <div class="stat-mini">
              <div class="stat-mini-value">\${data.outbound}<\/div>
              <div class="stat-mini-label">Outbound (\${data.outboundPercent}%)<\/div>
            <\/div>
          <\/div>
          <div class="card a2">
            <div class="card-label">Average Latency<\/div>
            <div class="card-value" style="font-size: 20px;">\${data.averageLatency}ms<\/div>
          <\/div>
          <div class="card a3">
            <div class="card-label">Protocol Version<\/div>
            <div class="card-value" style="font-size: 18px;">\${data.protocolVersion}<\/div>
          <\/div>
          <div class="card a4">
            <div class="card-label">IPv4 Reachable<\/div>
            <div class="card-value" style="font-size: 18px;">\${data.reachableIPv4 ? '✓ Yes' : '✗ No'}<\/div>
          <\/div>
          <div class="card a5">
            <div class="card-label">IPv6 Reachable<\/div>
            <div class="card-value" style="font-size: 18px;">\${data.reachableIPv6 ? '✓ Yes' : '✗ No'}<\/div>
          <\/div>
          <div class="card a6">
            <div class="card-label">Time Offset<\/div>
            <div class="card-value" style="font-size: 18px;">\${data.timeOffset}s<\/div>
          <\/div>
        </div>
        
        <div class="card" style="margin-top: 16px;">
          <div class="card-label">Client Distribution<\/div>
          \${clientHtml}
        </div>
        \`;

        if (!peerClientChart && document.getElementById('peerClientChart')) {
          initNetworkCharts();
        }
      } catch (e) {
        document.getElementById('network-content').innerHTML = '<div class="error-box">Error: ' + e.message + '<\/div>';
      }
    }

    async function loadSecurity() {
      try {
        const data = await fetch('/api/security').then(r => r.json());
        if (data.error) {
          document.getElementById('security-content').innerHTML = '<div class="error-box">❌ ' + data.error + '<\/div>';
          return;
        }

        let alertsHtml = '';
        if (data.alerts.length > 0) {
          alertsHtml = '<div style="background: var(--danger); color: white; padding: 12px; border-radius: 8px; margin-bottom: 16px;">';
          data.alerts.forEach(alert => {
            alertsHtml += \`<div>🚨 \${alert}<\/div>\`;
          });
          alertsHtml += '<\/div>';
        }

        document.getElementById('security-content').innerHTML = alertsHtml + \`
          <div class="card a1">
            <div class="card-label">Chain<\/div>
            <div class="card-value" style="font-size: 18px;">\${data.chain.toUpperCase()}<\/div>
          <\/div>
          <div class="card a2">
            <div class="card-label">Best Block Hash<\/div>
            <div class="card-value" style="font-size: 10px; word-break: break-all;">\${data.currentBlockHash}<\/div>
          <\/div>
          <div class="card a3">
            <div class="card-label">Reorg Detected<\/div>
            <div class="card-value" style="font-size: 18px;">\${data.reorgDetected ? '✗ Yes' : '✓ No'}<\/div>
          <\/div>
          <div class="card a4">
            <div class="card-label">Orphan Blocks<\/div>
            <div class="card-value">\${data.orphanBlocks}<\/div>
          <\/div>
          <div class="card a5">
            <div class="card-label">RPC Auth<\/div>
            <div class="card-value" style="font-size: 16px;">\${data.rpcAuth}<\/div>
          <\/div>
          <div class="card a6">
            <div class="card-label">Pruned<\/div>
            <div class="card-value" style="font-size: 16px;">\${data.pruned ? '✓ Yes' : '✗ No'}<\/div>
            <div class="stat-mini">
              <div class="stat-mini-value">\${data.pruneHeight}<\/div>
              <div class="stat-mini-label">Prune Height<\/div>
            <\/div>
          <\/div>
        \`;
      } catch (e) {
        document.getElementById('security-content').innerHTML = '<div class="error-box">Error: ' + e.message + '<\/div>';
      }
    }

    async function loadStorage() {
      try {
        const data = await fetch('/api/storage').then(r => r.json());
        if (data.error) {
          document.getElementById('storage-content').innerHTML = '<div class="error-box">❌ ' + data.error + '<\/div>';
          return;
        }

        document.getElementById('storage-content').innerHTML = \`
          <div class="card a1">
            <div class="card-label">Chainstate Size<\/div>
            <div class="card-value">\${data.chainstateGB} GB<\/div>
            <div class="stat-mini">
              <div class="stat-mini-value">\${fmt(data.chainstateSize)}<\/div>
              <div class="stat-mini-label">Bytes<\/div>
            <\/div>
          <\/div>
          <div class="card a2">
            <div class="card-label">Disk Usage<\/div>
            <div class="card-value">\${data.diskUsagePercent}%<\/div>
            <div class="card-progress"><div class="card-progress-fill" style="width: \${Math.min(parseFloat(data.diskUsagePercent), 100)}%"><\/div><\/div>
            <div class="stat-mini">
              <div class="stat-mini-value">\${data.diskUsedGB} / \${data.diskTotalGB} GB<\/div>
            <\/div>
          <\/div>
          <div class="card a3">
            <div class="card-label">Pruned<\/div>
            <div class="card-value" style="font-size: 18px;">\${data.pruned ? '✓ Yes' : '✗ No'}<\/div>
            <div class="stat-mini">
              <div class="stat-mini-value">\${data.autoPruneEnabled}<\/div>
              <div class="stat-mini-label">Auto-Prune<\/div>
            <\/div>
          <\/div>
          <div class="card a4">
            <div class="card-label">Oldest Block Retained<\/div>
            <div class="card-value" style="font-size: 16px;">\${data.oldestBlockRetained}<\/div>
          <\/div>
          <div class="card a5">
            <div class="card-label">UTXO Count<\/div>
            <div class="card-value">\${fmt(data.utxoCount)}<\/div>
          <\/div>
          <div class="card a6">
            <div class="card-label">Total Blocks<\/div>
            <div class="card-value">\${fmt(data.blocksCount)}<\/div>
          <\/div>
        \`;

        if (!diskUsageChart && document.getElementById('diskUsageChart')) {
          initStorageCharts();
        }
      } catch (e) {
        document.getElementById('storage-content').innerHTML = '<div class="error-box">Error: ' + e.message + '<\/div>';
      }
    }

    async function loadBlocks() {
      try {
        const blockData = await fetch('/api/block-insights').then(r => r.json());
        const recentData = await fetch('/api/recent-blocks').then(r => r.json());

        let html = '<div class="blocks-list">';
        recentData.blocks.forEach(b => {
          html += \`<div class="block-item">
            <div><div class="block-label">Height<\/div><div class="block-value">\${b.height}<\/div><\/div>
            <div><div class="block-label">Time<\/div><div class="block-value">\${new Date(b.time * 1000).toLocaleString()}<\/div><\/div>
            <div><div class="block-label">Transactions<\/div><div class="block-value">\${b.tx}<\/div><\/div>
            <div><div class="block-label">Size<\/div><div class="block-value">\${bytes(b.size)}<\/div><\/div>
            <div style="grid-column: 1/-1;"><div class="block-label">Hash<\/div><div class="block-value" style="font-size: 10px;">\${b.hash}<\/div><\/div>
          <\/div>\`;
        });
        html += '<\/div>';

        document.getElementById('blocks-content').innerHTML = \`
          <div class="dashboard" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 16px;">
            <div class="card a1">
              <div class="card-label">Avg Block Size<\/div>
              <div class="card-value">\${bytes(parseInt(blockData.averageBlockSize))}<\/div>
            <\/div>
            <div class="card a2">
              <div class="card-label">Avg TX / Block<\/div>
              <div class="card-value">\${blockData.averageTxPerBlock}<\/div>
            <\/div>
            <div class="card a3">
              <div class="card-label">Avg Block Time<\/div>
              <div class="card-value">\${blockData.averageBlockTime}m<\/div>
            <\/div>
          <\/div>
          \${html}
        \`;

        if (!blockSizeChart && document.getElementById('blockSizeChart')) {
          initBlockCharts();
        }
      } catch (e) {
        document.getElementById('blocks-content').innerHTML = '<div class="error-box">Error: ' + e.message + '<\/div>';
      }
    }

    async function loadExplorer() {
      // Just show the search inputs - results shown by search functions
      document.getElementById('explorer-content').innerHTML = '<div class="loading">Enter a TXID or block to search...<\/div>';
    }

    async function searchTransaction() {
      const txid = document.getElementById('tx-search').value.trim();
      if (!txid) {
        alert('Please enter a transaction ID');
        return;
      }

      try {
        const data = await fetch(\`/api/tx-lookup/\${txid}\`).then(r => r.json());
        if (data.error) {
          document.getElementById('explorer-content').innerHTML = \`<div class="error-box">\${data.error}<\/div>\`;
          return;
        }

        let inputsHtml = '<div style="display: grid; grid-template-columns: 1fr; gap: 8px;">';
        data.inputs.forEach(inp => {
          inputsHtml += \`<div style="background: var(--bg-secondary); padding: 8px; border-radius: 6px; font-size: 10px;">
            <div>From: \${inp.txid.substring(0, 16)}...<\/div>
            <div>vOut: \${inp.vout}<\/div>
          <\/div>\`;
        });
        inputsHtml += '<\/div>';

        let outputsHtml = '<div style="display: grid; grid-template-columns: 1fr; gap: 8px;">';
        data.outputs.forEach(out => {
          outputsHtml += \`<div style="background: var(--bg-secondary); padding: 8px; border-radius: 6px; font-size: 10px;">
            <div>Value: \${out.value} BTC<\/div>
            <div>Address: \${out.address}<\/div>
          <\/div>\`;
        });
        outputsHtml += '<\/div>';

        document.getElementById('explorer-content').innerHTML = \`
          <div class="card a1" style="grid-column: 1/-1;">
            <div class="card-label">Transaction ID<\/div>
            <div class="card-value" style="font-size: 10px; word-break: break-all;">\${data.txid}<\/div>
          <\/div>
          <div class="card a2">
            <div class="card-label">Size<\/div>
            <div class="card-value">\${data.size}B<\/div>
          <\/div>
          <div class="card a3">
            <div class="card-label">Inputs<\/div>
            <div class="card-value">\${data.vin}<\/div>
          <\/div>
          <div class="card a4">
            <div class="card-label">Outputs<\/div>
            <div class="card-value">\${data.vout}<\/div>
          <\/div>
          <div class="card a5">
            <div class="card-label">Confirmations<\/div>
            <div class="card-value">\${data.confirmations}<\/div>
          <\/div>

          <div class="card" style="grid-column: 1/-1; margin-top: 16px;">
            <div class="card-label">Inputs<\/div>
            \${inputsHtml}
          <\/div>

          <div class="card" style="grid-column: 1/-1; margin-top: 16px;">
            <div class="card-label">Outputs<\/div>
            \${outputsHtml}
          <\/div>
        \`;
      } catch (e) {
        document.getElementById('explorer-content').innerHTML = '<div class="error-box">Error: ' + e.message + '<\/div>';
      }
    }

    async function searchBlockExplorer() {
      const blockId = document.getElementById('block-height-search').value.trim();
      if (!blockId) {
        alert('Please enter a block height or hash');
        return;
      }

      try {
        const data = await fetch(\`/api/block-lookup/\${blockId}\`).then(r => r.json());
        if (data.error) {
          document.getElementById('explorer-content').innerHTML = \`<div class="error-box">\${data.error}<\/div>\`;
          return;
        }

        document.getElementById('explorer-content').innerHTML = \`
          <div class="card a1" style="grid-column: 1/-1;">
            <div class="card-label">Block Hash<\/div>
            <div class="card-value" style="font-size: 10px; word-break: break-all;">\${data.hash}<\/div>
          <\/div>
          <div class="card a2">
            <div class="card-label">Height<\/div>
            <div class="card-value">\${data.height}<\/div>
          <\/div>
          <div class="card a3">
            <div class="card-label">Transactions<\/div>
            <div class="card-value">\${data.transactions}<\/div>
          <\/div>
          <div class="card a4">
            <div class="card-label">Size<\/div>
            <div class="card-value">\${bytes(data.size)}<\/div>
          <\/div>
          <div class="card a5">
            <div class="card-label">Time<\/div>
            <div class="card-value" style="font-size: 12px;">\${data.time}<\/div>
          <\/div>
          <div class="card a6">
            <div class="card-label">Difficulty<\/div>
            <div class="card-value">\${data.difficulty.toExponential(2)}<\/div>
          <\/div>
          <div class="card a1" style="margin-top: 16px;">
            <div class="card-label">Confirmations<\/div>
            <div class="card-value">\${data.confirmations}<\/div>
          <\/div>
          <div class="card a2">
            <div class="card-label">Weight<\/div>
            <div class="card-value">\${data.weight}<\/div>
          <\/div>
          <div class="card a3">
            <div class="card-label">Previous Block<\/div>
            <div class="card-value" style="font-size: 10px; word-break: break-all;">\${data.previousblockhash}<\/div>
          <\/div>
        \`;
      } catch (e) {
        document.getElementById('explorer-content').innerHTML = '<div class="error-box">Error: ' + e.message + '<\/div>';
      }
    }
    function refreshTab() {
      const active = document.querySelector('.tab-content.active').id;
      loadTabContent(active);
    }
    function searchBlock() {
      alert('Block search coming soon!');
    }

    // ========== CHART INITIALIZATION FUNCTIONS ==========
    
    function initHealthCharts() {
      const colors = getChartColors();
      const commonOptions = {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { labels: { color: colors.text } } },
        scales: {
          y: { grid: { color: colors.grid }, ticks: { color: colors.text }, min: 0, max: 100 },
          x: { grid: { color: colors.grid }, ticks: { color: colors.text } }
        }
      };

      cpuChart = new Chart(document.getElementById('cpuChart'), {
        type: 'line',
        data: {
          labels: chartData.times,
          datasets: [{
            label: 'CPU Usage (%)',
            data: chartData.cpu,
            backgroundColor: 'rgba(76, 175, 80, 0.1)',
            borderColor: 'rgb(76, 175, 80)',
            borderWidth: 2,
            fill: true,
            tension: 0.4
          }]
        },
        options: commonOptions
      });

      ramChart = new Chart(document.getElementById('ramChart'), {
        type: 'line',
        data: {
          labels: chartData.times,
          datasets: [{
            label: 'RAM Usage (%)',
            data: chartData.ram,
            backgroundColor: 'rgba(63, 81, 181, 0.1)',
            borderColor: 'rgb(63, 81, 181)',
            borderWidth: 2,
            fill: true,
            tension: 0.4
          }]
        },
        options: commonOptions
      });

      diskChart = new Chart(document.getElementById('diskChart'), {
        type: 'line',
        data: {
          labels: chartData.times,
          datasets: [{
            label: 'Disk Usage (%)',
            data: chartData.disk,
            backgroundColor: 'rgba(244, 67, 54, 0.1)',
            borderColor: 'rgb(244, 67, 54)',
            borderWidth: 2,
            fill: true,
            tension: 0.4
          }]
        },
        options: commonOptions
      });
    }

    function addHealthChartPoint(cpu, ram, disk) {
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      chartData.times.push(now);
      chartData.cpu.push(cpu);
      chartData.ram.push(ram);
      chartData.disk.push(disk);

      if (chartData.times.length > MAX_POINTS) {
        chartData.times.shift();
        chartData.cpu.shift();
        chartData.ram.shift();
        chartData.disk.shift();
      }

      if (cpuChart) {
        cpuChart.data.labels = chartData.times;
        cpuChart.data.datasets[0].data = chartData.cpu;
        cpuChart.update('none');
      }
      if (ramChart) {
        ramChart.data.labels = chartData.times;
        ramChart.data.datasets[0].data = chartData.ram;
        ramChart.update('none');
      }
      if (diskChart) {
        diskChart.data.labels = chartData.times;
        diskChart.data.datasets[0].data = chartData.disk;
        diskChart.update('none');
      }
    }

    function initSyncCharts() {
      const colors = getChartColors();
      const commonOptions = {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { labels: { color: colors.text } } },
        scales: {
          y: { grid: { color: colors.grid }, ticks: { color: colors.text } },
          x: { grid: { color: colors.grid }, ticks: { color: colors.text } }
        }
      };

      syncProgressChart = new Chart(document.getElementById('syncProgressChart'), {
        type: 'line',
        data: {
          labels: chartData.times,
          datasets: [{
            label: 'Sync Progress (%)',
            data: chartData.syncProgress,
            backgroundColor: 'rgba(67, 233, 123, 0.1)',
            borderColor: 'rgb(67, 233, 123)',
            borderWidth: 2,
            fill: true,
            tension: 0.4
          }]
        },
        options: { ...commonOptions, scales: { ...commonOptions.scales, y: { ...commonOptions.scales.y, min: 0, max: 100 } } }
      });

      blockSpeedChart = new Chart(document.getElementById('blockSpeedChart'), {
        type: 'line',
        data: {
          labels: chartData.times,
          datasets: [{
            label: 'Blocks/Hour',
            data: chartData.blockSpeed,
            backgroundColor: 'rgba(255, 152, 0, 0.1)',
            borderColor: 'rgb(255, 152, 0)',
            borderWidth: 2,
            fill: true,
            tension: 0.4
          }]
        },
        options: commonOptions
      });

      headerGapChart = new Chart(document.getElementById('headerGapChart'), {
        type: 'line',
        data: {
          labels: chartData.times,
          datasets: [{
            label: 'Headers Behind',
            data: chartData.headerGap,
            backgroundColor: 'rgba(244, 67, 54, 0.1)',
            borderColor: 'rgb(244, 67, 54)',
            borderWidth: 2,
            fill: true,
            tension: 0.4
          }]
        },
        options: commonOptions
      });
    }

    function addSyncChartPoint(progress, blockSpeed, headerGap) {
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (chartData.times[chartData.times.length - 1] !== now) {
        chartData.times.push(now);
        chartData.syncProgress.push(progress);
        chartData.blockSpeed.push(blockSpeed);
        chartData.headerGap.push(headerGap);

        if (chartData.times.length > MAX_POINTS) {
          chartData.times.shift();
          chartData.syncProgress.shift();
          chartData.blockSpeed.shift();
          chartData.headerGap.shift();
        }

        if (syncProgressChart) {
          syncProgressChart.data.labels = chartData.times;
          syncProgressChart.data.datasets[0].data = chartData.syncProgress;
          syncProgressChart.update('none');
        }
        if (blockSpeedChart) {
          blockSpeedChart.data.labels = chartData.times;
          blockSpeedChart.data.datasets[0].data = chartData.blockSpeed;
          blockSpeedChart.update('none');
        }
        if (headerGapChart) {
          headerGapChart.data.labels = chartData.times;
          headerGapChart.data.datasets[0].data = chartData.headerGap;
          headerGapChart.update('none');
        }
      }
    }

    function initMempoolCharts() {
      const colors = getChartColors();
      const commonOptions = {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { labels: { color: colors.text } } },
        scales: {
          y: { grid: { color: colors.grid }, ticks: { color: colors.text } },
          x: { grid: { color: colors.grid }, ticks: { color: colors.text } }
        }
      };

      mempoolSizeChart = new Chart(document.getElementById('mempoolSizeChart'), {
        type: 'line',
        data: {
          labels: chartData.times,
          datasets: [{
            label: 'Mempool Transactions',
            data: chartData.mempoolSize,
            backgroundColor: 'rgba(240, 147, 251, 0.1)',
            borderColor: 'rgb(240, 147, 251)',
            borderWidth: 2,
            fill: true,
            tension: 0.4
          }]
        },
        options: commonOptions
      });
    }

    function addMempoolChartPoint(txCount, mempoolMB) {
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (chartData.times[chartData.times.length - 1] !== now) {
        chartData.times.push(now);
        chartData.mempoolSize.push(txCount);

        if (chartData.times.length > MAX_POINTS) {
          chartData.times.shift();
          chartData.mempoolSize.shift();
        }

        if (mempoolSizeChart) {
          mempoolSizeChart.data.labels = chartData.times;
          mempoolSizeChart.data.datasets[0].data = chartData.mempoolSize;
          mempoolSizeChart.update('none');
        }
      }
    }

    function initNetworkCharts() {
      const colors = getChartColors();
      peerClientChart = new Chart(document.getElementById('peerClientChart'), {
        type: 'doughnut',
        data: { labels: [], datasets: [{ data: [], backgroundColor: ['rgb(102, 126, 234)', 'rgb(240, 147, 251)', 'rgb(79, 172, 254)', 'rgb(67, 233, 123)'] }] },
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { labels: { color: colors.text } } } }
      });
    }

    function initStorageCharts() {
      const colors = getChartColors();
      diskUsageChart = new Chart(document.getElementById('diskUsageChart'), {
        type: 'line',
        data: {
          labels: chartData.times,
          datasets: [{
            label: 'Disk Usage (%)',
            data: chartData.diskUsage,
            backgroundColor: 'rgba(244, 67, 54, 0.1)',
            borderColor: 'rgb(244, 67, 54)',
            borderWidth: 2,
            fill: true,
            tension: 0.4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: { legend: { labels: { color: colors.text } } },
          scales: {
            y: { grid: { color: colors.grid }, ticks: { color: colors.text }, min: 0, max: 100 },
            x: { grid: { color: colors.grid }, ticks: { color: colors.text } }
          }
        }
      });
    }

    function initBlockCharts() {
      const colors = getChartColors();
      const commonOptions = {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { labels: { color: colors.text } } },
        scales: {
          y: { grid: { color: colors.grid }, ticks: { color: colors.text } },
          x: { grid: { color: colors.grid }, ticks: { color: colors.text } }
        }
      };

      blockSizeChart = new Chart(document.getElementById('blockSizeChart'), {
        type: 'line',
        data: {
          labels: chartData.times,
          datasets: [{
            label: 'Block Size (Bytes)',
            data: chartData.blockSize,
            backgroundColor: 'rgba(102, 126, 234, 0.1)',
            borderColor: 'rgb(102, 126, 234)',
            borderWidth: 2,
            fill: true,
            tension: 0.4
          }]
        },
        options: commonOptions
      });

      txPerBlockChart = new Chart(document.getElementById('txPerBlockChart'), {
        type: 'line',
        data: {
          labels: chartData.times,
          datasets: [{
            label: 'Transactions per Block',
            data: chartData.txPerBlock,
            backgroundColor: 'rgba(240, 147, 251, 0.1)',
            borderColor: 'rgb(240, 147, 251)',
            borderWidth: 2,
            fill: true,
            tension: 0.4
          }]
        },
        options: commonOptions
      });
    }

    initTheme();
    loadOverview();
    setInterval(() => {
      if (document.querySelector('.tab-content.active').id === 'overview') loadOverview();
    }, 15000);
  <\/script>
<\/body>
<\/html>\`;
  res.send(html);
});

app.get('/api/status', async (req, res) => {
  try {
    const blockchainInfo = await callBitcoinRpc('getblockchaininfo');
    const netInfo = await callBitcoinRpc('getnetworkinfo');
    const memInfo = await callBitcoinRpc('getmemoryinfo');
    let mempoolSize = 0, uptime = 'N/A', chainstatesize = 0;
    try {
      const mempoolInfo = await callBitcoinRpc('getmempoolinfo');
      mempoolSize = mempoolInfo.size || 0;
    } catch (e) {}
    try {
      const uptimeSeconds = await callBitcoinRpc('uptime');
      const days = Math.floor(uptimeSeconds / 86400);
      const hours = Math.floor((uptimeSeconds % 86400) / 3600);
      uptime = days > 0 ? `${days}d ${hours}h` : `${hours}h`;
    } catch (e) {}
    try {
      const chainsstats = await callBitcoinRpc('getchainsstats', [1]);
      chainstatesize = chainsstats ? chainsstats.bytes_serialized : 0;
    } catch (e) {}
    res.json({
      blockchain: blockchainInfo,
      peers: netInfo.connections || 0,
      memory: (memInfo.locked ? memInfo.locked.used : 0) / (1024 * 1024),
      networkInfo: {
        version: netInfo.version || 'Unknown',
        inbound: netInfo.connections_in || 0,
        outbound: netInfo.connections_out || 0
      },
      mempool: mempoolSize,
      uptime,
      chainstatesize
    });
  } catch (error) {
    res.json({ error: error.message });
  }
});

app.get('/api/recent-blocks', async (req, res) => {
  try {
    const blockchainInfo = await callBitcoinRpc('getblockchaininfo');
    const blocks = [];
    for (let i = 0; i < 10; i++) {
      const height = blockchainInfo.blocks - i;
      if (height < 0) break;
      try {
        const hash = await callBitcoinRpc('getblockhash', [height]);
        const block = await callBitcoinRpc('getblock', [hash]);
        blocks.push({ height, hash: block.hash, time: block.time, tx: block.tx.length, size: block.size });
      } catch (e) {}
    }
    res.json({ blocks });
  } catch (error) {
    res.json({ error: error.message, blocks: [] });
  }
});

app.get('/api/mempool', async (req, res) => {
  try {
    const mempool = await callBitcoinRpc('getrawmempool', [true]);
    const transactions = Object.entries(mempool).slice(0, 20).map(([txid, info]) => ({
      txid, size: info.size, fee: (info.fee * 100000000).toFixed(0) + ' sat'
    }));
    res.json({ transactions });
  } catch (error) {
    res.json({ error: error.message, transactions: [] });
  }
});

app.get('/api/network', async (req, res) => {
  try {
    const netInfo = await callBitcoinRpc('getnetworkinfo');
    res.json({
      connections: netInfo.connections,
      inbound: netInfo.connections_in || 0,
      outbound: netInfo.connections_out || 0,
      version: netInfo.version,
      relayfee: netInfo.relayfee,
      minrelaytxfee: netInfo.minrelaytxfee,
      warnings: netInfo.warnings || 'None'
    });
  } catch (error) {
    res.json({ error: error.message });
  }
});

app.get('/api/chainstate', async (req, res) => {
  try {
    const chainsstats = await callBitcoinRpc('getchainsstats', [1]);
    res.json({
      size: chainsstats.bytes_serialized,
      utxos: chainsstats.utxo_count,
      transactions: chainsstats.transaction_count,
      tx_serialized: chainsstats.txid_index_bytes_serialized,
      utxo_serialized: chainsstats.utxo_index_bytes_serialized
    });
  } catch (error) {
    res.json({ error: error.message });
  }
});

// ========== 1️⃣ NODE HEALTH & PERFORMANCE ==========
app.get('/api/health', async (req, res) => {
  try {
    const systemMetrics = getSystemMetrics();
    const networkInfo = await callBitcoinRpc('getnetworkinfo');
    const blockchainInfo = await callBitcoinRpc('getblockchaininfo');
    const uptime = await callBitcoinRpc('uptime');
    
    // Calculate alerts
    const alerts = [];
    if (systemMetrics.cpuUsage > 80) alerts.push({ type: 'cpu', value: systemMetrics.cpuUsage, message: 'High CPU usage' });
    if (systemMetrics.ramUsage > 85) alerts.push({ type: 'ram', value: systemMetrics.ramUsage, message: 'High RAM usage' });
    if (systemMetrics.diskUsage > 90) alerts.push({ type: 'disk', value: systemMetrics.diskUsage, message: 'Low disk space' });
    if (networkInfo.connections < 1) alerts.push({ type: 'network', value: 0, message: 'No peer connections' });
    
    res.json({
      cpu: systemMetrics.cpuUsage,
      ram: systemMetrics.ramUsage,
      ramMB: systemMetrics.ramUseMB,
      ramTotalMB: systemMetrics.ramTotalMB,
      disk: systemMetrics.diskUsage,
      diskUsedGB: systemMetrics.diskUsedGB,
      diskTotalGB: systemMetrics.diskTotalGB,
      bitcoindUptime: uptime,
      bitcoindUptimeFormatted: formatUptime(uptime),
      connections: networkInfo.connections,
      alerts
    });
  } catch (error) {
    res.json({ error: error.message });
  }
});

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

// ========== 2️⃣ SYNC & BLOCKCHAIN INSIGHTS ==========
app.get('/api/sync-info', async (req, res) => {
  try {
    const blockchainInfo = await callBitcoinRpc('getblockchaininfo');
    const currentTime = Date.now();
    const timeSinceLastUpdate = (currentTime - lastUpdateTime) / 1000;
    
    const sync = blockchainInfo.verificationprogress * 100;
    const blocksBehind = blockchainInfo.headers - blockchainInfo.blocks;
    
    // Calculate sync speed
    let blocksPerMinute = 0;
    let blocksPerHour = 0;
    let estimatedTimeRemaining = 'N/A';
    
    if (blockchainInfo.blocks !== lastBlockHeight) {
      blockTimestamps.push({ height: blockchainInfo.blocks, time: currentTime });
      if (blockTimestamps.length > 60) blockTimestamps.shift();
      
      if (blockTimestamps.length > 1) {
        const timeDiff = (blockTimestamps[blockTimestamps.length - 1].time - blockTimestamps[0].time) / 1000;
        const heightDiff = blockTimestamps[blockTimestamps.length - 1].height - blockTimestamps[0].height;
        
        if (timeDiff > 0) {
          blocksPerMinute = (heightDiff / timeDiff) * 60;
          blocksPerHour = blocksPerMinute * 60;
          
          if (blocksPerMinute > 0 && blocksBehind > 0) {
            const minutesRemaining = blocksBehind / blocksPerMinute;
            estimatedTimeRemaining = formatTime(minutesRemaining * 60);
          }
        }
      }
      
      lastBlockHeight = blockchainInfo.blocks;
      lastUpdateTime = currentTime;
    }
    
    res.json({
      syncPercentage: sync.toFixed(2),
      blockHeight: blockchainInfo.blocks,
      headerHeight: blockchainInfo.headers,
      blocksBehind,
      blocksPerMinute: blocksPerMinute.toFixed(2),
      blocksPerHour: blocksPerHour.toFixed(2),
      estimatedTimeRemaining,
      ibd: blockchainInfo.initialblockdownload,
      chain: blockchainInfo.chain,
      validationStage: blockchainInfo.initialblockdownload ? 'IBD' : 'Validating',
      chainwork: blockchainInfo.chainwork,
      difficulty: blockchainInfo.difficulty,
      time: blockchainInfo.time,
      mediantime: blockchainInfo.mediantime
    });
  } catch (error) {
    res.json({ error: error.message });
  }
});

function formatTime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

// ========== 3️⃣ MEMPOOL INTELLIGENCE ==========
app.get('/api/mempool-enhanced', async (req, res) => {
  try {
    const mempoolInfo = await callBitcoinRpc('getmempoolinfo');
    const mempool = await callBitcoinRpc('getrawmempool', [true]);
    
    // Analyze fee distribution
    const feeRates = Object.entries(mempool).map(([txid, info]) => info.fees.base * 100000000 / info.size);
    feeRates.sort((a, b) => a - b);
    
    const percentile10 = feeRates[Math.floor(feeRates.length * 0.1)] || 0;
    const percentile50 = feeRates[Math.floor(feeRates.length * 0.5)] || 0;
    const percentile90 = feeRates[Math.floor(feeRates.length * 0.9)] || 0;
    
    // Get oldest transaction
    let oldestTime = Date.now();
    Object.values(mempool).forEach(tx => {
      if (tx.time < oldestTime) oldestTime = tx.time;
    });
    const oldestAge = Math.floor((Date.now() / 1000 - oldestTime) / 60);
    
    res.json({
      transactionCount: mempoolInfo.size,
      mempoolBytes: mempoolInfo.bytes,
      mempoolMB: (mempoolInfo.bytes / (1024 * 1024)).toFixed(2),
      totalFees: (mempoolInfo.total_fee * 100000000).toFixed(0),
      mempoolMinFee: (mempoolInfo.mempoolminfee * 100000000).toFixed(2),
      minRelayFee: (mempoolInfo.minrelaytxfee * 100000000).toFixed(2),
      feeDistribution: {
        slow: percentile10.toFixed(2),
        medium: percentile50.toFixed(2),
        fast: percentile90.toFixed(2)
      },
      oldestTransactionAge: oldestAge,
      averageFee: ((mempoolInfo.total_fee / mempoolInfo.size) * 100000000).toFixed(2),
      topTransactions: Object.entries(mempool).sort((a, b) => b[1].fees.base - a[1].fees.base).slice(0, 10).map(([txid, info]) => ({
        txid,
        size: info.size,
        fee: (info.fees.base * 100000000).toFixed(0),
        feeRate: (info.fees.base * 100000000 / info.size).toFixed(2)
      }))
    });
  } catch (error) {
    res.json({ error: error.message });
  }
});

// ========== 4️⃣ NETWORK & PEER ANALYTICS ==========
app.get('/api/network-analytics', async (req, res) => {
  try {
    const netInfo = await callBitcoinRpc('getnetworkinfo');
    const peers = await callBitcoinRpc('getpeerinfo');
    
    // Analyze peers
    let inbound = 0, outbound = 0;
    const clientVersions = {};
    let totalLatency = 0;
    
    peers.forEach(peer => {
      if (peer.inbound) inbound++;
      else outbound++;
      
      const version = peer.subver || 'Unknown';
      clientVersions[version] = (clientVersions[version] || 0) + 1;
      
      if (peer.pingtime) totalLatency += peer.pingtime;
    });
    
    const avgLatency = peers.length > 0 ? (totalLatency / peers.length * 1000).toFixed(2) : 0;
    
    res.json({
      totalPeers: peers.length,
      inbound,
      outbound,
      inboundPercent: peers.length > 0 ? ((inbound / peers.length) * 100).toFixed(1) : 0,
      outboundPercent: peers.length > 0 ? ((outbound / peers.length) * 100).toFixed(1) : 0,
      averageLatency: avgLatency,
      clientDistribution: clientVersions,
      networkConnections: netInfo.connections,
      networkVersion: netInfo.version,
      protocolVersion: netInfo.protocolversion,
      reachableIPv4: netInfo.reachable_ipv4 || false,
      reachableIPv6: netInfo.reachable_ipv6 || false,
      reachableTor: netInfo.reachable_ipv6 || false,
      timeOffset: netInfo.timeoffset
    });
  } catch (error) {
    res.json({ error: error.message });
  }
});

// ========== 5️⃣ SECURITY & NODE INTEGRITY ==========
app.get('/api/security', async (req, res) => {
  try {
    const blockchainInfo = await callBitcoinRpc('getblockchaininfo');
    const netInfo = await callBitcoinRpc('getnetworkinfo');
    
    const alerts = [];
    
    // Check for reorg risk
    if (blockchainInfo.mediantime && blockchainInfo.time) {
      const timeDiff = blockchainInfo.time - blockchainInfo.mediantime;
      if (timeDiff > 3600) alerts.push('⚠️ Large time offset detected');
    }
    
    // Check for network warnings
    if (netInfo.warnings) {
      alerts.push('⚠️ Network warning: ' + netInfo.warnings);
    }
    
    res.json({
      warnings: netInfo.warnings || 'None',
      chain: blockchainInfo.chain,
      currentBlockHash: blockchainInfo.bestblockhash,
      previousBlockHash: 'N/A',
      orphanBlocks: 0,
      reorgDetected: false,
      chainForks: 0,
      rpcAuth: 'Enabled',
      tor: blockchainInfo.tor ? 'Connected' : 'Not Connected',
      alerts,
      softforks: blockchainInfo.softforks || [],
      isInitialBlockDownload: blockchainInfo.initialblockdownload,
      pruned: blockchainInfo.pruned,
      pruneHeight: blockchainInfo.pruneheight || 'N/A'
    });
  } catch (error) {
    res.json({ error: error.message });
  }
});

// ========== 6️⃣ STORAGE & PRUNING ==========
app.get('/api/storage', async (req, res) => {
  try {
    const blockchainInfo = await callBitcoinRpc('getblockchaininfo');
    const chainsstats = await callBitcoinRpc('getchainsstats', [1]);
    const systemMetrics = getSystemMetrics();
    
    res.json({
      chainstateSize: chainsstats.bytes_serialized,
      chainstateGB: (chainsstats.bytes_serialized / (1024 * 1024 * 1024)).toFixed(2),
      pruned: blockchainInfo.pruned,
      pruneHeight: blockchainInfo.pruneheight || blockchainInfo.blocks,
      pruneTargetSize: blockchainInfo.prune_target_size || 'N/A',
      oldestBlockRetained: blockchainInfo.pruneheight ? `Block ${blockchainInfo.pruneheight}` : 'All blocks',
      diskUsedGB: systemMetrics.diskUsedGB.toFixed(2),
      diskTotalGB: systemMetrics.diskTotalGB.toFixed(2),
      diskUsagePercent: systemMetrics.diskUsage.toFixed(2),
      blocksCount: blockchainInfo.blocks,
      utxoCount: chainsstats.utxo_count,
      autoPruneEnabled: blockchainInfo.prune_target_size ? 'Yes' : 'No'
    });
  } catch (error) {
    res.json({ error: error.message });
  }
});

// ========== 7️⃣ MINER & BLOCK INSIGHTS ==========
app.get('/api/block-insights', async (req, res) => {
  try {
    const blockchainInfo = await callBitcoinRpc('getblockchaininfo');
    const blocks = [];
    let totalSize = 0;
    let totalTx = 0;
    let totalFees = 0;
    const sizes = [];
    const txCounts = [];
    const avgBlockTimes = [];
    
    for (let i = 0; i < 20; i++) {
      const height = blockchainInfo.blocks - i;
      if (height <= 0) break;
      
      try {
        const hash = await callBitcoinRpc('getblockhash', [height]);
        const block = await callBitcoinRpc('getblock', [hash]);
        
        blocks.push({
          height,
          hash: block.hash,
          time: new Date(block.time * 1000),
          txCount: block.tx.length,
          size: block.size,
          miner: 'Unknown'
        });
        
        totalSize += block.size;
        totalTx += block.tx.length;
        sizes.push(block.size);
        txCounts.push(block.tx.length);
        
        if (blocks.length > 1) {
          avgBlockTimes.push(blocks[0].time - blocks[1].time);
        }
      } catch (e) {}
    }
    
    const averageBlockSize = blocks.length > 0 ? (totalSize / blocks.length).toFixed(0) : 0;
    const averageTxPerBlock = blocks.length > 0 ? (totalTx / blocks.length).toFixed(2) : 0;
    const averageBlockTime = avgBlockTimes.length > 0 
      ? (avgBlockTimes.reduce((a, b) => a + b, 0) / avgBlockTimes.length / 1000 / 60).toFixed(2)
      : 10;
    
    res.json({
      latestBlocks: blocks.reverse().slice(0, 10),
      averageBlockSize,
      averageTxPerBlock,
      averageBlockTime,
      totalBlocksAnalyzed: blocks.length,
      largestBlock: Math.max(...sizes),
      smallestBlock: Math.min(...sizes),
      maxTxInBlock: Math.max(...txCounts),
      minTxInBlock: Math.min(...txCounts)
    });
  } catch (error) {
    res.json({ error: error.message, latestBlocks: [] });
  }
});

// ========== 8️⃣ TRANSACTION EXPLORER ==========
app.get('/api/tx-lookup/:txid', async (req, res) => {
  try {
    const txid = req.params.txid;
    if (!/^[a-f0-9]{64}$/.test(txid.toLowerCase())) {
      return res.json({ error: 'Invalid TXID format' });
    }
    
    try {
      const tx = await callBitcoinRpc('getrawtransaction', [txid, true]);
      res.json({
        txid,
        version: tx.version,
        size: tx.size,
        vsize: tx.vsize,
        weight: tx.weight,
        locktime: tx.locktime,
        vin: tx.vin.length,
        vout: tx.vout.length,
        inputs: tx.vin.map(inp => ({
          txid: inp.txid,
          vout: inp.vout,
          sequence: inp.sequence
        })),
        outputs: tx.vout.map(out => ({
          value: out.value,
          scriptPubKey: out.scriptPubKey.type,
          address: out.scriptPubKey.address || 'N/A'
        })),
        confirmations: tx.confirmations || 0,
        blocktime: tx.blocktime || null,
        time: tx.time || null
      });
    } catch (e) {
      res.json({ error: 'Transaction not found' });
    }
  } catch (error) {
    res.json({ error: error.message });
  }
});

app.get('/api/block-lookup/:blockId', async (req, res) => {
  try {
    const blockId = req.params.blockId;
    let hash;
    
    if (blockId.length === 64) {
      hash = blockId;
    } else {
      const height = parseInt(blockId);
      if (isNaN(height)) return res.json({ error: 'Invalid block identifier' });
      hash = await callBitcoinRpc('getblockhash', [height]);
    }
    
    const block = await callBitcoinRpc('getblock', [hash]);
    res.json({
      hash: block.hash,
      height: block.height,
      time: new Date(block.time * 1000),
      miner: block.miner || 'Unknown',
      transactions: block.tx.length,
      size: block.size,
      vsize: block.vsize,
      weight: block.weight,
      version: block.version,
      difficulty: block.difficulty,
      nonce: block.nonce,
      previousblockhash: block.previousblockhash,
      nextblockhash: block.nextblockhash || null,
      confirmations: block.confirmations
    });
  } catch (error) {
    res.json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Bitcoin Node Explorer running on port ${PORT}`);
});
