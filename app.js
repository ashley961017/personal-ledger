const DB_NAME = "personal-ledger-v1";
const DB_VERSION = 1;
const STORE_NAMES = ["books", "accounts", "categories", "transactions", "sync_state", "settings"];
const CHART_COLORS = ["#1f7a6b", "#bd4b4b", "#2d6cdf", "#c48a22", "#7a4fb8", "#3b7d9a", "#8b6f47", "#d26a3c"];

const state = {
  db: null,
  supabase: null,
  session: null,
  syncTimer: null,
  books: [],
  accounts: [],
  categories: [],
  transactions: [],
  currentBookId: "",
  type: "expense",
  view: "dashboard"
};

const els = {};

document.addEventListener("DOMContentLoaded", async () => {
  bindElements();
  bindEvents();
  await initDb();
  await ensureSeedData();
  await loadAll();
  applyLaunchShortcut();
  await initSupabase();
  resetForm();
  render();
  registerServiceWorker();
  startAutoSync();
});

function bindElements() {
  [
    "bookSelect", "expenseMode", "incomeMode", "transactionForm", "editingId", "amountInput", "dateInput",
    "accountInput", "categoryInput", "noteInput", "resetForm", "monthPicker", "monthIncome", "monthExpense",
    "monthBalance", "yearBalance", "categoryChart", "categoryLegend", "yearChart", "searchInput", "typeFilter",
    "accountFilter", "categoryFilter", "fromDate", "toDate", "transactionRows", "exportFiltered", "exportAll",
    "backupJson", "restoreJson", "bookList", "accountList", "categoryList", "formTitle", "syncStatus",
    "manualSync", "supabaseConfigForm", "supabaseUrl", "supabaseAnonKey", "authForm", "authEmail",
    "authPassword", "signOut", "authStatus", "importCsv", "importSummary"
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      renderViews();
    });
  });

  els.bookSelect.addEventListener("change", async () => {
    state.currentBookId = els.bookSelect.value;
    await put("settings", { key: "currentBookId", value: state.currentBookId });
    render();
  });

  els.expenseMode.addEventListener("click", () => setType("expense"));
  els.incomeMode.addEventListener("click", () => setType("income"));
  els.resetForm.addEventListener("click", resetForm);
  els.transactionForm.addEventListener("submit", saveTransaction);
  els.monthPicker.addEventListener("change", renderDashboard);
  ["searchInput", "typeFilter", "accountFilter", "categoryFilter", "fromDate", "toDate"].forEach((id) => {
    els[id].addEventListener("input", renderTransactions);
    els[id].addEventListener("change", renderTransactions);
  });
  els.exportFiltered.addEventListener("click", () => exportCsv(filteredTransactions(), "filtered-transactions"));
  els.exportAll.addEventListener("click", () => exportCsv(currentBookTransactions(), "book-transactions"));
  els.backupJson.addEventListener("click", backupJson);
  els.restoreJson.addEventListener("change", restoreJson);
  els.importCsv.addEventListener("change", importCsv);
  els.manualSync.addEventListener("click", () => syncNow({ manual: true }));
  els.supabaseConfigForm.addEventListener("submit", saveSupabaseConfig);
  els.authForm.addEventListener("submit", handleAuth);
  els.signOut.addEventListener("click", signOut);

  document.querySelectorAll(".inline-form").forEach((form) => {
    form.addEventListener("submit", addEntity);
  });
}

function initDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      STORE_NAMES.forEach((name) => {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: name === "settings" ? "key" : "id" });
      });
    };
    request.onsuccess = () => {
      state.db = request.result;
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

function tx(storeName, mode = "readonly") {
  return state.db.transaction(storeName, mode).objectStore(storeName);
}

function getAll(storeName) {
  return new Promise((resolve, reject) => {
    const request = tx(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function get(storeName, key) {
  return new Promise((resolve, reject) => {
    const request = tx(storeName).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function put(storeName, value) {
  return new Promise((resolve, reject) => {
    const request = tx(storeName, "readwrite").put(value);
    request.onsuccess = () => resolve(value);
    request.onerror = () => reject(request.error);
  });
}

function del(storeName, key) {
  return new Promise((resolve, reject) => {
    const request = tx(storeName, "readwrite").delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function clearStore(storeName) {
  return new Promise((resolve, reject) => {
    const request = tx(storeName, "readwrite").clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function ensureSeedData() {
  const books = await getAll("books");
  if (books.length) return;
  const now = new Date().toISOString();
  const defaultBook = withSync({ id: id(), name: "个人账本", createdAt: now, updatedAt: now });
  const familyBook = withSync({ id: id(), name: "家庭账本", createdAt: now, updatedAt: now });
  const accounts = ["微信", "支付宝", "银行卡", "现金", "信用卡"].map((name) => withSync({ id: id(), bookId: defaultBook.id, name, note: "", createdAt: now, updatedAt: now }));
  const expenseNames = ["餐饮", "交通", "购物", "住房", "娱乐", "医疗", "学习", "其他"];
  const incomeNames = ["工资", "奖金", "报销", "投资", "其他收入"];
  const categories = [
    ...expenseNames.map((name) => withSync({ id: id(), bookId: defaultBook.id, name, type: "expense", createdAt: now, updatedAt: now })),
    ...incomeNames.map((name) => withSync({ id: id(), bookId: defaultBook.id, name, type: "income", createdAt: now, updatedAt: now }))
  ];
  await put("books", defaultBook);
  await put("books", familyBook);
  for (const account of accounts) await put("accounts", account);
  for (const category of categories) await put("categories", category);
  await put("settings", { key: "currentBookId", value: defaultBook.id });
}

async function loadAll() {
  const [books, accounts, categories, transactions, currentBook] = await Promise.all([
    getAll("books"),
    getAll("accounts"),
    getAll("categories"),
    getAll("transactions"),
    get("settings", "currentBookId")
  ]);
  state.books = books.filter((item) => !item.deletedAt).sort(byName);
  state.accounts = accounts.filter((item) => !item.deletedAt).sort(byName);
  state.categories = categories.filter((item) => !item.deletedAt).sort(byName);
  state.transactions = transactions.filter((item) => !item.deletedAt).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  state.currentBookId = currentBook?.value && state.books.some((book) => book.id === currentBook.value) ? currentBook.value : state.books[0]?.id || "";
  if (state.currentBookId) await put("settings", { key: "currentBookId", value: state.currentBookId });
}

function render() {
  renderBookSelect();
  renderTypeButtons();
  renderSelectors();
  renderDashboard();
  renderTransactions();
  renderManage();
  renderSync();
  renderViews();
}

function renderBookSelect() {
  els.bookSelect.innerHTML = state.books.map((book) => option(book.id, book.name, book.id === state.currentBookId)).join("");
}

function renderTypeButtons() {
  els.expenseMode.classList.toggle("active", state.type === "expense");
  els.incomeMode.classList.toggle("active", state.type === "income");
  els.formTitle.textContent = els.editingId.value ? "编辑记录" : state.type === "expense" ? "新增支出" : "新增收入";
}

function renderSelectors() {
  const accounts = currentAccounts();
  const categories = currentCategories().filter((category) => category.type === state.type);
  if (!accounts.length) {
    const seeded = withSync({ id: id(), bookId: state.currentBookId, name: "默认账户", note: "", createdAt: now(), updatedAt: now() });
    state.accounts.push(seeded);
    put("accounts", seeded);
  }
  if (!categories.length) {
    const seeded = withSync({ id: id(), bookId: state.currentBookId, name: state.type === "expense" ? "其他" : "其他收入", type: state.type, createdAt: now(), updatedAt: now() });
    state.categories.push(seeded);
    put("categories", seeded);
  }
  els.accountInput.innerHTML = currentAccounts().map((item) => option(item.id, item.name)).join("");
  els.categoryInput.innerHTML = currentCategories().filter((item) => item.type === state.type).map((item) => option(item.id, item.name)).join("");
  els.accountFilter.innerHTML = `<option value="all">全部账户</option>${currentAccounts().map((item) => option(item.id, item.name)).join("")}`;
  els.categoryFilter.innerHTML = `<option value="all">全部分类</option>${currentCategories().map((item) => option(item.id, `${item.type === "expense" ? "支出" : "收入"} · ${item.name}`)).join("")}`;
}

function renderDashboard() {
  const picked = els.monthPicker.value || monthKey(new Date());
  els.monthPicker.value = picked;
  const year = picked.slice(0, 4);
  const monthTransactions = currentBookTransactions().filter((item) => item.date.startsWith(picked));
  const yearTransactions = currentBookTransactions().filter((item) => item.date.startsWith(year));
  const monthIncome = sum(monthTransactions, "income");
  const monthExpense = sum(monthTransactions, "expense");
  const yearIncome = sum(yearTransactions, "income");
  const yearExpense = sum(yearTransactions, "expense");
  els.monthIncome.textContent = money(monthIncome);
  els.monthExpense.textContent = money(monthExpense);
  els.monthBalance.textContent = money(monthIncome - monthExpense);
  els.yearBalance.textContent = money(yearIncome - yearExpense);
  drawCategoryChart(monthTransactions);
  drawYearChart(yearTransactions, year);
}

function renderTransactions() {
  const rows = filteredTransactions();
  if (!rows.length) {
    els.transactionRows.innerHTML = `<tr><td class="empty" colspan="7">暂无符合条件的记录</td></tr>`;
    return;
  }
  els.transactionRows.innerHTML = rows.map((item) => {
    const account = findName(state.accounts, item.accountId);
    const category = findName(state.categories, item.categoryId);
    const typeText = item.type === "expense" ? "支出" : "收入";
    const amountClass = item.type === "expense" ? "expense" : "income";
    return `
      <tr>
        <td>${escapeHtml(item.date)}</td>
        <td>${typeText}</td>
        <td>${escapeHtml(category)}</td>
        <td>${escapeHtml(account)}</td>
        <td class="amount ${amountClass}">${item.type === "expense" ? "-" : "+"}${money(item.amount)}</td>
        <td>${escapeHtml(item.note || "")}</td>
        <td>
          <div class="row-actions">
            <button type="button" data-action="edit" data-id="${item.id}">编辑</button>
            <button type="button" data-action="delete" data-id="${item.id}">删除</button>
          </div>
        </td>
      </tr>`;
  }).join("");
  els.transactionRows.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.action === "edit") editTransaction(button.dataset.id);
      if (button.dataset.action === "delete") deleteTransaction(button.dataset.id);
    });
  });
}

function renderManage() {
  els.bookList.innerHTML = state.books.map((book) => pill(book.name, book.id, "books", state.books.length <= 1)).join("");
  els.accountList.innerHTML = currentAccounts().map((account) => pill(`${account.name}${account.note ? ` · ${account.note}` : ""}`, account.id, "accounts", inUse("accountId", account.id))).join("");
  els.categoryList.innerHTML = currentCategories().map((category) => pill(`${category.type === "expense" ? "支出" : "收入"} · ${category.name}`, category.id, "categories", inUse("categoryId", category.id))).join("");
  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteEntity(button.dataset.store, button.dataset.delete));
  });
}

function renderSync() {
  const email = state.session?.user?.email;
  const configured = Boolean(state.supabase);
  const pending = ["books", "accounts", "categories", "transactions"].reduce((count, storeName) => {
    const rows = storeName === "books" ? state.books : storeName === "accounts" ? state.accounts : storeName === "categories" ? state.categories : state.transactions;
    return count + rows.filter((item) => item.syncStatus === "pending").length;
  }, 0);
  if (els.syncStatus) {
    els.syncStatus.textContent = email ? `已登录 ${email}。待同步 ${pending} 条。` : configured ? "Supabase 已配置，请登录后同步。" : "当前仅保存在本机。配置 Supabase 后可多设备同步。";
  }
  if (els.authStatus) {
    els.authStatus.textContent = email ? `已登录：${email}` : "未登录";
  }
  if (els.manualSync) {
    els.manualSync.disabled = !state.supabase || !state.session;
  }
}

function renderViews() {
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === state.view));
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  document.getElementById(`${state.view}View`).classList.add("active");
}

async function saveTransaction(event) {
  event.preventDefault();
  const amount = Number(String(els.amountInput.value).replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) {
    alert("请输入大于 0 的金额");
    return;
  }
  const existing = els.editingId.value ? state.transactions.find((item) => item.id === els.editingId.value) : null;
  const saved = withSync({
    id: existing?.id || id(),
    bookId: state.currentBookId,
    accountId: els.accountInput.value,
    categoryId: els.categoryInput.value,
    type: state.type,
    amount: Math.round(amount * 100) / 100,
    date: els.dateInput.value,
    note: els.noteInput.value,
    createdAt: existing?.createdAt || now(),
    updatedAt: now()
  });
  await put("transactions", saved);
  await loadAll();
  resetForm();
  render();
}

function editTransaction(transactionId) {
  const item = state.transactions.find((entry) => entry.id === transactionId);
  if (!item) return;
  setType(item.type);
  els.editingId.value = item.id;
  els.amountInput.value = item.amount;
  els.dateInput.value = item.date;
  els.accountInput.value = item.accountId;
  els.categoryInput.value = item.categoryId;
  els.noteInput.value = item.note || "";
  state.view = "dashboard";
  renderTypeButtons();
  renderViews();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteTransaction(transactionId) {
  if (!confirm("确定删除这条记录吗？")) return;
  const item = state.transactions.find((entry) => entry.id === transactionId);
  if (!item) return;
  item.deletedAt = now();
  item.updatedAt = now();
  item.syncStatus = "pending";
  await put("transactions", item);
  await loadAll();
  render();
}

async function addEntity(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const name = String(data.get("name") || "").trim();
  if (!name) return;
  const kind = form.dataset.kind;
  const base = withSync({ id: id(), name, createdAt: now(), updatedAt: now() });
  if (kind === "book") {
    await put("books", base);
    state.currentBookId = base.id;
    await put("settings", { key: "currentBookId", value: base.id });
  }
  if (kind === "account") {
    await put("accounts", { ...base, bookId: state.currentBookId, note: String(data.get("note") || "") });
  }
  if (kind === "category") {
    await put("categories", { ...base, bookId: state.currentBookId, type: String(data.get("type")) });
  }
  form.reset();
  await loadAll();
  render();
}

async function deleteEntity(storeName, entityId) {
  if (storeName === "books" && state.books.length <= 1) {
    alert("至少保留一个账本");
    return;
  }
  if (storeName === "books" && state.transactions.some((item) => item.bookId === entityId)) {
    alert("该账本已有交易记录，暂不能删除。");
    return;
  }
  if ((storeName === "accounts" && inUse("accountId", entityId)) || (storeName === "categories" && inUse("categoryId", entityId))) {
    alert("已有交易使用该项目，暂不能删除。");
    return;
  }
  if (!confirm("确定删除吗？")) return;
  const item = await get(storeName, entityId);
  if (!item) return;
  item.deletedAt = now();
  item.updatedAt = now();
  item.syncStatus = "pending";
  await put(storeName, item);
  if (storeName === "books" && state.currentBookId === entityId) {
    const nextBook = state.books.find((book) => book.id !== entityId);
    state.currentBookId = nextBook?.id || "";
    await put("settings", { key: "currentBookId", value: state.currentBookId });
  }
  await loadAll();
  render();
}

function setType(type) {
  state.type = type;
  renderTypeButtons();
  renderSelectors();
}

function applyLaunchShortcut() {
  if (location.hash === "#income") state.type = "income";
  if (location.hash === "#expense") state.type = "expense";
}

function resetForm() {
  els.editingId.value = "";
  els.amountInput.value = "";
  els.dateInput.value = dateKey(new Date());
  els.noteInput.value = "";
  renderTypeButtons();
}

function filteredTransactions() {
  const query = els.searchInput.value.trim().toLowerCase();
  return currentBookTransactions().filter((item) => {
    const account = findName(state.accounts, item.accountId).toLowerCase();
    const category = findName(state.categories, item.categoryId).toLowerCase();
    const text = `${account} ${category} ${item.note || ""}`.toLowerCase();
    const matchesQuery = !query || text.includes(query);
    const matchesType = els.typeFilter.value === "all" || item.type === els.typeFilter.value;
    const matchesAccount = els.accountFilter.value === "all" || item.accountId === els.accountFilter.value;
    const matchesCategory = els.categoryFilter.value === "all" || item.categoryId === els.categoryFilter.value;
    const matchesFrom = !els.fromDate.value || item.date >= els.fromDate.value;
    const matchesTo = !els.toDate.value || item.date <= els.toDate.value;
    return matchesQuery && matchesType && matchesAccount && matchesCategory && matchesFrom && matchesTo;
  });
}

function currentBookTransactions() {
  return state.transactions.filter((item) => item.bookId === state.currentBookId);
}

function currentAccounts() {
  return state.accounts.filter((item) => item.bookId === state.currentBookId);
}

function currentCategories() {
  return state.categories.filter((item) => item.bookId === state.currentBookId);
}

function drawCategoryChart(transactions) {
  const canvas = els.categoryChart;
  const ctx = canvas.getContext("2d");
  clearCanvas(ctx, canvas);
  const totals = groupByCategory(transactions.filter((item) => item.type === "expense"));
  const entries = Object.entries(totals);
  if (!entries.length) {
    drawEmpty(ctx, canvas, "本月还没有支出记录");
    els.categoryLegend.innerHTML = "";
    return;
  }
  const total = entries.reduce((acc, [, amount]) => acc + amount, 0);
  let start = -Math.PI / 2;
  entries.forEach(([categoryId, amount], index) => {
    const slice = (amount / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(180, 160);
    ctx.arc(180, 160, 116, start, start + slice);
    ctx.closePath();
    ctx.fillStyle = CHART_COLORS[index % CHART_COLORS.length];
    ctx.fill();
    start += slice;
  });
  ctx.fillStyle = "#17211f";
  ctx.font = "700 24px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(money(total), 180, 168);
  els.categoryLegend.innerHTML = entries.map(([categoryId, amount], index) => {
    const label = findName(state.categories, categoryId);
    return `<span><i class="dot" style="background:${CHART_COLORS[index % CHART_COLORS.length]}"></i>${escapeHtml(label)} ${money(amount)}</span>`;
  }).join("");
}

function drawYearChart(transactions, year) {
  const canvas = els.yearChart;
  const ctx = canvas.getContext("2d");
  clearCanvas(ctx, canvas);
  const months = Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
  const income = months.map((key) => sum(transactions.filter((item) => item.date.startsWith(key)), "income"));
  const expense = months.map((key) => sum(transactions.filter((item) => item.date.startsWith(key)), "expense"));
  const max = Math.max(100, ...income, ...expense);
  const left = 44;
  const bottom = 278;
  const width = 552;
  const height = 220;
  ctx.strokeStyle = "#d8dfdc";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, 34);
  ctx.lineTo(left, bottom);
  ctx.lineTo(left + width, bottom);
  ctx.stroke();
  months.forEach((key, index) => {
    const x = left + (index / 11) * width;
    ctx.fillStyle = "#62706d";
    ctx.font = "11px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(String(index + 1), x, 302);
  });
  drawLine(ctx, income, max, left, bottom, width, height, "#1f7a6b");
  drawLine(ctx, expense, max, left, bottom, width, height, "#bd4b4b");
  ctx.textAlign = "left";
  ctx.fillStyle = "#1f7a6b";
  ctx.fillText("收入", left + 10, 24);
  ctx.fillStyle = "#bd4b4b";
  ctx.fillText("支出", left + 70, 24);
}

function drawLine(ctx, values, max, left, bottom, width, height, color) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  values.forEach((value, index) => {
    const x = left + (index / 11) * width;
    const y = bottom - (value / max) * height;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  values.forEach((value, index) => {
    const x = left + (index / 11) * width;
    const y = bottom - (value / max) * height;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  });
}

function clearCanvas(ctx, canvas) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawEmpty(ctx, canvas, text) {
  ctx.fillStyle = "#62706d";
  ctx.font = "16px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
}

function groupByCategory(transactions) {
  return transactions.reduce((acc, item) => {
    acc[item.categoryId] = (acc[item.categoryId] || 0) + item.amount;
    return acc;
  }, {});
}

function exportCsv(rows, name) {
  const headers = ["账本", "日期", "类型", "分类", "账户", "金额", "备注", "创建时间", "更新时间"];
  const lines = rows.map((item) => [
    findName(state.books, item.bookId),
    item.date,
    item.type === "expense" ? "支出" : "收入",
    findName(state.categories, item.categoryId),
    findName(state.accounts, item.accountId),
    item.amount,
    item.note || "",
    item.createdAt,
    item.updatedAt
  ]);
  download(`${name}-${dateKey(new Date())}.csv`, [headers, ...lines].map((row) => row.map(csvCell).join(",")).join("\n"), "text/csv;charset=utf-8");
}

async function backupJson() {
  const data = {};
  for (const storeName of STORE_NAMES) data[storeName] = await getAll(storeName);
  data.meta = { app: "personal-ledger", version: 1, exportedAt: now() };
  download(`ledger-backup-${dateKey(new Date())}.json`, JSON.stringify(data, null, 2), "application/json");
}

async function restoreJson(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!confirm("恢复备份会覆盖当前本地数据，确定继续吗？")) return;
  const data = JSON.parse(await file.text());
  for (const storeName of STORE_NAMES) await clearStore(storeName);
  for (const storeName of STORE_NAMES) {
    for (const item of data[storeName] || []) await put(storeName, item);
  }
  await loadAll();
  render();
  event.target.value = "";
}

async function importCsv(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length < 2) throw new Error("CSV 没有可导入的数据");
    const header = rows[0].map(normalizeHeader);
    const imported = [];
    let skipped = 0;
    const accountCache = new Map(currentAccounts().map((item) => [item.name, item]));
    const categoryCache = new Map(currentCategories().map((item) => [`${item.type}:${item.name}`, item]));
    for (const rawRow of rows.slice(1)) {
      if (!rawRow.some((cell) => String(cell || "").trim())) continue;
      const row = Object.fromEntries(header.map((key, index) => [key, rawRow[index] || ""]));
      const normalized = normalizeCsvTransaction(row);
      if (!normalized) {
        skipped += 1;
        continue;
      }
      const account = await ensureImportedAccount(normalized.accountName, accountCache);
      const category = await ensureImportedCategory(normalized.categoryName, normalized.type, categoryCache);
      imported.push(withSync({
        id: id(),
        bookId: state.currentBookId,
        accountId: account.id,
        categoryId: category.id,
        type: normalized.type,
        amount: normalized.amount,
        date: normalized.date,
        note: normalized.note,
        createdAt: now(),
        updatedAt: now()
      }));
    }
    if (!imported.length) throw new Error("没有识别到有效交易。请确认表头包含日期、金额等字段。");
    if (!confirm(`将导入 ${imported.length} 条记录到当前账本，跳过 ${skipped} 行。继续吗？`)) return;
    for (const item of imported) await put("transactions", item);
    await loadAll();
    render();
    if (els.importSummary) els.importSummary.textContent = `已导入 ${imported.length} 条记录，跳过 ${skipped} 行。`;
    syncNow({ manual: false });
  } catch (error) {
    alert(`CSV 导入失败：${error.message}`);
  } finally {
    event.target.value = "";
  }
}

function parseCsv(text) {
  const clean = text.replace(/^\ufeff/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index];
    const next = clean[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows.filter((items) => items.some((item) => String(item || "").trim()));
}

function normalizeHeader(value) {
  const key = String(value || "").trim().toLowerCase();
  const map = {
    "账本": "book",
    "日期": "date",
    "交易日期": "date",
    "时间": "date",
    "类型": "type",
    "收支": "type",
    "分类": "category",
    "账户": "account",
    "支付账户": "account",
    "金额": "amount",
    "收入": "incomeAmount",
    "支出": "expenseAmount",
    "备注": "note",
    "说明": "note",
    "date": "date",
    "type": "type",
    "category": "category",
    "account": "account",
    "amount": "amount",
    "note": "note"
  };
  return map[key] || key;
}

function normalizeCsvTransaction(row) {
  const date = normalizeDate(row.date);
  const note = String(row.note || "").trim();
  let amount = parseAmount(row.amount);
  let type = normalizeType(row.type);
  const incomeAmount = parseAmount(row.incomeAmount);
  const expenseAmount = parseAmount(row.expenseAmount);
  if (!amount && incomeAmount) {
    amount = incomeAmount;
    type = "income";
  }
  if (!amount && expenseAmount) {
    amount = expenseAmount;
    type = "expense";
  }
  if (!type && amount < 0) type = "expense";
  if (!type) type = "expense";
  amount = Math.abs(amount);
  if (!date || !amount) return null;
  return {
    date,
    type,
    amount: Math.round(amount * 100) / 100,
    accountName: String(row.account || "默认账户").trim() || "默认账户",
    categoryName: String(row.category || (type === "income" ? "其他收入" : "其他")).trim() || (type === "income" ? "其他收入" : "其他"),
    note
  };
}

function normalizeType(value) {
  const text = String(value || "").trim().toLowerCase();
  if (["收入", "入账", "income", "in"].includes(text)) return "income";
  if (["支出", "出账", "expense", "out"].includes(text)) return "expense";
  return "";
}

function parseAmount(value) {
  const text = String(value || "").replaceAll(",", "").replace(/[¥￥\s]/g, "");
  const amount = Number(text);
  return Number.isFinite(amount) ? amount : 0;
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const match = text.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : dateKey(parsed);
}

async function ensureImportedAccount(name, cache) {
  if (cache.has(name)) return cache.get(name);
  const account = withSync({ id: id(), bookId: state.currentBookId, name, note: "CSV 导入创建", createdAt: now(), updatedAt: now() });
  await put("accounts", account);
  cache.set(name, account);
  return account;
}

async function ensureImportedCategory(name, type, cache) {
  const key = `${type}:${name}`;
  if (cache.has(key)) return cache.get(key);
  const category = withSync({ id: id(), bookId: state.currentBookId, name, type, createdAt: now(), updatedAt: now() });
  await put("categories", category);
  cache.set(key, category);
  return category;
}

async function initSupabase() {
  const [urlSetting, keySetting] = await Promise.all([
    get("settings", "supabaseUrl"),
    get("settings", "supabaseAnonKey")
  ]);
  const supabaseUrl = urlSetting?.value || "";
  const supabaseAnonKey = keySetting?.value || "";
  if (els.supabaseUrl) els.supabaseUrl.value = supabaseUrl;
  if (els.supabaseAnonKey) els.supabaseAnonKey.value = supabaseAnonKey;
  if (!supabaseUrl || !supabaseAnonKey) return;
  try {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    state.supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data } = await state.supabase.auth.getSession();
    state.session = data.session;
    state.supabase.auth.onAuthStateChange((_event, session) => {
      state.session = session;
      renderSync();
      if (session) syncNow({ manual: false });
    });
  } catch (error) {
    setSyncStatus(`Supabase 初始化失败：${error.message}`);
  }
}

async function saveSupabaseConfig(event) {
  event.preventDefault();
  await put("settings", { key: "supabaseUrl", value: els.supabaseUrl.value.trim() });
  await put("settings", { key: "supabaseAnonKey", value: els.supabaseAnonKey.value.trim() });
  state.supabase = null;
  state.session = null;
  await initSupabase();
  renderSync();
  alert("Supabase 配置已保存");
}

async function handleAuth(event) {
  event.preventDefault();
  if (!state.supabase) {
    alert("请先保存 Supabase 配置");
    return;
  }
  const action = event.submitter?.dataset.authAction;
  const email = els.authEmail.value.trim();
  const password = els.authPassword.value;
  if (!email || !password) {
    alert("请输入邮箱和密码");
    return;
  }
  const request = action === "signup"
    ? state.supabase.auth.signUp({ email, password })
    : state.supabase.auth.signInWithPassword({ email, password });
  const { data, error } = await request;
  if (error) {
    alert(error.message);
    return;
  }
  state.session = data.session || state.session;
  renderSync();
  if (action === "signup" && !data.session) {
    alert("注册成功。请查看邮箱确认链接后再登录。");
    return;
  }
  await syncNow({ manual: true });
}

async function signOut() {
  if (!state.supabase) return;
  await state.supabase.auth.signOut();
  state.session = null;
  renderSync();
}

function startAutoSync() {
  window.addEventListener("online", () => syncNow({ manual: false }));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) syncNow({ manual: false });
  });
  state.syncTimer = window.setInterval(() => syncNow({ manual: false }), 60000);
  syncNow({ manual: false });
}

