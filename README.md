# Comfyg-Prompt

[![ComfyUI](https://img.shields.io/badge/ComfyUI-Node-blue)](https://github.com/comfyanonymous/ComfyUI)

A ComfyUI custom node that queues one job per prompt. Dynamically add or remove prompt fields as needed.

## What it does

Comfyg-Prompt allows you to:
- Enter multiple prompts in a single node
- Each prompt becomes a separate job in the ComfyUI queue
- Dynamically add or remove prompt fields
- Configure seed behavior for each job

## Installation

### Via ComfyUI Manager (Recommended)

1. Open ComfyUI Manager
2. Search for "Comfyg-Prompt"
3. Click Install
4. Restart ComfyUI

### Manual Installation

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/your-username/comfyg-prompt.git
pip install requests
```

## Usage

1. Add the **Comfyg-Prompt** node to your workflow
2. Enter prompts in the text fields (click "+ Add Prompt" to add more)
3. Configure seed and seed mode
4. Click Run

The node will:
- Execute the first prompt immediately
- Queue remaining prompts as separate jobs
- Each job uses the configured seed mode

## Seed Modes

| Mode | Description |
|------|-------------|
| `fixed` | Same seed for all jobs |
| `increment` | Seed increases by 1 for each job |
| `decrement` | Seed decreases by 1 for each job |
| `random` | Random seed for each job |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| `prompt` | STRING | The current prompt text |
| `seed` | INT | The calculated seed value |

## Features

- ✅ Dynamic prompt fields (add/remove)
- ✅ Multiple seed modes
- ✅ Automatic job queuing
- ✅ Clean UI with horizontal layout
- ✅ Workflow persistence

## Requirements

- ComfyUI (latest version)
- Python 3.x
- `requests` library (for API calls)

## License

MIT License
