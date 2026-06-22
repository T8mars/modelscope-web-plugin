import time
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Tuple, Union

import requests


DEFAULT_BASE_URL = "https://api-inference.modelscope.cn/v1"
DEFAULT_IMAGE_MODEL = "Tongyi-MAI/Z-Image-Turbo"
DEFAULT_TIMEOUT_SECONDS = 60 * 60
DEFAULT_SUBMIT_TIMEOUT_SECONDS = 120
DEFAULT_POLL_INTERVAL_SECONDS = 1.5
MAX_LORAS_PER_REQUEST = 5


def strip_bearer(value: str) -> str:
    text = str(value or "").strip()
    if text.lower().startswith("bearer "):
        return text[7:].strip()
    return text


def modelscope_api_root(value: str = DEFAULT_BASE_URL) -> str:
    base = str(value or DEFAULT_BASE_URL).strip().rstrip("/")
    if not base:
        return DEFAULT_BASE_URL
    return base if base.endswith("/v1") else f"{base}/v1"


def parse_size(size: str = "", width: Optional[int] = None, height: Optional[int] = None) -> Tuple[Optional[int], Optional[int], str]:
    if width and height:
        return int(width), int(height), f"{int(width)}x{int(height)}"

    text = str(size or "1024x1024").strip().lower().replace("*", "x")
    parts = text.split("x", 1)
    if len(parts) != 2:
        return width, height, text
    try:
        parsed_width = int(parts[0])
        parsed_height = int(parts[1])
    except ValueError:
        return width, height, text
    if parsed_width <= 0 or parsed_height <= 0:
        return width, height, text
    return parsed_width, parsed_height, f"{parsed_width}x{parsed_height}"


def _clean_lora_id(value: Any) -> str:
    text = str(value or "").strip()
    if not text or len(text) > 180:
        return ""
    if any(ord(ch) < 32 or ord(ch) == 127 for ch in text):
        return ""
    return text


def _normalize_lora_strength(value: Any, fallback: float = 0.8) -> float:
    try:
        n = float(value)
    except (TypeError, ValueError):
        n = fallback
    if n < 0:
        return 0
    if n > 1:
        return 1
    return n


def normalize_lora_items(value: Any) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    seen = set()

    def add(raw_id: Any, raw_strength: Any) -> None:
        if len(out) >= 24:
            return
        lora_id = _clean_lora_id(raw_id)
        if not lora_id or lora_id in seen:
            return
        seen.add(lora_id)
        out.append({"id": lora_id, "strength": _normalize_lora_strength(raw_strength, 0.8)})

    if not value:
        return out
    if isinstance(value, str):
        add(value, 1)
        return out
    if isinstance(value, dict):
        for raw_id, raw_strength in value.items():
            if isinstance(raw_strength, dict):
                add(raw_id, raw_strength.get("strength", raw_strength.get("weight", raw_strength.get("scale"))))
            else:
                add(raw_id, raw_strength)
        return out
    if isinstance(value, Iterable):
        for item in value:
            if isinstance(item, str):
                add(item, 1)
                continue
            if not isinstance(item, dict):
                continue
            if item.get("enabled") is False:
                continue
            add(
                item.get("id") or item.get("loraId"),
                item.get("strength", item.get("loraStrength", item.get("default_strength", item.get("defaultStrength", item.get("weight", item.get("scale")))))),
            )
    return out


def normalize_loras_payload(value: Any) -> Optional[Union[str, Dict[str, float]]]:
    weighted = [item for item in normalize_lora_items(value) if item["strength"] > 0][:MAX_LORAS_PER_REQUEST]
    if not weighted:
        return None
    if len(weighted) == 1:
        return weighted[0]["id"]

    total = sum(item["strength"] for item in weighted)
    if total <= 0:
        return None

    out: Dict[str, float] = {}
    used = 0.0
    for index, item in enumerate(weighted):
        if index == len(weighted) - 1:
            weight = max(0.0, round(1.0 - used, 4))
        else:
            weight = round(item["strength"] / total, 4)
        out[item["id"]] = weight
        used = round(used + weight, 4)
    return out


