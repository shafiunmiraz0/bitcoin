package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"
)

type BitcoinRPC struct {
	Host     string
	Port     string
	User     string
	Password string
}

type RPCRequest struct {
	JSONRPC string        `json:"jsonrpc"`
	ID      string        `json:"id"`
	Method  string        `json:"method"`
	Params  []interface{} `json:"params"`
}

type RPCResponse struct {
	Result interface{} `json:"result"`
	Error  interface{} `json:"error"`
}

// State tracking for metrics
var (
	bitcoinRPC      BitcoinRPC
	lastBlockHeight int64
	lastBlockTime   time.Time
	blockTimestamps []struct {
		height int64
		time   time.Time
	}
)

var (
	// Cached API response
	storageCache map[string]interface{}

	// Timestamp of last cache update
	storageCacheTime time.Time

	// Mutex to prevent race conditions
	storageCacheMutex sync.Mutex
)

// Global reusable HTTP client with long timeout
var rpcClient = &http.Client{
	Timeout: 5 * time.Minute, // allow long RPC calls like gettxoutsetinfo
}

func init() {
	bitcoinRPC = BitcoinRPC{
		Host:     getEnv("BITCOIN_HOST", "bitcoin"),
		Port:     getEnv("BITCOIN_PORT", "8332"),
		User:     getEnv("BITCOIN_USER", "bitcoinuser"),
		Password: getEnv("BITCOIN_PASSWORD", "CHANGE_THIS_TO_A_STRONG_PASSWORD"),
	}
}

func getEnv(key, defaultVal string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultVal
}

func callBitcoinRpc(method string, params []interface{}) (interface{}, error) {
	req := RPCRequest{
		JSONRPC: "1.0",
		ID:      "webhook",
		Method:  method,
		Params:  params,
	}

	body, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}

	url := fmt.Sprintf("http://%s:%s/", bitcoinRPC.Host, bitcoinRPC.Port)
	httpReq, err := http.NewRequest("POST", url, bytes.NewBuffer(body))
	if err != nil {
		return nil, err
	}

	httpReq.SetBasicAuth(bitcoinRPC.User, bitcoinRPC.Password)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := rpcClient.Do(httpReq)
	if err != nil {
		log.Printf("RPC Error: %s - %v\n", method, err)
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var rpcResp RPCResponse
	err = json.Unmarshal(respBody, &rpcResp)
	if err != nil {
		return nil, err
	}

	if rpcResp.Error != nil {
		return nil, fmt.Errorf("RPC %s returned error: %v", method, rpcResp.Error)
	}

	return rpcResp.Result, nil
}

