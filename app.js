const storageKey = "zfl16-movable-type-workshop";

const starterInventory = [
  { id: crypto.randomUUID(), char: "山", style: "宋体旧字", size: 30, quantity: 4, wear: "微磨" },
  { id: crypto.randomUUID(), char: "月", style: "宋体旧字", size: 30, quantity: 3, wear: "旧痕" },
  { id: crypto.randomUUID(), char: "风", style: "楷体木刻", size: 28, quantity: 2, wear: "微磨" },
  { id: crypto.randomUUID(), char: "花", style: "楷体木刻", size: 28, quantity: 2, wear: "新" },
  { id: crypto.randomUUID(), char: "茶", style: "黑体铅字", size: 24, quantity: 3, wear: "旧痕" },
  { id: crypto.randomUUID(), char: "雨", style: "仿宋细字", size: 22, quantity: 4, wear: "新" }
];

const defaultState = {
  inventory: starterInventory,
  selectedTypeId: starterInventory[0].id,
  placements: [],
  splitOrder: null,
  drafts: [],
  settings: {
    paperSize: "postcard",
    flowMode: "horizontal",
    gridGap: 8,
    workTitle: "晚风小笺"
  }
};

let state = loadState();

// 页面级临时提示，不写入本地记录
let splitAttempt = null; // 被碍事格子挡住的开单请求 { direction, position }
let splitStockRefusal = null; // 因合计用字超库存被拒绝开单的字模清单
let stageNotice = null; // 版面旁的页面提示 { kind: "warn" | "info", text }