async function syncNow({ manual }) {
  if (!state.supabase || !state.session) return;
  try {
    setSyncStatus("正在同步...");
    await discardStarterDataIfRemoteExists();
    await pullRemote();
    await uploadPending();
    await pullRemote();
    await put("sync_state", { id: "supabase", provider: "supabase", lastSyncAt: now(), status: "ok" });
    await loadAll();
    render();
    setSyncStatus(`同步完成：${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`);
  } catch (error) {
    setSyncStatus(`同步失败：${error.message}`);
    if (manual) alert(`同步失败：${error.message}`);
  }
}

async function discardStarterDataIfRemoteExists() {
  const [{ data, error }, localTransactions, localBooks, localAccounts, localCategories] = await Promise.all([
    state.supabase.from("books").select("id").limit(1),
    getAll("transactions"),
    getAll("books"),
    getAll("accounts"),
    getAll("categories")
  ]);
  if (error) throw error;
  const remoteHasData = Boolean(data?.length);
  const localHasUserData = localTransactions.length > 0 || [...localBooks, ...localAccounts, ...localCategories].some((item) => item.syncStatus === "synced");
  if (!remoteHasData || localHasUserData) return;
  await clearStore("books");
  await clearStore("accounts");
  await clearStore("categories");
}

async function uploadPending() {
  for (const storeName of ["books", "accounts", "categories", "transactions"]) {
    const rows = (await getAll(storeName)).filter((item) => item.syncStatus === "pending");
    if (!rows.length) continue;
    const payload = rows.map((item) => toRemote(storeName, item, state.session.user.id));
    const { error } = await state.supabase.from(storeName).upsert(payload, { onConflict: "id" });
    if (error) throw error;
    for (const item of rows) {
      await put(storeName, { ...item, syncStatus: "synced", remoteId: item.id, syncProvider: "supabase" });
    }
  }
}

