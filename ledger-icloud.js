// ledger-icloud.js — 改进与重构版
// 主要改动：减少代码重复，增强安全性，优化用户体验

// ====== 常量定义 ======
const ELEM_ID = {
  loginPane: 'login-pane',
  appPane: 'app-pane',
  username: 'username',
  password: 'password',
  loginBtn: 'loginBtn',
  registerBtn: 'registerBtn',
  loginMsg: 'loginMsg',
  logoutBtn: 'logoutBtn',
  recordForm: 'recordForm',
  ledgerTableBody: '#ledgerTable tbody',
  chart: 'chart',
  exportBtn: 'exportBtn',
  importFile: 'importFile',
  copySyncBtn: 'copySyncBtn',
  pasteSyncBtn: 'pasteSyncBtn',
  exportUserBtn: 'exportUserBtn',
  importUserFile: 'importUserFile',
  importUserBtn: 'importUserBtn',
  deleteAccountBtn: 'deleteAccountBtn',
  profileUsername: 'profileUsername',
  profileCount: 'profileCount',
  tabBtns: '.mini-tabs .tab',
  tabContent: '.tab-content',
};

const DATA_KEY = 'ledger_users';
const TIP_CLASS = 'tipBubble';

// ====== 工具函数 ======
function $id(id) { return document.getElementById(id); }
function $sel(sel) { return document.querySelector(sel); }
function $all(sel) { return document.querySelectorAll(sel); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function showMsg(el, msg, isError = true) {
  el.style.color = isError ? '#ff3b30' : 'green';
  el.innerText = msg;
}

// ====== 数据初始化与哈希 ======
let users = {};
try {
  const raw = localStorage.getItem(DATA_KEY);
  if (raw) users = JSON.parse(raw);
} catch (e) {
  console.error('Failed to load data from localStorage', e);
  users = {};
}
let currentUser = null;
let records = [];
let chart = null;

// 使用 crypto.subtle 异步哈希密码
async function hashPassword(pwd) {
  if (!pwd) return '';
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pwd));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    console.error('crypto.subtle failed, falling back to insecure method', e);
    // 降级为 Base64，但请注意这不安全
    return btoa(unescape(encodeURIComponent(pwd)));
  }
}

function saveLocal() {
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(users));
  } catch (e) {
    console.error('Failed to save data to localStorage', e);
  }
}

// ====== 渲染函数 ======
function renderTable() {
  const tbody = $sel(ELEM_ID.ledgerTableBody);
  if (!tbody) return;

  tbody.innerHTML = records.map((r, i) => `
    <tr>
      <td>${r.date}</td>
      <td>${r.amount}</td>
      <td>${r.category}</td>
      <td>${r.note}</td>
      <td><button class="deleteBtn" data-index="${i}">删除</button></td>
    </tr>
  `).join('');

  // 事件委托：为删除按钮绑定事件
  tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('.deleteBtn');
    if (!btn) return;

    const i = parseInt(btn.dataset.index);
    if (!btn.dataset.confirmed) {
      showTip(btn, '再次点击删除以确认', 5000);
      btn.dataset.confirmed = 'true';
      setTimeout(() => {
        delete btn.dataset.confirmed;
      }, 5000);
      return;
    }
    // 删除记录
    records.splice(i, 1);
    users[currentUser].records = records;
    saveLocal();
    renderTable();
    renderChart();
    renderProfile();
    showTip(btn, '记录已删除', 1200);
  }, { once: true });
}

function renderChart() {
  const canvas = $id(ELEM_ID.chart);
  if (!canvas || typeof Chart === 'undefined') return;

  const ctx = canvas.getContext('2d');
  const catMap = records.reduce((acc, r) => {
    const k = r.category || '未分类';
    acc[k] = (acc[k] || 0) + Number(r.amount || 0);
    return acc;
  }, {});

  const labels = Object.keys(catMap);
  const data = Object.values(catMap);

  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: [
          '#36A2EB', '#FF6384', '#FFCE56', '#4BC0C0', '#9966FF', '#8E8E93',
          '#FF9F40', '#FF5A5F', '#6A4C93', '#009688'
        ]
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { padding: 10 } } } }
  });
}

