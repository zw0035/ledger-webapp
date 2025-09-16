/* ledger-icloud.js — 升级版
   功能：
   - 多标签 (记账 / 统计 / 我的)
   - 导出 JSON / 导入 JSON / 复制同步码 / 粘贴同步码
   - 本地保存 users -> localStorage['ledger_users']
   - chart.js 饼图与折线图
*/

// ======= 工具函数 =======
function $(sel){ return document.querySelector(sel); }
function showToast(msg, timeout=2000){
  const t = $('#toast');
  t.textContent = msg;
  t.style.display = 'block';
  t.style.opacity = '1';
  setTimeout(()=>{ t.style.opacity = '0'; setTimeout(()=> t.style.display='none',300); }, timeout);
}

// base64 同步码
function makeSyncCode(obj){
  return btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
}
function parseSyncCode(code){
  try{
    const s = decodeURIComponent(escape(atob(code)));
    return JSON.parse(s);
  } catch(e){ return null; }
}

// ======= 数据 =======
let users = {};
let currentUser = null;
let records = [];
let expenseChart = null, trendChart = null;

// 读取本地
(function loadLocal(){
  try{
    const raw = localStorage.getItem('ledger_users');
    if(raw) users = JSON.parse(raw);
  }catch(e){ users = {}; }
})();

function saveLocal(){ localStorage.setItem('ledger_users', JSON.stringify(users)); }

// ======= 哈希密码（同你之前） =======
async function hashPassword(pwd){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pwd));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

// ======= UI / Tabs =======
function switchTab(name){
  document.querySelectorAll('.tab').forEach(b=> b.classList.toggle('active', b.dataset.tab===name));
  document.querySelectorAll('.tab-panel').forEach(p=> p.classList.toggle('active', p.id === `tab-${name}`));
  // update charts when entering stats
  if(name === 'stats'){ updateCharts(); }
}
document.addEventListener('click', (e)=>{
  const tab = e.target.closest('.tab');
  if(tab) switchTab(tab.dataset.tab);
});

// ======= 登录/注册/登出 =======
async function doRegister(){
  const u = $('#username').value.trim();
  const p = $('#password').value;
  const msg = $('#loginMsg');
  msg.style.color = '#ff3b30';
  if(!u || !p){ msg.textContent = '请输入用户名和密码'; return; }
  if(users[u]){ msg.textContent = '用户已存在（或请导入同步码）'; return; }
  users[u] = { passwordHash: await hashPassword(p), records: [] };
  saveLocal();
  msg.style.color = 'green';
  msg.textContent = '注册成功，请登录';
  showToast('注册成功');
}

async function doLogin(){
  const u = $('#username').value.trim();
  const p = $('#password').value;
  const msg = $('#loginMsg');
  msg.style.color = '#ff3b30';
  if(!u || !p){ msg.textContent = '请输入用户名和密码'; return; }
  if(!users[u]){ msg.textContent = '用户不存在（试试导入同步码）'; return; }
  const hash = await hashPassword(p);
  if(hash !== users[u].passwordHash){ msg.textContent = '密码错误'; return; }

  // 登录成功
  currentUser = u;
  records = users[u].records || [];
  $('#login').style.display = 'none';
  $('#panel-app').style.display = 'block';
  $('#currentUserLabel').textContent = currentUser;
  $('#profileUsername').textContent = currentUser;
  $('#loginMsg').textContent = '';
  renderTable();
  updateSummary();
  updateCharts();
  showToast('登录成功');
  switchTab('ledger');
}

function doLogout(){
  if(currentUser){ users[currentUser].records = records; saveLocal(); }
  currentUser = null; records = [];
  $('#panel-app').style.display = 'none';
  $('#login').style.display = 'block';
  $('#username').value = ''; $('#password').value = '';
  showToast('已登出');
}