async function pullRemote() {
  for (const storeName of ["books", "accounts", "categories", "transactions"]) {
    const { data, error } = await state.supabase.from(storeName).select("*");
    if (error) throw error;
    const localRows = await getAll(storeName);
    const localById = new Map(localRows.map((item) => [item.id, item]));
    for (const remote of data || []) {
      const incoming = fromRemote(storeName, remote);
      const local = localById.get(incoming.id);
      const localDirty = local?.syncStatus === "pending";
      const remoteIsNewer = !local || String(incoming.updatedAt || "") >= String(local.updatedAt || "");
      if (!localDirty || remoteIsNewer) await put(storeName, incoming);
    }
  }
}

function toRemote(storeName, item, userId) {
  const base = {
    id: item.id,
    user_id: userId,
    name: item.name,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
    deleted_at: item.deletedAt || null
  };
  if (storeName === "books") return base;
  if (storeName === "accounts") return { ...base, book_id: item.bookId, note: item.note || "" };
  if (storeName === "categories") return { ...base, book_id: item.bookId, type: item.type };
  return {
    id: item.id,
    user_id: userId,
    book_id: item.bookId,
    account_id: item.accountId,
    category_id: item.categoryId,
    type: item.type,
    amount: item.amount,
    date: item.date,
    note: item.note || "",
    created_at: item.createdAt,
    updated_at: item.updatedAt,
    deleted_at: item.deletedAt || null
  };
}