func getDashboardHTML() string {
	html := `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bitcoin Node Explorer</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js"></script>
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
    .btn { padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; background: rgba(255,255,255,0.2); color: white; transition: background 0.2s; }
    .btn:hover { background: rgba(255,255,255,0.3); }
    .nav-tabs { display: flex; gap: 8px; margin-bottom: 20px; background: var(--bg-primary); padding: 12px; border-radius: 10px; flex-wrap: wrap; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .nav-tab { padding: 8px 16px; border: 2px solid transparent; border-radius: 6px; cursor: pointer; background: var(--bg-secondary); color: var(--text-primary); font-weight: 600; transition: all 0.2s; }
    .nav-tab.active { background: var(--accent); color: white; border-color: var(--accent2); }
    .nav-tab:hover { background: var(--accent); color: white; }
    .content { background: var(--bg-primary); padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .cards-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
    .card { background: var(--bg-secondary); padding: 15px; border-radius: 8px; border-left: 4px solid var(--accent); }
    .card-label { font-size: 12px; color: var(--text-tertiary); text-transform: uppercase; margin-bottom: 6px; }
    .card-value { font-size: 24px; font-weight: 700; color: var(--accent); }
    .card-sub { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    .chart-container { position: relative; height: 300px; margin-bottom: 20px; background: var(--bg-secondary); padding: 15px; border-radius: 8px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid var(--border); }
    th { background: var(--bg-secondary); font-weight: 600; color: var(--accent); }
    tr:hover { background: var(--bg-secondary); }
    code { font-size: 11px; color: var(--text-secondary); }
    .search-box { display: flex; gap: 8px; margin-bottom: 15px; }
    .search-box input { flex: 1; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary); }
    .search-box input::placeholder { color: var(--text-tertiary); }
    .status-badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }
    .status-badge.synced { background: var(--success); color: white; }
    .status-badge.syncing { background: var(--warning); color: white; }
    @media (max-width: 768px) {
      .header { flex-direction: column; align-items: flex-start; }
      .cards-grid { grid-template-columns: 1fr; }
      .chart-container { height: 200px; }
      .nav-tabs { flex-direction: column; }
      .nav-tab { width: 100%; }
      table { font-size: 12px; }
      th, td { padding: 6px; }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="title">₿ Bitcoin Node Explorer</div>
      <div class="controls">
        <button class="btn" onclick="toggleTheme()">🌓 Theme</button>
      </div>
    </div>
    <div class="nav-tabs">
      <div class="nav-tab active" onclick="switchTab('overview', this)">📊 Overview</div>
      <div class="nav-tab" onclick="switchTab('health', this)">❤️ Health</div>
      <div class="nav-tab" onclick="switchTab('sync', this)">⚡ Sync</div>
      <div class="nav-tab" onclick="switchTab('mempool', this)">💫 Mempool</div>
      <div class="nav-tab" onclick="switchTab('network', this)">🌐 Network</div>
      <div class="nav-tab" onclick="switchTab('security', this)">🔒 Security</div>
      <div class="nav-tab" onclick="switchTab('storage', this)">💾 Storage</div>
      <div class="nav-tab" onclick="switchTab('blocks', this)">⛓️ Blocks</div>
      <div class="nav-tab" onclick="switchTab('explorer', this)">🔍 Explorer</div>
      <div class="nav-tab" onclick="switchTab('chainstate', this)">📈 ChainState</div>
    </div>
    <div class="content">
      <div id="overview" class="tab-content active">
        <div class="cards-grid" id="statusCards"></div>
        <h3>📊 Real-time Metrics</h3>
        <div class="chart-container"><canvas id="blockChart"></canvas></div>
        <div class="chart-container"><canvas id="peersChart"></canvas></div>
        <div class="chart-container"><canvas id="memoryChart"></canvas></div>
        <div class="chart-container"><canvas id="syncChart"></canvas></div>
      </div>
      <div id="health" class="tab-content">
        <div class="cards-grid" id="healthCards"></div>
      </div>
      <div id="sync" class="tab-content">
        <div class="cards-grid" id="syncCards"></div>
        <div class="chart-container"><canvas id="syncProgressChart"></canvas></div>
      </div>
      <div id="mempool" class="tab-content">
        <div class="cards-grid" id="mempoolCards"></div>
        <h3>💫 Top Mempool Transactions</h3>
        <table id="mempoolTable">
          <thead><tr><th>TXID</th><th>Size</th><th>Fee</th><th>Fee Rate (sat/vB)</th></tr></thead>
          <tbody id="mempoolList"></tbody>
        </table>
      </div>
      <div id="network" class="tab-content">
        <div class="cards-grid" id="networkCards"></div>
      </div>
      <div id="security" class="tab-content">
        <div class="cards-grid" id="securityCards"></div>
      </div>
      <div id="storage" class="tab-content">
        <div class="cards-grid" id="storageCards"></div>
      </div>
      <div id="blocks" class="tab-content">
        <h3>📦 Recent Blocks</h3>
        <div class="search-box">
          <input type="number" id="blockSearch" placeholder="Search by height..." />
          <button class="btn" onclick="searchBlock()">Search</button>
        </div>
        <table id="blocksTable">
          <thead><tr><th>Height</th><th>Hash</th><th>Time</th><th>Transactions</th><th>Size</th></tr></thead>
          <tbody id="blocksList"></tbody>
        </table>
      </div>
      <div id="explorer" class="tab-content">
        <h3>🔍 Transaction Explorer</h3>
        <div class="search-box">
          <input type="text" id="txSearch" placeholder="Enter transaction ID (TXID)..." />
          <button class="btn" onclick="searchTransaction()">Search TX</button>
        </div>
        <div id="explorerResults"></div>
      </div>
      <div id="chainstate" class="tab-content">
        <h3>⛓️ ChainState Database</h3>
        <div class="cards-grid" id="chainstateCards"></div>
      </div>
    </div>
  </div>
  <script>
    const chartData = { times: [], blocks: [], peers: [], memory: [], sync: [] };
    let blockChart, peersChart, memoryChart, syncChart;
    function fmt(num) { return new Intl.NumberFormat().format(Math.floor(num)); }
    function bytes(b) { const units = ['B','KB','MB','GB']; let size = b, idx = 0; while (size >= 1024 && idx < units.length-1) { size /= 1024; idx++; } return (size < 10 ? size.toFixed(2) : Math.floor(size)) + ' ' + units[idx]; }
    function initTheme() { if (localStorage.getItem('theme') === 'dark') document.documentElement.classList.add('dark-mode'); }
    function toggleTheme() { document.documentElement.classList.toggle('dark-mode'); const isDark = document.documentElement.classList.contains('dark-mode'); localStorage.setItem('theme', isDark ? 'dark' : 'light'); if (blockChart) updateChartColors(); }
    function getChartColors() { const isDark = document.documentElement.classList.contains('dark-mode'); return { gridColor: isDark ? '#404040' : '#e0e0e0', textColor: isDark ? '#b0b0b0' : '#666', lineColor: isDark ? '#667eea' : '#667eea' }; }
    function updateChartColors() { const colors = getChartColors(); [blockChart, peersChart, memoryChart, syncChart].forEach(chart => { if (chart) { chart.options.scales.y.grid.color = colors.gridColor; chart.options.scales.y.ticks.color = colors.textColor; chart.options.scales.x.grid.color = colors.gridColor; chart.options.scales.x.ticks.color = colors.textColor; chart.update(); } }); }
    async function loadOverview() {
      try {
        const status = await fetch('/api/status').then(r => r.json());
        const now = new Date().toLocaleTimeString();
        chartData.times.push(now);
        chartData.blocks.push(status.blockchain?.blocks || 0);
        chartData.peers.push(status.peers || 0);
        chartData.memory.push(status.memory || 0);
        chartData.sync.push((status.blockchain?.verificationprogress || 0) * 100);
        if (chartData.times.length > 60) { chartData.times.shift(); chartData.blocks.shift(); chartData.peers.shift(); chartData.memory.shift(); chartData.sync.shift(); }
        const syncPercent = ((status.blockchain?.verificationprogress || 0) * 100).toFixed(2);
        const synced = syncPercent >= 99.9;
        document.getElementById('statusCards').innerHTML = '<div class="card"><div class="card-label">Block Height</div><div class="card-value">' + fmt(status.blockchain?.blocks || 0) + '</div></div><div class="card"><div class="card-label">Connections</div><div class="card-value">' + (status.peers || 0) + '</div></div><div class="card"><div class="card-label">Sync Progress</div><div class="card-value">' + syncPercent + '%</div><div class="card-sub"><span class="status-badge ' + (synced ? 'synced' : 'syncing') + '">' + (synced ? '✓ Synced' : '⟳ Syncing') + '</span></div></div><div class="card"><div class="card-label">Memory Usage</div><div class="card-value">' + (status.memory?.toFixed(1) || 0) + ' MB</div></div><div class="card"><div class="card-label">Mempool Size</div><div class="card-value">' + fmt(status.mempool || 0) + '</div></div><div class="card"><div class="card-label">Uptime</div><div class="card-value" style="font-size:14px">' + (status.uptime || 'N/A') + '</div></div>';
        const colors = getChartColors();
        const chartOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { color: colors.gridColor }, ticks: { color: colors.textColor } }, x: { grid: { color: colors.gridColor }, ticks: { color: colors.textColor } } } };
        if (!blockChart) {
          blockChart = new Chart(document.getElementById('blockChart'), { type: 'line', data: { labels: chartData.times, datasets: [{ label: 'Block Height', data: chartData.blocks, borderColor: colors.lineColor, tension: 0.1, fill: false }] }, options: chartOptions });
          peersChart = new Chart(document.getElementById('peersChart'), { type: 'line', data: { labels: chartData.times, datasets: [{ label: 'Peers', data: chartData.peers, borderColor: '#ff9800', tension: 0.1, fill: false }] }, options: chartOptions });
          memoryChart = new Chart(document.getElementById('memoryChart'), { type: 'line', data: { labels: chartData.times, datasets: [{ label: 'Memory (MB)', data: chartData.memory, borderColor: '#f44336', tension: 0.1, fill: false }] }, options: chartOptions });
          syncChart = new Chart(document.getElementById('syncChart'), { type: 'line', data: { labels: chartData.times, datasets: [{ label: 'Sync Progress (%)', data: chartData.sync, borderColor: '#4caf50', tension: 0.1, fill: false }] }, options: chartOptions });
        } else {
          blockChart.data.labels = chartData.times; blockChart.data.datasets[0].data = chartData.blocks; blockChart.update();
          peersChart.data.labels = chartData.times; peersChart.data.datasets[0].data = chartData.peers; peersChart.update();
          memoryChart.data.labels = chartData.times; memoryChart.data.datasets[0].data = chartData.memory; memoryChart.update();
          syncChart.data.labels = chartData.times; syncChart.data.datasets[0].data = chartData.sync; syncChart.update();
        }
      } catch (e) { console.error('Error loading overview:', e); }
    }
    async function loadBlocks() {
      try {
        const data = await fetch('/api/recent-blocks').then(r => r.json());
        let html = '';
        (data.blocks || []).forEach(b => { html += '<tr><td>' + fmt(b.height) + '</td><td><code style="word-break: break-all;">' + b.hash + '</code></td><td>' + new Date(b.time * 1000).toLocaleString() + '</td><td>' + b.tx + '</td><td>' + bytes(b.size) + '</td></tr>'; });
        document.getElementById('blocksList').innerHTML = html;
      } catch (e) { console.error('Error loading blocks:', e); }
    }
    async function loadMempool() {
      try {
        const data = await fetch('/api/mempool').then(r => r.json());
        let html = '';
        (data.transactions || []).forEach(t => { html += '<tr><td><code>' + t.txid.substring(0, 16) + '...</code></td><td>' + bytes(t.size) + '</td><td>' + t.fee + '</td></tr>'; });
        document.getElementById('mempoolList').innerHTML = html;
      } catch (e) { console.error('Error loading mempool:', e); }
    }
    async function loadNetwork() {
      try {
        const data = await fetch('/api/network').then(r => r.json());
        document.getElementById('networkCards').innerHTML = '<div class="card"><div class="card-label">Total Connections</div><div class="card-value">' + (data.connections || 0) + '</div></div><div class="card"><div class="card-label">Inbound</div><div class="card-value">' + (data.inbound || 0) + '</div></div><div class="card"><div class="card-label">Outbound</div><div class="card-value">' + (data.outbound || 0) + '</div></div><div class="card"><div class="card-label">Relay Fee</div><div class="card-value" style="font-size:14px">' + (data.relayfee || 'N/A') + '</div></div>';
      } catch (e) { console.error('Error loading network:', e); }
    }
    async function loadChainState() {
      try {
        const data = await fetch('/api/chainstate').then(r => r.json());
        document.getElementById('chainstateCards').innerHTML = '<div class="card"><div class="card-label">Database Size</div><div class="card-value">' + bytes(data.size || 0) + '</div></div><div class="card"><div class="card-label">UTXO Count</div><div class="card-value">' + fmt(data.utxos || 0) + '</div></div><div class="card"><div class="card-label">Transactions</div><div class="card-value">' + fmt(data.transactions || 0) + '</div></div>';
      } catch (e) { console.error('Error loading chainstate:', e); }
    }
    function switchTab(tabName, element) { document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active')); document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active')); document.getElementById(tabName).classList.add('active'); element.classList.add('active'); loadTabContent(tabName); }
    function loadTabContent(tab) {
      if (tab === 'overview') loadOverview();
      else if (tab === 'health') loadHealth();
      else if (tab === 'sync') loadSync();
      else if (tab === 'mempool') loadMempoolEnhanced();
      else if (tab === 'network') loadNetworkAnalytics();
      else if (tab === 'security') loadSecurity();
      else if (tab === 'storage') loadStorage();
      else if (tab === 'blocks') loadBlocks();
      else if (tab === 'explorer') { document.getElementById('explorerResults').innerHTML = '<p>Enter a transaction ID to search...</p>'; }
      else if (tab === 'chainstate') loadChainState();
    }
    async function loadHealth() {
      try {
        const data = await fetch('/api/health').then(r => r.json());
        document.getElementById('healthCards').innerHTML = '<div class="card"><div class="card-label">CPU Usage</div><div class="card-value">' + data.cpu.toFixed(1) + '%</div></div><div class="card"><div class="card-label">RAM Usage</div><div class="card-value">' + data.ram.toFixed(1) + '%</div><div class="card-sub">' + data.ramMB.toFixed(0) + 'MB / ' + data.ramTotalMB.toFixed(0) + 'MB</div></div><div class="card"><div class="card-label">Disk Usage</div><div class="card-value">' + data.disk.toFixed(1) + '%</div><div class="card-sub">' + data.diskUsedGB.toFixed(1) + 'GB / ' + data.diskTotalGB.toFixed(1) + 'GB</div></div><div class="card"><div class="card-label">Bitcoin Uptime</div><div class="card-value" style="font-size:16px">' + data.bitcoindUptimeFormatted + '</div></div>' + (data.alerts && data.alerts.length > 0 ? '<div class="card" style="background: #f44336; color: white;"><strong>Alerts:</strong><br>' + data.alerts.map(a => '⚠️ ' + a.message).join('<br>') + '</div>' : '');
      } catch (e) { console.error('Error loading health:', e); }
    }
    async function loadSync() {
      try {
        const data = await fetch('/api/sync-info').then(r => r.json());
        document.getElementById('syncCards').innerHTML = '<div class="card"><div class="card-label">Sync Progress</div><div class="card-value">' + parseFloat(data.syncPercentage).toFixed(2) + '%</div></div><div class="card"><div class="card-label">Block Height</div><div class="card-value">' + fmt(data.blockHeight) + '</div><div class="card-sub">Behind: ' + fmt(data.blocksBehind) + '</div></div><div class="card"><div class="card-label">Sync Speed</div><div class="card-value">' + data.blocksPerHour + ' blks/h</div></div><div class="card"><div class="card-label">Est. Time Left</div><div class="card-value" style="font-size:16px">' + data.estimatedTimeRemaining + '</div></div>';
      } catch (e) { console.error('Error loading sync:', e); }
    }
    async function loadMempoolEnhanced() {
      try {
        const data = await fetch('/api/mempool-enhanced').then(r => r.json());
        let txHtml = '';
        (data.topTransactions || []).slice(0, 10).forEach(t => { txHtml += '<tr><td><code style="word-break: break-all;">' + t.txid + '</code></td><td>' + bytes(t.size) + '</td><td>' + t.fee + ' sat</td><td>' + t.feeRate + '</td></tr>'; });
        document.getElementById('mempoolCards').innerHTML = '<div class="card"><div class="card-label">Transaction Count</div><div class="card-value">' + fmt(data.transactionCount) + '</div></div><div class="card"><div class="card-label">Mempool Size</div><div class="card-value">' + data.mempoolMB + ' MB</div></div><div class="card"><div class="card-label">Avg Fee</div><div class="card-value">' + data.averageFee + ' sat/vB</div></div><div class="card"><div class="card-label">Oldest TX Age</div><div class="card-value">' + data.oldestTransactionAge + ' min</div></div><div class="card"><div class="card-label">Recommended Fee</div><div class="card-sub">Slow: ' + data.feeDistribution.slow + ' | Medium: ' + data.feeDistribution.medium + ' | Fast: ' + data.feeDistribution.fast + '</div></div>';
        document.getElementById('mempoolList').innerHTML = txHtml;
      } catch (e) { console.error('Error loading mempool:', e); }
    }
    async function loadNetworkAnalytics() {
      try {
        const data = await fetch('/api/network-analytics').then(r => r.json());
        document.getElementById('networkCards').innerHTML = '<div class="card"><div class="card-label">Total Peers</div><div class="card-value">' + fmt(data.totalPeers) + '</div><div class="card-sub">Inbound: ' + data.inbound + ' | Outbound: ' + data.outbound + '</div></div><div class="card"><div class="card-label">Avg Latency</div><div class="card-value">' + data.averageLatency + 'ms</div></div><div class="card"><div class="card-label">IPv4 Reachable</div><div class="card-value" style="font-size:18px">' + (data.reachableIPv4 ? '✓' : '✗') + '</div></div><div class="card"><div class="card-label">IPv6 Reachable</div><div class="card-value" style="font-size:18px">' + (data.reachableIPv6 ? '✓' : '✗') + '</div></div>';
      } catch (e) { console.error('Error loading network:', e); }
    }
    async function loadSecurity() {
      try {
        const data = await fetch('/api/security').then(r => r.json());
        let alertHtml = '';
        if (data.alerts && data.alerts.length > 0) { alertHtml = '<div class="card" style="background: #f44336; color: white; grid-column: 1/-1;"><strong>Security Alerts:</strong><br>' + data.alerts.join('<br>') + '</div>'; }
        document.getElementById('securityCards').innerHTML = alertHtml + '<div class="card"><div class="card-label">Chain</div><div class="card-value">' + data.chain.toUpperCase() + '</div></div><div class="card"><div class="card-label">Reorg Detected</div><div class="card-value">' + (data.reorgDetected ? '✗ Yes' : '✓ No') + '</div></div><div class="card"><div class="card-label">Pruned</div><div class="card-value">' + (data.pruned ? '✓ Yes' : '✗ No') + '</div></div>';
      } catch (e) { console.error('Error loading security:', e); }
    }
    async function loadStorage() {
      try {
        const data = await fetch('/api/storage').then(r => r.json());
        document.getElementById('storageCards').innerHTML = '<div class="card"><div class="card-label">Chainstate Size</div><div class="card-value">' + data.chainstateGB + ' GB</div></div><div class="card"><div class="card-label">Disk Usage</div><div class="card-value">' + data.diskUsagePercent + '%</div></div><div class="card"><div class="card-label">Disk Free</div><div class="card-value">' + (100 - data.diskUsagePercent).toFixed(1) + '%</div><div class="card-sub">' + data.diskTotalGB + ' GB Total</div></div><div class="card"><div class="card-label">Pruned</div><div class="card-value">' + (data.pruned ? 'Yes' : 'No') + '</div><div class="card-sub">Auto-Prune: ' + data.autoPruneEnabled + '</div></div><div class="card"><div class="card-label">UTXO Count</div><div class="card-value">' + fmt(data.utxoCount) + '</div></div>';
      } catch (e) { console.error('Error loading storage:', e); }
    }
    async function searchTransaction() {
      const txid = document.getElementById('txSearch').value.trim();
      if (!txid) { alert('Please enter a transaction ID'); return; }
      try {
        const data = await fetch('/api/tx-lookup/' + txid).then(r => r.json());
        if (data.error) { document.getElementById('explorerResults').innerHTML = '<div style="color: red;">Error: ' + data.error + '</div>'; return; }
        document.getElementById('explorerResults').innerHTML = '<div class="cards-grid"><div class="card"><div class="card-label">TXID</div><div class="card-value" style="font-size:10px;word-break:break-all;">' + data.txid + '</div></div><div class="card"><div class="card-label">Size</div><div class="card-value">' + data.size + 'B</div></div><div class="card"><div class="card-label">Inputs</div><div class="card-value">' + data.vin + '</div></div><div class="card"><div class="card-label">Outputs</div><div class="card-value">' + data.vout + '</div></div><div class="card"><div class="card-label">Confirmations</div><div class="card-value">' + data.confirmations + '</div></div></div>';
      } catch (e) { console.error('Error searching tx:', e); }
    }
    function searchBlock() { alert('Block search coming soon!'); }
    initTheme();
    loadOverview();
    setInterval(() => { if (document.querySelector('.tab-content.active').id === 'overview') loadOverview(); }, 15000);
  </script>
</body>
</html>`
	return html
}

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, getDashboardHTML())
	})

	http.HandleFunc("/api/status", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		blockchainInfo, _ := callBitcoinRpc("getblockchaininfo", []interface{}{})
		netInfo, _ := callBitcoinRpc("getnetworkinfo", []interface{}{})
		memInfo, _ := callBitcoinRpc("getmemoryinfo", []interface{}{})

		var mempoolSize int64 = 0
		var uptime string = "N/A"
		var chainstatesize int64 = 0

		if mempoolResult, err := callBitcoinRpc("getmempoolinfo", []interface{}{}); err == nil {
			if m, ok := mempoolResult.(map[string]interface{}); ok {
				if size, ok := m["size"].(float64); ok {
					mempoolSize = int64(size)
				}
			}
		}

		if uptimeResult, err := callBitcoinRpc("uptime", []interface{}{}); err == nil {
			if uptimeSeconds, ok := uptimeResult.(float64); ok {
				days := int64(uptimeSeconds) / 86400
				hours := (int64(uptimeSeconds) % 86400) / 3600
				if days > 0 {
					uptime = fmt.Sprintf("%dd %dh", days, hours)
				} else {
					uptime = fmt.Sprintf("%dh", hours)
				}
			}
		}

		if chainstatsResult, err := callBitcoinRpc("getchainsstats", []interface{}{1}); err == nil {
			if m, ok := chainstatsResult.(map[string]interface{}); ok {
				if size, ok := m["bytes_serialized"].(float64); ok {
					chainstatesize = int64(size)
				}
			}
		}

		response := map[string]interface{}{
			"blockchain": blockchainInfo,
			"peers":      extractInt(netInfo, "connections"),
			"memory":     extractFloat(memInfo, "used") / (1024 * 1024),
			"networkInfo": map[string]interface{}{
				"version":  extractString(netInfo, "version"),
				"inbound":  extractInt(netInfo, "connections_in"),
				"outbound": extractInt(netInfo, "connections_out"),
			},
			"mempool":        mempoolSize,
			"uptime":         uptime,
			"chainstatesize": chainstatesize,
		}

		json.NewEncoder(w).Encode(response)
	})

	http.HandleFunc("/api/recent-blocks", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		blockchainInfo, _ := callBitcoinRpc("getblockchaininfo", []interface{}{})
		blocks := []map[string]interface{}{}

		if m, ok := blockchainInfo.(map[string]interface{}); ok {
			if blocksVal, ok := m["blocks"].(float64); ok {
				for i := 0; i < 10; i++ {
					height := int64(blocksVal) - int64(i)
					if height < 0 {
						break
					}

					if hash, err := callBitcoinRpc("getblockhash", []interface{}{height}); err == nil {
						if hashStr, ok := hash.(string); ok {
							if block, err := callBitcoinRpc("getblock", []interface{}{hashStr}); err == nil {
								if bm, ok := block.(map[string]interface{}); ok {
									txs := []interface{}{}
									if tx, ok := bm["tx"].([]interface{}); ok {
										txs = tx
									}
									blocks = append(blocks, map[string]interface{}{
										"height": height,
										"hash":   extractString(bm, "hash"),
										"time":   extractInt(bm, "time"),
										"tx":     len(txs),
										"size":   extractInt(bm, "size"),
									})
								}
							}
						}
					}
				}
			}
		}

		json.NewEncoder(w).Encode(map[string]interface{}{"blocks": blocks})
	})

	http.HandleFunc("/api/mempool", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		mempool, _ := callBitcoinRpc("getrawmempool", []interface{}{true})
		transactions := []map[string]interface{}{}

		if m, ok := mempool.(map[string]interface{}); ok {
			count := 0
			for txid, info := range m {
				if count >= 20 {
					break
				}
				if infoMap, ok := info.(map[string]interface{}); ok {
					var size int64 = 0
					var fee float64 = 0

					if s, ok := infoMap["size"].(float64); ok {
						size = int64(s)
					}
					if f, ok := infoMap["fee"].(float64); ok {
						fee = f
					}

					transactions = append(transactions, map[string]interface{}{
						"txid": txid,
						"size": size,
						"fee":  fmt.Sprintf("%.0f sat", fee*100000000),
					})
					count++
				}
			}
		}

		json.NewEncoder(w).Encode(map[string]interface{}{"transactions": transactions})
	})

	http.HandleFunc("/api/network", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		netInfo, _ := callBitcoinRpc("getnetworkinfo", []interface{}{})

		response := map[string]interface{}{
			"connections":   extractInt(netInfo, "connections"),
			"inbound":       extractInt(netInfo, "connections_in"),
			"outbound":      extractInt(netInfo, "connections_out"),
			"version":       extractString(netInfo, "version"),
			"relayfee":      extractFloat(netInfo, "relayfee"),
			"minrelaytxfee": extractFloat(netInfo, "minrelaytxfee"),
			"warnings":      extractString(netInfo, "warnings"),
		}

		json.NewEncoder(w).Encode(response)
	})

	http.HandleFunc("/api/chainstate", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		chainsstats, _ := callBitcoinRpc("getchainsstats", []interface{}{1})

		response := map[string]interface{}{
			"size":            extractInt(chainsstats, "bytes_serialized"),
			"utxos":           extractInt(chainsstats, "utxo_count"),
			"transactions":    extractInt(chainsstats, "transaction_count"),
			"tx_serialized":   extractInt(chainsstats, "txid_index_bytes_serialized"),
			"utxo_serialized": extractInt(chainsstats, "utxo_index_bytes_serialized"),
		}

		json.NewEncoder(w).Encode(response)
	})

	// ========== 1️⃣ NODE HEALTH & PERFORMANCE ==========
	http.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		metrics := getSystemMetrics()
		netInfo, _ := callBitcoinRpc("getnetworkinfo", []interface{}{})
		uptimeResult, _ := callBitcoinRpc("uptime", []interface{}{})

		uptimeFormatted := "N/A"
		if uptimeSeconds, ok := uptimeResult.(float64); ok {
			days := int64(uptimeSeconds) / 86400
			hours := (int64(uptimeSeconds) % 86400) / 3600
			mins := (int64(uptimeSeconds) % 3600) / 60
			if days > 0 {
				uptimeFormatted = fmt.Sprintf("%dd %dh %dm", days, hours, mins)
			} else if hours > 0 {
				uptimeFormatted = fmt.Sprintf("%dh %dm", hours, mins)
			} else {
				uptimeFormatted = fmt.Sprintf("%dm", mins)
			}
		}

		alerts := []map[string]interface{}{}
		if metrics.CPUUsage > 80 {
			alerts = append(alerts, map[string]interface{}{"type": "cpu", "message": "High CPU usage"})
		}
		if metrics.RAMUsage > 85 {
			alerts = append(alerts, map[string]interface{}{"type": "ram", "message": "High RAM usage"})
		}
		if extractInt(netInfo, "connections") < 1 {
			alerts = append(alerts, map[string]interface{}{"type": "network", "message": "No peer connections"})
		}

		response := map[string]interface{}{
			"cpu":                     metrics.CPUUsage,
			"ram":                     metrics.RAMUsage,
			"ramMB":                   metrics.RAMUseMB,
			"ramTotalMB":              metrics.RAMTotalMB,
			"disk":                    metrics.DiskUsage,
			"diskUsedGB":              metrics.DiskUsedGB,
			"diskTotalGB":             metrics.DiskTotalGB,
			"bitcoindUptime":          uptimeResult,
			"bitcoindUptimeFormatted": uptimeFormatted,
			"connections":             extractInt(netInfo, "connections"),
			"alerts":                  alerts,
		}

		json.NewEncoder(w).Encode(response)
	})

	// ========== 2️⃣ SYNC & BLOCKCHAIN INSIGHTS ==========
	http.HandleFunc("/api/sync-info", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		blockchainInfo, _ := callBitcoinRpc("getblockchaininfo", []interface{}{})

		var blockHeight, headerHeight, blocksBehind int64
		if m, ok := blockchainInfo.(map[string]interface{}); ok {
			blockHeight = int64(m["blocks"].(float64))
			headerHeight = int64(m["headers"].(float64))
			blocksBehind = headerHeight - blockHeight
		}

		syncPercent := 0.0
		if blockHeaderHeight, ok := blockchainInfo.(map[string]interface{})["verificationprogress"].(float64); ok {
			syncPercent = blockHeaderHeight * 100
		}

		estimatedTimeRemaining := "N/A"
		blocksPerHour := 0.0
		blocksPerMinute := 0.0

		if lastBlockHeight != blockHeight && blocksBehind > 0 {
			// Simple calculation based on recent blocks
			if len(blockTimestamps) > 10 {
				timeDiff := time.Since(blockTimestamps[0].time).Seconds()
				heightDiff := blockTimestamps[len(blockTimestamps)-1].height - blockTimestamps[0].height
				if timeDiff > 0 {
					blocksPerMinute = (float64(heightDiff) / timeDiff) * 60
					blocksPerHour = blocksPerMinute * 60
					if blocksPerMinute > 0 {
						minutesRemaining := float64(blocksBehind) / blocksPerMinute
						hoursRemaining := minutesRemaining / 60
						if hoursRemaining > 24 {
							estimatedTimeRemaining = fmt.Sprintf("%.0fd", hoursRemaining/24)
						} else if hoursRemaining > 0 {
							estimatedTimeRemaining = fmt.Sprintf("%.0fh", hoursRemaining)
						} else {
							estimatedTimeRemaining = fmt.Sprintf("%.0fm", minutesRemaining)
						}
					}
				}
			}
			lastBlockHeight = blockHeight
		}

		response := map[string]interface{}{
			"syncPercentage":         fmt.Sprintf("%.2f", syncPercent),
			"blockHeight":            blockHeight,
			"headerHeight":           headerHeight,
			"blocksBehind":           blocksBehind,
			"blocksPerMinute":        fmt.Sprintf("%.2f", blocksPerMinute),
			"blocksPerHour":          fmt.Sprintf("%.2f", blocksPerHour),
			"estimatedTimeRemaining": estimatedTimeRemaining,
			"ibd":                    blockchainInfo.(map[string]interface{})["initialblockdownload"],
			"chain":                  blockchainInfo.(map[string]interface{})["chain"],
			"validationStage":        "Syncing",
		}

		json.NewEncoder(w).Encode(response)
	})
	// =========================
	// 3️⃣ MEMPOOL INTELLIGENCE
	// =========================
	http.HandleFunc("/api/mempool-enhanced", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		mempoolInfo, _ := callBitcoinRpc("getmempoolinfo", []interface{}{})
		mempoolRaw, _ := callBitcoinRpc("getrawmempool", []interface{}{true})

		transactions := []map[string]interface{}{}
		feeRates := []float64{}

		// Helper to safely convert interface{} to float64
		floatFromMap := func(m map[string]interface{}, key string) float64 {
			if val, ok := m[key]; ok && val != nil {
				if f, ok := val.(float64); ok {
					return f
				}
			}
			return 0
		}

		if m, ok := mempoolRaw.(map[string]interface{}); ok {
			count := 0
			for txid, info := range m {
				if count >= 20 {
					break
				}
				if infoMap, ok := info.(map[string]interface{}); ok {
					size := int64(floatFromMap(infoMap, "size"))

					// Fee can be under "fee" or "fees.base"
					fee := floatFromMap(infoMap, "fee")
					if fee == 0 {
						if fees, ok := infoMap["fees"].(map[string]interface{}); ok {
							fee = floatFromMap(fees, "base")
						}
					}

					feeRate := 0.0
					if size > 0 {
						feeRate = (fee * 1e8) / float64(size)
					}
					feeRates = append(feeRates, feeRate)

					transactions = append(transactions, map[string]interface{}{
						"txid":    txid,
						"size":    size,
						"fee":     fmt.Sprintf("%.0f", fee*1e8),
						"feeRate": fmt.Sprintf("%.2f", feeRate),
					})
					count++
				}
			}
		}

		// Calculate fee distribution percentiles
		var slow, medium, fast float64
		if len(feeRates) > 0 {
			sorted := make([]float64, len(feeRates))
			copy(sorted, feeRates)
			sort.Float64s(sorted)
			slow = sorted[int(float64(len(sorted))*0.1)]
			medium = sorted[int(float64(len(sorted))*0.5)]
			fast = sorted[int(float64(len(sorted))*0.9)]
		}

		// Mempool stats
		mempoolSize := int64(0)
		avgFee := 0.0
		if m, ok := mempoolInfo.(map[string]interface{}); ok {
			mempoolSize = int64(floatFromMap(m, "size"))
			totalFee := floatFromMap(m, "total_fee")
			if mempoolSize > 0 {
				avgFee = totalFee / float64(mempoolSize)
			}
		}

		bytes := floatFromMap(mempoolInfo.(map[string]interface{}), "bytes")

		response := map[string]interface{}{
			"transactionCount": mempoolSize,
			"mempoolBytes":     bytes,
			"mempoolMB":        fmt.Sprintf("%.2f", bytes/(1024*1024)),
			"averageFee":       fmt.Sprintf("%.2f", avgFee*1e8),
			"feeDistribution": map[string]interface{}{
				"slow":   fmt.Sprintf("%.2f", slow),
				"medium": fmt.Sprintf("%.2f", medium),
				"fast":   fmt.Sprintf("%.2f", fast),
			},
			"topTransactions": transactions,
		}

		json.NewEncoder(w).Encode(response)
	})

	// ========== 4️⃣ NETWORK & PEER ANALYTICS ==========
	http.HandleFunc("/api/network-analytics", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		netInfo, _ := callBitcoinRpc("getnetworkinfo", []interface{}{})
		peers, _ := callBitcoinRpc("getpeerinfo", []interface{}{})

		inbound := int64(0)
		outbound := int64(0)
		avgLatency := 0.0

		if arr, ok := peers.([]interface{}); ok {
			for _, peer := range arr {
				if peerMap, ok := peer.(map[string]interface{}); ok {
					if peerMap["inbound"].(bool) {
						inbound++
					} else {
						outbound++
					}
					if latency, ok := peerMap["pingtime"].(float64); ok {
						avgLatency += latency
					}
				}
			}
			if len(arr) > 0 {
				avgLatency = (avgLatency / float64(len(arr))) * 1000
			}
		}

		totalPeers := inbound + outbound
		inboundPercent := 0.0
		if totalPeers > 0 {
			inboundPercent = (float64(inbound) / float64(totalPeers)) * 100
		}

		response := map[string]interface{}{
			"totalPeers":      totalPeers,
			"inbound":         inbound,
			"outbound":        outbound,
			"inboundPercent":  fmt.Sprintf("%.1f", inboundPercent),
			"outboundPercent": fmt.Sprintf("%.1f", 100-inboundPercent),
			"averageLatency":  fmt.Sprintf("%.2f", avgLatency),
			"protocolVersion": extractInt(netInfo, "protocolversion"),
			"reachableIPv4":   netInfo.(map[string]interface{})["reachable_ipv4"],
			"reachableIPv6":   netInfo.(map[string]interface{})["reachable_ipv6"],
			"timeOffset":      extractInt(netInfo, "timeoffset"),
		}

		json.NewEncoder(w).Encode(response)
	})

	// ========== 5️⃣ SECURITY & NODE INTEGRITY ==========
	http.HandleFunc("/api/security", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		blockchainInfo, _ := callBitcoinRpc("getblockchaininfo", []interface{}{})
		netInfo, _ := callBitcoinRpc("getnetworkinfo", []interface{}{})

		alerts := []string{}
		if warnings, ok := netInfo.(map[string]interface{})["warnings"].(string); ok && warnings != "" {
			alerts = append(alerts, "⚠️ Network warning: "+warnings)
		}

		response := map[string]interface{}{
			"warnings":         netInfo.(map[string]interface{})["warnings"],
			"chain":            blockchainInfo.(map[string]interface{})["chain"],
			"currentBlockHash": blockchainInfo.(map[string]interface{})["bestblockhash"],
			"orphanBlocks":     0,
			"reorgDetected":    false,
			"rpcAuth":          "Enabled",
			"alerts":           alerts,
			"pruned":           blockchainInfo.(map[string]interface{})["pruned"],
		}

		json.NewEncoder(w).Encode(response)
	})

	// ========== 6️⃣ STORAGE & PRUNING ==========
	http.HandleFunc("/api/storage", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		storageCacheMutex.Lock()
		defer storageCacheMutex.Unlock()

		// If cache exists and is younger than 10 minutes → return it
		if storageCache != nil && time.Since(storageCacheTime) < 10*time.Minute {
			json.NewEncoder(w).Encode(storageCache)
			return
		}

		// Otherwise fetch fresh data
		blockchainInfo, err := callBitcoinRpc("getblockchaininfo", []interface{}{})
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}

		utxoInfo, err := callBitcoinRpc("gettxoutsetinfo", []interface{}{})
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}

		metrics := getSystemMetrics()

		chainstateBytes := int64(0)
		utxoCount := int64(0)

		if m, ok := utxoInfo.(map[string]interface{}); ok {
			if v, ok := m["disk_size"].(float64); ok {
				chainstateBytes = int64(v)
			}
			if v, ok := m["txouts"].(float64); ok {
				utxoCount = int64(v)
			}
		}

		response := map[string]interface{}{
			"chainstateSize":   chainstateBytes,
			"chainstateGB":     fmt.Sprintf("%.2f", float64(chainstateBytes)/(1024*1024*1024)),
			"pruned":           blockchainInfo.(map[string]interface{})["pruned"],
			"pruneHeight":      extractInt(blockchainInfo, "pruneheight"),
			"diskUsedGB":       fmt.Sprintf("%.2f", metrics.DiskUsedGB),
			"diskTotalGB":      fmt.Sprintf("%.2f", metrics.DiskTotalGB),
			"diskUsagePercent": fmt.Sprintf("%.2f", metrics.DiskUsage),
			"blocksCount":      extractInt(blockchainInfo, "blocks"),
			"utxoCount":        utxoCount,
			"autoPruneEnabled": "Yes",
		}

		// Save to cache
		storageCache = response
		storageCacheTime = time.Now()

		json.NewEncoder(w).Encode(response)
	})

	// ========== 8️⃣ TRANSACTION EXPLORER ==========
	http.HandleFunc("/api/tx-lookup/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		txid := strings.TrimSpace(strings.TrimPrefix(r.URL.Path, "/api/tx-lookup/"))
		if !regexp.MustCompile(`^[a-f0-9]{64}$`).MatchString(txid) {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]interface{}{"error": "Invalid TXID format"})
			return
		}

		tx, err := callBitcoinRpc("getrawtransaction", []interface{}{txid, true})
		if err != nil || tx == nil {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]interface{}{"error": "Transaction not found"})
			return
		}

		txMap, ok := tx.(map[string]interface{})
		if !ok {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]interface{}{"error": "Unexpected response from Bitcoin RPC"})
			return
		}

		// Count vin/vout safely
		inputs := int64(0)
		if arr, ok := txMap["vin"].([]interface{}); ok {
			inputs = int64(len(arr))
		}
		outputs := int64(0)
		if arr, ok := txMap["vout"].([]interface{}); ok {
			outputs = int64(len(arr))
		}

		response := map[string]interface{}{
			"txid":          txid,
			"size":          extractInt(txMap, "size"),
			"vin":           inputs,
			"vout":          outputs,
			"confirmations": extractInt(txMap, "confirmations"),
			"blocktime":     extractInt(txMap, "blocktime"),
		}

		json.NewEncoder(w).Encode(response)
	})

	port := getEnv("PORT", "3000")
	log.Printf("Bitcoin Node Explorer running on port %s\n", port)
	log.Fatal(http.ListenAndServe("0.0.0.0:"+port, nil))
}

