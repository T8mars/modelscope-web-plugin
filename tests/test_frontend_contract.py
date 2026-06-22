import os
import unittest


ROOT = os.path.dirname(os.path.dirname(__file__))


def read_text(*parts):
    with open(os.path.join(ROOT, *parts), "r", encoding="utf-8") as f:
        return f.read()


class FrontendContractTests(unittest.TestCase):
    def test_web_page_exposes_model_lora_and_async_task_controls(self):
        html = read_text("templates", "index.html")
        api_js = read_text("static", "js", "api.js")
        main_js = read_text("static", "js", "main.js")

        for element_id in ("generation_model", "lora_options", "num_images", "image_width", "image_height"):
            self.assertIn(f'id="{element_id}"', html)

        self.assertIn("/api/modelscope_options", api_js)
        self.assertIn("/api/submit_image_task", api_js)
        self.assertIn("/task_status/", api_js)
        self.assertIn("loadModelscopeOptions", main_js)
        self.assertIn("getGenerationOptions", main_js)

    def test_web_page_exposes_and_uses_api_key_settings(self):
        html = read_text("templates", "index.html")
        api_js = read_text("static", "js", "api.js")
        main_js = read_text("static", "js", "main.js")

        for element_id in ("modelscope_api_key", "analysis_api_key", "save_api_keys", "clear_api_keys"):
            self.assertIn(f'id="{element_id}"', html)

        self.assertIn("getApiKeySettings", main_js)
        self.assertIn("localStorage", main_js)
        self.assertIn("syncRuntimeSettings", api_js)
        self.assertIn("/api/runtime_settings", api_js)
        self.assertIn("syncWebRuntimeSettings", main_js)
        self.assertIn("本地服务版本过旧", api_js)
        self.assertIn("右键同步失败", main_js)
        self.assertIn("analysis_api_key", api_js)
        self.assertIn("modelscope_api_key", api_js)

    def test_web_page_exposes_reverse_prompt_and_custom_lora_controls(self):
        html = read_text("templates", "index.html")
        main_js = read_text("static", "js", "main.js")
        css = read_text("static", "css", "style.css")

        for element_id in (
            "prompt_result_panel",
            "reverse_prompt",
            "copy_reverse_prompt",
            "custom_lora_id",
            "custom_lora_strength",
            "add_custom_lora",
            "custom_lora_list",
            "lora_weight_summary",
            "balance_loras",
        ):
            self.assertIn(f'id="{element_id}"', html)

        self.assertIn("showReversePrompt", main_js)
        self.assertIn("copyReversePrompt", main_js)
        self.assertIn("addCustomLora", main_js)
        self.assertIn("customLoras", main_js)
        self.assertIn("targetModel", main_js)
        self.assertIn("getCustomLorasForCurrentModel", main_js)
        self.assertIn("normalizeLoraWeightsTotal", main_js)
        self.assertIn("distributeLoraWeights", main_js)
        self.assertIn("MAX_LORAS_PER_REQUEST", main_js)
        self.assertIn("custom_loras", main_js)
        self.assertIn(".prompt-result-panel", css)
        self.assertIn(".custom-lora-list", css)
        self.assertIn(".lora-weight-panel", css)

    def test_web_upload_preview_binds_load_handlers_before_setting_image_src(self):
        ui_js = read_text("static", "js", "ui.js")

        onload_index = ui_js.find("previewImg.onload = function()")
        src_index = ui_js.find("previewImg.src = imageUrl")
        self.assertNotEqual(onload_index, -1)
        self.assertNotEqual(src_index, -1)
        self.assertLess(onload_index, src_index)
        self.assertIn("dropPlaceholder.style.display = 'none';", ui_js)
        self.assertIn("imagePreview.style.backgroundColor = '#fff';", ui_js)

    def test_extension_popup_exposes_model_lora_and_async_task_controls(self):
        html = read_text("extension", "popup.html")
        config_js = read_text("extension", "scripts", "config.js")
        api_js = read_text("extension", "scripts", "api.js")
        ui_js = read_text("extension", "scripts", "ui.js")

        for element_id in (
            "serverStatus",
            "openaiKey",
            "modelscopeApiKey",
            "generationModel",
            "loraOptions",
            "customLoraId",
            "customLoraStrength",
            "addCustomLora",
            "customLoraList",
            "loraWeightSummary",
            "balanceLoras",
            "numImages",
        ):
            self.assertIn(f'id="{element_id}"', html)

        self.assertIn("MODELSCOPE_MODEL", config_js)
        self.assertIn("SELECTED_LORAS", config_js)
        self.assertIn("CUSTOM_LORAS", config_js)
        self.assertIn("OPTIONS", config_js)
        self.assertIn("SUBMIT", config_js)
        self.assertIn("getModelscopeOptions", api_js)
        self.assertIn("applyGenerationOptions", ui_js)
        self.assertIn("customLoras", ui_js)
        self.assertIn("targetModel", ui_js)
        self.assertIn("normalizeLoraWeightsTotal", ui_js)
        self.assertIn("distributeLoraWeights", ui_js)
        self.assertIn("getCurrentModelCustomLoras", ui_js)

    def test_extension_branding_uses_t8_not_gua(self):
        manifest = read_text("extension", "manifest.json")
        popup_html = read_text("extension", "popup.html")

        self.assertIn('"name": "T8 图片反推+ModelScope 生图"', manifest)
        self.assertIn('"default_title": "T8 图片反推+ModelScope 生图"', manifest)
        self.assertIn("<title>T8 图片反推+ModelScope 生图</title>", popup_html)
        self.assertIn("T8 图片反推+ModelScope 生图", popup_html)
        self.assertNotIn("Gua", manifest + popup_html)

    def test_extension_context_menu_uses_saved_generation_settings_and_async_submit(self):
        manifest = read_text("extension", "manifest.json")
        background_js = read_text("extension", "scripts", "background.js")
        content_js = read_text("extension", "scripts", "content.js")
        content_css = read_text("extension", "styles", "content.css")

        self.assertNotIn('"content_scripts"', manifest)
        self.assertIn('contexts: ["image"]', background_js)
        self.assertIn('title: "反推生图 图片"', background_js)
        self.assertIn("chrome.scripting.executeScript", background_js)
        self.assertIn("installContextMenu();", background_js)
        self.assertIn("__qwenReverseImageContentLoaded", content_js)
        self.assertIn("qwen-reverse-modal", content_js)
        self.assertIn("qwen-original-image", content_js)
        self.assertIn("qwen-generated-main", content_js)
        self.assertIn("modelscope_model", content_js)
        self.assertIn("selected_loras", content_js)
        self.assertIn("/api/runtime_settings", content_js)
        self.assertIn("getRuntimeWebSettings", content_js)
        self.assertIn("has_modelscope_api_key", content_js)
        self.assertIn("本地服务版本过旧", content_js)
        self.assertIn("/api/submit_image_task", content_js)
        self.assertIn("/task_status/", content_js)
        self.assertIn("position: fixed;", content_css)
        self.assertIn("right: 24px;", content_css)
        self.assertIn("bottom: 24px;", content_css)
        self.assertNotIn("translate(-50%, -50%)", content_css)


if __name__ == "__main__":
    unittest.main()
