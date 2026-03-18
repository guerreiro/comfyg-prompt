import json
import copy
import requests


class ComfygPrompt:
    """
    Comfyg-Prompt — queues one independent ComfyUI job per prompt/repetition.

    Widgets serialised in widgets_values (order matters for workflow JSON):
        [0] prompts_data  — JSON array of prompt strings (managed by the JS extension)
        [1] repetitions   — how many times each prompt is run
        [2] seed_mode     — "incremental" | "fixed"
        [3] seed          — base seed value
        [4] control_after_generate — auto-added by ComfyUI for the seed widget
        [5] _index                — current job index (written by the node itself when queueing)

    _index and prompts_data are hidden in the UI via the JS extension.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                # Stores all prompts as a JSON array; rendered as individual
                # text widgets by the JS extension.
                "prompts_data": ("STRING", {"default": '[""]'}),
                "repetitions": ("INT", {"default": 1, "min": 1, "max": 50}),
                "seed_mode": (["incremental", "fixed"],),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF}),
                # Internal counter — hidden in the UI, updated per job.
                "_index": ("INT", {"default": 0, "min": 0, "max": 9999}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO",
                "prompt": "PROMPT",
            },
        }

    RETURN_TYPES = ("STRING", "INT")
    RETURN_NAMES = ("prompt", "seed")
    FUNCTION = "execute"
    CATEGORY = "utils/testing"

    # ------------------------------------------------------------------ #

    def execute(
        self,
        prompts_data,
        repetitions,
        seed_mode,
        seed,
        _index,
        unique_id,
        extra_pnginfo,
        prompt,
    ):
        # --- parse prompts ------------------------------------------------
        try:
            prompts = json.loads(prompts_data)
        except Exception:
            prompts = [prompts_data]

        prompts = [p.strip() for p in prompts if p.strip()]

        if not prompts:
            print("[PromptTester] No prompts found — returning empty string.")
            return ("", seed)

        # --- build flat job list: [p0, p0, p0, p1, p1, ...] --------------
        # Each prompt is repeated `repetitions` times consecutively.
        job_list = [p for p in prompts for _ in range(repetitions)]
        total = len(job_list)
        index = min(_index, total - 1)

        current_prompt = job_list[index]
        current_seed = (seed + index) if seed_mode == "incremental" else seed

        print(
            f"[PromptTester] Job {index + 1}/{total} "
            f"| seed_mode={seed_mode} seed={current_seed} "
            f"| prompt={current_prompt[:80]!r}"
        )

        # --- queue next job if there is one --------------------------------
        if index + 1 < total:
            self._queue_next(
                prompt,
                extra_pnginfo,
                unique_id,
                index + 1,
                seed,
            )

        return (current_prompt, current_seed)

    # ------------------------------------------------------------------ #

    def _queue_next(self, api_prompt, extra_pnginfo, unique_id, next_index, base_seed):
        """
        Build a copy of the current prompt/workflow with _index incremented
        and POST it to the local ComfyUI /prompt endpoint.
        """
        new_prompt = copy.deepcopy(api_prompt)
        node_id = str(unique_id)

        # Update _index inside the API-format prompt (used by ComfyUI to
        # resolve node inputs during execution). We also force
        # control_after_generate to fixed so ComfyUI does not mutate the
        # seed behind our own seed_mode logic.
        if node_id in new_prompt:
            inputs = new_prompt[node_id].setdefault("inputs", {})
            inputs["_index"] = next_index
            inputs["seed"] = base_seed
            inputs["control_after_generate"] = "fixed"

        # Also update the workflow JSON that gets embedded in the PNG metadata
        # and is used by the frontend to restore the graph state.
        workflow = {}
        if extra_pnginfo and "workflow" in extra_pnginfo:
            workflow = copy.deepcopy(extra_pnginfo["workflow"])
            for node in workflow.get("nodes", []):
                if str(node.get("id")) == node_id:
                    wv = node.get("widgets_values", [])
                    # widgets_values also includes ComfyUI's linked
                    # control_after_generate widget for seed, so _index is
                    # the last entry rather than a fixed index.
                    if len(wv) >= 1:
                        wv[-1] = next_index
                    if len(wv) >= 2 and isinstance(wv[-2], str):
                        wv[-2] = "fixed"
                    if len(wv) >= 3:
                        wv[-3] = base_seed
                    break

        payload = {
            "prompt": new_prompt,
            "extra_data": {"extra_pnginfo": {"workflow": workflow}},
        }

        try:
            resp = requests.post(
                "http://localhost:8188/prompt", json=payload, timeout=5
            )
            data = resp.json()
            if resp.status_code == 200:
                print(
                    f"[PromptTester] Queued job #{next_index + 1}, "
                    f"prompt_id={data.get('prompt_id', '?')}"
                )
            else:
                print(
                    f"[PromptTester] Queue failed ({resp.status_code}): "
                    f"{data.get('error', resp.text)}"
                )
        except Exception as exc:
            print(f"[PromptTester] Error queuing next job: {exc}")


# ------------------------------------------------------------------ #

NODE_CLASS_MAPPINGS = {
    "ComfygPrompt": ComfygPrompt,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ComfygPrompt": "Comfyg-Prompt",
}
