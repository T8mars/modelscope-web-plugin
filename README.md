# T8 图片反推 + ModelScope 生图

一个本地 Flask Web 服务 + Chrome/Edge Manifest V3 扩展组成的图片反推生图工具。

核心流程：

1. 上传图片，或在任意网页图片上右键。
2. 调用 OpenAI-compatible 视觉模型反推出中文提示词。
3. 使用 ModelScope API-Inference 提交图片生成任务。
4. 在 Web 页面或当前网页右下角浮层中查看提示词、原图、生成图和缩略图。

## 主要功能

- Web 页面拖拽上传图片并反推生图。
- Chrome/Edge 图片右键菜单：`反推生图 图片`。
- 当前网页右下角弹窗，不跳转、不遮挡页面主体。
- Web 端统一配置 API Token、模型、尺寸、张数和 LoRA。
- 右键扩展复用 Web 端配置，避免插件和网页各配一套。
- 支持 ModelScope API-Inference 异步任务提交与轮询。
- 支持多 LoRA，最多 5 个，提交前自动归一到总权重 1.00。
- 支持自定义 LoRA，并按当前生图模型绑定。
- 支持反推提示词展示与复制。
- Windows 启动器会检测旧服务版本，避免 `/api/runtime_settings` 缺失导致右键同步失败。
- 支持 Electron Windows 便携版打包，双击后自动启动内置 Flask 后端。

## 目录结构

```text
.
├── web_app.py                 # Flask app 入口
├── routes.py                  # Web/API 路由
├── image_analyzer.py          # 图片反推逻辑
├── providers/modelscope.py    # ModelScope API-Inference provider
├── task_poller.py             # 异步任务轮询
├── runtime_tasks.py           # 运行时 task_id 上下文
├── templates/index.html       # Web 页面
├── static/                    # Web CSS/JS
├── extension/                 # Chrome/Edge 扩展源码
├── electron/main.js           # Electron 主进程
├── packaging/                 # PyInstaller 和桌面版打包脚本
├── tests/                     # 单元和契约测试
├── package.json               # Electron/electron-builder 配置
├── requirements.txt
└── 启动器.bat                 # Windows 本地启动器
```

## 环境要求

- Python 3.9+
- Chrome 或 Edge
- ModelScope API Token
- 可选：单独的 OpenAI-compatible 视觉模型 Token

依赖：

```powershell
pip install -r requirements.txt
```

## 启动后端

### 方式一：Windows 启动器

```powershell
.\启动器.bat
```

启动器会：

- 检查 Python。
- 读取当前环境变量 `MODELSCOPE_API_KEY` 或 `MODELSCOPE_SDK_TOKEN`。
- 如果缺失，会在当前启动进程里临时提示输入。
- 检查 `http://127.0.0.1:5000/health` 和 `/api/runtime_settings`。
- 启动 Flask 并打开 Web 页面。

### 方式二：手动启动

```powershell
$env:MODELSCOPE_API_KEY="your-modelscope-token"
python web_app.py
```

可选反推 Token：

```powershell
$env:OPENAI_API_KEY="your-analysis-token"
```

服务地址：

```text
http://127.0.0.1:5000/
```

## Web 页面使用

1. 打开 `http://127.0.0.1:5000/`。
2. 在“生成设置”里填写 `ModelScope API Token`。
3. 可选填写“反推 Token”，不填则复用 ModelScope Token。
4. 选择模型、宽高、张数和 LoRA。
5. 上传图片，点击“反推并生成”。

Web 页面保存配置后，会同步到本地 Flask 运行时配置。右键扩展会优先读取这份配置。

## 安装浏览器扩展

1. 启动本地后端。
2. 打开 `chrome://extensions/` 或 Edge 的扩展管理页。
3. 开启“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择本项目的 `extension/` 目录。
6. 在 Web 页面保存 API/model 设置。
7. 在任意网页图片上右键，选择 `反推生图 图片`。

如果扩展仍显示旧名称或旧行为，请在扩展管理页点击“重新加载”。

## 打包 Windows 桌面版

桌面版会把 Flask 后端打成 `t8-backend.exe`，再通过 Electron 启动本地 Web 页面。用户运行便携版时不需要自己安装 Python 或 Node。

构建依赖：

```powershell
npm install
```

生成便携版：

```powershell
npm run dist:win
```

