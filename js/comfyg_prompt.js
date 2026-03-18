import { app } from "../../scripts/app.js";

const EXT_NAME = "ComfygPrompt.DynamicPrompts";
const NODE_NAME = "ComfygPrompt";
const DATA_WGT = "prompts_data";
const INDEX_WGT = "_index";
const CONTROL_WGT = "control_after_generate";

const MIN_NODE_WIDTH = 380;
const PROMPT_TEXTAREA_HEIGHT = 110;
const PROMPT_CARD_HEIGHT = 170;
const EDITOR_CHROME_HEIGHT = 78;

function findWidget(node, name) {
    return node.widgets?.find(widget => widget.name === name);
}

function normalizePrompts(rawValue) {
    let prompts = rawValue;

    if (typeof prompts === "string") {
        try {
            prompts = JSON.parse(prompts);
        } catch {
            prompts = [prompts];
        }
    }

    if (!Array.isArray(prompts)) {
        prompts = [prompts ?? ""];
    }

    prompts = prompts.map(prompt => {
        if (typeof prompt === "string") return prompt;
        return String(prompt ?? "");
    });

    return prompts.length ? prompts : [""];
}

function getPromptState(node) {
    if (!Array.isArray(node._comfygPromptState) || node._comfygPromptState.length === 0) {
        node._comfygPromptState = [""];
    }
    return node._comfygPromptState;
}

function setPromptState(node, prompts, options = {}) {
    const { sync = true, render = true, resize = true } = options;

    node._comfygPromptState = normalizePrompts(prompts);

    if (sync) syncDataWidget(node);
    if (render) renderPromptEditor(node);
    if (resize) resizeNodeForEditor(node);
}

function syncDataWidget(node) {
    const dataWidget = findWidget(node, DATA_WGT);
    if (dataWidget) {
        dataWidget.value = JSON.stringify(getPromptState(node));
    }
}

function hideWidget(widget) {
    if (!widget || widget._comfygHidden) return;

    widget._comfygHidden = true;
    widget.computeSize = () => [0, 0];
    widget.draw = () => {};

    const inputEl = widget.inputEl ?? widget.element ?? null;
    if (inputEl?.style) {
        inputEl.style.display = "none";
        inputEl.style.visibility = "hidden";
        inputEl.style.pointerEvents = "none";
        inputEl.style.height = "0px";
        inputEl.style.minHeight = "0px";
        inputEl.style.maxHeight = "0px";
        inputEl.style.opacity = "0";
    }
}

function getEditorHeight(node) {
    return EDITOR_CHROME_HEIGHT + (getPromptState(node).length * PROMPT_CARD_HEIGHT);
}

function getNodeMinHeight(node) {
    const baseHeight = node.computeSize ? node.computeSize()[1] : 0;
    return Math.max(baseHeight, getEditorHeight(node) + 140);
}

function resizeNodeForEditor(node) {
    const nextWidth = Math.max(node.size?.[0] ?? MIN_NODE_WIDTH, MIN_NODE_WIDTH);
    const nextHeight = Math.max(node.size?.[1] ?? 0, getNodeMinHeight(node));

    if (!node.size || node.size[0] !== nextWidth || node.size[1] !== nextHeight) {
        node.setSize([nextWidth, nextHeight]);
    }

    app.graph.setDirtyCanvas(true, true);
}

function stopEventBubble(element) {
    const stop = event => event.stopPropagation();
    ["pointerdown", "mousedown", "click", "dblclick", "wheel"].forEach(eventName => {
        element.addEventListener(eventName, stop);
    });
}

function createElement(tag, style = {}) {
    const element = document.createElement(tag);
    Object.assign(element.style, style);
    return element;
}

function buildEditorDom(node) {
    const root = createElement("div", {
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        boxSizing: "border-box",
        width: "100%",
        color: "#ddd",
        padding: "4px 0 2px 0",
        fontFamily: "system-ui, sans-serif",
    });

    const title = createElement("div", {
        fontSize: "12px",
        fontWeight: "600",
        letterSpacing: "0.03em",
        textTransform: "uppercase",
        color: "#a8a8a8",
        padding: "2px 2px 0 2px",
    });
    title.textContent = "Prompts";

    const list = createElement("div", {
        display: "flex",
        flexDirection: "column",
        gap: "12px",
    });

    const addButton = createElement("button", {
        appearance: "none",
        border: "1px solid #666",
        borderRadius: "8px",
        background: "#2d2d2d",
        color: "#f2f2f2",
        cursor: "pointer",
        fontSize: "14px",
        lineHeight: "20px",
        height: "38px",
        width: "100%",
    });
    addButton.type = "button";
    addButton.textContent = "+ Add Prompt";
    stopEventBubble(addButton);
    addButton.addEventListener("click", () => {
        setPromptState(node, [...getPromptState(node), ""]);
    });

    root.append(title, list, addButton);
    stopEventBubble(root);

    node._comfygEditorEls = { root, list, addButton };
    return root;
}

