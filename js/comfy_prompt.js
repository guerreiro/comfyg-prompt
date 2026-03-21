import { app } from "../../scripts/app.js";

const NODE_NAME = "ComfygPrompt";

// ─────────────────────────────────────────────────────────────────────────────
// CSS — injected once into the document
// ─────────────────────────────────────────────────────────────────────────────

const CSS = `
.cp-panel {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 0 4px;
    box-sizing: border-box;
    width: 100%;
}
.cp-list {
    display: flex;
    flex-direction: column;
    gap: 5px;
}
.cp-row {
    display: grid;
    grid-template-columns: 22px 1fr 22px;
    align-items: flex-start;
    gap: 4px;
}
.cp-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--comfy-primary-color, #555);
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    flex-shrink: 0;
    margin-top: 3px;
    user-select: none;
}
.cp-ta {
    width: 100%;
    min-height: 56px;
    resize: vertical;
    font-family: inherit;
    font-size: 12px;
    line-height: 1.4;
    padding: 5px 7px;
    background: var(--comfy-input-bg);
    color: var(--input-text);
    border: 1px solid var(--border-color);
    border-radius: 5px;
    box-sizing: border-box;
    transition: border-color 0.15s;
    outline: none;
}
.cp-ta:focus {
    border-color: var(--comfy-primary-color, #888);
}
.cp-ta::placeholder {
    color: color-mix(in srgb, var(--input-text) 35%, transparent);
    font-style: italic;
}
.cp-rm {
    width: 22px;
    height: 22px;
    padding: 0;
    cursor: pointer;
    border-radius: 50%;
    font-size: 11px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    color: var(--input-text);
    border: 1px solid var(--border-color);
    flex-shrink: 0;
    margin-top: 3px;
    opacity: 0.6;
    transition: opacity 0.15s, background 0.15s;
}
.cp-rm:hover {
    opacity: 1;
    background: rgba(200, 60, 60, 0.25);
    border-color: rgba(200, 60, 60, 0.6);
}
.cp-rm.hidden { visibility: hidden; }
.cp-add-btn {
    width: 100%;
    margin-top: 2px;
    padding: 5px 0;
    cursor: pointer;
    border-radius: 5px;
    font-size: 12px;
    font-family: inherit;
    background: transparent;
    color: var(--input-text);
    border: 1px dashed var(--border-color);
    opacity: 0.75;
    transition: opacity 0.15s, border-color 0.15s, border-style 0.15s;
}
.cp-add-btn:hover {
    opacity: 1;
    border-color: var(--comfy-primary-color, #888);
    border-style: solid;
}
`;

