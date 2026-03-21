import { app } from "../../scripts/app.js";

const NODE_NAME = "ComfygPrompt";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — hidden (serialised) widgets
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Add a number or string widget that is invisible but gets serialised into
 * widgets_values, which is what ComfyUI sends to the Python backend.
 */
function addHiddenWidget(node, name, defaultValue, type = "number") {
    if (node.widgets?.find(w => w.name === name)) return;

    const w = node.addWidget(type, name, defaultValue, () => {});
    // Zero height hides it from the canvas without breaking layout.
    w.computeSize = () => [0, -4];
    return w;
}

/** Get the value of a named widget. */
function getWidget(node, name) {
    return node.widgets?.find(w => w.name === name);
}

/** Read the current prompts array from the hidden JSON widget. */
function readPrompts(node) {
    const w = getWidget(node, "_prompts_json");
    try { return JSON.parse(w?.value ?? '[""]'); } catch { return [""]; }
}

/** Write the current visual prompts back into the hidden JSON widget. */
function syncJson(node) {
    const w = getWidget(node, "_prompts_json");
    if (!w) return;
    const values = (node._promptWidgets ?? []).map(pw => {
        const ta = pw.element?.querySelector("textarea");
        return ta ? ta.value : "";
    });
    w.value = JSON.stringify(values);
}

// ─────────────────────────────────────────────────────────────────────────────
// DOM prompt widget
// ─────────────────────────────────────────────────────────────────────────────

function buildPromptElement(node, index, value) {
    const container = document.createElement("div");
    Object.assign(container.style, {
        display: "flex",
        alignItems: "flex-start",
        gap: "4px",
        padding: "2px 0",
        boxSizing: "border-box",
    });

    const label = document.createElement("span");
    label.textContent = `Prompt ${index + 1}:`;
    Object.assign(label.style, {
        minWidth: "65px",
        fontWeight: "bold",
        paddingTop: "5px",
        fontSize: "12px",
        color: "var(--input-text)",
        flexShrink: "0",
    });

    const textarea = document.createElement("textarea");
    textarea.value = value;
    Object.assign(textarea.style, {
        flex: "1",
        minHeight: "52px",
        resize: "vertical",
        fontFamily: "inherit",
        fontSize: "12px",
        padding: "4px 6px",
        background: "var(--comfy-input-bg)",
        color: "var(--input-text)",
        border: "1px solid var(--border-color)",
        borderRadius: "4px",
        boxSizing: "border-box",
    });
    textarea.addEventListener("input", () => syncJson(node));

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "✕";
    Object.assign(removeBtn.style, {
        padding: "3px 7px",
        cursor: "pointer",
        borderRadius: "3px",
        fontSize: "11px",
        flexShrink: "0",
        background: "var(--comfy-input-bg)",
        color: "var(--input-text)",
        border: "1px solid var(--border-color)",
    });
    removeBtn.title = "Remove this prompt";

    container.appendChild(label);
    container.appendChild(textarea);
    container.appendChild(removeBtn);

    return { container, label, textarea, removeBtn };
}

/**
 * Append one visual prompt widget to the node.
 * The widget itself has serialize=false — the JSON widget carries all data.
 */
function addPromptWidget(node, value = "") {
    if (!node._promptWidgets) node._promptWidgets = [];

    const index = node._promptWidgets.length;
    const { container, label, textarea, removeBtn } = buildPromptElement(node, index, value);

    const widget = node.addDOMWidget(
        `_vp_${index}`,  // internal name — not serialised
        "prompt_row",
        container,
        {
            serialize: false,   // ← KEY: no per-widget serialisation
            hideOnZoom: false,
            getValue: () => textarea.value,
            setValue: (v) => { textarea.value = v ?? ""; syncJson(node); },
        }
    );

    removeBtn.addEventListener("click", () => {
        if ((node._promptWidgets?.length ?? 0) <= 1) return;
        removePromptAt(node, node._promptWidgets.indexOf(widget));
    });

    node._promptWidgets.push(widget);

    // Update remove-button visibility across all widgets
    refreshRemoveButtons(node);
    syncJson(node);
    return widget;
}

/** Hide remove buttons when there is only one prompt left. */
function refreshRemoveButtons(node) {
    const multi = (node._promptWidgets?.length ?? 0) > 1;
    for (const pw of (node._promptWidgets ?? [])) {
        const btn = pw.element?.querySelector("button");
        if (btn) btn.style.visibility = multi ? "visible" : "hidden";
    }
}

/** Renumber labels after a removal. */
function renumberLabels(node) {
    (node._promptWidgets ?? []).forEach((pw, i) => {
        const span = pw.element?.querySelector("span");
        if (span) span.textContent = `Prompt ${i + 1}:`;
    });
}

