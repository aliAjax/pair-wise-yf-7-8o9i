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
  drafts: [],
  split: null,
  splitCheck: null,
  blockedCells: [],
  settings: {
    paperSize: "postcard",
    flowMode: "horizontal",
    gridGap: 8,
    workTitle: "晚风小笺"
  }
};

let state = loadState();

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
  splitLine: document.querySelector("#splitLine"),
  splitLineLabel: document.querySelector("#splitLineLabel"),
  makeSplitBtn: document.querySelector("#makeSplitBtn"),
  cancelSplitBtn: document.querySelector("#cancelSplitBtn"),
  pageNotice: document.querySelector("#pageNotice"),
  splitSummary: document.querySelector("#splitSummary"),
  plateList: document.querySelector("#plateList"),
  mergePreview: document.querySelector("#mergePreview"),
  splitCheckList: document.querySelector("#splitCheckList")
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

let pageNotice = null;

function setNotice(text, kind = "info") {
  pageNotice = text ? { text, kind } : null;
  renderNotice();
}

function renderNotice() {
  if (!pageNotice) {
    els.pageNotice.hidden = true;
    return;
  }
  els.pageNotice.hidden = false;
  els.pageNotice.textContent = pageNotice.text;
  els.pageNotice.className = `page-notice ${pageNotice.kind}`;
}

function plateOfCell(row, col) {
  if (!state.split) return null;
  const line = state.split.line - 1;
  if (state.split.direction === "horizontal") {
    if (row === line) return "cut";
    return row < line ? "a" : "b";
  }
  if (col === line) return "cut";
  return col < line ? "a" : "b";
}

function getPlateRegion(plate) {
  const { cols, rows } = getGrid();
  const line = state.split.line - 1;
  const limit = state.split.direction === "horizontal" ? rows : cols;
  return plate === "a" ? { start: 0, end: line - 1, limit } : { start: line + 1, end: limit - 1, limit };
}

function placementsInPlate(plate) {
  return state.placements.filter((item) => plateOfCell(item.row, item.col) === plate);
}

function combinedUsageCheck() {
  const usage = getUsage();
  return state.inventory
    .filter((item) => usage[item.id])
    .map((item) => ({
      char: item.char,
      style: item.style,
      used: usage[item.id],
      quantity: item.quantity,
      ok: usage[item.id] <= item.quantity
    }));
}

function markPlateEdited(editedPlate) {
  if (!state.split) return;
  const other = editedPlate === "a" ? "b" : "a";
  state.split.plates[editedPlate].status = "已改动";
  state.split.plates[other].status = "待复核";
}

function makeSplit() {
  const direction = els.splitDirection.value;
  const line = Number(els.splitLine.value);
  const { cols, rows } = getGrid();
  const limit = direction === "horizontal" ? rows : cols;
  const unit = direction === "horizontal" ? "行" : "列";
  if (!Number.isInteger(line) || line < 1 || line > limit) {
    setNotice(`请填写有效的分隔${unit}（1–${limit}）。`, "warn");
    return;
  }
  if (line < 2 || line > limit - 1) {
    setNotice(`分隔${unit}太靠边，甲、乙两张小版都要留出版面。`, "warn");
    return;
  }
  const blocked = state.placements.filter((item) => (direction === "horizontal" ? item.row : item.col) === line - 1);
  if (blocked.length) {
    state.blockedCells = blocked.map((item) => ({ row: item.row, col: item.col }));
    setNotice(`分隔${unit}上有 ${blocked.length} 个落字碍事，已在版面标出，先不开单。`, "warn");
    renderAll();
    return;
  }
  const check = combinedUsageCheck();
  const failures = check.filter((item) => !item.ok);
  state.splitCheck = {
    at: new Date().toISOString(),
    ok: failures.length === 0,
    failures: failures.map((item) => ({ char: item.char, style: item.style, used: item.used, quantity: item.quantity }))
  };
  if (failures.length) {
    state.blockedCells = [];
    setNotice(`「${failures.map((item) => item.char).join("、")}」两版合计用量超出库存，拒绝开单。`, "warn");
    renderAll();
    return;
  }
  state.split = {
    direction,
    line,
    createdAt: new Date().toISOString(),
    plates: { a: { status: "正常" }, b: { status: "正常" } }
  };
  state.blockedCells = [];
  const cutLabel = direction === "horizontal" ? `横切第${line}行` : `竖切第${line}列`;
  setNotice(`已按${cutLabel}生成甲、乙两张小版，库存核对通过。分单信息见下方，核对记录见右侧。`, "ok");
  els.splitDirection.value = direction;
  renderAll();
}

