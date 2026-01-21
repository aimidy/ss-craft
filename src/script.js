/** @type {{ recipes: Array<{name: string, quality?: string, attribute?: string, ingredients: Array<{name: string, qty: number}>}> }} */
let data = { recipes: [] };

/** 已選料理：[{name, servings}] */
let selected = [];

/** 材料單價表（key=材料名, value=單價） */
const priceMap = new Map();

/** ✅ localStorage key（單價 + 已選料理一起存） */
const APP_STATE_KEY = 'recipe_calc_state_v1';

const el = (id) => document.getElementById(id);
const recipeSelect = el('recipeSelect');
const selectedQualityBadge = el('selectedQualityBadge');
const addBtn = el('addBtn');
const clearBtn = el('clearBtn');
const status = el('status');
const errorEl = el('error');
const recipeSearch = el('recipeSearch');

// 篩選狀態
let currentQualityFilter = 'all';
let currentAttrFilter = 'all';
let currentSearchText = '';

const selectedEmpty = el('selectedEmpty');
const selectedTableWrap = el('selectedTableWrap');
const selectedTbody = el('selectedTbody');

const totalEmpty = el('totalEmpty');
const totalTableWrap = el('totalTableWrap');
const totalTbody = el('totalTbody');

const costEmpty = el('costEmpty');
const costTableWrap = el('costTableWrap');
const costTbody = el('costTbody');
const costTotal = el('costTotal');
const clearPricesBtn = el('clearPricesBtn');

function setStatus(msg) {
    status.textContent = msg || '';
}
function setError(msg) {
    errorEl.textContent = msg || '';
}

function findRecipe(name) {
    return data.recipes.find((r) => r.name === name) || null;
}

function formatIngredientsScaled(recipe, servings) {
    return recipe.ingredients.map((it) => `${it.name} × ${it.qty * servings}`).join('、');
}

function upsertSelected(recipeName) {
    const idx = selected.findIndex((x) => x.name === recipeName);
    if (idx >= 0) {
        selected[idx].servings += 1;
        return '已存在，幫你 +1 份～';
    }
    selected.push({ name: recipeName, servings: 1 });
    return '已加入清單～';
}

function removeSelected(recipeName) {
    selected = selected.filter((x) => x.name !== recipeName);
}

function computeTotals() {
    const totals = new Map();
    for (const item of selected) {
        const recipe = findRecipe(item.name);
        if (!recipe) continue;
        for (const ing of recipe.ingredients) {
            const prev = totals.get(ing.name) || 0;
            totals.set(ing.name, prev + ing.qty * item.servings);
        }
    }
    return Array.from(totals.entries()).sort((a, b) => a[0].localeCompare(b[0], 'zh-Hant'));
}

/** ✅ localStorage：讀取整體 state（單價 + 已選料理） */
function loadAppState() {
    try {
        const raw = localStorage.getItem(APP_STATE_KEY);
        if (!raw) return;

        const obj = JSON.parse(raw);
        if (!obj || typeof obj !== 'object') return;

        // selected
        if (Array.isArray(obj.selected)) {
            selected = obj.selected
                .filter(
                    (x) => x && typeof x.name === 'string' && Number.isFinite(Number(x.servings)),
                )
                .map((x) => ({
                    name: x.name,
                    servings: Math.max(1, Math.floor(Number(x.servings))),
                }));
        }

        // prices
        priceMap.clear();
        const prices = obj.prices;
        if (prices && typeof prices === 'object') {
            for (const [k, v] of Object.entries(prices)) {
                const n = Number(v);
                if (Number.isFinite(n) && n >= 0) priceMap.set(k, n);
            }
        }
    } catch (_) {}
}

/** ✅ localStorage：寫入整體 state（單價 + 已選料理） */
function saveAppState() {
    try {
        const payload = {
            selected,
            prices: Object.fromEntries(priceMap.entries()),
        };
        localStorage.setItem(APP_STATE_KEY, JSON.stringify(payload));
    } catch (_) {}
}