let _cssInjected = false;
function injectCss() {
    if (_cssInjected) return;
    const s = document.createElement("style");
    s.textContent = CSS;
    document.head.appendChild(s);
    _cssInjected = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hidden serialised widget helpers
// ─────────────────────────────────────────────────────────────────────────────

function addHiddenWidget(node, name, defaultValue, type = "number") {
    if (node.widgets?.find(w => w.name === name)) return;
    const w = node.addWidget(type, name, defaultValue, () => {});
    w.computeSize = () => [0, -4];
    return w;
}

function getWidget(node, name) {
    return node.widgets?.find(w => w.name === name);
}

// ─────────────────────────────────────────────────────────────────────────────
// Single DOM widget — owns the entire prompt list UI
// ─────────────────────────────────────────────────────────────────────────────

function setupPromptsWidget(node) {
    injectCss();

    const panel = document.createElement("div");
    panel.className = "cp-panel";

    const list = document.createElement("div");
    list.className = "cp-list";

    const addBtn = document.createElement("button");
    addBtn.className = "cp-add-btn";
    addBtn.textContent = "+ Add Prompt";

    panel.appendChild(list);
    panel.appendChild(addBtn);

    // ── sync textarea values → hidden JSON widget ──────────────────────
    function syncJson() {
        const w = getWidget(node, "_prompts_json");
        if (!w) return;
        w.value = JSON.stringify(
            Array.from(list.querySelectorAll("textarea")).map(t => t.value)
        );
    }

    // ── renumber badges + placeholders ─────────────────────────────────
    function renumber() {
        Array.from(list.children).forEach((row, i) => {
            const badge = row.querySelector(".cp-badge");
            if (badge) badge.textContent = i + 1;
            const ta = row.querySelector("textarea");
            if (ta) ta.placeholder = `Prompt ${i + 1}\u2026`;
        });
    }

    // ── show/hide remove buttons ───────────────────────────────────────
    function refreshRemoveBtns() {
        const multi = list.children.length > 1;
        Array.from(list.children).forEach(row => {
            row.querySelector(".cp-rm")?.classList.toggle("hidden", !multi);
        });
    }

    // ── deterministic height calculation ──────────────────────────────
    // LiteGraph measures native widgets at exactly 28px per row (ComfyUI default).
    // Our CSS sets textarea min-height:56px + gap:5px + panel padding = 70px per row.
    // Add-button is 29px (padding:5*2 + font:12 + border:2 + margin-top:2 + gap:4).
    // Title bar = 30px (LiteGraph LGraphCanvas.NODE_TITLE_HEIGHT).
    // Bottom padding LiteGraph adds = 5px.
    const H_TITLE      = 30;  // LiteGraph title bar (NODE_TITLE_HEIGHT)
    const H_NATIVE_ROW = 28;  // each native widget row (seed, seed_mode)
    const H_PANEL_TOP  = 10;  // cp-panel padding-top + list gap before first row
    const H_ROW        = 70;  // prompt row: textarea(56) + gap(5) + surrounding(9)
    const H_ADD_BTN    = 33;  // add-button: margin-top(2) + padding(10) + font(12) + border(2) + gap(5) + bottom(2)
    const H_BOTTOM     =  5;  // LiteGraph bottom padding

    function calcHeight(rowCount) {
        return H_TITLE + H_NATIVE_ROW * 2 + H_PANEL_TOP
             + rowCount * H_ROW + H_ADD_BTN + H_BOTTOM;
    }

    function applyHeight() {
        const h = calcHeight(list.children.length);
        node.setSize([node.size[0], h]);
        app.graph.setDirtyCanvas(true, true);
    }

    // ── add a prompt row ───────────────────────────────────────────────
    function addRow(value = "") {
        const idx  = list.children.length;
        const row  = document.createElement("div");
        row.className = "cp-row";

        const badge = document.createElement("span");
        badge.className = "cp-badge";
        badge.textContent = idx + 1;

        const ta = document.createElement("textarea");
        ta.className = "cp-ta";
        ta.value = value;
        ta.placeholder = `Prompt ${idx + 1}\u2026`;
        ta.addEventListener("input", syncJson);
        // Prevent canvas zoom when scrolling inside the textarea
        ta.addEventListener("wheel", e => e.stopPropagation(), { passive: true });

        const rm = document.createElement("button");
        rm.className = "cp-rm";
        rm.textContent = "\u2715";
        rm.title = "Remove prompt";
        rm.addEventListener("click", () => removeRow(row));

        row.append(badge, ta, rm);
        list.appendChild(row);

        refreshRemoveBtns();
        syncJson();
        applyHeight();
    }

    // ── remove a prompt row ────────────────────────────────────────────
    function removeRow(rowEl) {
        if (list.children.length <= 1) return;
        rowEl.remove();
        renumber();
        refreshRemoveBtns();
        syncJson();
        applyHeight();
    }

    // ── rebuild all rows from an array ─────────────────────────────────
    function setValues(prompts) {
        list.innerHTML = "";
        const arr = Array.isArray(prompts) && prompts.length ? prompts : [""];
        for (const p of arr) addRowSilent(p);  // no applyHeight per row
        applyHeight();                           // apply once at the end
    }

    // addRow without triggering applyHeight (used during bulk rebuild)
    function addRowSilent(value = "") {
        const idx = list.children.length;
        const row = document.createElement("div");
        row.className = "cp-row";
        const badge = document.createElement("span");
        badge.className = "cp-badge";
        badge.textContent = idx + 1;
        const ta = document.createElement("textarea");
        ta.className = "cp-ta";
        ta.value = value;
        ta.placeholder = "Prompt " + (idx + 1) + "\u2026";
        ta.addEventListener("input", syncJson);
        ta.addEventListener("wheel", e => e.stopPropagation(), { passive: true });
        const rm = document.createElement("button");
        rm.className = "cp-rm";
        rm.textContent = "\u2715";
        rm.title = "Remove prompt";
        rm.addEventListener("click", () => removeRow(row));
        row.append(badge, ta, rm);
        list.appendChild(row);
        refreshRemoveBtns();
        syncJson();
    }

    addBtn.addEventListener("click", () => addRow(""));

    // ── register the single DOM widget ────────────────────────────────
    node.addDOMWidget("_prompts_ui", "prompts_panel", panel, {
        serialize: false,
        hideOnZoom: false,
        getValue: () => JSON.stringify(
            Array.from(list.querySelectorAll("textarea")).map(t => t.value)
        ),
        setValue: () => {},
    });

    // Expose API for lifecycle hooks
    node._promptsApi = { addRow, setValues };
}

// ─────────────────────────────────────────────────────────────────────────────
// Extension
// ─────────────────────────────────────────────────────────────────────────────

app.registerExtension({
    name: "ComfygPrompt.Frontend",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_NAME) return;

        // ── onNodeCreated ─────────────────────────────────────────────────
        nodeType.prototype.onNodeCreated = function () {
            this._wasConfigured = false;

            // Hidden serialised widgets (Python reads these)
            addHiddenWidget(this, "_index",        0,      "number");
            addHiddenWidget(this, "_prompts_json", '[""]', "text");

            // Visible native widgets
            if (!getWidget(this, "seed")) {
                this.addWidget("number", "seed", 0, () => {}, {
                    min: 0, max: 0xFFFFFFFFFFFFFFFF, step: 1, precision: 0,
                });
            }
            if (!getWidget(this, "seed_mode")) {
                this.addWidget("combo", "seed_mode", "fixed", () => {}, {
                    values: ["fixed", "increment", "decrement", "random"],
                });
            }

            // Single DOM widget that owns the entire prompt UI
            setupPromptsWidget(this);

            // Brand-new node: add the first row only if onConfigure never runs.
            // queueMicrotask fires after the current sync task, giving
            // onConfigure (if called) a chance to set _wasConfigured first.
            queueMicrotask(() => {
                if (!this._wasConfigured) {
                    this._promptsApi?.addRow("");
                }
            });
        };

        // ── onConfigure (workflow load / paste) ───────────────────────────
        nodeType.prototype.onConfigure = function () {
            this._wasConfigured = true;

            const jsonWidget = getWidget(this, "_prompts_json");
            let prompts;
            try { prompts = JSON.parse(jsonWidget?.value ?? '[""]'); } catch { prompts = [""]; }

            // Rebuild DOM rows from saved data.
            // We do NOT call setSize here — LiteGraph restores data.size
            // automatically after onConfigure returns.
            this._promptsApi?.setValues(prompts);
            app.graph.setDirtyCanvas(true, true);
        };

        // ── right-click menu ──────────────────────────────────────────────
        const origMenu = nodeType.prototype.getExtraMenuOptions;
        nodeType.prototype.getExtraMenuOptions = function (_, options) {
            origMenu?.apply(this, arguments);
            options.push({
                content: "Reset prompts",
                callback: () => {
                    const iw = getWidget(this, "_index");
                    if (iw) iw.value = 0;
                    this._promptsApi?.setValues([""]);
                    this.setSize(this.computeSize());
                },
            });
        };
    },
});
