import os
import json
import tempfile
import unittest
from unittest.mock import patch

from web_app import create_app


class FakeDownloadResponse:
    def raise_for_status(self):
        return None

    def iter_content(self, chunk_size=8192):
        yield b"fake-image-bytes"


class RouteTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.app = create_app()
        self.app.config.update(
            TESTING=True,
            UPLOAD_FOLDER=self.tmp.name,
            OPENAI_API_KEY="test-analysis-key",
            MODELSCOPE_API_KEY="test-modelscope-key",
        )
        self.client = self.app.test_client()

    def tearDown(self):
        self.tmp.cleanup()

    def test_analyze_uploaded_image_returns_prompt_without_temp_path_error(self):
        image_path = os.path.join(self.tmp.name, "input.png")
        with open(image_path, "wb") as f:
            f.write(b"fake-image")

        with self.client.session_transaction() as session:
            session["image_path"] = image_path
            session["image_filename"] = "input.png"

        with patch("routes.analyze_image", return_value=(True, "反推提示词")) as mocked_analyze:
            response = self.client.post("/analyze", json={"analysis_api_key": "request-analysis-key"})

        data = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["success"], True)
        self.assertEqual(data["prompt"], "反推提示词")
        self.assertEqual(mocked_analyze.call_args.kwargs["api_key"], "request-analysis-key")

    def test_analyze_from_url_downloads_image_and_returns_prompt(self):
        with patch("routes.requests.get", return_value=FakeDownloadResponse()) as mocked_get:
            with patch("routes.analyze_image", return_value=(True, "网络图片提示词")):
                response = self.client.post("/analyze_from_url", json={"url": "https://example.com/image.png"})

        data = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["success"], True)
        self.assertEqual(data["prompt"], "网络图片提示词")
        mocked_get.assert_called_once()

    def test_generate_image_uses_modelscope_api_key_not_cookie(self):
        with patch("routes.generate_modelscope_image", return_value={
            "ok": True,
            "image_urls": ["https://modelscope.example.com/out.png"],
            "task_id": "task-1",
            "model": "Tongyi-MAI/Z-Image-Turbo",
        }) as mocked_generate:
            response = self.client.post("/api/generate_image", json={
                "prompt": "a warm studio portrait",
                "model": "Tongyi-MAI/Z-Image-Turbo",
                "width": 832,
                "height": 1216,
                "loras": [{"id": "Daniel8152/film", "strength": 0.8}],
            })

        data = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["success"], True)
        self.assertEqual(data["images"], ["https://modelscope.example.com/out.png"])
        self.assertEqual(data["task_id"], "task-1")

        call = mocked_generate.call_args.kwargs
        self.assertEqual(call["api_key"], "test-modelscope-key")
        self.assertEqual(call["prompt"], "a warm studio portrait")
        self.assertEqual(call["model"], "Tongyi-MAI/Z-Image-Turbo")
        self.assertEqual(call["width"], 832)
        self.assertEqual(call["height"], 1216)
        self.assertEqual(call["loras"], [{"id": "Daniel8152/film", "strength": 0.8}])

    def test_generate_image_allows_local_request_modelscope_token_override(self):
        with patch("routes.generate_modelscope_image", return_value={
            "ok": True,
            "image_urls": ["https://modelscope.example.com/out.png"],
            "task_id": "task-2",
            "model": "Tongyi-MAI/Z-Image-Turbo",
        }) as mocked_generate:
            response = self.client.post("/api/generate_image", json={
                "prompt": "a warm studio portrait",
                "modelscope_api_key": "request-token",
            })

        data = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["success"], True)
        self.assertEqual(mocked_generate.call_args.kwargs["api_key"], "request-token")

    def test_modelscope_options_returns_models_loras_and_defaults(self):
        response = self.client.get("/api/modelscope_options")

        data = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["success"], True)
        self.assertIn("Tongyi-MAI/Z-Image-Turbo", data["image_models"])
        self.assertTrue(any(item["id"] == "Daniel8152/film" for item in data["available_loras"]))
        self.assertEqual(data["defaults"]["model"], "Tongyi-MAI/Z-Image-Turbo")

    def test_runtime_settings_share_web_configuration_without_returning_tokens(self):
        response = self.client.post("/api/runtime_settings", json={
            "analysis_api_key": "runtime-analysis-token",
            "modelscope_api_key": "runtime-modelscope-token",
            "model": "Qwen/Qwen-Image-2512",
            "width": 1024,
            "height": 1536,
            "num_images": 2,
            "loras": [{"id": "Daniel8152/Qwen-Image-2512-Film", "strength": 1}],
        })

        data = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["success"], True)
        self.assertEqual(data["settings"]["model"], "Qwen/Qwen-Image-2512")
        self.assertEqual(data["settings"]["width"], 1024)
        self.assertEqual(data["settings"]["height"], 1536)
        self.assertEqual(data["settings"]["num_images"], 2)
        self.assertEqual(data["settings"]["loras"], [{"id": "Daniel8152/Qwen-Image-2512-Film", "strength": 1}])
        self.assertEqual(data["settings"]["has_analysis_api_key"], True)
        self.assertEqual(data["settings"]["has_modelscope_api_key"], True)
        self.assertNotIn("runtime-analysis-token", json.dumps(data, ensure_ascii=False))
        self.assertNotIn("runtime-modelscope-token", json.dumps(data, ensure_ascii=False))

        get_response = self.client.get("/api/runtime_settings")
        get_data = get_response.get_json()
        self.assertEqual(get_response.status_code, 200)
        self.assertEqual(get_data["settings"]["model"], "Qwen/Qwen-Image-2512")
        self.assertNotIn("runtime-modelscope-token", json.dumps(get_data, ensure_ascii=False))

    def test_submit_image_task_uses_shared_web_runtime_settings(self):
        self.client.post("/api/runtime_settings", json={
            "modelscope_api_key": "runtime-modelscope-token",
            "model": "Qwen/Qwen-Image-2512",
            "width": 1024,
            "height": 1536,
            "num_images": 2,
            "loras": [{"id": "Daniel8152/Qwen-Image-2512-Film", "strength": 1}],
        })

        with patch("routes.submit_modelscope_image_task", return_value={
            "ok": True,
            "code": "submitted",
            "task_id": "runtime-task-1",
            "model": "Qwen/Qwen-Image-2512",
        }) as mocked_submit:
            response = self.client.post("/api/submit_image_task", json={
                "prompt": "a cinematic portrait",
            })

        data = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["success"], True)
        call = mocked_submit.call_args.kwargs
        self.assertEqual(call["api_key"], "runtime-modelscope-token")
        self.assertEqual(call["model"], "Qwen/Qwen-Image-2512")
        self.assertEqual(call["width"], 1024)
        self.assertEqual(call["height"], 1536)
        self.assertEqual(call["num_images"], 2)
        self.assertEqual(call["loras"], [{"id": "Daniel8152/Qwen-Image-2512-Film", "strength": 1}])

    def test_reverse_image_uses_shared_web_runtime_analysis_token(self):
        self.client.post("/api/runtime_settings", json={
            "analysis_api_key": "runtime-analysis-token",
            "modelscope_api_key": "runtime-modelscope-token",
        })

        with patch("routes.requests.get", return_value=FakeDownloadResponse()):
            with patch("routes.analyze_image", return_value=(True, "右键图片提示词")) as mocked_analyze:
                response = self.client.post("/reverse_image", json={
                    "image_url": "https://example.com/image.png",
                })

        data = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["success"], True)
        self.assertEqual(mocked_analyze.call_args.kwargs["api_key"], "runtime-analysis-token")

    def test_submit_image_task_returns_task_and_task_status_uses_runtime_context(self):
        with patch("routes.submit_modelscope_image_task", return_value={
            "ok": True,
            "code": "submitted",
            "task_id": "async-task-1",
            "model": "Tongyi-MAI/Z-Image-Turbo",
        }) as mocked_submit:
            response = self.client.post("/api/submit_image_task", json={
                "prompt": "a warm studio portrait",
                "modelscope_api_key": "request-token",
                "model": "Tongyi-MAI/Z-Image-Turbo",
                "loras": [{"id": "Daniel8152/film", "strength": 0.8}],
            })

        data = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["success"], True)
        self.assertEqual(data["status"], "processing")
        self.assertEqual(data["task_id"], "async-task-1")
        self.assertEqual(mocked_submit.call_args.kwargs["api_key"], "request-token")

        with patch("task_poller.poll_modelscope_task", return_value={
            "ok": True,
            "status": "completed",
            "image_urls": ["https://modelscope.example.com/out.png"],
            "raw": {"task_status": "SUCCEED"},
        }) as mocked_poll:
            poll_response = self.client.get("/task_status/async-task-1")

        poll_data = poll_response.get_json()
        self.assertEqual(poll_response.status_code, 200)
        self.assertEqual(poll_data["status"], "completed")
        self.assertEqual(poll_data["images"], ["https://modelscope.example.com/out.png"])
        self.assertEqual(mocked_poll.call_args.kwargs["api_key"], "request-token")


if __name__ == "__main__":
    unittest.main()
