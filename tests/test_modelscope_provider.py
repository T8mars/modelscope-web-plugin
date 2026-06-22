import unittest

from providers.modelscope import (
    ModelScopeClient,
    extract_image_urls,
    poll_modelscope_task,
    modelscope_api_root,
    normalize_loras_payload,
    submit_modelscope_image_task,
    strip_bearer,
)


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self.payload = payload
        self.status_code = status_code
        self.ok = 200 <= status_code < 300
        self.text = str(payload)

    def json(self):
        return self.payload


class FakeSession:
    def __init__(self):
        self.calls = []
        self.poll_count = 0

    def post(self, url, headers=None, json=None, timeout=None):
        self.calls.append({
            "method": "POST",
            "url": url,
            "headers": headers or {},
            "json": json,
            "timeout": timeout,
        })
        return FakeResponse({"task_id": "task-123"})

    def get(self, url, headers=None, timeout=None):
        self.poll_count += 1
        self.calls.append({
            "method": "GET",
            "url": url,
            "headers": headers or {},
            "timeout": timeout,
        })
        if self.poll_count == 1:
            return FakeResponse({"task_status": "RUNNING"})
        return FakeResponse({
            "task_status": "SUCCEED",
            "output_images": ["https://modelscope.example.com/out.png"],
        })


class ModelScopeProviderTests(unittest.TestCase):
    def test_modelscope_api_root_normalizes_v1_and_bearer_prefix(self):
        self.assertEqual(modelscope_api_root("https://api-inference.modelscope.cn"), "https://api-inference.modelscope.cn/v1")
        self.assertEqual(modelscope_api_root("https://api-inference.modelscope.cn/v1/"), "https://api-inference.modelscope.cn/v1")
        self.assertEqual(strip_bearer("Bearer ms-secret"), "ms-secret")

    def test_normalize_loras_payload_limits_and_normalizes_weights(self):
        payload = normalize_loras_payload([
            {"id": "lora/a", "strength": 0.25},
            {"id": "lora/b", "weight": 0.5},
            {"id": "lora/off", "strength": 1, "enabled": False},
            {"id": "lora/c", "scale": 1.25},
            {"id": "lora/d", "loraStrength": 9},
            {"id": "lora/e", "strength": -1},
            {"id": "lora/f", "strength": 0.9},
        ])

        self.assertEqual(payload, {
            "lora/a": 0.0685,
            "lora/b": 0.137,
            "lora/c": 0.274,
            "lora/d": 0.274,
            "lora/f": 0.2465,
        })
        self.assertEqual(round(sum(payload.values()), 4), 1)

    def test_single_lora_payload_uses_plain_string(self):
        self.assertEqual(normalize_loras_payload([{"id": "Daniel8152/film", "strength": 0.8}]), "Daniel8152/film")

    def test_extract_image_urls_handles_common_modelscope_shapes(self):
        self.assertEqual(
            extract_image_urls({
                "data": {
                    "images": [{"url": "https://example.com/a.png"}],
                    "output": {"url": "https://example.com/b.png"},
                }
            }),
            ["https://example.com/a.png", "https://example.com/b.png"],
        )

    def test_generate_image_submits_async_task_polls_and_returns_images(self):
        session = FakeSession()
        client = ModelScopeClient(
            api_key="Bearer ms-secret",
            base_url="https://api-inference.modelscope.cn",
            session=session,
        )

        result = client.generate_image(
            prompt="a warm studio portrait",
            model="Tongyi-MAI/Z-Image-Turbo",
            width=832,
            height=1216,
            loras={"Daniel8152/film": 0.75},
            poll_interval=0,
            timeout=5,
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["task_id"], "task-123")
        self.assertEqual(result["image_urls"], ["https://modelscope.example.com/out.png"])
        self.assertEqual(session.calls[0]["url"], "https://api-inference.modelscope.cn/v1/images/generations")
        self.assertEqual(session.calls[0]["headers"]["Authorization"], "Bearer ms-secret")
        self.assertEqual(session.calls[0]["headers"]["X-ModelScope-Async-Mode"], "true")
        self.assertEqual(session.calls[0]["json"]["model"], "Tongyi-MAI/Z-Image-Turbo")
        self.assertEqual(session.calls[0]["json"]["width"], 832)
        self.assertEqual(session.calls[0]["json"]["height"], 1216)
        self.assertEqual(session.calls[0]["json"]["loras"], "Daniel8152/film")
        self.assertEqual(session.calls[1]["url"], "https://api-inference.modelscope.cn/v1/tasks/task-123")
        self.assertEqual(session.calls[1]["headers"]["X-ModelScope-Task-Type"], "image_generation")

    def test_submit_image_task_returns_task_without_polling(self):
        session = FakeSession()

        result = submit_modelscope_image_task(
            api_key="ms-secret",
            prompt="a warm studio portrait",
            model="Tongyi-MAI/Z-Image-Turbo",
            width=512,
            height=512,
            loras=[{"id": "Daniel8152/film", "strength": 0.8}],
            session=session,
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["code"], "submitted")
        self.assertEqual(result["task_id"], "task-123")
        self.assertEqual(len(session.calls), 1)
        self.assertEqual(session.calls[0]["json"]["loras"], "Daniel8152/film")

    def test_poll_modelscope_task_normalizes_processing_and_completed_status(self):
        session = FakeSession()

        running = poll_modelscope_task(
            api_key="ms-secret",
            task_id="task-123",
            base_url="https://api-inference.modelscope.cn",
            session=session,
        )
        completed = poll_modelscope_task(
            api_key="ms-secret",
            task_id="task-123",
            base_url="https://api-inference.modelscope.cn",
            session=session,
        )

        self.assertTrue(running["ok"])
        self.assertEqual(running["status"], "processing")
        self.assertTrue(completed["ok"])
        self.assertEqual(completed["status"], "completed")
        self.assertEqual(completed["image_urls"], ["https://modelscope.example.com/out.png"])


if __name__ == "__main__":
    unittest.main()
