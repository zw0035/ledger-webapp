// === ledger.js ===
const app = document.getElementById("app");
app.innerHTML = `
<div id="loginPage">
  <form id="loginForm">
    <h2>登录 / 注册</h2>
    <select id="accountSelect">
      <option value="">选择账户</option>
    </select>
    <input type="text" id="newUsername" placeholder="新建账户名">
    <input type="password" id="password" placeholder="密码" required>
    <button type="submit">登录 / 注册</button>
  </form>
</div>

<div id="appPage" style="display:none;">
  <div>
    <label>选择月份：
      <input type="month" id="monthSelect">
    </label>
    <input type="text" id="searchInput" placeholder="搜索备注">
    <button onclick="logout()">登出</button>
  </div>

  <form id="entryForm">
    <input type="date" id="date" required>
    <input type="number" id="amount" placeholder="金额" required>
    <select id="category">
      <option value="餐饮">餐饮</option>
      <option value="交通">交通</option>
      <option value="娱乐">娱乐</option>
      <option value="购物">购物</option>
      <option value="收入">收入</option>
    </select>
    <input type="text" id="note" placeholder="备注">
    <button type="submit">添加流水</button>
  </form>

  <div class="summary">
    <h2>收支汇总</h2>
    <p>总收入：<span id="totalIncome">0</span></p>
    <p>总支出：<span id="totalExpense">0</span></p>
    <p>结余：<span id="balance">0</span></p>
  </div>

  <h2>流水记录</h2>
  <table id="recordsTable">
    <thead>
      <tr>
        <th>日期</th><th>类别</th><th>金额</th><th>备注</th><th>操作</th>
      </tr>
    </thead>
    <tbody></tbody>
  </table>

  <h2>支出类别统计</h2>
  <canvas id="expenseChart"></canvas>

  <h2>每月收入/支出趋势</h2>
  <canvas id="trendChart"></canvas>

  <div class="import-export">
    <button onclick="exportData()">导出数据 (JSON)</button>
    <input type="file" id="importFile" accept=".json" onchange="importData(event)">
  </div>
</div>
`;

// 加载 Chart.js
const chartScript = document.createElement('script');
chartScript.src = "https://cdn.jsdelivr.net/npm/chart.js";
chartScript.onload = initLedger;
document.body.appendChild(chartScript);

// 核心功能
async function hashPassword(password){
  const msgBuffer = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b=>b.toString(16).padStart(2,'0')).join('');
}

