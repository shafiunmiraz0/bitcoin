const express = require('express');
const axios = require('axios');
const app = express();

const BITCOIN_RPC = {
  host: process.env.BITCOIN_HOST || 'bitcoin',
  port: process.env.BITCOIN_PORT || 8332,
  user: process.env.BITCOIN_USER || 'bitcoinuser',
  password: process.env.BITCOIN_PASSWORD || 'CHANGE_THIS_TO_A_STRONG_PASSWORD'
};

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
      <div class="nav-tab" onclick="switchTab('blocks')">⛓️ Blocks</div>
      <div class="nav-tab" onclick="switchTab('mempool')">💫 Mempool</div>
      <div class="nav-tab" onclick="switchTab('network')">🌐 Network</div>
      <div class="nav-tab" onclick="switchTab('chainstate')">💾 ChainState</div>
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

    <div id="blocks" class="tab-content">
      <div class="search-box">
        <input type="text" id="block-search" placeholder="Enter block height or hash...">
        <button onclick="searchBlock()">Search<\/button>
      </div>
      <div id="blocks-content"><div class="loading">Loading blocks...<\/div><\/div>
    </div>

    <div id="mempool" class="tab-content">
      <div id="mempool-content"><div class="loading">Loading mempool...<\/div><\/div>
    </div>

    <div id="network" class="tab-content">
      <div class="dashboard" id="network-content">
        <div class="loading">Loading network...<\/div>
      </div>
    </div>

    <div id="chainstate" class="tab-content">
      <div class="dashboard" id="chainstate-content">
        <div class="loading">Loading chainstate...<\/div>
      </div>
    </div>
  </div>

  <script>
    let blockChart, peersChart, memoryChart, syncChart;
    let chartData = {
      times: [],
      blocks: [],
      peers: [],
      memory: [],
      sync: []
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
      else if (tab === 'blocks') loadBlocks();
      else if (tab === 'mempool') loadMempool();
      else if (tab === 'network') loadNetwork();
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
    async function loadBlocks() {
      try {
        const data = await fetch('/api/recent-blocks').then(r => r.json());
        let html = '<div class="blocks-list">';
        data.blocks.forEach(b => {
          html += \`<div class="block-item">
            <div><div class="block-label">Height<\/div><div class="block-value">\${b.height}<\/div><\/div>
            <div><div class="block-label">Time<\/div><div class="block-value">\${new Date(b.time * 1000).toLocaleString()}<\/div><\/div>
            <div><div class="block-label">Transactions<\/div><div class="block-value">\${b.tx}<\/div><\/div>
            <div><div class="block-label">Size<\/div><div class="block-value">\${bytes(b.size)}<\/div><\/div>
            <div style="grid-column: 1/-1;"><div class="block-label">Hash<\/div><div class="block-value" style="font-size: 10px;">\${b.hash}<\/div><\/div>
          <\/div>\`;
        });
        html += '<\/div>';
        document.getElementById('blocks-content').innerHTML = html;
      } catch (e) {
        document.getElementById('blocks-content').innerHTML = '<div class="error-box">Error: ' + e.message + '<\/div>';
      }
    }
    async function loadMempool() {
      try {
        const data = await fetch('/api/mempool').then(r => r.json());
        let html = '<div class="tx-table"><table><thead><tr><th>TXID<\/th><th>Size<\/th><th>Fee<\/th><\/tr><\/thead><tbody>';
        data.transactions.slice(0, 20).forEach(tx => {
          html += \`<tr><td style="word-break: break-all; font-size: 10px;">\${tx.txid}<\/td><td>\${tx.size}B<\/td><td>\${tx.fee}<\/td><\/tr>\`;
        });
        html += '<\/tbody><\/table><\/div>';
        document.getElementById('mempool-content').innerHTML = html;
      } catch (e) {
        document.getElementById('mempool-content').innerHTML = '<div class="error-box">Error: ' + e.message + '<\/div>';
      }
    }
    async function loadNetwork() {
      try {
        const data = await fetch('/api/network').then(r => r.json());
        document.getElementById('network-content').innerHTML = \`
          <div class="card a1">
            <div class="card-label">Total Connections<\/div>
            <div class="card-value">\${data.connections}<\/div>
            <div class="stat-mini"><div class="stat-mini-value">\${data.inbound}<\/div><div class="stat-mini-label">Inbound<\/div><\/div>
            <div class="stat-mini"><div class="stat-mini-value">\${data.outbound}<\/div><div class="stat-mini-label">Outbound<\/div><\/div>
          <\/div>
          <div class="card a2">
            <div class="card-label">Version<\/div>
            <div class="card-value" style="font-size: 16px;">\${data.version}<\/div>
          <\/div>
          <div class="card a3">
            <div class="card-label">Relay Fee<\/div>
            <div class="card-value" style="font-size: 16px;">\${data.relayfee}<\/div>
          <\/div>
          <div class="card a4">
            <div class="card-label">Min Relay Fee<\/div>
            <div class="card-value" style="font-size: 16px;">\${data.minrelaytxfee}<\/div>
          <\/div>
          <div class="card a5">
            <div class="card-label">Network Warnings<\/div>
            <div class="card-value" style="font-size: 14px;">\${data.warnings || 'None'}<\/div>
          <\/div>
        \`;
      } catch (e) {
        document.getElementById('network-content').innerHTML = '<div class="error-box">Error: ' + e.message + '<\/div>';
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
    function refreshTab() {
      const active = document.querySelector('.tab-content.active').id;
      loadTabContent(active);
    }
    function searchBlock() {
      alert('Block search coming soon!');
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Bitcoin Node Explorer running on port ${PORT}`);
});