// 品質 → 顏色（Badge + 圓點）
function qualityTheme(quality) {
    switch (quality) {
        case '金色':
            return {
                dot: '🟡',
                badge: 'inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800',
                chipDot: 'bg-amber-400',
            };
        case '橙色':
            return {
                dot: '🟠',
                badge: 'inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-800',
                chipDot: 'bg-orange-500',
            };
        case '紫色':
            return {
                dot: '🟣',
                badge: 'inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-800',
                chipDot: 'bg-violet-500',
            };
        default:
            return {
                dot: '⚪',
                badge: 'inline-flex items-center gap-2 rounded-full border border-cream-200 bg-cream-50 px-2.5 py-0.5 text-xs font-medium text-cocoa-700',
                chipDot: 'bg-rosewarm-200',
            };
    }
}

function makeQualityBadge(quality) {
    const q = quality || '?';
    const theme = qualityTheme(q);

    const badge = document.createElement('span');
    badge.className = theme.badge;

    const dot = document.createElement('span');
    dot.className = `inline-flex h-2.5 w-2.5 rounded-full ${theme.chipDot}`;

    const text = document.createElement('span');
    text.textContent = q;

    badge.appendChild(dot);
    badge.appendChild(text);
    return badge;
}

function renderSelectedQualityBadgeForSelect() {
    const name = recipeSelect.value;
    const recipe = findRecipe(name);
    if (!recipe) {
        selectedQualityBadge.classList.add('hidden');
        selectedQualityBadge.innerHTML = '';
        return;
    }
    selectedQualityBadge.className = '';
    const badge = makeQualityBadge(recipe.quality);
    selectedQualityBadge.innerHTML = '';
    selectedQualityBadge.appendChild(badge);
    selectedQualityBadge.classList.remove('hidden');
}

function renderRecipeOptions() {
    recipeSelect.innerHTML = '';
    const filtered = getFilteredRecipes();

    if (filtered.length === 0) {
        const opt = document.createElement('option');
        opt.disabled = true;
        opt.textContent = '沒有符合條件的料理';
        recipeSelect.appendChild(opt);
        return;
    }

    for (const r of filtered) {
        const q = r.quality || '?';
        const theme = qualityTheme(q);

        const opt = document.createElement('option');
        opt.value = r.name;
        opt.textContent = `${theme.dot}【${q}】${r.name}`;
        recipeSelect.appendChild(opt);
    }
}

function getFilteredRecipes() {
    return data.recipes.filter((r) => {
        // 品質篩選
        if (currentQualityFilter !== 'all' && r.quality !== currentQualityFilter) {
            return false;
        }
        // 屬性篩選
        if (currentAttrFilter !== 'all' && r.attribute !== currentAttrFilter) {
            return false;
        }
        // 搜尋篩選
        if (currentSearchText && !r.name.toLowerCase().includes(currentSearchText.toLowerCase())) {
            return false;
        }
        return true;
    });
}