def _looks_like_image_url(value: str) -> bool:
    text = str(value or "").strip()
    if not text:
        return False
    lower = text.lower().split("?", 1)[0]
    return lower.startswith(("http://", "https://", "data:image/")) and (
        lower.startswith("data:image/")
        or lower.endswith((".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"))
        or "image" in lower
        or "aliyuncs.com" in lower
        or "modelscope" in lower
    )


def extract_image_urls(raw: Any) -> List[str]:
    urls: List[str] = []

    def add(value: Any) -> None:
        if not isinstance(value, str):
            return
        text = value.strip()
        if text and _looks_like_image_url(text) and text not in urls:
            urls.append(text)

    def walk(value: Any, key_hint: str = "") -> None:
        if isinstance(value, dict):
            for key, item in value.items():
                lower_key = str(key).lower()
                if lower_key in {"url", "imageurl", "image_url", "output_image", "output_url"}:
                    add(item)
                elif lower_key in {"images", "image_urls", "imageurls", "output_images", "results", "data", "output"}:
                    walk(item, lower_key)
                else:
                    walk(item, lower_key)
        elif isinstance(value, list):
            for item in value:
                walk(item, key_hint)
        elif key_hint in {"images", "image_urls", "imageurls", "output_images"}:
            add(value)

    walk(raw)
    return urls


def extract_task_id(raw: Any) -> str:
    if not isinstance(raw, dict):
        return ""
    for key in ("task_id", "taskId", "id"):
        if raw.get(key):
            return str(raw[key])
    data = raw.get("data")
    if isinstance(data, dict):
        for key in ("task_id", "taskId", "id"):
            if data.get(key):
                return str(data[key])
    return ""


def task_status(raw: Any) -> str:
    if not isinstance(raw, dict):
        return ""
    data = raw.get("data") if isinstance(raw.get("data"), dict) else {}
    return str(
        raw.get("task_status")
        or raw.get("taskStatus")
        or raw.get("status")
        or data.get("task_status")
        or data.get("taskStatus")
        or data.get("status")
        or ""
    ).strip().upper()


def task_failure_detail(raw: Any) -> str:
    if not isinstance(raw, dict):
        return str(raw)
    data = raw.get("data") if isinstance(raw.get("data"), dict) else {}
    return str(
        raw.get("error_info")
        or raw.get("error")
        or raw.get("message")
        or raw.get("detail")
        or data.get("error_info")
        or data.get("error")
        or data.get("message")
        or raw
    )


