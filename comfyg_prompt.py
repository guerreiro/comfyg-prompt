import copy
import json
import random
import requests


class ComfygPrompt:
    """
    Comfyg-Prompt — queues one independent ComfyUI job per prompt/repetition.

    Hidden serialised widgets (managed by the JS extension):
        _prompts_json  — JSON array of prompt strings, e.g. '["wizard", "knight"]'
        _index         — current job index (0-based), incremented per queued job
        seed           — base seed value
        seed_mode      — "fixed" | "increment" | "decrement" | "random"
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO",
                "prompt": "PROMPT",
            },
        }

    RETURN_TYPES = ("STRING", "INT")
    RETURN_NAMES = ("prompt", "seed")
    FUNCTION = "execute"
    CATEGORY = "utils"

    # ------------------------------------------------------------------ #

    def calculate_seed(self, base_seed, index, seed_mode):
        if seed_mode == "increment":
            return base_seed + index
        elif seed_mode == "decrement":
            return max(0, base_seed - index)
        elif seed_mode == "random":
            return random.randint(0, 0xFFFFFFFFFFFFFFFF)
        return base_seed  # "fixed"

    def execute(self, unique_id, extra_pnginfo, prompt):
        node_id = str(unique_id)

        if node_id not in prompt:
            print("[Comfyg-Prompt] Node not found in prompt.")
            return ("", 0)

        inputs = prompt[node_id].get("inputs", {})

        # ── read inputs ────────────────────────────────────────────────
        prompts_json = inputs.get("_prompts_json", '[""]')
        seed         = int(inputs.get("seed", 0) or 0)
        seed_mode    = inputs.get("seed_mode", "fixed")
        _index       = int(inputs.get("_index", 0) or 0)

        try:
            prompts_list = json.loads(prompts_json)
        except Exception:
            prompts_list = [prompts_json]

        prompts_list = [p.strip() for p in prompts_list if p and p.strip()]

        if not prompts_list:
            print("[Comfyg-Prompt] No prompts found.")
            return ("", seed)

        index = min(_index, len(prompts_list) - 1)
        current_prompt = prompts_list[index]
        current_seed   = self.calculate_seed(seed, index, seed_mode)

        print(
            f"[Comfyg-Prompt] Job {index + 1}/{len(prompts_list)} "
            f"| seed_mode={seed_mode} seed={current_seed} "
            f"| prompt={current_prompt[:60]!r}"
        )

        if index + 1 < len(prompts_list):
            self._queue_next(prompt, extra_pnginfo, unique_id, index + 1)

        return (current_prompt, current_seed)

    # ------------------------------------------------------------------ #

    def _queue_next(self, api_prompt, extra_pnginfo, unique_id, next_index):
        new_prompt = copy.deepcopy(api_prompt)
        node_id    = str(unique_id)

        if node_id in new_prompt:
            new_prompt[node_id]["inputs"]["_index"] = next_index

        workflow = {}
        if extra_pnginfo and "workflow" in extra_pnginfo:
            workflow = copy.deepcopy(extra_pnginfo["workflow"])
            for node in workflow.get("nodes", []):
                if str(node.get("id")) == node_id:
                    # Update _index in the saved widget values so the frontend
                    # stays in sync when inspecting the queued job.
                    for wv in node.get("widgets_values", []):
                        pass  # values are keyed by position — handled via inputs above
                    break

        payload = {
            "prompt": new_prompt,
            "extra_data": {"extra_pnginfo": {"workflow": workflow}},
        }

        try:
            resp = requests.post(
                "http://localhost:8188/prompt", json=payload, timeout=5
            )
            if resp.status_code == 200:
                data = resp.json()
                print(
                    f"[Comfyg-Prompt] Queued job #{next_index + 1}, "
                    f"prompt_id={data.get('prompt_id', '?')}"
                )
            else:
                print(f"[Comfyg-Prompt] Queue error ({resp.status_code}): {resp.text}")
        except Exception as exc:
            print(f"[Comfyg-Prompt] Error queuing next job: {exc}")


# ------------------------------------------------------------------ #

NODE_CLASS_MAPPINGS       = {"ComfygPrompt": ComfygPrompt}
NODE_DISPLAY_NAME_MAPPINGS = {"ComfygPrompt": "Comfyg-Prompt"}
