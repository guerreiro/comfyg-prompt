import { app } from "../../scripts/app.js";
import { ComfyWidgets } from "../../scripts/widgets.js";

const EXT_NAME   = "ComfygPrompt.DynamicPrompts";
const NODE_NAME  = "ComfygPrompt";
const DATA_WGT   = "prompts_data"; // hidden widget that stores the JSON
const INDEX_WGT  = "_index";       // hidden counter widget
const CONTROL_WGT = "control_after_generate";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Return current prompt values from the visual widgets. */
function getPrompts(node) {
    return (node._promptWidgets ?? []).map(w => w.value ?? "");
}

/** Write current prompt values into the hidden prompts_data widget. */
function syncDataWidget(node) {
    const dw = node.widgets?.find(w => w.name === DATA_WGT);
    if (dw) dw.value = JSON.stringify(getPrompts(node));
}

function isPromptWidget(widget) {
    return !!(widget?._comfygPromptWidget || widget?.name?.startsWith("_vp_"));
}

function relabelPromptWidgets(node) {
    (node._promptWidgets ?? []).forEach((widget, index) => {
        const label = `Prompt ${index + 1}`;
        widget._comfygPromptWidget = true;
        widget.name = `_vp_${index}`;
        widget.label = label;
    });
}

function ensureWidgetOrder(node) {
    if (!node.widgets) return;

    const promptWidgets = node.widgets.filter(isPromptWidget);
    const addButton = node._addPromptButton
        ?? node.widgets.find(w => w?._comfygAddPromptButton);

    const baseWidgets = node.widgets.filter(
        w => !isPromptWidget(w) && w !== addButton
    );

    node.widgets.length = 0;
    node.widgets.push(...baseWidgets, ...promptWidgets);
    if (addButton) node.widgets.push(addButton);
}

/** Make a widget invisible while keeping it serialised. */
function hideWidget(widget) {
    widget.computeSize = () => [0, -4];
    widget.serializeValue = widget.serializeValue; // keep serialisation
}

// ─────────────────────────────────────────────────────────────────────────────
// Add / remove prompt widgets
// ─────────────────────────────────────────────────────────────────────────────

function addPromptWidget(node, value = "") {
    if (!node._promptWidgets) node._promptWidgets = [];

    const idx = node._promptWidgets.length;

    // Create a native STRING widget (multiline text area).
    const created = ComfyWidgets["STRING"](
        node,
        `_vp_${idx}`,               // internal name — not used by Python
        ["STRING", { multiline: true, default: value }],
        app
    );
    const w = created.widget;
    w.value = value;

    // Do NOT serialize this widget independently — prompts_data carries all values.
    w.serialize = false;

    // Intercept value changes so prompts_data stays in sync.
    const origCb = w.callback;
    w.callback = function (val) {
        origCb?.call(this, val);
        syncDataWidget(node);
    };

    // ── remove button drawn inside the widget row ──────────────────────
    // We draw a small "✕" button on the right side of the widget header.
    const origDraw = w.draw?.bind(w);
    w.draw = function (ctx, node, widgetWidth, y, H) {
        origDraw?.(ctx, node, widgetWidth, y, H);

        // Only show remove button when there is more than one prompt.
        if ((node._promptWidgets?.length ?? 0) <= 1) return;

        const btnSize = 18;
        const btnX = widgetWidth - btnSize - 6;
        const btnY = y + (H - btnSize) / 2;

        ctx.save();
        ctx.fillStyle = "rgba(180,60,60,0.85)";
        ctx.beginPath();
        ctx.roundRect(btnX, btnY, btnSize, btnSize, 3);
        ctx.fill();

        ctx.fillStyle = "#fff";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("✕", btnX + btnSize / 2, btnY + btnSize / 2);
        ctx.restore();

        // Store hit area so mouse handler can detect clicks.
        w._removeBtnRect = { x: btnX, y: btnY, w: btnSize, h: btnSize };
    };

    // ── mouse click handler ─────────────────────────────────────────────
    w.mouse = function (event, pos, node) {
        if (event.type !== "pointerdown") return false;
        const r = w._removeBtnRect;
        if (!r) return false;

        // pos is relative to the widget row — check bounds.
        const [mx, my] = pos;
        if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
            removePromptWidget(node, node._promptWidgets.indexOf(w));
            return true; // consumed
        }
        return false;
    };

    node._promptWidgets.push(w);
    relabelPromptWidgets(node);
    ensureWidgetOrder(node);
    syncDataWidget(node);

    return w;
}

