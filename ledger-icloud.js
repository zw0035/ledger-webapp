// === 哈希密码函数 ===
async function hashPassword(pwd) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pwd));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// === 数据初始化 ===
let users = {};
let currentUser = null;
let records = [];
let chart = null;

// === 保存到 LocalStorage ===
function saveLocal() {
  localStorage.setItem('ledger_users', JSON.stringify(users));
}

// === 渲染表格 ===
function renderTable() {
  const tbody = document.querySelector('#ledgerTable tbody');
  tbody.innerHTML = '';
  records.forEach((r, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.date}</td>
      <td>${r.amount}</td>
      <td>${r.category}</td>
      <td>${r.note}</td>
      <td><button class="deleteBtn" data-index="${i}">删除</button></td>`;
    tbody.appendChild(tr);
  });

  // 删除按钮事件
  document.querySelectorAll('.deleteBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.index);
      records.splice(i, 1);
      users[currentUser].records = records;
      saveLocal();
      renderTable();
      renderChart();
    });
  });
}

// === 渲染图表 ===
function renderChart() {
  const ctx = document.getElementById('chart').getContext('2d');
  const categories = {};
  records.forEach(r => {
    categories[r.category] = (categories[r.category] || 0) + r.amount;
  });

  const data = {
    labels: Object.keys(categories),
    datasets: [{
      label: '支出统计',
      data: Object.values(categories),
      backgroundColor: ['#36A2EB', '#FF6384', '#FFCE56', '#4BC0C0', '#9966FF']
    }]
  };

  if (chart) chart.destroy();
  chart = new Chart(ctx, { type: 'pie', data });
}

// === 用户注册 ===
async function register() {
  const u = document.getElementById('username').value.trim();
  const p = document.getElementById('password').value;
  const msg = document.getElementById('loginMsg');

  if (!u || !p) {
    msg.innerText = "请输入用户名和密码";
    return;
  }

  if (users[u]) {
    msg.innerText = "用户已存在";
    return;
  }

  users[u] = {
    passwordHash: await hashPassword(p),
    records: []
  };

  saveLocal();
  msg.style.color = 'green';
  msg.innerText = "注册成功，请登录";
}

// === 用户登录 ===
async function login() {
  const u = document.getElementById('username').value.trim();
  const p = document.getElementById('password').value;
  const msg = document.getElementById('loginMsg');

  if (!u || !p) {
    msg.innerText = "请输入用户名和密码";
    return;
  }

  if (!users[u]) {
    msg.innerText = "用户不存在";
    return;
  }

  const hash = await hashPassword(p);
  if (hash !== users[u].passwordHash) {
    msg.innerText = "密码错误";
    return;
  }

  currentUser = u;
  records = users[u].records || [];

  document.getElementById('login').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  msg.innerText = "";

  renderTable();
  renderChart();
}

// === 登出 ===
function logout() {
  if (currentUser) users[currentUser].records = records;
  saveLocal();
  currentUser = null;
  records = [];

  document.getElementById('login').style.display = 'block';
  document.getElementById('app').style.display = 'none';
  document.getElementById('username').value = '';
  document.getElementById('password').value = '';
  document.getElementById('loginMsg').innerText = '';
}

// === 导出数据（同步） ===
function exportData() {
  if (!currentUser) {
    alert("请先登录");
    return;
  }

  const blob = new Blob(
    [JSON.stringify({ users, currentUser, records }, null, 2)],
    { type: "application/json" }
  );

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ledger_data.json';
  a.click();
  URL.revokeObjectURL(a.href);

  alert("请保存到 iCloud Drive");
}

// === 一键同步 ===
function syncToICloud() {
  exportData();
}

// === 导入数据 ===
function importData(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (evt) {
    try {
      const imported = JSON.parse(evt.target.result);
      if (imported.users) users = imported.users;
      if (imported.currentUser) currentUser = imported.currentUser;
      if (currentUser && imported.records) records = imported.records;

      renderTable();
      renderChart();
      saveLocal();
      alert("导入成功");
    } catch (err) {
      alert("导入失败: " + err);
    }
  };
  reader.readAsText(file);
}

// === 添加记录表单事件 ===
document.getElementById('recordForm').addEventListener('submit', function (e) {
  e.preventDefault();
  if (!currentUser) return;

  const r = {
    date: document.getElementById('date').value,
    amount: parseFloat(document.getElementById('amount').value),
    category: document.getElementById('category').value,
    note: document.getElementById('note').value
  };

  records.push(r);
  users[currentUser].records = records;
  saveLocal();
  renderTable();
  renderChart();
  this.reset();

  setTimeout(() => {
    alert("请点击“一键同步”按钮，将最新数据保存到 iCloud Drive");
  }, 100);
});

// === 初始化：绑定按钮事件 ===
document.getElementById('registerBtn').addEventListener('click', register);
document.getElementById('loginBtn').addEventListener('click', login);
document.getElementById('logoutBtn').addEventListener('click', logout);
document.getElementById('exportBtn').addEventListener('click', exportData);
document.getElementById('syncBtn').addEventListener('click', syncToICloud);
document.getElementById('importFile').addEventListener('change', importData);

// === 加载本地用户数据 ===
const localUsers = localStorage.getItem('ledger_users');
if (localUsers) users = JSON.parse(localUsers);