function cancelSplit() {
  state.split = null;
  state.blockedCells = [];
  setNotice("已取消分单。", "info");
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
  const blockedSet = new Set(state.blockedCells.map((item) => placementKey(item.row, item.col)));
  els.stage.className = `stage ${state.settings.paperSize}`;
  els.stage.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  els.stage.style.gridTemplateRows = `repeat(${rows}, minmax(0, 1fr))`;
  els.stage.style.gap = `${state.settings.gridGap}px`;
  const cells = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const placement = map.get(placementKey(row, col));
      const type = placement ? state.inventory.find((item) => item.id === placement.typeId) : null;
      const zone = state.split ? plateOfCell(row, col) : null;
      const classes = ["cell"];
      if (type) classes.push("used");
      if (state.settings.flowMode === "vertical") classes.push("vertical");
      if (zone === "cut") classes.push("cut");
      if (zone === "a") classes.push("zone-a");
      if (zone === "b") classes.push("zone-b");
      if (blockedSet.has(placementKey(row, col))) classes.push("blocked");
      cells.push(`
        <button class="${classes.join(" ")}" data-row="${row}" data-col="${col}" type="button" aria-label="第${row + 1}行第${col + 1}列">
          ${type ? escapeHtml(type.char) : ""}
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

function renderSplitControls() {
  const { cols, rows } = getGrid();
  const isRow = els.splitDirection.value === "horizontal";
  const limit = isRow ? rows : cols;
  els.splitLineLabel.textContent = isRow ? "分隔行" : "分隔列";
  els.splitLine.max = limit;
  els.splitLine.placeholder = `2–${limit - 1}`;
  if (state.split && !els.splitLine.value) els.splitLine.value = state.split.line;
  els.cancelSplitBtn.hidden = !state.split;
  els.makeSplitBtn.textContent = state.split ? "重新分单" : "生成分单";
}

function renderSplitPanel() {
  if (!state.split) {
    els.splitSummary.textContent = "未分单";
    els.plateList.innerHTML = `<p class="empty">还没有分单。在版面设置旁选切法、填分隔位置后生成。</p>`;
    els.mergePreview.style.gridTemplateColumns = "";
    els.mergePreview.innerHTML = `<p class="empty">分单后在此按原坐标拼回整张预览。</p>`;
    return;
  }
  const directionLabel = state.split.direction === "horizontal" ? "横切" : "竖切";
  const unit = state.split.direction === "horizontal" ? "行" : "列";
  els.splitSummary.textContent = `${directionLabel}第${state.split.line}${unit} · ${new Date(state.split.createdAt).toLocaleString("zh-CN")}`;
  els.plateList.innerHTML = ["a", "b"]
    .map((plate) => {
      const name = plate === "a" ? "甲" : "乙";
      const side = state.split.direction === "horizontal" ? (plate === "a" ? "上" : "下") : plate === "a" ? "左" : "右";
      const region = getPlateRegion(plate);
      const placements = placementsInPlate(plate);
      const typeCount = new Set(placements.map((item) => item.typeId)).size;
      const status = state.split.plates[plate].status;
      const statusClass = status === "正常" ? "ok" : status === "已改动" ? "info" : "gold";
      return `
        <article class="plate-card">
          <header>
            <strong>${name}版（${side}）</strong>
            <span class="badge ${statusClass}">${status}</span>
          </header>
          <p>第${region.start + 1}–${region.end + 1}${unit} · ${placements.length}个落字 · ${typeCount}种字模</p>
          ${status !== "正常" ? `<button type="button" data-review-plate="${plate}">确认复核</button>` : ""}
        </article>
      `;
    })
    .join("");
  renderMergePreview();
}

function renderMergePreview() {
  const { cols, rows } = getGrid();
  const map = new Map(state.placements.map((item) => [placementKey(item.row, item.col), item]));
  els.mergePreview.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  const cells = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const placement = map.get(placementKey(row, col));
      const type = placement ? state.inventory.find((item) => item.id === placement.typeId) : null;
      const zone = plateOfCell(row, col);
      const classes = ["pv-cell"];
      if (type) classes.push("used");
      if (zone === "cut") classes.push("cut");
      if (zone === "a") classes.push("zone-a");
      if (zone === "b") classes.push("zone-b");
      cells.push(`<span class="${classes.join(" ")}">${type ? escapeHtml(type.char) : ""}</span>`);
    }
  }
  els.mergePreview.innerHTML = cells.join("");
}

function renderSplitCheck() {
  const parts = [];
  if (state.splitCheck) {
    const time = new Date(state.splitCheck.at).toLocaleString("zh-CN");
    if (state.splitCheck.ok) {
      parts.push(`<p class="check-record ok">上次核对通过 · ${time}</p>`);
    } else {
      parts.push(`<p class="check-record warn">拒绝开单 · ${time}</p>`);
      parts.push(
        state.splitCheck.failures
          .map(
            (item) => `
              <div class="usage-item warn">
                <strong>${escapeHtml(item.char)} ${escapeHtml(item.style)}</strong>
                <span>${item.used}/${item.quantity}</span>
              </div>
            `
          )
          .join("")
      );
    }
  }
  if (state.split) {
    const check = combinedUsageCheck();
    parts.push(`<p class="check-sub">两版合计实时用量</p>`);
    parts.push(
      check
        .map(
          (item) => `
            <div class="usage-item ${item.ok ? "" : "warn"}">
              <strong>${escapeHtml(item.char)} ${escapeHtml(item.style)}</strong>
              <span>${item.used}/${item.quantity}</span>
            </div>
          `
        )
        .join("") || `<p class="empty">两版都还没有落字。</p>`
    );
  }
  els.splitCheckList.innerHTML = parts.join("") || `<p class="empty">分单后在此核对两版合计用量。</p>`;
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

function renderAll() {
  saveState();
  renderSettings();
  renderStyleFilter();
  renderInventory();
  renderStage();
  renderUsage();
  renderSplitControls();
  renderSplitPanel();
  renderSplitCheck();
  renderDrafts();
}

function placeType(row, col, typeId = state.selectedTypeId) {
  if (!typeId) return;
  if (state.split && plateOfCell(row, col) === "cut") {
    state.blockedCells = [{ row, col }];
    setNotice("分切线上不能落字，已标出该格。", "warn");
    renderAll();
    return;
  }
  const plate = state.split ? plateOfCell(row, col) : null;
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
  state.blockedCells = [];
  if (plate) markPlateEdited(plate);
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
  state.blockedCells = [];
  if (state.split) {
    state.split = null;
    setNotice("纸张尺寸变了，分单已取消。", "info");
  }
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
  state.blockedCells = [];
  if (state.split) {
    state.split = null;
    setNotice("版面已清空，分单已取消。", "info");
  }
  renderAll();
});

els.splitDirection.addEventListener("change", renderSplitControls);
els.makeSplitBtn.addEventListener("click", makeSplit);
els.cancelSplitBtn.addEventListener("click", cancelSplit);

els.plateList.addEventListener("click", (event) => {
  const reviewButton = event.target.closest("[data-review-plate]");
  if (!reviewButton || !state.split) return;
  const plate = reviewButton.dataset.reviewPlate;
  state.split.plates[plate].status = "正常";
  setNotice(`${plate === "a" ? "甲" : "乙"}版已复核。`, "ok");
  renderAll();
});

els.typeList.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete-type]");
  if (deleteButton) {
    const typeId = deleteButton.dataset.deleteType;
    state.inventory = state.inventory.filter((item) => item.id !== typeId);
    state.placements = state.placements.filter((item) => item.typeId !== typeId);
    if (state.selectedTypeId === typeId) state.selectedTypeId = state.inventory[0]?.id || null;
    if (state.split) {
      state.split.plates.a.status = "待复核";
      state.split.plates.b.status = "待复核";
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
    state.blockedCells = [];
    if (state.split) {
      state.split = null;
      setNotice("已载入草稿，原分单已取消。", "info");
    }
    renderAll();
  }
  if (deleteButton) {
    state.drafts = state.drafts.filter((item) => item.id !== deleteButton.dataset.deleteDraft);
    renderAll();
  }
});

if (state.split) {
  els.splitDirection.value = state.split.direction;
  els.splitLine.value = state.split.line;
}

renderAll();