function initLedger(){
  const loginPage = document.getElementById('loginPage');
  const appPage = document.getElementById('appPage');
  const loginForm = document.getElementById('loginForm');
  const accountSelect = document.getElementById('accountSelect');
  const newUsernameInput = document.getElementById('newUsername');
  const passwordInput = document.getElementById('password');

  const form = document.getElementById("entryForm");
  const tableBody = document.querySelector("#recordsTable tbody");
  const totalIncomeEl = document.getElementById("totalIncome");
  const totalExpenseEl = document.getElementById("totalExpense");
  const balanceEl = document.getElementById("balance");
  const monthSelect = document.getElementById("monthSelect");
  const searchInput = document.getElementById('searchInput');
  const expenseCtx = document.getElementById("expenseChart").getContext("2d");
  const trendCtx = document.getElementById("trendChart").getContext("2d");

  let users = JSON.parse(localStorage.getItem('users')) || {};
  let currentUser = null;
  let records = [];

  // 初始化月份选择
  const today = new Date();
  monthSelect.value = today.toISOString().slice(0,7);
  monthSelect.addEventListener('change',renderTable);
  searchInput.addEventListener('input',renderTable);

  function updateAccountSelect(){
    accountSelect.innerHTML = `<option value="">选择账户</option>` + Object.keys(users).map(u=>`<option value="${u}">${u}</option>`).join('');
  }
  updateAccountSelect();

  let expenseChart = new Chart(expenseCtx,{type:'pie',data:{labels:[],datasets:[{data:[],backgroundColor:['#ff6384','#36a2eb','#ffce56','#4bc0c0','#9966ff']}]}});

  let trendChart = new Chart(trendCtx,{type:'line',data:{labels:[],datasets:[{label:'收入',data:[],borderColor:'#36a2eb',fill:false},{label:'支出',data:[],borderColor:'#ff6384',fill:false}]}});

  function saveData(){ localStorage.setItem('users',JSON.stringify(users)); }

  function getFilteredRecords(){
    let filtered = records;
    if(monthSelect.value) filtered = filtered.filter(r=>r.date.startsWith(monthSelect.value));
    const keyword = searchInput.value.trim().toLowerCase();
    if(keyword) filtered = filtered.filter(r=>r.note.toLowerCase().includes(keyword));
    return filtered;
  }

  function updateSummary(){
    const filtered = getFilteredRecords();
    let income=0, expense=0;
    filtered.forEach(r=>{ if(r.category==='收入') income+=Number(r.amount); else expense+=Number(r.amount); });
    totalIncomeEl.textContent = income.toFixed(2);
    totalExpenseEl.textContent = expense.toFixed(2);
    balanceEl.textContent = (income-expense).toFixed(2);
  }

  function updateCharts(){
    const filtered = getFilteredRecords();
    // 饼图
    let categories={};
    filtered.forEach(r=>{ if(r.category!=='收入') categories[r.category]=(categories[r.category]||0)+Number(r.amount); });
    expenseChart.data.labels = Object.keys(categories);
    expenseChart.data.datasets[0].data = Object.values(categories);
    expenseChart.update();
    // 折线图
    const monthMap = {};
    records.forEach(r=>{
      const m = r.date.slice(0,7);
      if(!monthMap[m]) monthMap[m]={income:0,expense:0};
      if(r.category==='收入') monthMap[m].income+=Number(r.amount);
      else monthMap[m].expense+=Number(r.amount);
    });
    const labels = Object.keys(monthMap).sort();
    trendChart.data.labels = labels;
    trendChart.data.datasets[0].data = labels.map(m=>monthMap[m].income);
    trendChart.data.datasets[1].data = labels.map(m=>monthMap[m].expense);
    trendChart.update();
  }

  function renderTable(){
    const filtered = getFilteredRecords();
    tableBody.innerHTML='';
    filtered.forEach((record,index)=>{
      const row = document.createElement('tr');
      row.innerHTML = `<td>${record.date}</td><td>${record.category}</td><td>${record.amount}</td><td>${record.note}</td><td><span class="delete-btn" onclick="deleteRecord(${index})">删除</span></td>`;
      tableBody.appendChild(row);
    });
    updateSummary();
    updateCharts();
    saveData();
  }

  loginForm.addEventListener('submit', async function(e){
    e.preventDefault();
    let username = accountSelect.value || newUsernameInput.value.trim();
    const password = passwordInput.value;
    if(!username || !password){ alert('请输入用户名和密码'); return; }

    const hashed = await hashPassword(password);
    if(!users[username]){
      users[username] = {password:hashed,records:[]};
      alert('账户创建成功！');
    } else if(users[username].password !== hashed){
      alert('密码错误！'); return;
    }

    currentUser = username;
    records = users[username].records || [];
    loginPage.style.display='none';
    appPage.style.display='block';
    updateAccountSelect();
    renderTable();
  });

  window.logout = function(){
    users[currentUser].records = records;
    saveData();
    appPage.style.display='none';
    loginPage.style.display='block';
    newUsernameInput.value=''; passwordInput.value=''; accountSelect.value='';
    currentUser=null;
  }

  form.addEventListener('submit',function(e){
    e.preventDefault();
    const record = {
      date: document.getElementById("date").value,
      amount: document.getElementById("amount").value,
      category: document.getElementById("category").value,
      note: document.getElementById("note").value
    };
    records.push(record);
    users[currentUser].records = records;
    renderTable();
    form.reset();
  });

  window.deleteRecord = function(index){
    const filtered = getFilteredRecords();
    const recordToDelete = filtered[index];
    const idx = records.indexOf(recordToDelete);
    if(idx>-1) records.splice(idx,1);
    users[currentUser].records = records;
    renderTable();
  }

  window.addEventListener('beforeunload',function(){
    if(currentUser) users[currentUser].records = records;
    saveData();
  });

  window.exportData=function(){
    const dataStr = JSON.stringify(users,null,2);
    const blob = new Blob([dataStr],{type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=`all_accounts_backup.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  window.importData=function(event){
    const file = event.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload=function(e){
      try{
        const imported = JSON.parse(e.target.result);
        if(imported.users){
          users = imported.users;
          updateAccountSelect();
          if(currentUser) { records = users[currentUser].records || []; renderTable(); }
          saveData();
          alert('导入成功！');
        } else alert('JSON 文件格式错误');
      } catch(err){
        alert('导入失败：'+err);
      }
    };
    reader.readAsText(file);
  }
}
