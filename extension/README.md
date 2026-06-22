# T8 图片反推+ModelScope 生图 Chrome 插件

这是一个基于视觉模型的图片内容分析与 ModelScope 图片生成的 Chrome / Edge 插件。加载 `extension/` 目录后，任意网页图片右键会出现“反推生图 图片”菜单。

## 功能特性

- 🖼️ **图片上传**: 支持拖拽上传或点击选择图片文件
- 🔍 **智能分析**: 使用OpenAI API分析图片内容并生成提示词
- 🎨 **图片生成**: 基于分析结果使用魔搭平台生成新图片
- ⚙️ **共享设置**: 右键流程优先复用 Web 页面保存的反推 Token、ModelScope API Token、生图模型、尺寸、张数、预设 LoRA 和自定义 LoRA
- 📊 **实时进度**: 显示处理进度和队列状态
- 📝 **操作日志**: 详细的操作记录和错误信息

## 安装说明

### 1. 启动后端服务

在安装插件之前，需要先启动本地后端服务：

```bash
# 在项目根目录下
python web_app.py
```

确保服务在 `http://localhost:5000` 上运行。

### 2. 安装插件

1. 打开Chrome浏览器
2. 访问 `chrome://extensions/`
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 `extension` 文件夹
6. 插件安装完成

## 使用方法

### 1. 配置 Web 设置

首次使用需要配置API密钥：

1. 打开 `http://127.0.0.1:5000/`
2. 在 Web 页面的“生成设置”中填入以下信息并点击保存：
   - **反推 Token（可选）**: 用于图片分析，不填则复用 ModelScope API Token
   - **ModelScope API Token**: 用于图片生成
   - **生图模型 / 图片尺寸 / 张数 / LoRA**: 右键图片流程会复用这些设置

### 2. 右键网页图片

1. 打开任意网页图片
2. 右键图片
3. 点击“反推生图 图片”
4. 当前页面会弹出反推提示词、原图、生成图和缩略图

### 3. Popup 上传图片

也可以直接在插件 popup 中拖拽或选择本地图片，点击“反推并生成”。

## 文件结构

```
extension/
├── manifest.json          # 插件配置文件
├── popup.html            # 弹窗页面
├── scripts/              # JavaScript文件
│   ├── config.js         # 配置文件
│   ├── utils.js          # 工具函数
│   ├── ui.js             # UI管理
│   ├── api.js            # API管理
│   └── popup.js          # 主入口
├── styles/               # 样式文件
│   └── popup.css         # 弹窗样式
├── icons/                # 图标文件
│   ├── icon.svg          # SVG图标（需转换为PNG）
│   ├── icon16.png        # 16x16图标（需添加）
│   ├── icon48.png        # 48x48图标（需添加）
│   └── icon128.png       # 128x128图标（需添加）
└── README.md             # 说明文档
```

## 技术架构

- **前端**: HTML + CSS + JavaScript (ES6+)
- **后端**: Python Flask (需要单独启动)
- **API**: OpenAI-compatible 视觉模型 + ModelScope API-Inference
- **存储**: Web localStorage + Flask runtime settings；Chrome Extension Storage 作为旧配置兜底

## 注意事项

1. **网络连接**: 需要稳定的网络连接访问OpenAI和ModelScope API
2. **API配额**: 注意API使用配额和费用
3. **文件大小**: 支持最大16MB的图片文件
4. **浏览器兼容**: 仅支持Chrome浏览器（Manifest V3）

## 故障排除

### 常见问题

1. **无法连接到本地服务器**
   - 确保 `web_app.py` 正在运行
   - 检查端口5000是否被占用

2. **API密钥错误**
   - 检查OpenAI API Key是否有效
   - 确认 ModelScope API Token 是否正确

3. **图片上传失败**
   - 检查文件格式是否支持
   - 确认文件大小不超过16MB

4. **生成失败**
   - 查看操作日志中的错误信息
   - 检查网络连接状态

### 调试方法

1. 打开Chrome开发者工具
2. 切换到Console标签
3. 查看错误信息和日志
4. 检查Network标签中的API请求

## 更新日志

### v1.0.0
- 初始版本发布
- 支持图片上传和分析
- 支持魔搭平台图片生成
- 完整的UI界面和设置管理

## 许可证

本项目仅供学习和研究使用。
