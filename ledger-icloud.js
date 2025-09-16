// ledger-icloud.js — 最终修复版，适配全新UI
// 修复了Tab切换问题，确保所有功能正常工作

// ====== 工具函数 ======
const $id = (id) => document.getElementById(id);
const $sel = (sel) => document.querySelector(sel);
const $all = (sel) => document.querySelectorAll(sel);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ====== App 核心对象 ======
const App = {
    // 状态管理
    state: {
        users: {},
        currentUser: null,
        records: [],
        chartInstance: null,
        sortConfig: { key: "date", direction: "desc" },
    },

    // 元素 ID 和常量
    constants: {
        ELEM_ID: {
            loginPane: "login-pane",
            appPane: "app-pane",
            loginForm: "loginForm",
            recordForm: "recordForm",
            username: "username",
            password: "password",
            loginBtn: "loginBtn",
            registerBtn: "registerBtn",
            loginMsg: "loginMsg",
            logoutBtn: "logoutBtn",
            date: "date",
            amount: "amount",
            category: "category",
            note: "note",
            ledgerTable: "ledgerTable",
            ledgerTableBody: "#ledgerTable tbody",
            chart: "chart",
            exportBtn: "exportBtn",
            importFile: "importFile",
            copySyncBtn: "copySyncBtn",
            pasteSyncBtn: "pasteSyncBtn",
            exportUserBtn: "exportUserBtn",
            importUserFile: "importUserFile",
            importUserBtn: "importUserBtn",
            deleteAccountBtn: "deleteAccountBtn",
            profileUsername: "profileUsername",
            profileCount: "profileCount",
            tabBtns: ".tab-bar .tab-item",
            tabContent: ".tab-content",
        },
        DATA_KEY: "ledger_users",
        TIP_CLASS: "tipBubble",
        LOADING_TEXT: "加载中...",
    },

    // 初始化
    init() {
        this.loadLocalData();
        this.bindEvents();
        this.initialRender();
    },

    // ====== 数据管理 ======
    loadLocalData() {
        try {
            const raw = localStorage.getItem(this.constants.DATA_KEY);
            if (raw) {
                this.state.users = JSON.parse(raw);
            }
        } catch (e) {
            console.error("无法从本地存储加载数据", e);
        }
    },

    saveLocalData() {
        try {
            localStorage.setItem(this.constants.DATA_KEY, JSON.stringify(this.state.users));
        } catch (e) {
            console.error("无法保存数据到本地存储", e);
        }
    },

    // ====== 渲染函数 ======
    renderTable() {
        const tbody = $sel(this.constants.ELEM_ID.ledgerTableBody);
        if (!tbody) return;

        const sortedRecords = [...this.state.records].sort((a, b) => {
            const { key, direction } = this.state.sortConfig;
            let valA = a[key];
            let valB = b[key];

            if (key === "date") {
                valA = new Date(valA);
                valB = new Date(valB);
            } else if (key === "amount") {
                valA = Number(valA);
                valB = Number(valB);
            }

            if (valA < valB) return direction === "asc" ? -1 : 1;
            if (valA > valB) return direction === "asc" ? 1 : -1;
            return 0;
        });

        tbody.innerHTML = sortedRecords
            .map(
                (r, i) => `
            <tr>
                <td>${r.date}</td>
                <td>${r.amount}</td>
                <td>${r.category}</td>
                <td>${r.note}</td>
                <td><button class="delete-btn" data-index="${this.state.records.indexOf(r)}">删除</button></td>
            </tr>
        `
            )
            .join("");
    },

    renderChart() {
        const canvas = $id(this.constants.ELEM_ID.chart);
        if (!canvas || typeof Chart === "undefined") return;

        const ctx = canvas.getContext("2d");
        const catMap = this.state.records.reduce((acc, r) => {
            const k = r.category || "未分类";
            acc[k] = (acc[k] || 0) + Number(r.amount || 0);
            return acc;
        }, {});

        const labels = Object.keys(catMap);
        const data = Object.values(catMap);

        if (this.state.chartInstance) {
            this.state.chartInstance.destroy();
        }
        this.state.chartInstance = new Chart(ctx, {
            type: "pie",
            data: {
                labels,
                datasets: [
                    {
                        data,
                        backgroundColor: [
                            "#1a73e8",
                            "#d93025",
                            "#0f9d58",
                            "#f4b400",
                            "#4285f4",
                            "#c3372c",
                            "#6d6d6d",
                            "#34a853",
                        ],
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: "bottom",
                        labels: {
                            padding: 16,
                            usePointStyle: true,
                        },
                    },
                },
            },
        });
    },

    renderProfile() {
        $id(this.constants.ELEM_ID.profileUsername).textContent = this.state.currentUser || "";
        $id(this.constants.ELEM_ID.profileCount).textContent = (this.state.records && this.state.records.length) || 0;
    },

    // ====== 状态切换和提示 ======
    showPane(paneId) {
        $id(this.constants.ELEM_ID.loginPane).style.display = "none";
        $id(this.constants.ELEM_ID.appPane).style.display = "none";
        $id(paneId).style.display = "flex";
    },

    switchToTab(tabName) {
        const tabs = $all(this.constants.ELEM_ID.tabContent);
        const buttons = $all(this.constants.ELEM_ID.tabBtns);
    
        tabs.forEach(tab => {
            tab.classList.add('hidden');
        });
        buttons.forEach(btn => {
            btn.classList.remove('active');
        });
    
        const activeTabContent = $id(`${tabName}-tab-content`);
        const activeTabBtn = $sel(`.tab-item[data-tab-name="${tabName}"]`);
    
        if (activeTabContent) {
            activeTabContent.classList.remove('hidden');
        }
        if (activeTabBtn) {
            activeTabBtn.classList.add('active');
        }

        if (tabName === "stats") {
            this.renderChart();
        } else if (tabName === "profile") {
            this.renderProfile();
        }
    },

    showTip(el, msg, duration = 1500) {
        const div = document.createElement("div");
        div.className = this.constants.TIP_CLASS;
        div.innerText = msg;
        document.body.appendChild(div);
        const rect = el.getBoundingClientRect();
        div.style.top = rect.top + window.scrollY - 40 + "px";
        div.style.left = rect.left + rect.width / 2 - div.offsetWidth / 2 + "px";
        div.style.opacity = "0";
        setTimeout(() => (div.style.opacity = "1"), 10);
        if (duration > 0)
            setTimeout(() => {
                div.style.opacity = "0";
                setTimeout(() => div.remove(), 300);
            }, duration);
    },

    setLoading(btnId, isLoading) {
        const btn = $id(btnId);
        if (!btn) return;
        btn.classList.toggle("loading", isLoading);
        btn.disabled = isLoading;
    },

    showMessage(elId, msg, isError = true) {
        const el = $id(elId);
        if (el) {
            el.classList.toggle("success", !isError);
            el.innerText = msg;
        }
    },

    // ====== 核心功能 ======
    async hashPassword(pwd) {
        if (!pwd) throw new Error("Password cannot be empty");
        try {
            const buf = await crypto.subtle.digest(
                "SHA-256",
                new TextEncoder().encode(pwd)
            );
            return Array.from(new Uint8Array(buf))
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("");
        } catch (e) {
            console.error("crypto.subtle failed, falling back to insecure method", e);
            throw new Error("密码哈希失败，浏览器不支持或存在问题");
        }
    },

    async handleRegister() {
        const u = $id(this.constants.ELEM_ID.username).value.trim();
        const p = $id(this.constants.ELEM_ID.password).value;
        if (!u || !p)
            return this.showMessage(this.constants.ELEM_ID.loginMsg, "请输入用户名和密码");
        if (this.state.users[u])
            return this.showMessage(this.constants.ELEM_ID.loginMsg, "用户已存在");

        this.setLoading(this.constants.ELEM_ID.registerBtn, true);
        try {
            const h = await this.hashPassword(p);
            this.state.users[u] = { passwordHash: h, records: [] };
            this.saveLocalData();
            this.showMessage(this.constants.ELEM_ID.loginMsg, "注册成功，请登录", false);
        } catch (err) {
            this.showMessage(this.constants.ELEM_ID.loginMsg, "注册失败: " + err.message);
        } finally {
            this.setLoading(this.constants.ELEM_ID.registerBtn, false);
        }
    },

    async handleLogin() {
        const u = $id(this.constants.ELEM_ID.username).value.trim();
        const p = $id(this.constants.ELEM_ID.password).value;
        if (!u || !p)
            return this.showMessage(this.constants.ELEM_ID.loginMsg, "请输入用户名和密码");
        if (!this.state.users[u])
            return this.showMessage(this.constants.ELEM_ID.loginMsg, "用户不存在");

        this.setLoading(this.constants.ELEM_ID.loginBtn, true);
        try {
            const h = await this.hashPassword(p);
            if (h !== this.state.users[u].passwordHash) {
                return this.showMessage(this.constants.ELEM_ID.loginMsg, "密码错误");
            }
            this.state.currentUser = u;
            this.state.records = this.state.users[u].records || [];
            this.showPane(this.constants.ELEM_ID.appPane);
            this.showMessage(this.constants.ELEM_ID.loginMsg, "");
            this.renderTable();
            this.renderChart();
            this.renderProfile();
            $id(this.constants.ELEM_ID.password).value = "";
            this.switchToTab("ledger");
        } catch (err) {
            console.error(err);
            this.showMessage(this.constants.ELEM_ID.loginMsg, "登录异常: " + (err.message || err));
        } finally {
            this.setLoading(this.constants.ELEM_ID.loginBtn, false);
        }
    },

    handleLogout() {
        if (this.state.currentUser) {
            this.state.users[this.state.currentUser].records = this.state.records;
            this.saveLocalData();
        }
        this.state.currentUser = null;
        this.state.records = [];
        this.showPane(this.constants.ELEM_ID.loginPane);
        $id(this.constants.ELEM_ID.username).value = "";
        $id(this.constants.ELEM_ID.password).value = "";
        this.showMessage(this.constants.ELEM_ID.loginMsg, "");
    },

    handleAddRecord(e) {
        e.preventDefault();
        if (!this.state.currentUser) return alert("请先登录");
        const form = $id(this.constants.ELEM_ID.recordForm);
        if (!form.reportValidity()) return;

        const date = $id(this.constants.ELEM_ID.date).value;
        const amount = Number($id(this.constants.ELEM_ID.amount).value);
        const category = $id(this.constants.ELEM_ID.category).value.trim();
        const note = $id(this.constants.ELEM_ID.note).value.trim();

        if (isNaN(amount) || amount <= 0) {
            this.showMessage("recordForm", "金额必须大于0", true);
            return;
        }

        const rec = { date, amount, category, note };
        this.state.records.push(rec);
        this.state.users[this.state.currentUser].records = this.state.records;
        this.saveLocalData();
        this.renderTable();
        this.renderChart();
        this.renderProfile();
        form.reset();
        this.showTip(form, "记录已添加", 1200);
    },

    handleImport(data) {
        if (!data || !data.users) {
            alert("文件格式不正确");
            return;
        }
        this.state.users = Object.assign({}, this.state.users, data.users);
        if (data.currentUser && this.state.users[data.currentUser]) {
            this.state.currentUser = data.currentUser;
            this.state.records = this.state.users[this.state.currentUser].records || [];
        }
        this.saveLocalData();
        this.renderTable();
        this.renderChart();
        this.renderProfile();
        alert("数据导入成功（已合并）");
    },

    handleFileImport(fileInputId) {
        const fileInput = $id(fileInputId);
        if (!fileInput.files || !fileInput.files[0]) return;
        const file = fileInput.files[0];
        const reader = new FileReader();
        reader.onload = (e) => this.handleImport(JSON.parse(e.target.result));
        reader.readAsText(file);
    },

    // ====== 事件绑定 ======
    bindEvents() {
        const { ELEM_ID } = this.constants;

        $id(ELEM_ID.loginBtn)?.addEventListener("click", () => this.handleLogin());
        $id(ELEM_ID.registerBtn)?.addEventListener("click", () => this.handleRegister());
        $id(ELEM_ID.loginForm)?.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                this.handleLogin();
            }
        });
        $id(ELEM_ID.logoutBtn)?.addEventListener("click", () => this.handleLogout());
        $id(ELEM_ID.recordForm)?.addEventListener("submit", (e) => this.handleAddRecord(e));

        $all(ELEM_ID.tabBtns).forEach((btn) => {
            btn.addEventListener("click", () => this.switchToTab(btn.dataset.tabName));
        });

        $id(ELEM_ID.ledgerTable)?.addEventListener("click", (e) => {
            const th = e.target.closest("th");
            if (th && th.classList.contains("sortable")) {
                const key = th.dataset.sortBy;
                let direction = "asc";
                if (this.state.sortConfig.key === key) {
                    direction = this.state.sortConfig.direction === "asc" ? "desc" : "asc";
                }
                this.state.sortConfig = { key, direction };
                $all(".sortable").forEach((t) => t.classList.remove("asc", "desc"));
                th.classList.add(direction);
                this.renderTable();
            }

            const btn = e.target.closest(".delete-btn");
            if (btn) {
                const i = parseInt(btn.dataset.index);
                if (!btn.dataset.confirmed) {
                    this.showTip(btn, "再次点击删除以确认", 5000);
                    btn.dataset.confirmed = "true";
                    setTimeout(() => {
                        delete btn.dataset.confirmed;
                    }, 5000);
                    return;
                }
                this.state.records.splice(i, 1);
                this.state.users[this.state.currentUser].records = this.state.records;
                this.saveLocalData();
                this.renderTable();
                this.renderChart();
                this.renderProfile();
                this.showTip(btn, "记录已删除", 1200);
            }
        });

        $id(ELEM_ID.exportBtn)?.addEventListener("click", () => {
            if (!this.state.currentUser) return alert("请先登录");
            const payload = {
                users: this.state.users,
                currentUser: this.state.currentUser,
                exportedAt: new Date().toISOString(),
            };
            this.downloadJSON(payload, `ledger_backup_${this.state.currentUser}.json`, ELEM_ID.exportBtn);
        });
        $id(ELEM_ID.importFile)?.addEventListener("change", () => this.handleFileImport(ELEM_ID.importFile));
        $id(ELEM_ID.copySyncBtn)?.addEventListener("click", () => {
            if (!this.state.currentUser) return alert("请先登录");
            const payload = {
                users: { [this.state.currentUser]: this.state.users[this.state.currentUser] },
                currentUser: this.state.currentUser,
                exportedAt: new Date().toISOString(),
            };
            this.copyToClipboard(this.makeSyncCode(payload), ELEM_ID.copySyncBtn, "已复制到剪贴板");
        });
        $id(ELEM_ID.pasteSyncBtn)?.addEventListener("click", async () => {
            try {
                const text = await navigator.clipboard.readText();
                const parsed = this.parseSyncCode(text);
                if (parsed) this.handleImport(parsed);
                else alert("剪贴板内容不是有效同步码");
            } catch (err) {
                console.error(err);
                const text = prompt("无法自动读取剪贴板，请手动粘贴同步码");
                if (text) {
                    const parsed = this.parseSyncCode(text);
                    if (parsed) this.handleImport(parsed);
                    else alert("同步码无效");
                }
            }
        });

        $id(ELEM_ID.exportUserBtn)?.addEventListener("click", () => {
            if (!this.state.currentUser) return alert("请先登录");
            const payload = {
                users: { [this.state.currentUser]: this.state.users[this.state.currentUser] },
                currentUser: this.state.currentUser,
                exportedAt: new Date().toISOString(),
            };
            this.downloadJSON(payload, `ledger_${this.state.currentUser}.json`, ELEM_ID.exportUserBtn);
        });

        $id(ELEM_ID.importUserBtn)?.addEventListener("click", () => $id(ELEM_ID.importUserFile).click());
        $id(ELEM_ID.importUserFile)?.addEventListener("change", () => this.handleFileImport(ELEM_ID.importUserFile));

        $id(ELEM_ID.deleteAccountBtn)?.addEventListener("click", () => {
            if (!this.state.currentUser) return alert("请先登录");
            if (!confirm("确定删除当前账户？此操作不可恢复")) return;
            delete this.state.users[this.state.currentUser];
            this.saveLocalData();
            this.handleLogout();
            alert("账户已删除");
        });
    },

    // ====== 通用函数 ======
    downloadJSON(payload, filename, buttonId) {
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
            type: "application/json",
        });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
        this.showTip($id(buttonId), "已生成 JSON 文件", 1200);
    },

    makeSyncCode(obj) {
        try {
            return btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
        } catch (e) {
            return btoa(JSON.stringify(obj));
        }
    },

    parseSyncCode(code) {
        try {
            return JSON.parse(decodeURIComponent(escape(atob(code))));
        } catch (e) {
            try {
                return JSON.parse(atob(code));
            } catch (err) {
                return null;
            }
        }
    },

    async copyToClipboard(text, btnId, successMsg) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                this.showTip($id(btnId), successMsg, 1200);
            } catch (err) {
                prompt("请手动复制以下内容", text);
            }
        } else {
            prompt("您的浏览器不支持自动复制，请手动复制以下内容", text);
        }
    },

    initialRender() {
        const names = Object.keys(this.state.users || {});
        if (names.length === 1) {
            try {
                $id(this.constants.ELEM_ID.username).value = names[0];
            } catch (e) {}
        }
    },
};

// 页面加载和卸载事件
document.addEventListener("DOMContentLoaded", () => {
    App.init();
});

window.addEventListener("beforeunload", () => {
    if (App.state.currentUser) {
        App.state.users[App.state.currentUser].records = App.state.records;
        App.saveLocalData();
    }
});