function fromRemote(storeName, row) {
  const base = withSync({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at || null
  });
  base.syncStatus = "synced";
  base.remoteId = row.id;
  base.syncProvider = "supabase";
  if (storeName === "books") return base;
  if (storeName === "accounts") return { ...base, bookId: row.book_id, note: row.note || "" };
  if (storeName === "categories") return { ...base, bookId: row.book_id, type: row.type };
  return {
    id: row.id,
    bookId: row.book_id,
    accountId: row.account_id,
    categoryId: row.category_id,
    type: row.type,
    amount: Number(row.amount),
    date: row.date,
    note: row.note || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at || null,
    syncStatus: "synced",
    remoteId: row.id,
    syncProvider: "supabase"
  };
}

function setSyncStatus(message) {
  if (els.syncStatus) els.syncStatus.textContent = message;
}

function download(filename, content, mimeType) {
  const blob = new Blob(["\ufeff", content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

function option(value, label, selected = false) {
  return `<option value="${escapeHtml(value)}"${selected ? " selected" : ""}>${escapeHtml(label)}</option>`;
}

function pill(label, idValue, storeName, disabled) {
  return `<span class="pill">${escapeHtml(label)}${disabled ? "" : `<button type="button" title="删除" data-store="${storeName}" data-delete="${idValue}">×</button>`}</span>`;
}

function inUse(field, idValue) {
  return currentBookTransactions().some((item) => item[field] === idValue);
}

function sum(rows, type) {
  return rows.filter((item) => item.type === type).reduce((acc, item) => acc + item.amount, 0);
}

function findName(collection, idValue) {
  return collection.find((item) => item.id === idValue)?.name || "未命名";
}

function byName(a, b) {
  return a.name.localeCompare(b.name, "zh-Hans-CN");
}

function withSync(value) {
  return {
    ...value,
    syncStatus: "pending",
    remoteId: value.remoteId || null,
    syncProvider: value.syncProvider || null
  };
}

function id() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function now() {
  return new Date().toISOString();
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthKey(date) {
  return dateKey(date).slice(0, 7);
}

function money(value) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(value);
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