@dataclass
class ModelScopeClient:
    api_key: str
    base_url: str = DEFAULT_BASE_URL
    session: Any = requests

    def __post_init__(self) -> None:
        self.api_key = strip_bearer(self.api_key)
        self.base_url = modelscope_api_root(self.base_url)

    def _headers(self, extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "X-ModelScope-Async-Mode": "true",
        }
        if extra:
            headers.update(extra)
        return headers

    def _image_payload(
        self,
        prompt: str,
        model: str = DEFAULT_IMAGE_MODEL,
        width: Optional[int] = None,
        height: Optional[int] = None,
        size: str = "",
        loras: Any = None,
        num_images: Optional[int] = None,
    ) -> Union[Dict[str, Any], Dict[str, str]]:
        clean_prompt = str(prompt or "").strip()
        if not clean_prompt:
            return {"__error_code": "missing_prompt", "__error": "请输入图像提示词。"}

        clean_model = str(model or DEFAULT_IMAGE_MODEL).strip() or DEFAULT_IMAGE_MODEL
        parsed_width, parsed_height, parsed_size = parse_size(size, width, height)
        payload: Dict[str, Any] = {
            "model": clean_model,
            "prompt": clean_prompt,
        }
        if parsed_width and parsed_height:
            payload.update({
                "width": parsed_width,
                "height": parsed_height,
                "size": parsed_size,
            })
        if num_images:
            try:
                payload["n"] = max(1, min(4, int(num_images)))
            except (TypeError, ValueError):
                pass
        lora_payload = normalize_loras_payload(loras)
        if lora_payload:
            payload["loras"] = lora_payload
        return payload

    def submit_image_task(
        self,
        prompt: str,
        model: str = DEFAULT_IMAGE_MODEL,
        width: Optional[int] = None,
        height: Optional[int] = None,
        size: str = "",
        loras: Any = None,
        num_images: Optional[int] = None,
        submit_timeout: int = DEFAULT_SUBMIT_TIMEOUT_SECONDS,
    ) -> Dict[str, Any]:
        if not self.api_key:
            return {"ok": False, "code": "missing_api_key", "error": "请配置 ModelScope API Token。"}

        clean_model = str(model or DEFAULT_IMAGE_MODEL).strip() or DEFAULT_IMAGE_MODEL
        payload = self._image_payload(
            prompt=prompt,
            model=clean_model,
            width=width,
            height=height,
            size=size,
            loras=loras,
            num_images=num_images,
        )
        if payload.get("__error_code"):
            return {"ok": False, "code": payload["__error_code"], "error": payload["__error"]}

        submit = self.session.post(
            f"{self.base_url}/images/generations",
            headers=self._headers(),
            json=payload,
            timeout=submit_timeout,
        )
        try:
            raw = submit.json()
        except Exception:
            raw = {"message": getattr(submit, "text", "")}

        if not getattr(submit, "ok", False):
            return {
                "ok": False,
                "code": "http_error",
                "status_code": getattr(submit, "status_code", None),
                "error": f"ModelScope 提交失败：HTTP {getattr(submit, 'status_code', 'unknown')}",
                "raw": raw,
            }

        task_id = extract_task_id(raw)
        if not task_id:
            image_urls = extract_image_urls(raw)
            if image_urls:
                return {
                    "ok": True,
                    "code": "completed",
                    "status": "completed",
                    "model": clean_model,
                    "image_urls": image_urls,
                    "raw": raw,
                }
            return {
                "ok": False,
                "code": "missing_task_id",
                "error": "ModelScope 未返回 task_id。",
                "raw": raw,
            }
        return {
            "ok": True,
            "code": "submitted",
            "status": "processing",
            "model": clean_model,
            "task_id": task_id,
            "raw": raw,
        }

    def poll_task(self, task_id: str, timeout: int = 120) -> Dict[str, Any]:
        clean_task_id = str(task_id or "").strip()
        if not clean_task_id:
            return {"ok": False, "code": "missing_task_id", "status": "failed", "error": "缺少任务ID。"}
        if not self.api_key:
            return {"ok": False, "code": "missing_api_key", "status": "failed", "error": "请配置 ModelScope API Token。"}

        poll = self.session.get(
            f"{self.base_url}/tasks/{clean_task_id}",
            headers=self._headers({"X-ModelScope-Task-Type": "image_generation"}),
            timeout=min(120, max(5, int(timeout or 120))),
        )
        try:
            data = poll.json()
        except Exception:
            data = {"message": getattr(poll, "text", "")}

        if not getattr(poll, "ok", False):
            return {
                "ok": False,
                "code": "http_error",
                "status": "failed",
                "task_id": clean_task_id,
                "status_code": getattr(poll, "status_code", None),
                "error": f"ModelScope 轮询失败：HTTP {getattr(poll, 'status_code', 'unknown')}",
                "raw": data,
            }

        status = task_status(data)
        if status in {"SUCCEED", "SUCCESS", "COMPLETED", "DONE"}:
            image_urls = extract_image_urls(data)
            if not image_urls:
                return {
                    "ok": False,
                    "code": "empty_image",
                    "status": "failed",
                    "task_id": clean_task_id,
                    "error": "ModelScope 成功但没有返回图片。",
                    "raw": data,
                }
            return {
                "ok": True,
                "code": "completed",
                "status": "completed",
                "task_id": clean_task_id,
                "image_urls": image_urls,
                "raw": data,
            }
        if status in {"FAILED", "FAIL", "ERROR", "CANCELED", "CANCELLED", "TIMEOUT", "REVOKED"}:
            return {
                "ok": False,
                "code": "task_failed",
                "status": "failed",
                "task_id": clean_task_id,
                "error": f"ModelScope 任务失败：{task_failure_detail(data)}",
                "raw": data,
            }
        return {
            "ok": True,
            "code": "processing",
            "status": "processing",
            "task_id": clean_task_id,
            "raw": data,
        }

    def generate_image(
        self,
        prompt: str,
        model: str = DEFAULT_IMAGE_MODEL,
        width: Optional[int] = None,
        height: Optional[int] = None,
        size: str = "",
        loras: Any = None,
        num_images: Optional[int] = None,
        timeout: int = DEFAULT_TIMEOUT_SECONDS,
        poll_interval: float = DEFAULT_POLL_INTERVAL_SECONDS,
        submit_timeout: int = DEFAULT_SUBMIT_TIMEOUT_SECONDS,
    ) -> Dict[str, Any]:
        clean_model = str(model or DEFAULT_IMAGE_MODEL).strip() or DEFAULT_IMAGE_MODEL
        submitted = self.submit_image_task(
            prompt=prompt,
            model=clean_model,
            width=width,
            height=height,
            size=size,
            loras=loras,
            num_images=num_images,
            submit_timeout=submit_timeout,
        )
        if not submitted.get("ok") or submitted.get("code") == "completed":
            return submitted

        task_id = submitted.get("task_id")
        deadline = time.time() + max(1, int(timeout or DEFAULT_TIMEOUT_SECONDS))
        last_payload = submitted.get("raw")
        while time.time() < deadline:
            if poll_interval > 0:
                time.sleep(poll_interval)
            polled = self.poll_task(task_id, timeout=timeout)
            last_payload = polled.get("raw")
            if polled.get("status") == "completed":
                polled["model"] = clean_model
                return polled
            if not polled.get("ok") or polled.get("status") == "failed":
                return polled

        return {
            "ok": False,
            "code": "timeout",
            "task_id": task_id,
            "error": "ModelScope 生图任务超时。",
            "raw": last_payload,
        }