产物位置：

```text
release/T8 ModelScope Web Plugin-1.0.0-x64.exe
```

调试用目录包：

```powershell
npm run pack:win
```

生成安装器：

```powershell
npm run dist:win:installer
```

打包脚本会自动创建 `.venv-build/`，安装 `requirements.txt`，并用 `packaging/t8-backend.spec` 把 `templates/`、`static/` 和后端源码打进 `dist/t8-backend.exe`。Electron 启动后会等待 `/health` 和 `/api/runtime_settings` 可访问，再加载页面。

可选环境变量：

| 变量 | 用途 |
| --- | --- |
| `T8_BACKEND_PORT` | 覆盖 Electron 内置后端端口，默认 `5000` |
| `T8_UPLOAD_FOLDER` | 覆盖后端上传目录；桌面版默认使用 Electron 用户数据目录 |

## API 配置

常用环境变量：

| 变量 | 用途 |
| --- | --- |
| `MODELSCOPE_API_KEY` | ModelScope API-Inference 生图 Token，也可作为默认反推 Token |
| `MODELSCOPE_SDK_TOKEN` | `MODELSCOPE_API_KEY` 的兼容别名 |
| `OPENAI_API_KEY` | 可选，单独用于 OpenAI-compatible 图片反推 |
| `MODELSCOPE_BASE_URL` | 默认 `https://api-inference.modelscope.cn/v1` |
| `MODELSCOPE_IMAGE_MODEL` | 默认生图模型 |
| `MODELSCOPE_IMAGE_MODELS` | 逗号分隔的可选生图模型 |
| `IMAGE_ANALYSIS_MODEL` | 默认反推模型 |
| `DEFAULT_WIDTH` / `DEFAULT_HEIGHT` | 默认生成尺寸 |
| `DEFAULT_NUM_IMAGES` | 默认生成张数 |

默认反推模型：

```text
Qwen/Qwen3-VL-235B-A22B-Instruct
```

默认生图模型：

```text
Tongyi-MAI/Z-Image-Turbo
```

## 核心接口

- `GET /health`
- `GET /api/modelscope_options`
- `GET /api/runtime_settings`
- `POST /api/runtime_settings`
- `POST /upload`
- `POST /analyze`
- `POST /analyze_from_url`
- `POST /reverse_image`
- `POST /api/submit_image_task`
- `GET /task_status/<task_id>`
- `POST /api/generate_image`

`/api/runtime_settings` 只返回 Token 是否已设置，不回传 Token 明文。

## 测试

```powershell
python -m unittest discover -s tests
python -m py_compile web_app.py routes.py image_analyzer.py task_poller.py utils.py config.py runtime_tasks.py providers/modelscope.py
python -m json.tool extension\manifest.json
```

前端和扩展 JS 语法检查：

```powershell
node --check static\js\api.js
node --check static\js\main.js
node --check extension\scripts\content.js
```

## 打包扩展

源码方式加载时直接选择 `extension/` 目录即可。

需要 zip 包时：

```powershell
New-Item -ItemType Directory -Force dist | Out-Null
Compress-Archive -Path .\extension\* -DestinationPath .\dist\qwen-web-chrome-extension.zip -Force
```

## 安全说明

- 不要把真实 API Key 写入代码、README、测试或提交历史。
- Web 页面中的 Token 保存在浏览器本地，并同步到当前 Flask 进程内存。
- `/api/runtime_settings` 不返回 Token 明文。
- `uploads/`、`dist/`、`release/`、本地日志、缓存、打包 venv 和本地上下文文件不会进入 Git。

## 常见问题

### 保存 Key 后提示右键同步失败

先确认后端是最新版本：

```powershell
Invoke-RestMethod http://127.0.0.1:5000/api/runtime_settings
```

如果返回 404，请停止旧 Flask 进程，重新运行 `启动器.bat` 或 `python web_app.py`。

### 右键菜单没有出现

- 确认浏览器扩展已加载 `extension/` 目录。
- 在 `chrome://extensions/` 点击扩展“重新加载”。
- 右键目标必须是网页里的图片元素。

### 生成任务一直处理中

打开后端控制台查看日志；ModelScope 异步任务可能需要等待。后端重启会丢失内存中的 task_id 轮询上下文。

## License

仅供学习、研究和本地工作流使用。
