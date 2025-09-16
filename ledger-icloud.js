// ledger-icloud.js — 升级版（动画、二次确认删除、iCloud 导入/导出、同步码）

// ====== 工具函数 ======
function $id(id){ return document.getElementById(id); }
function sleep(ms){ return new Promise(resolve=>setTimeout(resolve, ms)); }

// ====== 数据初始化 ======
let users = {};
try { const raw = localStorage.getItem('ledger_users'); if(raw) users = JSON.parse(raw); } catch(e){ users = {}; }
let currentUser = null;
let records = [];
let chart = null;

// ====== 安全哈希 ======
async function hashPassword(pwd){
  if(!pwd) return '';
  try{
    if(window.crypto && crypto.subtle && crypto.subtle.digest){
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pwd));
      return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
    }
  }catch(e){ console.warn('crypto.subtle 失败，降级使用不安全方式', e);}
  try{ return btoa(unescape(encodeURIComponent(pwd))); }catch(e){ return String(pwd); }
}

function saveLocal(){ try{ localStorage.setItem('ledger_users', JSON.stringify(users)); }catch(e){ console.error('保存失败', e); } }

// ====== 渲染表格 ======
function renderTable(){
  const tbody = document.querySelector('#ledgerTable tbody');
  tbody.innerHTML = '';
  records.forEach((r,i)=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.date}</td>
      <td>${r.amount}</td>
      <td>${r.category}</td>
      <td>${r.note}</td>
      <td><button class="deleteBtn" data-index="${i}">删除</button></td>
    `;
    tbody.appendChild(tr);
  });

  // 删除按钮动画 + 二次确认
  document.querySelectorAll('.deleteBtn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const i = parseInt(btn.dataset.index);
      if(!btn.dataset.confirmed){
        showTip(btn, '再次点击删除以确认');
        btn.dataset.confirmed = 'true';
        setTimeout(()=>{ delete btn.dataset.confirmed; removeTip(btn); },5000);
        return;
      }
      // 删除
      records.splice(i,1);
      users[currentUser].records = records;
      saveLocal();
      renderTable();
      renderChart();
      renderProfile();
      showTip(btn, '记录已删除', 1200);
    });
  });
}

// ====== 气泡提示 ======
function showTip(el, msg, duration=1500){
  const div = document.createElement('div');
  div.className = 'tipBubble';
  div.innerText = msg;
  document.body.appendChild(div);
  const rect = el.getBoundingClientRect();
  div.style.top = (rect.top + window.scrollY - 40)+'px';
  div.style.left = (rect.left + rect.width/2 - div.offsetWidth/2)+'px';
  div.style.opacity = '0';
  setTimeout(()=>div.style.opacity='1',10);
  if(duration>0) setTimeout(()=>{ div.style.opacity='0'; setTimeout(()=>div.remove(),300); }, duration);
}

// ====== Chart 统计 ======
function renderChart(){
  const canvas = $id('chart'); if(!canvas || typeof Chart==='undefined') return;
  const ctx = canvas.getContext('2d');
  const catMap = {};
  records.forEach(r=>{
    const k = r.category || '未分类';
    catMap[k] = (catMap[k]||0)+Number(r.amount||0);
  });
  const labels = Object.keys(catMap);
  const data = Object.values(catMap);

  if(chart) chart.destroy();
  chart = new Chart(ctx,{
    type:'pie',
    data:{
      labels,
      datasets:[{
        data,
        backgroundColor:[
          '#36A2EB','#FF6384','#FFCE56','#4BC0C0','#9966FF','#8E8E93',
          '#FF9F40','#FF5A5F','#6A4C93','#009688'
        ]
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{ legend:{ position:'bottom', labels:{ padding:10 } } }
    }
  });
}

// ====== 登录 / 注册 / 登出 ======
async function doRegister(){
  const u=$id('username').value.trim(), p=$id('password').value, msg=$id('loginMsg');
  msg.style.color='#ff3b30';
  if(!u||!p){ msg.innerText='请输入用户名和密码'; return; }
  if(users[u]){ msg.innerText='用户已存在'; return; }
  const h = await hashPassword(p);
  users[u]={passwordHash:h,records:[]};
  saveLocal();
  msg.style.color='green';
  msg.innerText='注册成功，请登录';
}

async function doLogin(){
  const u=$id('username').value.trim(), p=$id('password').value, msg=$id('loginMsg');
  msg.style.color='#ff3b30';
  if(!u||!p){ msg.innerText='请输入用户名和密码'; return; }
  if(!users[u]){ msg.innerText='用户不存在（请注册或导入同步码）'; return; }
  try{
    const h = await hashPassword(p);
    if(h!==users[u].passwordHash){ msg.innerText='密码错误'; return; }
    currentUser=u; records=users[u].records||[];
    $id('login').style.display='none';
    $id('app').style.display='block';
    msg.innerText='';
    renderTable(); renderChart(); renderProfile();
    switchTo('ledger');
  }catch(err){ console.error(err); alert('登录异常: '+(err.message||err)); }
}

function doLogout(){
  if(currentUser) users[currentUser].records = records;
  saveLocal();
  currentUser=null; records=[];
  $id('login').style.display='block';
  $id('app').style.display='none';
  $id('username').value=''; $id('password').value=''; $id('loginMsg').innerText='';
}

// ====== 导出 / 导入 ======
function exportData(){
  if(!currentUser){ alert('请先登录'); return; }
  const payload={users,currentUser,exportedAt:new Date().toISOString()};
  const blob = new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`ledger_backup_${currentUser}.json`; a.click();
  URL.revokeObjectURL(a.href);
  showTip($id('exportBtn'),'已生成 JSON 文件',1200);
}

function importDataFromFile(file){
  if(!file) return;
  const reader = new FileReader();
  reader.onload=function(e){
    try{
      const imported=JSON.parse(e.target.result);
      if(imported.users){
        users=Object.assign({},users,imported.users);
        if(imported.currentUser && users[imported.currentUser]){
          currentUser=imported.currentUser; records=users[currentUser].records||[];
        }
        saveLocal(); renderTable(); renderChart(); renderProfile();
        alert('导入成功（已合并）');
      }else alert('文件格式不正确');
    }catch(err){ alert('导入失败: '+err.message); }
  };
  reader.readAsText(file);
}

// ====== 同步码 ======
function makeSyncCode(obj){ try{return btoa(unescape(encodeURIComponent(JSON.stringify(obj))));}catch(e){return btoa(JSON.stringify(obj));} }
function parseSyncCode(code){ try{return JSON.parse(decodeURIComponent(escape(atob(code))));}catch(e){ try{return JSON.parse(atob(code));}catch(err){return null;}} }

function copySyncCodeForCurrent(){
  if(!currentUser){ alert('请先登录'); return; }
  const payload={users:{[currentUser]:users[currentUser]},currentUser,exportedAt:new Date().toISOString()};
  const code=makeSyncCode(payload);
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(code).then(()=>showTip($id('copySyncBtn'),'已复制到剪贴板')).catch(()=>prompt('请复制同步码',code));
  }else prompt('请复制同步码',code);
}

function pasteSyncCodeAndImport(){
  if(navigator.clipboard && navigator.clipboard.readText){
    navigator.clipboard.readText().then(text=>{
      const parsed=parseSyncCode(text);
      if(parsed && parsed.users){
        users=Object.assign({},users,parsed.users);
        if(parsed.currentUser && users[parsed.currentUser]){ currentUser=parsed.currentUser; records=users[currentUser].records||[]; }
        saveLocal(); renderTable(); renderChart(); renderProfile(); alert('已导入同步码（合并）');
      } else alert('剪贴板内容不是有效同步码');
    }).catch(err=>alert('读取失败: '+err.message));
  } else {
    const text=prompt('请粘贴同步码'); if(!text) return;
    const parsed=parseSyncCode(text);
    if(parsed && parsed.users){ users=Object.assign({},users,parsed.users); if(parsed.currentUser && users[parsed.currentUser]){ currentUser=parsed.currentUser; records=users[currentUser].records||[]; } saveLocal(); renderTable(); renderChart(); renderProfile(); alert('已导入同步码（合并）'); }
    else alert('同步码无效');
  }
}

// ====== 添加记录 ======
function addRecordFromForm(e){
  e&&e.preventDefault();
  if(!currentUser){ alert('请先登录'); return; }
  const date=$id('date').value, amount=Number($id('amount').value),
        category=$id('category').value.trim(), note=$id('note').value.trim();
  if(!date||!amount||!category){ alert('请填写日期、金额和类别'); return; }
  const rec={date,amount,category,note};
  records.push(rec);
  users[currentUser].records = records;
  saveLocal(); renderTable(); renderChart(); renderProfile();
  try{$id('recordForm').reset();}catch(e){}
  showTip($id('recordForm'),'记录已添加',1200);
}

// ====== 用户资料渲染 / Tab 切换 ======
function renderProfile(){
  $id('profileUsername').textContent = currentUser||'';
  $id('profileCount').textContent = (records&&records.length)||0;
}

function switchTo(tab){
  const ledgerEls=[$id('recordForm'),$id('ledgerTable'),document.querySelector('.controls-row')];
  const statsPane=$id('statsPane'), profilePane=$id('profilePane');
  document.querySelectorAll('.mini-tabs .tab').forEach(btn=> btn.classList.toggle('active', btn.dataset.show===tab));
  if(tab==='ledger'){ ledgerEls.forEach(el=>el&&(el.style.display='block')); statsPane&&(statsPane.style.display='none'); profilePane&&(profilePane.style.display='none'); }
  else if(tab==='stats'){ ledgerEls.forEach(el=>el&&(el.style.display='none')); statsPane&&(statsPane.style.display='block'); profilePane&&(profilePane.style.display='none'); renderChart(); }
  else if(tab==='profile'){ ledgerEls.forEach(el=>el&&(el.style.display='none')); statsPane&&(statsPane.style.display='none'); profilePane&&(profilePane.style.display='block'); renderProfile(); }
}

// ====== 事件绑定 ======
document.addEventListener('DOMContentLoaded',()=>{
  $id('registerBtn')?.addEventListener('click',doRegister);
  $id('loginBtn')?.addEventListener('click',doLogin);
  $id('logoutBtn')?.addEventListener('click',doLogout);
  $id('exportBtn')?.addEventListener('click',exportData);
  $id('syncBtn')?.addEventListener('click',()=>{ if(!currentUser){ alert('请先登录'); return; } exportData(); });
  $id('importFile')?.addEventListener('change', e=> { if(e.target.files&&e.target.files[0]) importDataFromFile(e.target.files[0]); });
  $id('recordForm')?.addEventListener('submit',addRecordFromForm);

  document.querySelectorAll('.mini-tabs .tab').forEach(btn=>btn.addEventListener('click',()=>switchTo(btn.dataset.show)));

  $id('copySyncBtn')?.addEventListener('click',copySyncCodeForCurrent);
  $id('pasteSyncBtn')?.addEventListener('click',pasteSyncCodeAndImport);

  $id('exportUserBtn')?.addEventListener('click',()=>{
    if(!currentUser){ alert('请先登录'); return; }
    const payload={users:{[currentUser]:users[currentUser]},currentUser,exportedAt:new Date().toISOString()};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download=`ledger_${currentUser}.json`; a.click(); URL.revokeObjectURL(a.href); showTip($id('exportUserBtn'),'已生成当前账户 JSON',1200);
  });

  $id('importUserBtn')?.addEventListener('click',()=> $id('importUserFile').click());
  $id('importUserFile')?.addEventListener('change',e=>{ if(e.target.files&&e.target.files[0]) importDataFromFile(e.target.files[0]); });

  $id('deleteAccountBtn')?.addEventListener('click',()=>{
    if(!currentUser){ alert('请先登录'); return; }
    if(!confirm('确定删除当前账户？此操作不可恢复')) return;
    delete users[currentUser];
    saveLocal();
    doLogout();
    alert('账户已删除');
  });

  const names = Object.keys(users||{});
  if(names.length===1){ try{$id('username').value=names[0];}catch(e){} }

  switchTo('ledger');
});

// ====== 页面卸载前保存 ======
window.addEventListener('beforeunload',()=>{ if(currentUser) users[currentUser].records=records; saveLocal(); });
