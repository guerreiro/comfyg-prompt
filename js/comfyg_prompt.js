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
    return (node._promptEntries ?? []).map(entry => entry.widget.value ?? "");
}

/** Write current prompt values into the hidden prompts_data widget. */
function syncDataWidget(node) {
    const dw = node.widgets?.find(w => w.name === DATA_WGT);
    if (dw) dw.value = JSON.stringify(getPrompts(node));
}

function isPromptWidget(widget) {
    return !!widget?._comfygPromptWidget;
}

function isPromptRemoveButton(widget) {
    return !!widget?._comfygPromptRemoveButton;
}

function relabelPromptWidgets(node) {
    const entries = node._promptEntries ?? [];

    entries.forEach((entry, index) => {
        const label = `Prompt ${index + 1}`;
        const { widget, removeButton } = entry;

        widget._comfygPromptWidget = true;
        widget.name = label;
        widget.label = label;

        const inputEl = widget._comfygInputEl;
        if (inputEl) {
            inputEl.placeholder = label;
            inputEl.setAttribute?.("placeholder", label);
        }

        if (removeButton) {
            removeButton.name = `Remove Prompt ${index + 1}`;
            removeButton.label = removeButton.name;
            removeButton.computeSize = () => (
                entries.length > 1 ? [node.size[0] - 20, 28] : [0, 0]
            );
        }
    });

    node._promptWidgets = entries.map(entry => entry.widget);
}

function cleanupWidgetDom(widget) {
    const inputEl = widget?._comfygInputEl ?? widget?.inputEl ?? widget?.element;
    inputEl?.remove?.();
}

/** Make a widget invisible while keeping it serialised. */
function hideWidget(widget) {
    widget.computeSize = () => [0, 0];
    widget.serializeValue = widget.serializeValue; // keep serialisation

    const inputEl = widget?._comfygInputEl ?? widget?.inputEl ?? widget?.element;
    if (inputEl?.style) {
        inputEl.style.display = "none";
        inputEl.style.visibility = "hidden";
        inputEl.style.pointerEvents = "none";
        inputEl.style.height = "0px";
    }
}

function removeWidgetFromNode(node, widget) {
    if (!node?.widgets || !widget) return;
    const index = node.widgets.indexOf(widget);
    if (index !== -1) node.widgets.splice(index, 1);
}

function removeAddPromptButton(node) {
    if (!node?._addPromptButton) return;
    removeWidgetFromNode(node, node._addPromptButton);
    node._addPromptButton = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Add / remove prompt widgets
// ─────────────────────────────────────────────────────────────────────────────

function appendPromptWidget(node, value = "") {
    if (!node._promptEntries) node._promptEntries = [];

    const idx = node._promptEntries.length;

    // Create a native STRING widget (multiline text area).
    const created = ComfyWidgets["STRING"](
        node,
        `Prompt ${idx + 1}`,
        ["STRING", { multiline: true, default: value }],
        app
    );
    const w = created.widget;
    w.value = value;
    w._comfygPromptWidget = true;
    w._comfygInputEl = created.inputEl ?? w.inputEl ?? w.element ?? null;
    if (w._comfygInputEl?.style) {
        w._comfygInputEl.style.overflowY = "auto";
        w._comfygInputEl.style.resize = "vertical";
        w._comfygInputEl.style.minHeight = "84px";
    }

    // Do NOT serialize this widget independently — prompts_data carries all values.
    w.serialize = false;

    // Intercept value changes so prompts_data stays in sync.
    const origCb = w.callback;
    w.callback = function (val) {
        origCb?.call(this, val);
        syncDataWidget(node);
    };

    const removeButton = node.addWidget("button", `Remove Prompt ${idx + 1}`, null, () => {
        const currentIndex = (node._promptEntries ?? []).findIndex(
            entry => entry.widget === w
        );
        removePromptWidget(node, currentIndex);
    });
    removeButton._comfygPromptRemoveButton = true;
    removeButton.serialize = false;

    node._promptEntries.push({ widget: w, removeButton });
    relabelPromptWidgets(node);
    syncDataWidget(node);

    return w;
}

function createAddPromptButton(node) {
    if (node._addPromptButton && node.widgets?.includes(node._addPromptButton)) {
        return node._addPromptButton;
    }

    const button = node.addWidget("button", "+ Add Prompt", null, () => {
        addPromptWidget(node, "");
    });

    button._comfygAddPromptButton = true;
    button.name = "+ Add Prompt";
    button.label = "+ Add Prompt";
    button.serialize = false;
    node._addPromptButton = button;
    return button;
}

function addPromptWidget(node, value = "") {
    removeAddPromptButton(node);
    const widget = appendPromptWidget(node, value);
    createAddPromptButton(node);
    node.setSize(node.computeSize());
    app.graph.setDirtyCanvas(true, true);
    return widget;
}

function removePromptWidget(node, index) {
    if (!node._promptEntries || node._promptEntries.length <= 1) return;

    const entry = node._promptEntries[index];
    if (!entry) return;

    const { widget, removeButton } = entry;

    // Remove from node.widgets
    cleanupWidgetDom(widget);

    removeWidgetFromNode(node, widget);
    removeWidgetFromNode(node, removeButton);

    // Remove from tracked list
    node._promptEntries.splice(index, 1);

    // Re-label remaining widgets
    relabelPromptWidgets(node);

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

    removeAddPromptButton(node);

    // Remove every prompt widget we can find. This avoids stale widgets
    // when ComfyUI restores the node lifecycle in a different order.
    for (const w of (node.widgets ?? []).filter(
        widget => isPromptWidget(widget) || isPromptRemoveButton(widget)
    )) {
        if (isPromptWidget(w)) cleanupWidgetDom(w);
        removeWidgetFromNode(node, w);
    }
    node._promptEntries = [];
    node._promptWidgets = [];

    // Recreate
    for (const p of prompts) appendPromptWidget(node, p);

    relabelPromptWidgets(node);
    createAddPromptButton(node);
    node.setSize(node.computeSize());
    app.graph.setDirtyCanvas(true, true);
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
