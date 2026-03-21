import copy
import random
import requests


class ComfygPrompt:
    """
    Comfyg-Prompt — queues one independent ComfyUI job per prompt/repetition.

    Dynamically add or remove prompt fields as needed.
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

    def calculate_seed(self, base_seed, index, seed_mode):
        if seed_mode == "fixed":
            return base_seed
        elif seed_mode == "increment":
            return base_seed + index
        elif seed_mode == "decrement":
            return base_seed - index
        elif seed_mode == "random":
            return random.randint(0, 0xFFFFFFFFFFFFFFFF)
        return base_seed

    def execute(self, unique_id, extra_pnginfo, prompt):
        node_id = str(unique_id)

        if node_id not in prompt:
            print("[Comfyg-Prompt] Node not found in prompt.")
            return ("", 0)

        inputs = prompt[node_id].get("inputs", {})

        prompts = []
        seed = 0
        seed_mode = "fixed"
        _index = 0

        for key, value in inputs.items():
            if key.startswith("prompt_"):
                if isinstance(value, str) and value.strip():
                    try:
                        num = int(key.split("_")[1])
                        prompts.append((num, value.strip()))
                    except (ValueError, IndexError):
                        pass
            elif key == "seed":
                seed = int(value) if value else 0
            elif key == "seed_mode":
                seed_mode = value
            elif key == "_index":
                _index = int(value) if value else 0

        prompts.sort(key=lambda x: x[0])
        prompts_list = [p[1] for p in prompts]

        if not prompts_list:
            print("[Comfyg-Prompt] No prompts found.")
            return ("", seed)

        index = min(_index, len(prompts_list) - 1)
        current_prompt = prompts_list[index]
        current_seed = self.calculate_seed(seed, index, seed_mode)

        print(
            f"[Comfyg-Prompt] Job {index + 1}/{len(prompts_list)} "
            f"| seed={current_seed} | prompt={current_prompt[:60]!r}..."
        )

        if index + 1 < len(prompts_list):
            self._queue_next(
                prompt,
                extra_pnginfo,
                unique_id,
                index + 1,
                seed,
                seed_mode,
            )

        return (current_prompt, current_seed)

    def _queue_next(self, api_prompt, extra_pnginfo, unique_id, next_index, base_seed, seed_mode):
        new_prompt = copy.deepcopy(api_prompt)
        node_id = str(unique_id)
        next_seed = self.calculate_seed(base_seed, next_index, seed_mode)

        if node_id in new_prompt:
            inputs = new_prompt[node_id].setdefault("inputs", {})
            inputs["_index"] = next_index
            inputs["seed"] = next_seed

        workflow = {}
        if extra_pnginfo and "workflow" in extra_pnginfo:
            workflow = copy.deepcopy(extra_pnginfo["workflow"])

        payload = {
            "prompt": new_prompt,
            "extra_data": {"extra_pnginfo": {"workflow": workflow}},
        }

        try:
            resp = requests.post("http://localhost:8188/prompt", json=payload, timeout=5)
            if resp.status_code == 200:
                print(f"[Comfyg-Prompt] Queued job #{next_index + 1}")
        except Exception as exc:
            print(f"[Comfyg-Prompt] Error: {exc}")


NODE_CLASS_MAPPINGS = {"ComfygPrompt": ComfygPrompt}
NODE_DISPLAY_NAME_MAPPINGS = {"ComfygPrompt": "Comfyg-Prompt"}