function renderSelected() {
    selectedTbody.innerHTML = '';

    if (selected.length === 0) {
        selectedEmpty.classList.remove('hidden');
        selectedTableWrap.classList.add('hidden');
        return;
    }

    selectedEmpty.classList.add('hidden');
    selectedTableWrap.classList.remove('hidden');

    for (const item of selected) {
        const recipe = findRecipe(item.name);

        const tr = document.createElement('tr');

        const tdName = document.createElement('td');
        tdName.className = 'px-3 py-3';

        const nameWrap = document.createElement('div');
        nameWrap.className = 'flex items-center gap-2 flex-wrap';

        const badge = makeQualityBadge(recipe?.quality);
        const nameText = document.createElement('span');
        nameText.className = 'font-medium text-slate-900';
        nameText.textContent = item.name;

        nameWrap.appendChild(badge);
        nameWrap.appendChild(nameText);
        tdName.appendChild(nameWrap);

        const tdServ = document.createElement('td');
        tdServ.className = 'px-3 py-3';
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.step = '1';
        input.value = String(item.servings);
        input.className =
            'w-28 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200';

        const tdDetail = document.createElement('td');
        tdDetail.className = 'px-3 py-3 text-slate-600';
        tdDetail.textContent = recipe
            ? formatIngredientsScaled(recipe, item.servings)
            : '(找不到此料理資料)';

        input.addEventListener('input', () => {
            const v = Math.max(0, Math.floor(Number(input.value || 0)));
            item.servings = v;

            tdDetail.textContent = recipe
                ? formatIngredientsScaled(recipe, item.servings)
                : '(找不到此料理資料)';

            if (item.servings === 0) {
                removeSelected(item.name);
                renderSelected();
            }

            // ✅ store selected + servings
            saveAppState();
            renderTotals();
        });

        tdServ.appendChild(input);

        const tdAct = document.createElement('td');
        tdAct.className = 'px-3 py-3';
        const rm = document.createElement('button');
        rm.className =
            'rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 active:bg-slate-100';
        rm.textContent = '移除';
        rm.addEventListener('click', () => {
            removeSelected(item.name);
            saveAppState();
            renderAll();
        });
        tdAct.appendChild(rm);

        tr.appendChild(tdName);
        tr.appendChild(tdServ);
        tr.appendChild(tdDetail);
        tr.appendChild(tdAct);
        selectedTbody.appendChild(tr);
    }
}

function renderTotals() {
    totalTbody.innerHTML = '';
    const totals = computeTotals();

    if (totals.length === 0) {
        totalEmpty.classList.remove('hidden');
        totalTableWrap.classList.add('hidden');
    } else {
        totalEmpty.classList.add('hidden');
        totalTableWrap.classList.remove('hidden');

        for (const [name, qty] of totals) {
            const tr = document.createElement('tr');

            const tdA = document.createElement('td');
            tdA.className = 'px-3 py-3 text-slate-900';
            tdA.textContent = name;

            const tdB = document.createElement('td');
            tdB.className = 'px-3 py-3 text-slate-900';
            tdB.textContent = String(qty);

            tr.appendChild(tdA);
            tr.appendChild(tdB);
            totalTbody.appendChild(tr);
        }
    }

    renderCostTable(totals);
}

function fmtMoney(n) {
    const v = Number(n || 0);
    return String(Math.round(v));
}

function renderCostTable(totals) {
    costTbody.innerHTML = '';

    if (!totals || totals.length === 0) {
        costEmpty.classList.remove('hidden');
        costTableWrap.classList.add('hidden');
        costTotal.textContent = '0';
        return;
    }

    costEmpty.classList.add('hidden');
    costTableWrap.classList.remove('hidden');

    let sum = 0;

    for (const [material, qty] of totals) {
        const tr = document.createElement('tr');

        const tdM = document.createElement('td');
        tdM.className = 'px-3 py-3 text-slate-900';
        tdM.textContent = material;

        const tdQ = document.createElement('td');
        tdQ.className = 'px-3 py-3 text-slate-900 tabular-nums';
        tdQ.textContent = String(qty);

        const tdP = document.createElement('td');
        tdP.className = 'px-3 py-3';

        const priceInput = document.createElement('input');
        priceInput.type = 'number';
        priceInput.min = '0';
        priceInput.step = '1';
        priceInput.inputMode = 'numeric';
        priceInput.placeholder = '輸入單價';
        priceInput.value = String(priceMap.get(material) ?? '');
        priceInput.className =
            'w-40 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200';

        const tdC = document.createElement('td');
        tdC.className = 'px-3 py-3 text-slate-900 tabular-nums';
        const initPrice = Number(priceMap.get(material) || 0);
        const initCost = qty * initPrice;
        tdC.textContent = fmtMoney(initCost);

        priceInput.addEventListener('input', () => {
            if (priceInput.value === '') {
                priceMap.delete(material);
            } else {
                const p = Math.max(0, Math.floor(Number(priceInput.value || 0)));
                priceMap.set(material, p);
            }

            // ✅ store prices + selected
            saveAppState();

            const pNow = Number(priceMap.get(material) || 0);
            const newCost = qty * pNow;
            tdC.textContent = fmtMoney(newCost);

            let newSum = 0;
            for (const [m2, q2] of totals) {
                const p2 = Number(priceMap.get(m2) || 0);
                newSum += q2 * p2;
            }
            costTotal.textContent = fmtMoney(newSum);
        });

        tdP.appendChild(priceInput);

        tr.appendChild(tdM);
        tr.appendChild(tdQ);
        tr.appendChild(tdP);
        tr.appendChild(tdC);
        costTbody.appendChild(tr);

        sum += initCost;
    }

    costTotal.textContent = fmtMoney(sum);
}