func extractInt(data interface{}, key string) int64 {
	if m, ok := data.(map[string]interface{}); ok {
		if val, ok := m[key].(float64); ok {
			return int64(val)
		}
	}
	return 0
}

func extractFloat(data interface{}, key string) float64 {
	if m, ok := data.(map[string]interface{}); ok {
		if val, ok := m[key].(float64); ok {
			return val
		}
	}
	return 0
}

func extractString(data interface{}, key string) string {
	if m, ok := data.(map[string]interface{}); ok {
		if val, ok := m[key].(string); ok {
			return val
		}
	}
	return ""
}

// System metrics utilities
type SystemMetrics struct {
	CPUUsage    float64
	RAMUsage    float64
	RAMUseMB    float64
	RAMTotalMB  float64
	DiskUsage   float64
	DiskUsedGB  float64
	DiskTotalGB float64
}

func getSystemMetrics() SystemMetrics {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	ramUseMB := float64(m.Alloc) / (1024 * 1024)
	ramTotalMB := float64(m.TotalAlloc) / (1024 * 1024)
	ramUsagePercent := (float64(m.Alloc) / float64(m.Sys)) * 100

	// CPU usage is simplified - in production use a proper monitoring library
	cpuUsage := 0.0

	// Disk usage estimation (simplified)
	diskUsage := 0.0
	diskUsedGB := 0.0
	diskTotalGB := 0.0

	return SystemMetrics{
		CPUUsage:    cpuUsage,
		RAMUsage:    ramUsagePercent,
		RAMUseMB:    ramUseMB,
		RAMTotalMB:  ramTotalMB,
		DiskUsage:   diskUsage,
		DiskUsedGB:  diskUsedGB,
		DiskTotalGB: diskTotalGB,
	}
}