function removePromptAt(node, index) {
    const widget = node._promptWidgets?.[index];
    if (!widget) return;

    // Remove from node.widgets
    const wi = node.widgets?.indexOf(widget);
    if (wi !== -1) node.widgets.splice(wi, 1);

    // Remove the DOM element from the document
    widget.element?.remove();

    // Remove from tracking array
    node._promptWidgets.splice(index, 1);

    renumberLabels(node);
    refreshRemoveButtons(node);
    syncJson(node);

    // Shrink only by the removed widget height, never below computed minimum.
    const computed = node.computeSize();
    const removedH = widget.computeSize ? widget.computeSize()[1] : 0;
    node.setSize([
        Math.max(node.size[0], computed[0]),
        Math.max(node.size[1] - removedH, computed[1]),
    ]);
    app.graph.setDirtyCanvas(true, true);
}

// ─────────────────────────────────────────────────────────────────────────────
// Rebuild all visual prompt widgets from saved JSON (used on load)
// ─────────────────────────────────────────────────────────────────────────────

function clearPromptWidgets(node) {
    for (const pw of (node._promptWidgets ?? [])) {
        const wi = node.widgets?.indexOf(pw);
        if (wi !== -1) node.widgets.splice(wi, 1);
        pw.element?.remove();
    }
    node._promptWidgets = [];
}

function rebuildFromJson(node, jsonValue, skipResize = false) {
    clearPromptWidgets(node);

    let prompts;
    try { prompts = JSON.parse(jsonValue); } catch { prompts = [""]; }
    if (!Array.isArray(prompts) || prompts.length === 0) prompts = [""];

    for (const p of prompts) addPromptWidget(node, p);

    // When called from onConfigure, skip setSize — LiteGraph restores
    // the saved size from data.size automatically after onConfigure returns.
    if (!skipResize) node.setSize(node.computeSize());
    app.graph.setDirtyCanvas(true, true);
}

// ─────────────────────────────────────────────────────────────────────────────
// Extension
// ─────────────────────────────────────────────────────────────────────────────

app.registerExtension({
    name: "ComfygPrompt.Frontend",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_NAME) return;

        // ── onNodeCreated ──────────────────────────────────────────────────
        // Called for EVERY node instance (new AND loaded from workflow).
        // We add infrastructure widgets here but NO visual prompt widgets —
        // those are added later, either in onConfigure (loaded) or via
        // queueMicrotask (brand-new node).
        nodeType.prototype.onNodeCreated = function () {
            this._promptWidgets  = [];
            this._wasConfigured  = false;

            // ── hidden serialised widgets (Python reads these) ──────────
            addHiddenWidget(this, "_index",        0,      "number");
            addHiddenWidget(this, "_prompts_json", '[""]', "text");

            // ── visible widgets ─────────────────────────────────────────
            if (!getWidget(this, "seed")) {
                this.addWidget("number", "seed", 0, () => {}, {
                    min: 0,
                    max: 0xFFFFFFFFFFFFFFFF,
                    step: 1,
                    precision: 0,
                });
            }
            if (!getWidget(this, "seed_mode")) {
                this.addWidget("combo", "seed_mode", "fixed", () => {}, {
                    values: ["fixed", "increment", "decrement", "random"],
                });
            }

            // ── "+ Add Prompt" button ───────────────────────────────────
            this.addWidget("button", "+ Add Prompt", "+ Add Prompt", () => {
                addPromptWidget(this, "");
                const computed = this.computeSize();
                this.setSize([
                    Math.max(this.size[0], computed[0]),
                    Math.max(this.size[1], computed[1]),
                ]);
                app.graph.setDirtyCanvas(true, true);
            }, { serialize: false });

            // For a brand-new node (not loaded from a workflow), onConfigure
            // is never called, so we add the first prompt after the current
            // call stack is done (giving onConfigure a chance to run first).
            queueMicrotask(() => {
                if (!this._wasConfigured) {
                    addPromptWidget(this, "");
                    this.setSize(this.computeSize());
                }
            });
        };

        // ── onConfigure ────────────────────────────────────────────────────
        // Called when ComfyUI restores a saved workflow.
        // At this point the hidden widget values are already restored by
        // ComfyUI, so we can read _prompts_json and rebuild the DOM widgets.
        nodeType.prototype.onConfigure = function (/* nodeData */) {
            this._wasConfigured = true;

            const jsonWidget = getWidget(this, "_prompts_json");
            // skipResize=true: LiteGraph restores data.size after this returns
            rebuildFromJson(this, jsonWidget?.value ?? '[""]', true);
        };

        // ── context menu ───────────────────────────────────────────────────
        const origMenu = nodeType.prototype.getExtraMenuOptions;
        nodeType.prototype.getExtraMenuOptions = function (_, options) {
            origMenu?.apply(this, arguments);
            options.push({
                content: "Reset prompts",
                callback: () => {
                    const iw = getWidget(this, "_index");
                    if (iw) iw.value = 0;
                    rebuildFromJson(this, '[""]');
                },
            });
        };
    },
});