function renderProfile() {
  const profileUsername = $id(ELEM_ID.profileUsername);
  const profileCount = $id(ELEM_ID.profileCount);
  if (profileUsername) profileUsername.textContent = currentUser || '';
  if (profileCount) profileCount.textContent = (records && records.length) || 0;
}

// ====== 气泡提示 ======
function showTip(el, msg, duration = 1500) {
  const div = document.createElement('div');
  div.className = TIP_CLASS;
  div.innerText = msg;
  document.body.appendChild(div);
  const rect = el.getBoundingClientRect();
  div.style.top = (rect.top + window.scrollY - 40) + 'px';
  div.style.left = (rect.left + rect.width / 2 - div.offsetWidth / 2) + 'px';
  div.style.opacity = '0';
  setTimeout(() => div.style.opacity = '1', 10);
  if (duration > 0) setTimeout(() => {
    div.style.opacity = '0';
    setTimeout(() => div.remove(), 300);
  }, duration);
}

// ====== 登录 / 注册 / 登出 ======
async function doRegister() {
  const u = $id(ELEM_ID.username).value.trim();
  const p = $id(ELEM_ID.password).value;
  const msg = $id(ELEM_ID.loginMsg);
  const registerBtn = $id(ELEM_ID.registerBtn);

  if (!u || !p) return showMsg(msg, '请输入用户名和密码');
  if (users[u]) return showMsg(msg, '用户已存在');

  registerBtn.disabled = true;
  try {
    const h = await hashPassword(p);
    users[u] = { passwordHash: h, records: [] };
    saveLocal();
    showMsg(msg, '注册成功，请登录', false);
  } catch (err) {
    showMsg(msg, '注册失败: ' + err.message);
  } finally {
    registerBtn.disabled = false;
  }
}

async function doLogin() {
  const u = $id(ELEM_ID.username).value.trim();
  const p = $id(ELEM_ID.password).value;
  const msg = $id(ELEM_ID.loginMsg);
  const loginBtn = $id(ELEM_ID.loginBtn);

  if (!u || !p) return showMsg(msg, '请输入用户名和密码');
  if (!users[u]) return showMsg(msg, '用户不存在（请注册或导入同步码）');

  loginBtn.disabled = true;
  try {
    const h = await hashPassword(p);
    if (h !== users[u].passwordHash) {
      showMsg(msg, '密码错误');
      return;
    }
    currentUser = u;
    records = users[u].records || [];
    $id(ELEM_ID.loginPane).style.display = 'none';
    $id(ELEM_ID.appPane).style.display = 'block';
    showMsg(msg, '');
    renderTable();
    renderChart();
    renderProfile();
    // 登录成功后清空密码
    $id(ELEM_ID.password).value = '';
    switchToTab('ledger');
  } catch (err) {
    console.error(err);
    showMsg(msg, '登录异常: ' + (err.message || err));
  } finally {
    loginBtn.disabled = false;
  }
}

function doLogout() {
  if (currentUser) {
    users[currentUser].records = records;
    saveLocal();
  }
  currentUser = null;
  records = [];
  $id(ELEM_ID.loginPane).style.display = 'block';
  $id(ELEM_ID.appPane).style.display = 'none';
  $id(ELEM_ID.username).value = '';
  $id(ELEM_ID.password).value = '';
  $id(ELEM_ID.loginMsg).innerText = '';
}

// ====== 导入/导出通用函数 ======
function downloadJSON(payload, filename, buttonId) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
  showTip($id(buttonId), '已生成 JSON 文件', 1200);
}

function importData(data) {
  if (!data || !data.users) {
    alert('文件格式不正确');
    return;
  }
  // 合并导入的用户数据
  users = Object.assign({}, users, data.users);
  if (data.currentUser && users[data.currentUser]) {
    currentUser = data.currentUser;
    records = users[currentUser].records || [];
  }
  saveLocal();
  renderTable();
  renderChart();
  renderProfile();
  alert('数据导入成功（已合并）');
}

// ====== 同步码 ======
function makeSyncCode(obj) {
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
  } catch (e) {
    return btoa(JSON.stringify(obj));
  }
}

function parseSyncCode(code) {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(code))));
  } catch (e) {
    try {
      return JSON.parse(atob(code));
    } catch (err) {
      return null;
    }
  }
}

