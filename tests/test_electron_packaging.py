import json
import os
import unittest


ROOT = os.path.dirname(os.path.dirname(__file__))


def read_text(*parts):
    with open(os.path.join(ROOT, *parts), "r", encoding="utf-8") as f:
        return f.read()


class ElectronPackagingTests(unittest.TestCase):
    def test_package_json_defines_electron_builder_release_scripts(self):
        with open(os.path.join(ROOT, "package.json"), "r", encoding="utf-8") as f:
            package = json.load(f)

        self.assertEqual(package["main"], "electron/main.js")
        self.assertIn("electron", package["devDependencies"])
        self.assertIn("electron-builder", package["devDependencies"])
        self.assertIn("backend:build", package["scripts"])
        self.assertIn("dist:win", package["scripts"])
        self.assertIn("pack:win", package["scripts"])
        self.assertIn("packaging/t8-backend.spec", package["scripts"]["backend:build"])

        build = package["build"]
        self.assertEqual(build["appId"], "com.t8.modelscope.webplugin")
        self.assertEqual(build["productName"], "T8 ModelScope Web Plugin")
        self.assertTrue(any(item.get("from") == "dist/t8-backend.exe" for item in build["extraResources"]))
        self.assertNotIn("SKILL.md", json.dumps(build, ensure_ascii=False))
        self.assertNotIn("features.json", json.dumps(build, ensure_ascii=False))

    def test_electron_main_manages_backend_and_waits_for_required_apis(self):
        main_js = read_text("electron", "main.js")

        self.assertIn("spawn", main_js)
        self.assertIn("t8-backend.exe", main_js)
        self.assertIn("process.resourcesPath", main_js)
        self.assertIn("T8_UPLOAD_FOLDER", main_js)
        self.assertIn("/health", main_js)
        self.assertIn("/api/runtime_settings", main_js)
        self.assertIn("BrowserWindow", main_js)
        self.assertIn("backendProcess.kill", main_js)

    def test_pyinstaller_spec_bundles_flask_templates_and_static_assets(self):
        spec = read_text("packaging", "t8-backend.spec")

        self.assertIn("'templates'", spec)
        self.assertIn("'static'", spec)
        self.assertIn("web_app.py", spec)
        self.assertIn("name='t8-backend'", spec)
        self.assertIn("console=False", spec)

    def test_flask_app_supports_frozen_resource_paths_and_writable_uploads(self):
        web_app = read_text("web_app.py")
        config = read_text("config.py")

        self.assertIn("sys._MEIPASS", web_app)
        self.assertIn("template_folder=", web_app)
        self.assertIn("static_folder=", web_app)
        self.assertIn("T8_UPLOAD_FOLDER", config)
        self.assertIn("T8_BACKEND_PORT", web_app)


if __name__ == "__main__":
    unittest.main()
