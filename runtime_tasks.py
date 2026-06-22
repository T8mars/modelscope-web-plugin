from typing import Dict


_TASK_CONTEXTS: Dict[str, Dict[str, str]] = {}


def register_task_context(task_id: str, api_key: str, base_url: str = "") -> None:
    clean_task_id = str(task_id or "").strip()
    clean_api_key = str(api_key or "").strip()
    if not clean_task_id or not clean_api_key:
        return
    _TASK_CONTEXTS[clean_task_id] = {
        "api_key": clean_api_key,
        "base_url": str(base_url or "").strip(),
    }


def get_task_context(task_id: str) -> Dict[str, str]:
    return dict(_TASK_CONTEXTS.get(str(task_id or "").strip(), {}))


def clear_task_context(task_id: str) -> None:
    _TASK_CONTEXTS.pop(str(task_id or "").strip(), None)


def clear_all_task_contexts() -> None:
    _TASK_CONTEXTS.clear()