// ====== 添加记录 ======
function addRecordFromForm(e) {
  e?.preventDefault();
  if (!currentUser) {
    alert('请先登录');
    return;
  }
  const date = $id('date').value;
  const amount = Number($id('amount').value);
  const category = $id('category').value.trim();
  const note = $id('note').value.trim();

  if (!$id('recordForm').reportValidity()) {
    return;
  }
  
  const rec = { date, amount, category, note };
  records.push(rec);
  users[currentUser].records = records;
  saveLocal();
  renderTable();
  renderChart();
  renderProfile();
  try { $id('recordForm').reset(); } catch (e) {}
  showTip($id('recordForm'), '记录已添加', 1200);
}

// ====== Tab 切换 ======
function switchToTab(tabName) {
  $all(ELEM_ID.tabContent).forEach(el => el.classList.remove('active'));
  $id(`${tabName}-tab-content`).classList.add('active');

  $all(ELEM_ID.tabBtns).forEach(btn => btn.classList.toggle('active', btn.dataset.tabName === tabName));

  if (tabName === 'stats') {
    renderChart();
  } else if (tabName === 'profile') {
    renderProfile();
  }
}

// ====== 事件绑定 ======
document.addEventListener('DOMContentLoaded', () => {
  $id(ELEM_ID.registerBtn)?.addEventListener('click', doRegister);
  $id(ELEM_ID.loginBtn)?.addEventListener('click', doLogin);
  $id(ELEM_ID.logoutBtn)?.addEventListener('click', doLogout);
  $id(ELEM_ID.recordForm)?.addEventListener('submit', addRecordFromForm);

  $all(ELEM_ID.tabBtns).forEach(btn => {
    btn.addEventListener('click', () => switchToTab(btn.dataset.tabName));
  });

  // 导出/导入
  $id(ELEM_ID.exportBtn)?.addEventListener('click', () => {
    if (!currentUser) return alert('请先登录');
    const payload = { users, currentUser, exportedAt: new Date().toISOString() };
    downloadJSON(payload, `ledger_backup_${currentUser}.json`, ELEM_ID.exportBtn);
  });
  $id(ELEM_ID.importFile)?.addEventListener('change', e => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = e => importData(JSON.parse(e.target.result));
    reader.readAsText(file);
  });

  // 用户资料页的按钮
  $id(ELEM_ID.copySyncBtn)?.addEventListener('click', () => {
    if (!currentUser) return alert('请先登录');
    const payload = { users: { [currentUser]: users[currentUser] }, currentUser, exportedAt: new Date().toISOString() };
    const code = makeSyncCode(payload);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(() => showTip($id(ELEM_ID.copySyncBtn), '已复制到剪贴板')).catch(() => prompt('请复制同步码', code));
    } else prompt('请复制同步码', code);
  });
  $id(ELEM_ID.pasteSyncBtn)?.addEventListener('click', () => {
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then(text => importData(parseSyncCode(text))).catch(err => alert('读取失败: ' + err.message));
    } else {
      const text = prompt('请粘贴同步码');
      if (text) importData(parseSyncCode(text));
    }
  });

  $id(ELEM_ID.exportUserBtn)?.addEventListener('click', () => {
    if (!currentUser) return alert('请先登录');
    const payload = { users: { [currentUser]: users[currentUser] }, currentUser, exportedAt: new Date().toISOString() };
    downloadJSON(payload, `ledger_${currentUser}.json`, ELEM_ID.exportUserBtn);
  });

  $id(ELEM_ID.importUserBtn)?.addEventListener('click', () => $id(ELEM_ID.importUserFile).click());
  $id(ELEM_ID.importUserFile)?.addEventListener('change', e => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = e => importData(JSON.parse(e.target.result));
    reader.readAsText(file);
  });

  $id(ELEM_ID.deleteAccountBtn)?.addEventListener('click', () => {
    if (!currentUser) return alert('请先登录');
    if (!confirm('确定删除当前账户？此操作不可恢复')) return;
    delete users[currentUser];
    saveLocal();
    doLogout();
    alert('账户已删除');
  });

  // 启动逻辑
  const names = Object.keys(users || {});
  if (names.length === 1) {
    try { $id(ELEM_ID.username).value = names[0]; } catch (e) {}
  }
  
  switchToTab('ledger');
});

// ====== 页面卸载前保存 ======
window.addEventListener('beforeunload', () => {
  if (currentUser) {
    users[currentUser].records = records;
    saveLocal();
  }
});
