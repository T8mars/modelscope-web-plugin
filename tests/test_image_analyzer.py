import os
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from config import IMAGE_ANALYSIS_MODEL
from image_analyzer import analyze_image


class FakeCompletions:
    def __init__(self):
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(content="  一段\n图片反推提示词  "),
                )
            ]
        )


class FakeOpenAIClient:
    def __init__(self):
        self.completions = FakeCompletions()
        self.chat = SimpleNamespace(completions=self.completions)


class ImageAnalyzerTests(unittest.TestCase):
    def test_default_analysis_model_is_current_modelscope_vision_model(self):
        self.assertEqual(IMAGE_ANALYSIS_MODEL, "Qwen/Qwen3-VL-235B-A22B-Instruct")

    def test_analyze_image_uses_configured_model_and_normalizes_content(self):
        client = FakeOpenAIClient()

        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
            f.write(b"fake-image")
            image_path = f.name

        try:
            with patch("image_analyzer.OpenAI", return_value=client):
                success, result = analyze_image(image_path, api_key="test-token")
        finally:
            os.remove(image_path)

        self.assertTrue(success)
        self.assertEqual(result, "一段 图片反推提示词")
        self.assertEqual(client.completions.calls[0]["model"], "Qwen/Qwen3-VL-235B-A22B-Instruct")


if __name__ == "__main__":
    unittest.main()