const els = {
  paperSize: document.querySelector("#paperSize"),
  flowMode: document.querySelector("#flowMode"),
  gridGap: document.querySelector("#gridGap"),
  workTitle: document.querySelector("#workTitle"),
  stage: document.querySelector("#stage"),
  typeList: document.querySelector("#typeList"),
  typeForm: document.querySelector("#typeForm"),
  charInput: document.querySelector("#charInput"),
  styleInput: document.querySelector("#styleInput"),
  sizeInput: document.querySelector("#sizeInput"),
  quantityInput: document.querySelector("#quantityInput"),
  wearInput: document.querySelector("#wearInput"),
  inventorySearch: document.querySelector("#inventorySearch"),
  styleFilter: document.querySelector("#styleFilter"),
  selectedTypeLabel: document.querySelector("#selectedTypeLabel"),
  shortageBadge: document.querySelector("#shortageBadge"),
  usageList: document.querySelector("#usageList"),
  draftList: document.querySelector("#draftList"),
  placedCount: document.querySelector("#placedCount"),
  inventoryCount: document.querySelector("#inventoryCount"),
  saveDraftBtn: document.querySelector("#saveDraftBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  clearBoardBtn: document.querySelector("#clearBoardBtn"),
  splitDirection: document.querySelector("#splitDirection"),
  splitPosition: document.querySelector("#splitPosition"),
  splitPositionName: document.querySelector("#splitPositionName"),
  splitCreateBtn: document.querySelector("#splitCreateBtn"),
  splitInfo: document.querySelector("#splitInfo"),
  plateLegend: document.querySelector("#plateLegend"),
  stageHint: document.querySelector("#stageHint"),
  splitStock: document.querySelector("#splitStock")
};

function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return structuredClone(defaultState);
  try {
    const parsed = JSON.parse(saved);
    return {
      ...structuredClone(defaultState),
      ...parsed,
      settings: { ...defaultState.settings, ...parsed.settings }
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function getGrid() {
  const size = state.settings.paperSize;
  if (size === "bookmark") return { cols: 7, rows: 18 };
  if (size === "square") return { cols: 12, rows: 12 };
  return { cols: 16, rows: 10 };
}

function placementKey(row, col) {
  return `${row}:${col}`;
}

function getSelectedType() {
  return state.inventory.find((item) => item.id === state.selectedTypeId) || null;
}

function getUsage() {
  return state.placements.reduce((acc, placement) => {
    acc[placement.typeId] = (acc[placement.typeId] || 0) + 1;
    return acc;
  }, {});
}

function getPlateOfCell(row, col) {
  const order = state.splitOrder;
  if (!order) return null;
  const index = order.direction === "horizontal" ? row : col;
  if (index === order.position) return "cut";
  return index < order.position ? "a" : "b";
}

function findBlockedCells(direction, position) {
  return state.placements.filter((item) => (direction === "horizontal" ? item.row : item.col) === position);
}

function getSplitUsage() {
  const usage = { a: {}, b: {} };
  state.placements.forEach((placement) => {
    const plate = getPlateOfCell(placement.row, placement.col);
    if (plate === "a" || plate === "b") {
      usage[plate][placement.typeId] = (usage[plate][placement.typeId] || 0) + 1;
    }
  });
  return usage;
}

function describeCut(order = state.splitOrder) {
  const name = order.direction === "horizontal" ? "横切" : "竖切";
  const unit = order.direction === "horizontal" ? "行" : "列";
  return `${name} · 刀口第${order.position + 1}${unit}`;
}

function describePlateRange(plate) {
  const { cols, rows } = getGrid();
  const { direction, position } = state.splitOrder;
  if (direction === "horizontal") {
    return plate === "a" ? `上 · 第1–${position}行` : `下 · 第${position + 2}–${rows}行`;
  }
  return plate === "a" ? `左 · 第1–${position}列` : `右 · 第${position + 2}–${cols}列`;
}

function resetSplitTransients() {
  splitAttempt = null;
  splitStockRefusal = null;
  stageNotice = null;
}

function reconcileSplitTransients() {
  if (splitAttempt && findBlockedCells(splitAttempt.direction, splitAttempt.position).length === 0) {
    splitAttempt = null;
    if (stageNotice && stageNotice.kind === "warn") {
      stageNotice = { kind: "info", text: "碍事格子已清空，可以重新开单。" };
    }
  }
  if (splitStockRefusal) {
    const usage = getUsage();
    const stillOver = state.inventory.some((item) => (usage[item.id] || 0) > item.quantity);
    if (!stillOver) splitStockRefusal = null;
  }
}

function createSplitOrder() {
  if (state.splitOrder) return;
  resetSplitTransients();
  const direction = els.splitDirection.value;
  const { cols, rows } = getGrid();
  const limit = direction === "horizontal" ? rows : cols;
  const unit = direction === "horizontal" ? "行" : "列";
  const input = Number(els.splitPosition.value);
  const position = input - 1;
  if (!Number.isInteger(input) || position < 1 || position > limit - 2) {
    stageNotice = { kind: "warn", text: `分隔${unit}请填 2–${limit - 1} 的整数，刀口两侧都要留出版面。` };
    renderAll();
    return;
  }
  const blocked = findBlockedCells(direction, position);
  if (blocked.length) {
    splitAttempt = { direction, position };
    const names = blocked
      .slice(0, 4)
      .map((item) => `第${item.row + 1}行第${item.col + 1}列`)
      .join("、");
    stageNotice = {
      kind: "warn",
      text: `刀口第${input}${unit}有 ${blocked.length} 格落字碍事（${names}${blocked.length > 4 ? " 等" : ""}），已在版面标红，先不开单。`
    };
    renderAll();
    return;
  }
  const usage = getUsage();
  const over = state.inventory.filter((item) => (usage[item.id] || 0) > item.quantity);
  if (over.length) {
    splitStockRefusal = over.map((item) => ({ ...item, used: usage[item.id] }));
    renderAll();
    return;
  }
  state.splitOrder = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    direction,
    position,
    plates: { a: { status: "ok" }, b: { status: "ok" } }
  };
  stageNotice = { kind: "info", text: `已开单：${describeCut()}，甲、乙两版可分印，合版预览见下方版面。` };
  renderAll();
}

function renderSettings() {
  els.paperSize.value = state.settings.paperSize;
  els.flowMode.value = state.settings.flowMode;
  els.gridGap.value = state.settings.gridGap;
  els.workTitle.value = state.settings.workTitle;
}

function renderStyleFilter() {
  const current = els.styleFilter.value || "all";
  const styles = [...new Set(state.inventory.map((item) => item.style))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  els.styleFilter.innerHTML = `<option value="all">全部风格</option>${styles
    .map((style) => `<option value="${escapeHtml(style)}">${escapeHtml(style)}</option>`)
    .join("")}`;
  els.styleFilter.value = styles.includes(current) ? current : "all";
}

function renderInventory() {
  const keyword = els.inventorySearch.value.trim();
  const style = els.styleFilter.value;
  const usage = getUsage();
  const items = state.inventory.filter((item) => {
    const matchesKeyword = !keyword || `${item.char}${item.style}${item.wear}`.includes(keyword);
    const matchesStyle = style === "all" || item.style === style;
    return matchesKeyword && matchesStyle;
  });

  els.inventoryCount.textContent = `${state.inventory.length}枚字模`;
  els.typeList.innerHTML = items
    .map((item) => {
      const used = usage[item.id] || 0;
      const selected = item.id === state.selectedTypeId ? "selected" : "";
      return `
        <article class="type-card ${selected}" draggable="true" data-type-id="${item.id}">
          <div class="glyph" style="font-size:${Math.min(item.size, 36)}px">${escapeHtml(item.char)}</div>
          <div class="type-meta">
            <strong>${escapeHtml(item.char)} · ${escapeHtml(item.style)}</strong>
            <span>${item.size}px · ${escapeHtml(item.wear)} · 已用${used}/${item.quantity}</span>
          </div>
          <button class="mini-btn" title="删除字模" data-delete-type="${item.id}" type="button">×</button>
        </article>
      `;
    })
    .join("");
}

function renderStage() {
  const { cols, rows } = getGrid();
  const map = new Map(state.placements.map((item) => [placementKey(item.row, item.col), item]));
  const blockedKeys = new Set(
    splitAttempt
      ? findBlockedCells(splitAttempt.direction, splitAttempt.position).map((item) => placementKey(item.row, item.col))
      : []
  );
  els.stage.className = `stage ${state.settings.paperSize}`;
  els.stage.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  els.stage.style.gridTemplateRows = `repeat(${rows}, minmax(0, 1fr))`;
  els.stage.style.gap = `${state.settings.gridGap}px`;
  const cells = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const placement = map.get(placementKey(row, col));
      const type = placement ? state.inventory.find((item) => item.id === placement.typeId) : null;
      const classes = ["cell"];
      if (type) classes.push("used");
      if (state.settings.flowMode === "vertical") classes.push("vertical");
      if (blockedKeys.has(placementKey(row, col))) classes.push("blocked");
      const plate = getPlateOfCell(row, col);
      if (plate === "cut") classes.push("cut");
      if (plate === "a") classes.push("plate-a");
      if (plate === "b") classes.push("plate-b");
      const label = plate === "cut" ? `刀口第${row + 1}行第${col + 1}列，不可落字` : `第${row + 1}行第${col + 1}列`;
      cells.push(`
        <button class="${classes.join(" ")}" data-row="${row}" data-col="${col}" type="button" aria-label="${label}">
          ${type ? escapeHtml(type.char) : plate === "cut" ? "✂" : ""}
        </button>
      `);
    }
  }
  els.stage.innerHTML = cells.join("");
}

function renderUsage() {
  const usage = getUsage();
  const entries = state.inventory.filter((item) => usage[item.id]);
  els.placedCount.textContent = `${state.placements.length}个落字`;

  const shortages = entries.filter((item) => usage[item.id] > item.quantity);
  els.shortageBadge.textContent = shortages.length ? `${shortages.length}处超量` : "数量充足";
  els.shortageBadge.className = `badge ${shortages.length ? "warn" : "ok"}`;

  const selectedType = getSelectedType();
  els.selectedTypeLabel.textContent = selectedType ? `当前：${selectedType.char} · ${selectedType.style}` : "未选择字模";

  els.usageList.innerHTML =
    entries
      .map((item) => {
        const used = usage[item.id];
        const warn = used > item.quantity ? "warn" : "";
        return `
          <div class="usage-item ${warn}">
            <strong>${escapeHtml(item.char)} ${escapeHtml(item.style)}</strong>
            <span>${used}/${item.quantity}</span>
          </div>
        `;
      })
      .join("") || `<p class="empty">还没有落字。</p>`;
}

function renderDrafts() {
  els.draftList.innerHTML =
    state.drafts
      .map(
        (draft) => `
          <article class="draft-item">
            <strong>${escapeHtml(draft.title)}</strong>
            <span>${draft.placements.length}个落字 · ${new Date(draft.savedAt).toLocaleString("zh-CN")}</span>
            <div class="draft-actions">
              <button type="button" data-load-draft="${draft.id}">载入</button>
              <button type="button" data-delete-draft="${draft.id}">删除</button>
            </div>
          </article>
        `
      )
      .join("") || `<p class="empty">还没有保存草稿。</p>`;
}

function renderSplitControls() {
  const { cols, rows } = getGrid();
  const horizontal = els.splitDirection.value === "horizontal";
  const maxPosition = (horizontal ? rows : cols) - 1;
  els.splitPositionName.textContent = horizontal ? "分隔行" : "分隔列";
  els.splitPosition.min = 2;
  els.splitPosition.max = maxPosition;
  els.splitPosition.placeholder = `2–${maxPosition}`;
  const active = Boolean(state.splitOrder);
  els.splitDirection.disabled = active;
  els.splitPosition.disabled = active;
  els.splitCreateBtn.disabled = active;
  els.splitCreateBtn.textContent = active ? "已开单" : "开单";
}

function renderSplitInfo() {
  const order = state.splitOrder;
  if (!order) {
    els.splitInfo.hidden = true;
    els.splitInfo.innerHTML = "";
    return;
  }
  const usage = getSplitUsage();
  const countOf = (plate) => Object.values(usage[plate]).reduce((sum, count) => sum + count, 0);
  els.splitInfo.hidden = false;
  els.splitInfo.innerHTML = `
    <div class="split-order-head">
      <div>
        <strong>拼版分单 · ${describeCut()}</strong>
        <span>开单时间 ${new Date(order.createdAt).toLocaleString("zh-CN")} · 合版预览按原坐标拼回整张，改动任一小版，另一张自动标记待复核。</span>
      </div>
      <button type="button" data-cancel-split>撤销分单</button>
    </div>
    <div class="plate-cards">
      ${renderPlateCard("a", "甲版", countOf("a"))}
      ${renderPlateCard("b", "乙版", countOf("b"))}
    </div>
  `;
}

function renderPlateCard(plate, name, placedCount) {
  const review = state.splitOrder.plates[plate].status === "review";
  return `
    <article class="plate-card ${review ? "review" : ""}">
      <header>
        <strong>${name} · ${describePlateRange(plate)}</strong>
        <span class="tag ${review ? "review" : ""}">${review ? "待复核" : "已核对"}</span>
      </header>
      ${renderMiniGrid(plate)}
      <footer>
        <span>${placedCount}个落字</span>
        <button type="button" data-review-plate="${plate}" ${review ? "" : "disabled"}>标记已复核</button>
      </footer>
    </article>
  `;
}

function renderMiniGrid(plate) {
  const { cols, rows } = getGrid();
  const { direction, position } = state.splitOrder;
  const range =
    direction === "horizontal"
      ? { r0: plate === "a" ? 0 : position + 1, r1: plate === "a" ? position - 1 : rows - 1, c0: 0, c1: cols - 1 }
      : { r0: 0, r1: rows - 1, c0: plate === "a" ? 0 : position + 1, c1: plate === "a" ? position - 1 : cols - 1 };
  const map = new Map(state.placements.map((item) => [placementKey(item.row, item.col), item]));
  const cells = [];
  for (let row = range.r0; row <= range.r1; row += 1) {
    for (let col = range.c0; col <= range.c1; col += 1) {
      const placement = map.get(placementKey(row, col));
      const type = placement ? state.inventory.find((item) => item.id === placement.typeId) : null;
      cells.push(`<span class="mini-cell ${type ? "used" : ""}">${type ? escapeHtml(type.char) : ""}</span>`);
    }
  }
  const colCount = range.c1 - range.c0 + 1;
  return `<div class="mini-grid" style="grid-template-columns:repeat(${colCount}, 18px)">${cells.join("")}</div>`;
}

function renderSplitStock() {
  if (splitStockRefusal) {
    els.splitStock.innerHTML = `
      <p class="refusal">已拒绝开单：两版合计用字超出库存，请先调整。</p>
      ${splitStockRefusal
        .map(
          (item) => `
            <div class="stock-row warn">
              <strong>${escapeHtml(item.char)} ${escapeHtml(item.style)}</strong>
              <span class="breakdown">合计 ${item.used} / 库存 ${item.quantity}</span>
            </div>
          `
        )
        .join("")}
    `;
    return;
  }
  if (!state.splitOrder) {
    els.splitStock.innerHTML = `<p class="empty">开单后在此核对甲、乙两版的合计用字。</p>`;
    return;
  }
  const usage = getSplitUsage();
  const typeIds = [...new Set([...Object.keys(usage.a), ...Object.keys(usage.b)])];
  const rowsHtml = typeIds
    .map((typeId) => {
      const item = state.inventory.find((entry) => entry.id === typeId);
      if (!item) return "";
      const a = usage.a[typeId] || 0;
      const b = usage.b[typeId] || 0;
      const total = a + b;
      return `
        <div class="stock-row ${total > item.quantity ? "warn" : ""}">
          <strong>${escapeHtml(item.char)} ${escapeHtml(item.style)}</strong>
          <span class="breakdown">甲${a} + 乙${b} = ${total} / 库存 ${item.quantity}</span>
        </div>
      `;
    })
    .join("");
  const over = typeIds.some((typeId) => {
    const item = state.inventory.find((entry) => entry.id === typeId);
    return item && (usage.a[typeId] || 0) + (usage.b[typeId] || 0) > item.quantity;
  });
  const conclusion = typeIds.length
    ? `<p class="conclusion ${over ? "warn" : "ok"}">${over ? "合计用量超出库存，请调整后再交付代印。" : "两版合计用字未超库存，可交付代印。"}</p>`
    : `<p class="empty">两版都还没有落字。</p>`;
  els.splitStock.innerHTML = conclusion + rowsHtml;
}

function renderStageHint() {
  if (stageNotice) {
    els.stageHint.hidden = false;
    els.stageHint.className = `stage-hint ${stageNotice.kind}`;
    els.stageHint.textContent = stageNotice.text;
  } else {
    els.stageHint.hidden = true;
    els.stageHint.textContent = "";
  }
  if (!state.splitOrder) {
    els.plateLegend.hidden = true;
    els.plateLegend.innerHTML = "";
    return;
  }
  els.plateLegend.hidden = false;
  els.plateLegend.innerHTML = `
    <span>合版预览 · 按原坐标拼回整张</span>
    <span class="legend-key"><i class="legend-swatch a"></i>甲版</span>
    <span class="legend-key"><i class="legend-swatch b"></i>乙版</span>
    <span class="legend-key"><i class="legend-swatch cut"></i>刀口</span>
  `;
}

function renderAll() {
  reconcileSplitTransients();
  saveState();
  renderSettings();
  renderSplitControls();
  renderStyleFilter();
  renderInventory();
  renderStage();
  renderUsage();
  renderSplitInfo();
  renderSplitStock();
  renderStageHint();
  renderDrafts();
}

function placeType(row, col, typeId = state.selectedTypeId) {
  if (!typeId) return;
  const order = state.splitOrder;
  const plate = getPlateOfCell(row, col);
  if (order && plate === "cut") {
    stageNotice = { kind: "warn", text: "刀口不可落字，如需挪动刀口请先撤销分单。" };
    renderAll();
    return;
  }
  const existingIndex = state.placements.findIndex((item) => item.row === row && item.col === col);
  if (existingIndex >= 0) {
    if (state.placements[existingIndex].typeId === typeId) {
      state.placements.splice(existingIndex, 1);
    } else {
      state.placements[existingIndex].typeId = typeId;
    }
  } else {
    state.placements.push({ row, col, typeId });
  }
  if (order && plate === "a") order.plates.b.status = "review";
  if (order && plate === "b") order.plates.a.status = "review";
  if (stageNotice && stageNotice.kind === "warn" && !splitAttempt) stageNotice = null;
  renderAll();
}

function addType(event) {
  event.preventDefault();
  const item = {
    id: crypto.randomUUID(),
    char: els.charInput.value.trim(),
    style: els.styleInput.value.trim(),
    size: Number(els.sizeInput.value),
    quantity: Number(els.quantityInput.value),
    wear: els.wearInput.value
  };
  if (!item.char || !item.style) return;
  state.inventory.unshift(item);
  state.selectedTypeId = item.id;
  els.typeForm.reset();
  els.sizeInput.value = 24;
  els.quantityInput.value = 3;
  renderAll();
}

function saveDraft() {
  const title = state.settings.workTitle.trim() || "未命名作品";
  state.drafts.unshift({
    id: crypto.randomUUID(),
    title,
    settings: structuredClone(state.settings),
    placements: structuredClone(state.placements),
    savedAt: new Date().toISOString()
  });
  state.drafts = state.drafts.slice(0, 8);
  renderAll();
}

function exportPreview() {
  const { cols, rows } = getGrid();
  const cell = state.settings.paperSize === "bookmark" ? 44 : 56;
  const gap = state.settings.gridGap;
  const margin = 48;
  const width = cols * cell + (cols - 1) * gap + margin * 2;
  const height = rows * cell + (rows - 1) * gap + margin * 2 + 70;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fffaf1";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#2f2921";
  ctx.lineWidth = 4;
  ctx.strokeRect(18, 18, width - 36, height - 36);
  ctx.fillStyle = "#22201c";
  ctx.font = "bold 28px sans-serif";
  ctx.fillText(state.settings.workTitle || "未命名作品", margin, 50);
  ctx.font = "bold 30px serif";
  state.placements.forEach((placement) => {
    const type = state.inventory.find((item) => item.id === placement.typeId);
    if (!type) return;
    const x = margin + placement.col * (cell + gap);
    const y = margin + 45 + placement.row * (cell + gap);
    ctx.fillStyle = "#2f2921";
    ctx.fillRect(x, y, cell, cell);
    ctx.fillStyle = "#fff5df";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${Math.min(type.size + 8, 42)}px serif`;
    ctx.fillText(type.char, x + cell / 2, y + cell / 2);
  });
  const link = document.createElement("a");
  link.download = `${state.settings.workTitle || "movable-type"}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

els.paperSize.addEventListener("change", () => {
  state.settings.paperSize = els.paperSize.value;
  const { cols, rows } = getGrid();
  state.placements = state.placements.filter((item) => item.row < rows && item.col < cols);
  const hadOrder = Boolean(state.splitOrder);
  state.splitOrder = null;
  resetSplitTransients();
  if (hadOrder) stageNotice = { kind: "info", text: "纸型已更换，原分单随之撤销，请重新开单。" };
  renderAll();
});

els.flowMode.addEventListener("change", () => {
  state.settings.flowMode = els.flowMode.value;
  renderAll();
});

els.gridGap.addEventListener("input", () => {
  state.settings.gridGap = Number(els.gridGap.value);
  renderAll();
});

els.workTitle.addEventListener("input", () => {
  state.settings.workTitle = els.workTitle.value;
  saveState();
});

els.typeForm.addEventListener("submit", addType);
els.inventorySearch.addEventListener("input", renderInventory);
els.styleFilter.addEventListener("change", renderInventory);
els.saveDraftBtn.addEventListener("click", saveDraft);
els.exportBtn.addEventListener("click", exportPreview);
els.clearBoardBtn.addEventListener("click", () => {
  state.placements = [];
  const hadOrder = Boolean(state.splitOrder);
  state.splitOrder = null;
  resetSplitTransients();
  if (hadOrder) stageNotice = { kind: "info", text: "版面已清空，分单一并撤销。" };
  renderAll();
});

els.splitCreateBtn.addEventListener("click", createSplitOrder);

els.splitDirection.addEventListener("change", () => {
  resetSplitTransients();
  renderAll();
});

els.splitPosition.addEventListener("input", () => {
  resetSplitTransients();
  renderAll();
});

els.splitInfo.addEventListener("click", (event) => {
  const reviewButton = event.target.closest("[data-review-plate]");
  if (reviewButton && state.splitOrder) {
    const plate = reviewButton.dataset.reviewPlate;
    state.splitOrder.plates[plate].status = "ok";
    stageNotice = { kind: "info", text: `${plate === "a" ? "甲" : "乙"}版已复核。` };
    renderAll();
    return;
  }
  if (event.target.closest("[data-cancel-split]")) {
    state.splitOrder = null;
    resetSplitTransients();
    stageNotice = { kind: "info", text: "已撤销分单，版面恢复整版编辑。" };
    renderAll();
  }
});

els.typeList.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete-type]");
  if (deleteButton) {
    const typeId = deleteButton.dataset.deleteType;
    const removedPlacements = state.placements.some((item) => item.typeId === typeId);
    state.inventory = state.inventory.filter((item) => item.id !== typeId);
    state.placements = state.placements.filter((item) => item.typeId !== typeId);
    if (state.selectedTypeId === typeId) state.selectedTypeId = state.inventory[0]?.id || null;
    if (state.splitOrder && removedPlacements) {
      state.splitOrder.plates.a.status = "review";
      state.splitOrder.plates.b.status = "review";
    }
    renderAll();
    return;
  }
  const card = event.target.closest("[data-type-id]");
  if (!card) return;
  state.selectedTypeId = card.dataset.typeId;
  renderAll();
});

els.typeList.addEventListener("dragstart", (event) => {
  const card = event.target.closest("[data-type-id]");
  if (!card) return;
  event.dataTransfer.setData("text/plain", card.dataset.typeId);
});

els.stage.addEventListener("dragover", (event) => {
  if (event.target.closest(".cell")) event.preventDefault();
});

els.stage.addEventListener("drop", (event) => {
  const cell = event.target.closest(".cell");
  if (!cell) return;
  event.preventDefault();
  placeType(Number(cell.dataset.row), Number(cell.dataset.col), event.dataTransfer.getData("text/plain"));
});

els.stage.addEventListener("click", (event) => {
  const cell = event.target.closest(".cell");
  if (!cell) return;
  placeType(Number(cell.dataset.row), Number(cell.dataset.col));
});

els.draftList.addEventListener("click", (event) => {
  const loadButton = event.target.closest("[data-load-draft]");
  const deleteButton = event.target.closest("[data-delete-draft]");
  if (loadButton) {
    const draft = state.drafts.find((item) => item.id === loadButton.dataset.loadDraft);
    if (!draft) return;
    state.settings = structuredClone(draft.settings);
    state.placements = structuredClone(draft.placements);
    state.splitOrder = null;
    resetSplitTransients();
    renderAll();
  }
  if (deleteButton) {
    state.drafts = state.drafts.filter((item) => item.id !== deleteButton.dataset.deleteDraft);
    renderAll();
  }
});

renderAll();
