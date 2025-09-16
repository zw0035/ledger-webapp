// ledger-icloud.js （在你原有功能上做增强：稳定绑定、Tab、同步码、Chart）

// ====== 工具 / 数据初始化 ======
function $id(id){ return document.getElementById(id); }

// 载入本地 users（如果存在）
let users = {};
try { const raw = localStorage.getItem('ledger_users'); if(raw) users = JSON.parse(raw); } catch(e) { users = {}; }
let currentUser = null;
let records = [];
let chart = null;

// 安全哈希（优先使用 crypto.subtle；若不可用，使用可警告的 fallback）
async function hashPassword(pwd){
  if(!pwd) return '';
  try {
    if(window.crypto && crypto.subtle && crypto.subtle.digest){
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pwd));
      return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
    }
  } catch(e){
    console.warn('crypto.subtle 失败，降级使用不安全的编码（仅在不支持 crypto 的环境使用）', e);
  }
  // fallback (不安全) — 仅在极端环境下使用
  try {
    return btoa(unescape(encodeURIComponent(pwd)));
  } catch(e){
    return String(pwd);
  }
}

function saveLocal(){ try{ localStorage.setItem('ledger_users', JSON.stringify(users)); }catch(e){ console.error('保存本地失败', e); } }

// ====== 渲染表格 ======
function renderTable(){
  const tbody = document.querySelector('#ledgerTable tbody');
  tbody.innerHTML = '';
  records.forEach((r, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.date || ''}</td>
      <td>${Number(r.amount || 0).toFixed(2)}</td>
      <td>${r.category || ''}</td>
      <td>${r.note || ''}</td>
      <td><button class="deleteBtn" data-index="${i}">删除</button></td>
    `;
    tbody.appendChild(tr);
  });

  // 绑定删除（事件委托也可）
  tbody.querySelectorAll('.deleteBtn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const idx = Number(btn.dataset.index);
      if (Number.isFinite(idx)) {
        records.splice(idx,1);
        users[currentUser].records = records;
        saveLocal();
        renderTable();
        renderChart();
        renderProfile();
      }
    });
  });
}

// ====== 统计图表 ======
function renderChart(){
  // 如果没有 Chart.js 或 canvas，静默返回
  const canvas = $id('chart');
  if(!canvas || typeof Chart === 'undefined') return;
  const ctx = canvas.getContext('2d');
  const catMap = {};
  records.forEach(r=>{
    const k = r.category || '未分类';
    catMap[k] = (catMap[k]||0) + Number(r.amount || 0);
  });
  const labels = Object.keys(catMap);
  const data = Object.values(catMap);

  if(chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [{ data, backgroundColor: ['#36A2EB','#FF6384','#FFCE56','#4BC0C0','#9966FF','#8E8E93'] }]
    },
    options:{ responsive:true, maintainAspectRatio:false }
  });
}

// ====== 登录 / 注册 / 登出 ======
async function doRegister(){
  const u = $id('username').value.trim();
  const p = $id('password').value;
  const msg = $id('loginMsg');
  msg.style.color = '#ff3b30';
  if(!u || !p){ msg.innerText = '请输入用户名和密码'; return; }
  if(users[u]){ msg.innerText = '用户已存在'; return; }
  const h = await hashPassword(p);
  users[u] = { passwordHash: h, records: [] };
  saveLocal();
  msg.style.color = 'green';
  msg.innerText = '注册成功，请登录';
}

async function doLogin(){
  const u = $id('username').value.trim();
  const p = $id('password').value;
  const msg = $id('loginMsg');
  msg.style.color = '#ff3b30';
  // quick visible feedback
  console.log('尝试登录：', u);
  if(!u || !p){ msg.innerText = '请输入用户名和密码'; return; }
  if(!users[u]){ msg.innerText = '用户不存在（请注册或导入同步码）'; return; }
  try {
    const h = await hashPassword(p);
    if(h !== users[u].passwordHash){ msg.innerText = '密码错误'; return; }
    // 成功
    currentUser = u;
    records = users[u].records || [];
    $id('login').style.display = 'none';
    $id('app').style.display = 'block';
    msg.innerText = '';
    renderTable();
    renderChart();
    renderProfile();
    switchTo('ledger'); // 默认显示记账
  } catch(err){
    console.error('登录异常', err);
    alert('登录时发生错误，请在控制台查看：' + (err && err.message));
  }
}

function doLogout(){
  if(currentUser) users[currentUser].records = records;
  saveLocal();
  currentUser = null;
  records = [];
  $id('login').style.display = 'block';
  $id('app').style.display = 'none';
  $id('username').value = '';
  $id('password').value = '';
  $id('loginMsg').innerText = '';
}

// ====== 导出 / 导入 / 同步码 ======
function exportData(){
  if(!currentUser){ alert('请先登录'); return; }
  const payload = { users, currentUser, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(payload,null,2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ledger_backup_${currentUser}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  alert('已生成 JSON 文件，请保存到 iCloud Drive 或在设备间传输以实现同步');
}

function importDataFromFile(file){
  if(!file){ return; }
  const reader = new FileReader();
  reader.onload = function(e){
    try{
      const imported = JSON.parse(e.target.result);
      if(imported.users){
        // 合并用户，导入的同名用户覆盖本地
        users = Object.assign({}, users, imported.users);
        if(imported.currentUser && users[imported.currentUser]) {
          currentUser = imported.currentUser;
          records = users[currentUser].records || [];
        }
        saveLocal();
        renderTable();
        renderChart();
        renderProfile();
        alert('导入成功（已合并）');
      } else {
        alert('文件格式不正确');
      }
    }catch(err){
      alert('导入失败：' + err.message);
    }
  };
  reader.readAsText(file);
}

// 只导出当前账户（生成同步码）
function makeSyncCode(obj){
  try { return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))); }
  catch(e){ return btoa(JSON.stringify(obj)); }
}
function parseSyncCode(code){
  try { return JSON.parse(decodeURIComponent(escape(atob(code)))); }
  catch(e){ try{ return JSON.parse(atob(code)); } catch(err){ return null; } }
}

function copySyncCodeForCurrent(){
  if(!currentUser){ alert('请先登录'); return; }
  const payload = { users: { [currentUser]: users[currentUser] }, currentUser, exportedAt: new Date().toISOString() };
  const code = makeSyncCode(payload);
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(code).then(()=> alert('同步码已复制到剪贴板')).catch(()=> { prompt('请复制同步码（剪贴板不可用）', code); });
  } else {
    prompt('请复制同步码（浏览器不支持自动复制）', code);
  }
}

function pasteSyncCodeAndImport(){
  if(navigator.clipboard && navigator.clipboard.readText){
    navigator.clipboard.readText().then(text=>{
      const parsed = parseSyncCode(text);
      if(parsed && parsed.users){
        users = Object.assign({}, users, parsed.users);
        // 如果 payload 指定 currentUser，使用它
        if(parsed.currentUser && users[parsed.currentUser]) {
          currentUser = parsed.currentUser;
          records = users[currentUser].records || [];
        }
        saveLocal();
        renderTable(); renderChart(); renderProfile();
        alert('已导入同步码（合并）');
      } else alert('剪贴板内容不是有效的同步码');
    }).catch(err=>{ alert('读取剪贴板失败：' + err.message); });
  } else {
    const text = prompt('请粘贴同步码（手动）');
    if(!text) return;
    const parsed = parseSyncCode(text);
    if(parsed && parsed.users){
      users = Object.assign({}, users, parsed.users);
      if(parsed.currentUser && users[parsed.currentUser]) {
        currentUser = parsed.currentUser; records = users[currentUser].records || [];
      }
      saveLocal();
      renderTable(); renderChart(); renderProfile();
      alert('已导入同步码（合并）');
    } else alert('粘贴内容无效');
  }
}

// ====== 添加记录 ======
function addRecordFromForm(e){
  e && e.preventDefault();
  if(!currentUser){ alert('请先登录'); return; }
  const date = $id('date').value;
  const amount = Number($id('amount').value);
  const category = $id('category').value.trim();
  const note = $id('note').value.trim();
  if(!date || !amount || !category){ alert('请填写日期、金额和类别'); return; }
  const rec = { date, amount, category, note };
  records.push(rec);
  users[currentUser].records = records;
  saveLocal();
  renderTable();
  renderChart();
  renderProfile();
  // reset
  try{ $id('recordForm').reset(); }catch(e){}
  setTimeout(()=>{ alert('已添加记录，请点击一键同步或导出 JSON 保存到 iCloud Drive'); }, 200);
}

// ====== UI：Profile 渲染 / Tab 切换 ======
function renderProfile(){
  $id('profileUsername').textContent = currentUser || '';
  $id('profileCount').textContent = (records && records.length) || 0;
}

function switchTo(tab){
  // ledger: show form+table+controls; stats: show chart; profile: show profile panel
  const ledgerElements = [$id('recordForm'), $id('ledgerTable'), document.querySelector('.controls-row')];
  const statsPane = $id('statsPane');
  const profilePane = $id('profilePane');
  // tabs styling
  document.querySelectorAll('.mini-tabs .tab').forEach(btn=> btn.classList.toggle('active', btn.dataset.show === tab));

  if(tab === 'ledger'){
    ledgerElements.forEach(el=> el && (el.style.display = 'block'));
    if(statsPane) statsPane.style.display = 'none';
    if(profilePane) profilePane.style.display = 'none';
  } else if(tab === 'stats'){
    ledgerElements.forEach(el=> el && (el.style.display = 'none'));
    if(statsPane) statsPane.style.display = 'block';
    if(profilePane) profilePane.style.display = 'none';
    renderChart();
  } else if(tab === 'profile'){
    ledgerElements.forEach(el=> el && (el.style.display = 'none'));
    if(statsPane) statsPane.style.display = 'none';
    if(profilePane) profilePane.style.display = 'block';
    renderProfile();
  }
}

// ====== 事件绑定（在 DOMContentLoaded 中进行） ======
document.addEventListener('DOMContentLoaded', ()=>{
  // bind core buttons
  const rBtn = $id('registerBtn'); if(rBtn) rBtn.addEventListener('click', doRegister);
  const lBtn = $id('loginBtn'); if(lBtn) lBtn.addEventListener('click', doLogin);
  const loBtn = $id('logoutBtn'); if(loBtn) loBtn.addEventListener('click', doLogout);
  const exportBtn = $id('exportBtn'); if(exportBtn) exportBtn.addEventListener('click', exportData);
  const syncBtn = $id('syncBtn'); if(syncBtn) syncBtn.addEventListener('click', ()=>{ if(!currentUser){ alert('请先登录'); return; } exportData(); });
  // import file (global)
  const importFile = $id('importFile'); if(importFile) importFile.addEventListener('change', (e)=> { if(e.target.files && e.target.files[0]) importDataFromFile(e.target.files[0]); });

  // ledger form
  const form = $id('recordForm'); if(form) form.addEventListener('submit', addRecordFromForm);

  // Tabs
  document.querySelectorAll('.mini-tabs .tab').forEach(btn=>{
    btn.addEventListener('click', ()=> switchTo(btn.dataset.show) );
  });

  // profile buttons
  const copyBtn = $id('copySyncBtn'); if(copyBtn) copyBtn.addEventListener('click', copySyncCodeForCurrent);
  const pasteBtn = $id('pasteSyncBtn'); if(pasteBtn) pasteBtn.addEventListener('click', pasteSyncCodeAndImport);
  const exportUserBtn = $id('exportUserBtn'); if(exportUserBtn) exportUserBtn.addEventListener('click', ()=>{
    if(!currentUser){ alert('请先登录'); return; }
    // export only current user
    const payload = { users: { [currentUser]: users[currentUser] }, currentUser, exportedAt:new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload,null,2)], { type:'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `ledger_${currentUser}.json`; a.click(); URL.revokeObjectURL(a.href); alert('已生成当前账户 JSON');
  });
  const importUserBtn = $id('importUserBtn'); if(importUserBtn) importUserBtn.addEventListener('click', ()=> $id('importUserFile').click());
  const importUserFile = $id('importUserFile'); if(importUserFile) importUserFile.addEventListener('change', (e)=> { if(e.target.files && e.target.files[0]) importDataFromFile(e.target.files[0]); });

  const delAccBtn = $id('deleteAccountBtn'); if(delAccBtn) delAccBtn.addEventListener('click', ()=>{
    if(!currentUser){ alert('请先登录'); return; }
    if(!confirm('确定删除当前账户？此操作不可恢复')) return;
    delete users[currentUser];
    saveLocal();
    doLogout();
    alert('账户已删除');
  });

  // If a single user exists, prefill username
  const names = Object.keys(users || {});
  if(names.length === 1) { try{ $id('username').value = names[0]; }catch(e){} }

  // initial tab
  switchTo('ledger');
});

// ====== beforeunload 保存 ======
window.addEventListener('beforeunload', ()=> {
  if(currentUser) users[currentUser].records = records;
  saveLocal();
});