def generate_modelscope_image(
    api_key: str,
    prompt: str,
    model: str = DEFAULT_IMAGE_MODEL,
    width: Optional[int] = None,
    height: Optional[int] = None,
    size: str = "",
    loras: Any = None,
    num_images: Optional[int] = None,
    base_url: str = DEFAULT_BASE_URL,
    timeout: int = DEFAULT_TIMEOUT_SECONDS,
    poll_interval: float = DEFAULT_POLL_INTERVAL_SECONDS,
    session: Any = requests,
) -> Dict[str, Any]:
    client = ModelScopeClient(api_key=api_key, base_url=base_url, session=session)
    return client.generate_image(
        prompt=prompt,
        model=model,
        width=width,
        height=height,
        size=size,
        loras=loras,
        num_images=num_images,
        timeout=timeout,
        poll_interval=poll_interval,
    )


def submit_modelscope_image_task(
    api_key: str,
    prompt: str,
    model: str = DEFAULT_IMAGE_MODEL,
    width: Optional[int] = None,
    height: Optional[int] = None,
    size: str = "",
    loras: Any = None,
    num_images: Optional[int] = None,
    base_url: str = DEFAULT_BASE_URL,
    session: Any = requests,
) -> Dict[str, Any]:
    client = ModelScopeClient(api_key=api_key, base_url=base_url, session=session)
    return client.submit_image_task(
        prompt=prompt,
        model=model,
        width=width,
        height=height,
        size=size,
        loras=loras,
        num_images=num_images,
    )


def poll_modelscope_task(
    api_key: str,
    task_id: str,
    base_url: str = DEFAULT_BASE_URL,
    timeout: int = 120,
    session: Any = requests,
) -> Dict[str, Any]:
    client = ModelScopeClient(api_key=api_key, base_url=base_url, session=session)
    return client.poll_task(task_id=task_id, timeout=timeout)
