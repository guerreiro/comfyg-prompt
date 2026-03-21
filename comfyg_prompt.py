import copy
import random
import requests


class ComfygPrompt:
    """
    Comfyg-Prompt — queues one independent ComfyUI job per prompt/repetition.

    Enter prompts in the text area, one per line.
    Empty lines are ignored.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "prompts": ("STRING", {
                    "default": "",
                    "multiline": True,
                    "placeholder": "Enter prompts, one per line...",
                }),
                "repetitions": ("INT", {"default": 1, "min": 1, "max": 50}),
                "_index": ("INT", {"default": 0, "min": 0, "max": 9999}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF, "control_after_generate": False}),
                "seed_mode": (["fixed", "increment", "decrement", "random"],),
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

    def execute(
        self,
        prompts,
        repetitions,
        _index,
        seed,
        seed_mode,
        unique_id,
        extra_pnginfo,
        prompt,
    ):
        lines = [line.strip() for line in prompts.split('\n') if line.strip()]
        
        if not lines:
            print("[Comfyg-Prompt] No prompts found.")
            return ("", seed)

        job_list = [p for p in lines for _ in range(repetitions)]
        total = len(job_list)
        
        index = min(_index, total - 1)
        current_prompt = job_list[index]
        current_seed = self.calculate_seed(seed, index, seed_mode)

        print(
            f"[Comfyg-Prompt] Job {index + 1}/{total} "
            f"| seed_mode={seed_mode} seed={current_seed} "
            f"| prompt={current_prompt[:60]!r}..."
        )

        if index + 1 < total:
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
            for node in workflow.get("nodes", []):
                if str(node.get("id")) == node_id:
                    wv = node.get("widgets_values", [])
                    if len(wv) >= 1:
                        wv[-1] = next_index
                    if len(wv) >= 2:
                        wv[-2] = next_seed
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
                    f"[Comfyg-Prompt] Queued job #{next_index + 1}, "
                    f"prompt_id={data.get('prompt_id', '?')}"
                )
            else:
                print(
                    f"[Comfyg-Prompt] Queue failed ({resp.status_code}): "
                    f"{data.get('error', resp.text)}"
                )
        except Exception as exc:
            print(f"[Comfyg-Prompt] Error queuing next job: {exc}")


NODE_CLASS_MAPPINGS = {
    "ComfygPrompt": ComfygPrompt,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ComfygPrompt": "Comfyg-Prompt",
}