function renderAll() {
    selected = selected.filter((x) => x.servings > 0);
    renderSelected();
    renderTotals();
}

async function init() {
    try {
        setError('');
        setStatus('讀取 recipes.json 中…');

        const res = await fetch('./recipes.json', { cache: 'no-store' });
        if (!res.ok) throw new Error(`讀取失敗：HTTP ${res.status}`);
        data = await res.json();

        if (!data || !Array.isArray(data.recipes)) {
            throw new Error('recipes.json 格式不正確（缺少 recipes 陣列）');
        }

        // ✅ load (selected + prices)
        loadAppState();

        renderRecipeOptions();
        setStatus(`已載入 ${data.recipes.length} 道料理`);

        recipeSelect.addEventListener('change', () => {
            renderSelectedQualityBadgeForSelect();
        });

        addBtn.addEventListener('click', () => {
            const recipeName = recipeSelect.value;
            const msg = upsertSelected(recipeName);
            setStatus(msg);
            saveAppState();
            renderAll();
        });

        clearBtn.addEventListener('click', () => {
            selected = [];
            setStatus('已清空～');
            saveAppState();
            renderAll();
        });

        clearPricesBtn.addEventListener('click', () => {
            priceMap.clear();
            setStatus('已清除單價～');
            saveAppState();
            renderTotals();
        });

        // 品質篩選按鍵
        document.querySelectorAll('.quality-filter-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.quality-filter-btn').forEach((b) => {
                    b.classList.remove(
                        'active',
                        'border-slate-400',
                        'bg-slate-100',
                        'text-cocoa-900',
                    );
                    b.classList.add('border-slate-300', 'bg-white', 'text-slate-700');
                });

                btn.classList.add('active', 'border-slate-400', 'bg-slate-100', 'text-cocoa-900');
                btn.classList.remove('border-slate-300', 'bg-white', 'text-slate-700');

                currentQualityFilter = btn.getAttribute('data-quality');
                renderRecipeOptions();
                renderSelectedQualityBadgeForSelect();
            });
        });

        // 屬性篩選按鍵
        document.querySelectorAll('.attr-filter-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.attr-filter-btn').forEach((b) => {
                    b.classList.remove(
                        'active',
                        'border-slate-400',
                        'bg-slate-100',
                        'text-cocoa-900',
                    );
                    b.classList.add('border-slate-300', 'bg-white', 'text-slate-700');
                });

                btn.classList.add('active', 'border-slate-400', 'bg-slate-100', 'text-cocoa-900');
                btn.classList.remove('border-slate-300', 'bg-white', 'text-slate-700');

                currentAttrFilter = btn.getAttribute('data-attr');
                renderRecipeOptions();
                renderSelectedQualityBadgeForSelect();
            });
        });

        // 搜尋輸入框
        recipeSearch.addEventListener('input', () => {
            currentSearchText = recipeSearch.value.trim();
            renderRecipeOptions();
            renderSelectedQualityBadgeForSelect();
        });

        if (selected.length === 0 && data.recipes.length > 0) {
            selected = [{ name: data.recipes[0].name, servings: 1 }];
            saveAppState();
        }

        renderSelectedQualityBadgeForSelect();
        renderAll();
    } catch (e) {
        setStatus('');
        setError(String(e && e.message ? e.message : e));
    }
}

init();
