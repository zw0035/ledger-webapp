// 简单 SHA-256 加密密码
async function hashPassword(pwd){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pwd));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

let users = {};
let currentUser = null;
let records = [];

// 保存到 LocalStorage（作为临时缓存）
function saveLocal(){
  localStorage.setItem('ledger_users', JSON.stringify(users));
}

// 注册
window.register = async function(){
  const u = document.getElementById('username').value.trim();
  const p = document.getElementById('password').value;
  if(!u || !p){ document.getElementById('loginMsg').innerText="请输入用户名和密码"; return; }
  if(users[u]){ document.getElementById('loginMsg').innerText="用户已存在"; return; }
  users[u] = { passwordHash: await hashPassword(p), records: [] };
  saveLocal();
  document.getElementById('loginMsg').innerText="注册成功，请登录";
}

// 登录
window.login = async function(){
  const u = document.getElementById('username').value.trim();
  const p = document.getElementById('password').value;
  if(!u || !p){ document.getElementById('loginMsg').innerText="请输入用户名和密码"; return; }
  if(!users[u]){ document.getElementById('loginMsg').innerText="用户不存在"; return; }
  const hash = await hashPassword(p);
  if(hash !== users[u].passwordHash){ document.getElementById('loginMsg').innerText="密码错误"; return; }

  currentUser = u;
  records = users[u].records || [];
  document.getElementById('login').style.display='none';
  document.getElementById('app').style.display='block';
  renderTable();
  renderChart();
}

// 登出
window.logout = function(){
  users[currentUser].records = records;
  saveLocal();
  currentUser = null;
  records = [];
  document.getElementById('login').style.display='block';
  document.getElementById('app').style.display='none';
  document.getElementById('username').value=''; document.getElementById('password').value='';
}

// 添加记录
document.getElementById('recordForm').addEventListener('submit', function(e){
  e.preventDefault();
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
});

// 渲染表格
function renderTable(){
  const tbody = document.querySelector('#ledgerTable tbody');
  tbody.innerHTML = '';
  records.forEach((r,i)=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.date}</td><td>${r.amount}</td><td>${r.category}</td><td>${r.note}</td>
    <td><button onclick="deleteRecord(${i})">删除</button></td>`;
    tbody.appendChild(tr);
  });
}

// 删除记录
window.deleteRecord = function(i){
  records.splice(i,1);
  users[currentUser].records = records;
  saveLocal();
  renderTable();
  renderChart();
}

// 导出到 iCloud Drive
window.exportData = function(){
  const blob = new Blob([JSON.stringify({users,currentUser,records},null,2)],{type:"application/json"});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ledger_data.json';
  a.click();
  URL.revokeObjectURL(a.href);
  alert("请保存到 iCloud Drive 以实现跨设备同步");
}

// 导入 JSON
window.importData = function(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(evt){
    try{
      const imported = JSON.parse(evt.target.result);
      if(imported.users) users = imported.users;
      if(imported.currentUser) currentUser = imported.currentUser;
      if(currentUser && imported.records) records = imported.records;
      renderTable();
      renderChart();
      saveLocal();
      alert("导入成功");
    }catch(err){ alert("导入失败:"+err); }
  }
  reader.readAsText(file);
}

// 渲染图表
let chart = null;
function renderChart(){
  const ctx = document.getElementById('chart').getContext('2d');
  const categories = {};
  records.forEach(r=>{
    categories[r.category] = (categories[r.category]||0) + r.amount;
  });
  const data = {
    labels: Object.keys(categories),
    datasets: [{ label:'支出统计', data:Object.values(categories), backgroundColor:['#36A2EB','#FF6384','#FFCE56','#4BC0C0','#9966FF'] }]
  };
  if(chart) chart.destroy();
  chart = new Chart(ctx, { type:'pie', data });
}

// 自动保存提示
window.addEventListener('beforeunload',()=>{
  if(currentUser) users[currentUser].records = records;
  saveLocal();
  if(records.length>0) alert("请确保导出 JSON 保存到 iCloud Drive，以保证跨设备同步");
});

// 页面加载时读取本地缓存（临时）
window.onload = function(){
  const localUsers = localStorage.getItem('ledger_users');
  if(localUsers) users = JSON.parse(localUsers);
};


// 一键同步到 iCloud Drive
window.syncToICloud = function(){
  if(!currentUser){
    alert("请先登录");
    return;
  }
  // 生成 JSON Blob
  const blob = new Blob([JSON.stringify({users,currentUser,records},null,2)],{type:"application/json"});
  // 创建下载链接
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ledger_data.json'; // 用户保存到 iCloud Drive
  a.click();
  URL.revokeObjectURL(a.href);
  alert("已生成 JSON 文件，请保存到 iCloud Drive 以完成同步");
};

setTimeout(()=>{ alert("请点击“一键同步”按钮，将最新数据保存到 iCloud Drive"); }, 100);