function removePromptWidget(node, index) {
    if (!node._promptWidgets || node._promptWidgets.length <= 1) return;

    const w = node._promptWidgets[index];
    if (!w) return;

    // Remove from node.widgets
    const wi = node.widgets.indexOf(w);
    if (wi !== -1) node.widgets.splice(wi, 1);

    // Remove from tracked list
    node._promptWidgets.splice(index, 1);

    // Re-label remaining widgets
    relabelPromptWidgets(node);

    ensureWidgetOrder(node);
    syncDataWidget(node);
    node.setSize(node.computeSize());
    app.graph.setDirtyCanvas(true, true);
}

// ─────────────────────────────────────────────────────────────────────────────
// Rebuild visual widgets from a saved JSON array (used on load / configure)
// ─────────────────────────────────────────────────────────────────────────────

function rebuildFromData(node, promptsJson) {
    let prompts;
    try {
        prompts = JSON.parse(promptsJson);
    } catch {
        prompts = [""];
    }
    if (!Array.isArray(prompts) || prompts.length === 0) prompts = [""];

    // Remove every prompt widget we can find. This avoids stale widgets
    // when ComfyUI restores the node lifecycle in a different order.
    for (const w of (node.widgets ?? []).filter(isPromptWidget)) {
        const i = node.widgets.indexOf(w);
        if (i !== -1) node.widgets.splice(i, 1);
    }
    node._promptWidgets = [];

    // Recreate
    for (const p of prompts) addPromptWidget(node, p);

    relabelPromptWidgets(node);
    ensureWidgetOrder(node);
    node.setSize(node.computeSize());
    app.graph.setDirtyCanvas(true, true);
}

function ensureAddPromptButton(node) {
    if (node._addPromptButton && node.widgets?.includes(node._addPromptButton)) {
        return node._addPromptButton;
    }

    let button = node.widgets?.find(w => w?._comfygAddPromptButton);
    if (!button) {
        button = node.addWidget("button", "+ Add Prompt", null, () => {
            addPromptWidget(node, "");
            node.setSize(node.computeSize());
            app.graph.setDirtyCanvas(true, true);
        });
        button._comfygAddPromptButton = true;
    }

    node._addPromptButton = button;
    ensureWidgetOrder(node);
    return button;
}

function prepareNode(node) {
    const dataW = node.widgets?.find(w => w.name === DATA_WGT);
    const indexW = node.widgets?.find(w => w.name === INDEX_WGT);
    const controlW = node.widgets?.find(w => w.name === CONTROL_WGT);

    if (dataW) hideWidget(dataW);
    if (indexW) hideWidget(indexW);
    if (controlW) hideWidget(controlW);

    const seedModeW = node.widgets?.find(w => w.name === "seed_mode");
    if (seedModeW) seedModeW.label = "Seed mode";

    ensureAddPromptButton(node);
}

// ─────────────────────────────────────────────────────────────────────────────
// Extension registration
// ─────────────────────────────────────────────────────────────────────────────

app.registerExtension({
    name: EXT_NAME,

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_NAME) return;

        // ── onNodeCreated ──────────────────────────────────────────────
        const origCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            origCreated?.apply(this, arguments);
            prepareNode(this);

            const dataW = this.widgets?.find(w => w.name === DATA_WGT);
            rebuildFromData(this, dataW?.value || '[""]');
        };

        // ── onConfigure — restore widgets when loading a saved workflow ──
        const origConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (data) {
            origConfigure?.apply(this, arguments);
            prepareNode(this);

            const dataW = this.widgets?.find(w => w.name === DATA_WGT);
            rebuildFromData(this, dataW?.value || '[""]');
        };

        // ── getExtraMenuOptions — right-click context menu ───────────────
        const origMenu = nodeType.prototype.getExtraMenuOptions;
        nodeType.prototype.getExtraMenuOptions = function (_, options) {
            origMenu?.apply(this, arguments);
            options.push({
                content: "Reset Comfyg-Prompt (clear all prompts)",
                callback: () => {
                    rebuildFromData(this, '[""]');
                    const indexW = this.widgets?.find(w => w.name === INDEX_WGT);
                    if (indexW) indexW.value = 0;
                },
            });
        };
    },
});
