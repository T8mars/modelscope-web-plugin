import os
import unittest


class LauncherTests(unittest.TestCase):
    def test_windows_launcher_documents_token_port_and_health_check(self):
        launcher_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "启动器.bat")
        with open(launcher_path, "r", encoding="utf-8") as f:
            content = f.read()

        self.assertIn("MODELSCOPE_API_KEY", content)
        self.assertIn("python web_app.py", content)
        self.assertIn("http://127.0.0.1:5000/health", content)
        self.assertIn("http://127.0.0.1:5000/api/runtime_settings", content)
        self.assertIn("http://127.0.0.1:5000/", content)
        self.assertNotIn("MODEL_SCOPE_COOKIE", content)

    def test_windows_launcher_detects_outdated_running_service(self):
        launcher_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "启动器.bat")
        with open(launcher_path, "r", encoding="utf-8") as f:
            content = f.read()

        self.assertIn("Service is already running but looks outdated", content)
        self.assertIn("RUNTIME_URL", content)

    def test_windows_launcher_keeps_console_visible_on_success_paths(self):
        launcher_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "启动器.bat")
        with open(launcher_path, "r", encoding="utf-8") as f:
            content = f.read()

        self.assertIn("Console stays open", content)
        self.assertIn("Press any key to close launcher window", content)
        self.assertNotIn('start "qwen-web-backend"', content)

    def test_windows_launcher_content_is_ascii_for_cmd_stability(self):
        launcher_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "启动器.bat")
        with open(launcher_path, "r", encoding="utf-8") as f:
            content = f.read()

        self.assertTrue(content.isascii())


if __name__ == "__main__":
    unittest.main()