function renderPromptEditor(node) {
    const list = node._comfygEditorEls?.list;
    if (!list) return;

    list.replaceChildren();

    const prompts = getPromptState(node);

    prompts.forEach((promptValue, index) => {
        const card = createElement("div", {
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            border: "1px solid #4f4f4f",
            borderRadius: "10px",
            padding: "10px",
            background: "#232323",
            boxSizing: "border-box",
        });

        const header = createElement("div", {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
        });

        const title = createElement("div", {
            fontSize: "13px",
            fontWeight: "600",
            color: "#e8e8e8",
        });
        title.textContent = `Prompt ${index + 1}`;

        const removeButton = createElement("button", {
            appearance: "none",
            border: "1px solid #7a4b4b",
            borderRadius: "6px",
            background: prompts.length > 1 ? "#5b2d2d" : "#353535",
            color: prompts.length > 1 ? "#fff" : "#8d8d8d",
            cursor: prompts.length > 1 ? "pointer" : "default",
            fontSize: "12px",
            lineHeight: "18px",
            minWidth: "84px",
            height: "28px",
        });
        removeButton.type = "button";
        removeButton.textContent = "Remove";
        removeButton.disabled = prompts.length <= 1;
        stopEventBubble(removeButton);
        removeButton.addEventListener("click", () => {
            if (prompts.length <= 1) return;
            const nextPrompts = getPromptState(node).filter((_, promptIndex) => promptIndex !== index);
            setPromptState(node, nextPrompts);
        });

        const textarea = createElement("textarea", {
            width: "100%",
            minWidth: "0",
            minHeight: `${PROMPT_TEXTAREA_HEIGHT}px`,
            height: `${PROMPT_TEXTAREA_HEIGHT}px`,
            maxHeight: `${PROMPT_TEXTAREA_HEIGHT}px`,
            boxSizing: "border-box",
            resize: "none",
            overflowY: "auto",
            border: "1px solid #5d5d5d",
            borderRadius: "8px",
            background: "#171717",
            color: "#f3f3f3",
            padding: "10px",
            fontSize: "13px",
            lineHeight: "1.4",
            outline: "none",
        });
        textarea.value = promptValue;
        textarea.placeholder = `Prompt ${index + 1}`;
        textarea.spellcheck = false;
        stopEventBubble(textarea);
        textarea.addEventListener("input", event => {
            const nextPrompts = [...getPromptState(node)];
            nextPrompts[index] = event.target.value;
            setPromptState(node, nextPrompts, { render: false, resize: false });
        });

        header.append(title, removeButton);
        card.append(header, textarea);
        list.append(card);
    });

    const addButton = node._comfygEditorEls?.addButton;
    if (addButton) {
        addButton.disabled = false;
    }

    app.graph.setDirtyCanvas(true, true);
}

function ensureEditorWidget(node) {
    if (node._comfygEditorWidget) return node._comfygEditorWidget;
    if (typeof node.addDOMWidget !== "function") {
        console.warn("[Comfyg-Prompt] addDOMWidget is not available in this frontend.");
        return null;
    }

    const root = buildEditorDom(node);

    const widget = node.addDOMWidget("prompts_editor", "COMFYG_PROMPTS_EDITOR", root, {
        hideOnZoom: false,
        getValue: () => JSON.stringify(getPromptState(node)),
        setValue: value => {
            setPromptState(node, normalizePrompts(value));
        },
        getMinHeight: () => getEditorHeight(node),
        getMaxHeight: () => getEditorHeight(node),
        getHeight: () => getEditorHeight(node),
        afterResize: () => {
            resizeNodeForEditor(node);
        },
    });

    widget.serialize = false;
    widget.computeSize = () => [Math.max((node.size?.[0] ?? MIN_NODE_WIDTH) - 20, 0), getEditorHeight(node)];
    node._comfygEditorWidget = widget;

    return widget;
}

function prepareNode(node) {
    hideWidget(findWidget(node, DATA_WGT));
    hideWidget(findWidget(node, INDEX_WGT));
    hideWidget(findWidget(node, CONTROL_WGT));

    const seedModeWidget = findWidget(node, "seed_mode");
    if (seedModeWidget) seedModeWidget.label = "Seed mode";

    ensureEditorWidget(node);
}

function syncFromSerializedData(node) {
    const dataWidget = findWidget(node, DATA_WGT);
    const prompts = normalizePrompts(dataWidget?.value ?? '[""]');
    setPromptState(node, prompts);
}

app.registerExtension({
    name: EXT_NAME,

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_NAME) return;

        const origCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            origCreated?.apply(this, arguments);
            prepareNode(this);
            syncFromSerializedData(this);
        };

        const origConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (data) {
            origConfigure?.apply(this, arguments);
            prepareNode(this);
            syncFromSerializedData(this);
        };

        const origResize = nodeType.prototype.onResize;
        nodeType.prototype.onResize = function (size) {
            origResize?.apply(this, arguments);

            if (Array.isArray(size) && size.length >= 2) {
                const nextWidth = Math.max(size[0], MIN_NODE_WIDTH);
                const nextHeight = Math.max(size[1], getNodeMinHeight(this));
                if (nextWidth !== size[0] || nextHeight !== size[1]) {
                    this.setSize([nextWidth, nextHeight]);
                }
            }
        };

        const origRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            this._comfygEditorEls?.root?.remove?.();
            this._comfygEditorEls = null;
            this._comfygEditorWidget = null;
            this._comfygPromptState = null;
            origRemoved?.apply(this, arguments);
        };

        const origMenu = nodeType.prototype.getExtraMenuOptions;
        nodeType.prototype.getExtraMenuOptions = function (_, options) {
            origMenu?.apply(this, arguments);
            options.push({
                content: "Reset Comfyg-Prompt (clear all prompts)",
                callback: () => {
                    const indexWidget = findWidget(this, INDEX_WGT);
                    if (indexWidget) indexWidget.value = 0;
                    setPromptState(this, [""]);
                },
            });
        };
    },
});
