import os

here = os.path.dirname(os.path.abspath(__file__))

def _env(name, default=""):
    return os.getenv(name, default).strip()

def _env_int(name, default):
    try:
        return int(_env(name, str(default)))
    except (TypeError, ValueError):
        return default

# 配置上传文件夹和允许的文件扩展名
UPLOAD_FOLDER = os.path.join(here, 'uploads')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp'}
MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB上传限制

# API Key 配置：优先使用环境变量，禁止把真实 Token 写入仓库文件。
MODELSCOPE_API_KEY = _env("MODELSCOPE_API_KEY") or _env("MODELSCOPE_SDK_TOKEN")
OPENAI_API_KEY = _env("OPENAI_API_KEY") or MODELSCOPE_API_KEY

MODELSCOPE_BASE_URL = _env("MODELSCOPE_BASE_URL", "https://api-inference.modelscope.cn/v1")
MODELSCOPE_IMAGE_MODELS = [
    model.strip()
    for model in _env(
        "MODELSCOPE_IMAGE_MODELS",
        "Tongyi-MAI/Z-Image-Turbo,Qwen/Qwen-Image-2512,Qwen/Qwen-Image-Edit-2511,black-forest-labs/FLUX.2-klein-9B"
    ).split(",")
    if model.strip()
]
MODELSCOPE_IMAGE_MODEL = _env("MODELSCOPE_IMAGE_MODEL", MODELSCOPE_IMAGE_MODELS[0] if MODELSCOPE_IMAGE_MODELS else "Tongyi-MAI/Z-Image-Turbo")
IMAGE_ANALYSIS_MODEL = _env("IMAGE_ANALYSIS_MODEL", "Qwen/Qwen3-VL-235B-A22B-Instruct")
IMAGE_ANALYSIS_FALLBACK_MODELS = [
    model.strip()
    for model in _env(
        "IMAGE_ANALYSIS_FALLBACK_MODELS",
        ""
    ).split(",")
    if model.strip()
]

# 图像生成默认参数
DEFAULT_WIDTH = _env_int("DEFAULT_WIDTH", 1104)
DEFAULT_HEIGHT = _env_int("DEFAULT_HEIGHT", 1472)
DEFAULT_NUM_IMAGES = _env_int("DEFAULT_NUM_IMAGES", 1)

MODELSCOPE_AVAILABLE_LORAS = [
    {
        "id": "Daniel8152/film",
        "name": "Z-Image Film",
        "targetModel": "Tongyi-MAI/Z-Image-Turbo",
        "strength": 0.8,
    },
    {
        "id": "Daniel8152/Qwen-Image-2512-Film",
        "name": "Qwen Image 2512 Film",
        "targetModel": "Qwen/Qwen-Image-2512",
        "strength": 0.8,
    },
    {
        "id": "Daniel8152/Klein-enhance",
        "name": "Klein enhance",
        "targetModel": "black-forest-labs/FLUX.2-klein-9B",
        "strength": 0.8,
    },
]

MODELSCOPE_DEFAULT_LORAS = []

# 旧变量名兼容，避免扩展或临时脚本导入时报错；ModelScope API-Inference 使用 loras 字段。
LORA_ARGS = MODELSCOPE_DEFAULT_LORAS