// ======= 表格/记录操作 =======
function renderTable(){
  const tbody = $('#ledgerTable tbody');
  tbody.innerHTML = '';
  records.forEach((r,i)=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.date}</td><td>${r.category}</td><td>${Number(r.amount).toFixed(2)}</td><td>${r.note||''}</td>
      <td><button class="deleteBtn" data-i="${i}">删除</button></td>`;
    tbody.appendChild(tr);
  });
  // delete binding
  tbody.querySelectorAll('.deleteBtn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const idx = Number(btn.dataset.i);
      records.splice(idx,1);
      users[currentUser].records = records;
      saveLocal();
      renderTable();
      updateCharts();
      updateSummary();
      showToast('已删除记录');
    });
  });
}

function updateSummary(){
  let income = 0, expense = 0;
  records.forEach(r=> {
    if(r.category === '收入' || r.category.toLowerCase()==='income') income += Number(r.amount);
    else expense += Number(r.amount);
  });
  $('#totalIncome').textContent = income.toFixed(2);
  $('#totalExpense').textContent = expense.toFixed(2);
  $('#balance').textContent = (income - expense).toFixed(2);
}

// ======= Charts =======
function updateCharts(){
  // expense pie (current records)
  const catMap = {};
  records.forEach(r=> { if(!(r.category==='收入' || r.category.toLowerCase()==='income')) catMap[r.category] = (catMap[r.category]||0) + Number(r.amount); });
  const labels = Object.keys(catMap);
  const data = Object.values(catMap);

  const expCtx = document.getElementById('expenseChart').getContext('2d');
  if(expenseChart) expenseChart.destroy();
  expenseChart = new Chart(expCtx, {
    type:'pie',
    data:{ labels, datasets:[{ data, backgroundColor: ['#36A2EB','#FF6384','#FFCE56','#4BC0C0','#9966FF','#8E8E93'] }] }
  });

  // trend chart: group by month across all records
  const monthMap = {};
  (users[currentUser]?.records || []).forEach(r=>{
    const m = (r.date || '').slice(0,7) || 'unknown';
    if(!monthMap[m]) monthMap[m] = {income:0, expense:0};
    if(r.category==='收入' || r.category.toLowerCase()==='income') monthMap[m].income += Number(r.amount);
    else monthMap[m].expense += Number(r.amount);
  });
  const months = Object.keys(monthMap).sort();
  const incomes = months.map(m=>monthMap[m].income);
  const expenses = months.map(m=>monthMap[m].expense);

  const trendCtx = document.getElementById('trendChart').getContext('2d');
  if(trendChart) trendChart.destroy();
  trendChart = new Chart(trendCtx, {
    type:'line',
    data:{ labels: months, datasets:[
      { label:'收入', data: incomes, borderColor:'#36A2EB', fill:false },
      { label:'支出', data: expenses, borderColor:'#FF6384', fill:false }
    ]},
    options:{ scales:{ y:{ beginAtZero:true } } }
  });
}

// ======= 导出 / 导入 / 复制同步码 =======
function exportData(){
  if(!currentUser) { showToast('请先登录'); return; }
  const payload = { users, currentUser, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(payload,null,2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ledger_backup_${currentUser}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('已生成 JSON，保存到 iCloud Drive 完成跨设备同步');
}

function importFromFile(file){
  const reader = new FileReader();
  reader.onload = function(evt){
    try{
      const imported = JSON.parse(evt.target.result);
      if(imported.users){
        // merge users (preserve existing unless name conflict -> imported wins)
        users = Object.assign({}, users, imported.users);
        if(imported.currentUser) currentUser = imported.currentUser;
        if(currentUser && users[currentUser]) records = users[currentUser].records || [];
        saveLocal();
        renderTable(); updateCharts(); updateSummary();
        showToast('导入成功（已合并）');
      } else {
        showToast('JSON 格式不对');
      }
    } catch(e){
      showToast('导入失败: ' + e.message);
    }
  };
  reader.readAsText(file);
}

function copySyncCode(){
  if(!currentUser){ showToast('请先登录'); return; }
  const payload = { users: { [currentUser]: users[currentUser] }, currentUser, exportedAt: new Date().toISOString() };
  const code = makeSyncCode(payload);
  navigator.clipboard.writeText(code).then(()=> showToast('同步码已复制到剪贴板')).catch(()=> showToast('复制失败，请手动复制'));
}

function pasteSyncCodeAndImport(){
  navigator.clipboard.readText().then(text=>{
    const data = parseSyncCode(text);
    if(!data || !data.users){ showToast('粘贴的同步码无效'); return; }
    users = Object.assign({}, users, data.users);
    // set currentUser to imported if single user in payload
    if(data.currentUser) currentUser = data.currentUser;
    if(currentUser && users[currentUser]) records = users[currentUser].records || [];
    saveLocal();
    renderTable(); updateCharts(); updateSummary();
    showToast('已导入同步码（合并）');
  }).catch(()=> showToast('读取剪贴板失败，请允许剪贴板权限或手动粘贴'));
}

// ======= Add record handler =======
document.addEventListener('DOMContentLoaded', ()=>{
  // bind buttons
  $('#registerBtn').addEventListener('click', doRegister);
  $('#loginBtn').addEventListener('click', doLogin);
  $('#logoutBtn').addEventListener('click', doLogout);
  $('#exportBtn').addEventListener('click', exportData);
  $('#importBtn').addEventListener('click', ()=> $('#importFile').click());
  $('#importFile').addEventListener('change', (e)=> { if(e.target.files[0]) importFromFile(e.target.files[0]); });
  $('#copySyncBtn').addEventListener('click', copySyncCode);
  $('#pasteSyncBtn').addEventListener('click', pasteSyncCodeAndImport);
  $('#syncQuickBtn').addEventListener('click', ()=> {
    if(!currentUser){ showToast('请先登录'); return; }
    exportData();
  });

  // form submit
  $('#recordForm').addEventListener('submit', (e)=> {
    e.preventDefault();
    if(!currentUser){ showToast('请先登录'); return; }
    const r = {
      date: $('#date').value || new Date().toISOString().slice(0,10),
      amount: Number($('#amount').value) || 0,
      category: $('#category').value || '其他',
      note: $('#note').value || ''
    };
    records.push(r);
    users[currentUser].records = records;
    saveLocal();
    renderTable();
    updateCharts();
    updateSummary();
    $('#recordForm').reset();
    showToast('已添加记录');
  });

  // delete account button
  $('#deleteAccountBtn').addEventListener('click', ()=>{
    if(!currentUser){ showToast('请先登录'); return; }
    if(!confirm('确定要删除当前账户？此操作不可恢复。')) return;
    delete users[currentUser];
    saveLocal();
    doLogout();
    showToast('账户已删除');
  });

  // init charts placeholders
  const expenseCtx = document.getElementById('expenseChart').getContext('2d');
  expenseChart = new Chart(expenseCtx, { type:'pie', data:{labels:[], datasets:[{data:[]}] } });
  const trendCtx = document.getElementById('trendChart').getContext('2d');
  trendChart = new Chart(trendCtx, { type:'line', data:{labels:[], datasets:[] } });

  // If there's only one user in local storage, optionally prefill login field
  const localUsernames = Object.keys(users);
  if(localUsernames.length === 1){ $('#username').value = localUsernames[0]; }
});

// ======= beforeunload auto-save =======
window.addEventListener('beforeunload', ()=>{
  if(currentUser) users[currentUser].records = records;
  saveLocal();
});
