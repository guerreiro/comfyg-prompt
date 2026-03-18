# Comfyg-Prompt

Custom node for ComfyUI that lets you manage multiple prompts inside a single node and execute each `prompt x repetition` combination as an independent job in the ComfyUI queue.

The node builds the job list internally and, after each execution, auto-enqueues the next item through `POST http://localhost:8188/prompt`.

## What It Does

- Displays multiple visual prompt fields inside the ComfyUI frontend.
- Stores all prompts in a single serialized widget (`prompts_data`) as JSON.
- Expands the prompt list into a flat sequence of jobs.
- Runs each prompt `N` times based on `repetitions`.
- Supports either a fixed seed or an incremented seed per job.
- Updates `_index` internally so the sequence continues until the queue is finished.

Example with:

- `prompts = ["A", "B"]`
- `repetitions = 2`

Result:

```text
Job 1: A
Job 2: A
Job 3: B
Job 4: B
```

If `seed_mode = incremental` and `seed = 10`, the generated seeds are:

```text
10, 11, 12, 13
```

## Project Structure

```text
.
├── __init__.py
├── comfyg_prompt.py
└── js/
    └── comfyg_prompt.js
```

## How It Works

### Python Backend

File: [`comfyg_prompt.py`](/Volumes/NVME_Mac_500/vibe/comfyg-prompt/comfyg_prompt.py)

The `ComfygPrompt` node:

- receives `prompts_data` as a JSON string;
- filters out empty prompts;
- builds a linear list of repeated jobs;
- selects the current job based on `_index`;
- returns:
  - `prompt` (`STRING`)
  - `seed` (`INT`)
- auto-enqueues the next execution if there is another job pending.

Main inputs:

- `prompts_data`: JSON array containing all prompts
- `repetitions`: number of repetitions per prompt
- `seed_mode`: `incremental` or `fixed`
- `seed`: base seed value
- `_index`: internal execution counter

Hidden inputs:

- `unique_id`
- `extra_pnginfo`
- `prompt`

### JavaScript Frontend

File: [`js/comfyg_prompt.js`](/Volumes/NVME_Mac_500/vibe/comfyg-prompt/js/comfyg_prompt.js)

The frontend extension:

- hides the internal `prompts_data` and `_index` widgets;
- creates dynamic visual widgets for each prompt;
- keeps the visual values synchronized with `prompts_data`;
- adds a `+ Add Prompt` button;
- allows prompt removal directly from the widget row;
- rebuilds the prompt fields when a saved workflow is loaded;
- adds a context menu action to reset the node.

## Installation

Clone this repository into your ComfyUI custom nodes directory:

```bash
cd ComfyUI/custom_nodes
git clone <repo-url> comfyg-prompt
```

Install the Python dependency used by the node:

```bash
pip install requests
```

Restart ComfyUI after installation.

## Usage

1. Add the `Comfyg-Prompt` node to your workflow.
2. Click `+ Add Prompt` to create as many prompt fields as needed.
3. Set `repetitions`.
4. Choose `seed_mode`:
   - `fixed`: reuse the same seed for every job
   - `incremental`: add the current job index to the base seed
5. Connect the `prompt` output wherever your text input is consumed.
6. Connect the `seed` output to nodes that expect a numeric seed.
7. Run the workflow normally.

## Logs and Debug

The node already includes simple backend logs that are useful during development and debugging in the ComfyUI terminal.

Example logs:

```text
[PromptTester] Job 1/4 | seed_mode=incremental seed=10 | prompt='A cat wearing sunglasses'
[PromptTester] Queued job #2, prompt_id=12345
```

Queueing failures also show up in the terminal:

```text
[PromptTester] Queue failed (500): ...
[PromptTester] Error queuing next job: ...
```

Useful debug checks:

- confirm ComfyUI is reachable at `http://localhost:8188`;
- verify that `prompts_data` is being stored as valid JSON;
- confirm `_index` is being updated in the serialized workflow;
- check whether the `/prompt` endpoint returns the next `prompt_id`.

## Current Limitations

- The enqueue endpoint is hardcoded to `http://localhost:8188/prompt`.
- The request timeout is fixed at 5 seconds.
- The `requests` dependency must be available in the ComfyUI Python environment.
- Logs still use the `[PromptTester]` prefix even though the node name is `Comfyg-Prompt`.
- The node category is currently set to `utils/testing`.

## Node Registration

File: [`__init__.py`](/Volumes/NVME_Mac_500/vibe/comfyg-prompt/__init__.py)

- exported class: `ComfygPrompt`
- display name: `Comfyg-Prompt`
- web directory: `./js`

## Recommended Next Improvements

- align the log prefix with `Comfyg-Prompt`;
- make the ComfyUI host and port configurable;
- add more explicit error handling around `resp.json()`;
- include screenshots or a GIF in the README;
- add an example workflow for easier testing and onboarding.
