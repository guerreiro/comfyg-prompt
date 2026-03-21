import { app } from "../../scripts/app.js";

const NODE_NAME = "ComfygPrompt";
const MIN_PROMPTS = 1;

app.registerExtension({
    name: "ComfygPrompt.Frontend",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_NAME) return;

        nodeType.prototype.serialize_widgets = true;

        nodeType.prototype.onNodeCreated = function () {
            this._promptCounter = 0;
            this._promptWidgets = [];

            // Order: seed first, then add button, then prompts
            addSeedWidgets(this);
            addAddButton(this);
            addPromptWidget(this);
        };

        nodeType.prototype.onConfigure = function () {
            initWidgets(this);
        };
    },
});

function initWidgets(node) {
    // Initialize tracking arrays
    node._promptCounter = 0;
    node._promptWidgets = [];

    // Collect existing prompt values before removing
    const existingValues = [];
    if (node.widgets) {
        for (const w of node.widgets) {
            if (w?.name?.startsWith("prompt_")) {
                const val = w.getValue?.() || w.value || "";
                if (val) existingValues.push(val);
            }
        }

        // Remove ALL non-seed widgets to rebuild in correct order
        for (let i = node.widgets.length - 1; i >= 0; i--) {
            const w = node.widgets[i];
            if (w && !["seed", "seed_mode", "_index"].includes(w.name)) {
                node.widgets.splice(i, 1);
            }
        }
    }

    // Add seed widgets if missing
    addSeedWidgets(node);

    // Add button (after seed, before prompts)
    addAddButton(node);

    // Add prompt widgets
    if (existingValues.length > 0) {
        for (const val of existingValues) {
            addPromptWidget(node, val);
        }
    } else {
        addPromptWidget(node);
    }

    app.graph.setDirtyCanvas(true, true);
}

function addSeedWidgets(node) {
    // Hidden _index for job tracking
    if (!node.widgets?.find(w => w?.name === "_index")) {
        const indexWidget = node.addWidget("number", "_index", 0, function() {}, {
            min: 0,
            max: 9999,
            step: 1,
            precision: 0,
        });
        indexWidget.computeSize = () => [0, -4];
        indexWidget.type = "hidden";
    }
    if (!node.widgets?.find(w => w?.name === "seed")) {
        node.addWidget("number", "seed", 0, function() {}, {
            min: 0,
            max: 0xFFFFFFFFFFFFFFFF,
            step: 1,
            precision: 0,
        });
    }
    if (!node.widgets?.find(w => w?.name === "seed_mode")) {
        node.addWidget("combo", "seed_mode", "fixed", function() {}, {
            values: ["fixed", "increment", "decrement", "random"],
        });
    }
}

function addAddButton(node) {
    if (node.widgets?.find(w => w?.name === "+ Add Prompt")) return;
    node.addWidget("button", "+ Add Prompt", "+ Add Prompt", function() {
        addPromptWidget(node);
    }, { serialize: false });
}

function addPromptWidget(node, value = "") {
    node._promptCounter++;
    const num = node._promptCounter;
    const name = "prompt_" + num;

    // Create container div with flexbox
    const container = document.createElement("div");
    container.style.display = "flex";
    container.style.alignItems = "flex-start";
    container.style.gap = "4px";
    container.style.marginBottom = "4px";
    container.style.padding = "2px";

    // Label "Prompt N:"
    const label = document.createElement("span");
    label.textContent = "Prompt " + num + ":";
    label.style.minWidth = "60px";
    label.style.fontWeight = "bold";
    label.style.paddingTop = "6px";
    label.style.fontSize = "12px";

    // Textarea for the prompt
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.flex = "1";
    textarea.style.minHeight = "50px";
    textarea.style.resize = "vertical";
    textarea.style.fontFamily = "inherit";
    textarea.style.fontSize = "12px";
    textarea.style.padding = "4px";

    // Remove button (X) on the right
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "✕";
    removeBtn.style.padding = "4px 8px";
    removeBtn.style.cursor = "pointer";
    removeBtn.style.borderRadius = "3px";
    removeBtn.title = "Remove this prompt";

    // Hide remove button for first prompt
    if (num === 1) {
        removeBtn.style.visibility = "hidden";
    }

    // Assemble row
    container.appendChild(label);
    container.appendChild(textarea);
    container.appendChild(removeBtn);

    // Register as DOM widget
    const widget = node.addDOMWidget(name, "prompt_row", container, {
        serialize: true,
        hideOnZoom: false,
        getValue: () => textarea.value,
        setValue: (val) => { textarea.value = val; },
    });

    // Setup remove button click
    removeBtn.onclick = () => {
        if (node._promptWidgets.length > MIN_PROMPTS) {
            removeAndRenumber(node, name);
        }
    };

    node._promptWidgets.push(widget);
    app.graph.setDirtyCanvas(true, true);

    return widget;
}

function removeAndRenumber(node, nameToRemove) {
    if (node._promptWidgets.length <= MIN_PROMPTS) return;

    // Save values from remaining widgets
    const values = [];
    for (const w of node._promptWidgets) {
        if (w.name !== nameToRemove) {
            const textarea = w.element?.querySelector("textarea");
            if (textarea) {
                values.push(textarea.value);
            }
        }
    }

    // Remove only prompt DOM widgets (not seed/add button)
    for (const w of node._promptWidgets) {
        const idx = node.widgets.indexOf(w);
        if (idx !== -1) {
            node.widgets.splice(idx, 1);
        }
        w.element?.remove();
    }
    node._promptWidgets = [];

    // Recreate with sequential numbering
    node._promptCounter = 0;
    for (const val of values) {
        addPromptWidget(node, val);
    }

    app.graph.setDirtyCanvas(true, true);
}
