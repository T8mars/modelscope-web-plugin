import logging
import os
import uuid
from datetime import datetime

import requests
from flask import Blueprint, current_app, jsonify, render_template, request, session
from werkzeug.utils import secure_filename

from config import (
    DEFAULT_HEIGHT,
    DEFAULT_NUM_IMAGES,
    DEFAULT_WIDTH,
    MODELSCOPE_AVAILABLE_LORAS,
    MODELSCOPE_BASE_URL,
    MODELSCOPE_DEFAULT_LORAS,
    MODELSCOPE_IMAGE_MODEL,
    MODELSCOPE_IMAGE_MODELS,
)
from image_analyzer import analyze_image
from providers.modelscope import generate_modelscope_image, submit_modelscope_image_task
from runtime_tasks import register_task_context
from utils import allowed_file

main_bp = Blueprint('main', __name__)
RUNTIME_WEB_SETTINGS_KEY = 'RUNTIME_WEB_SETTINGS'


def _request_json():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def _int_value(value, fallback, minimum=None, maximum=None):
    try:
        n = int(value)
    except (TypeError, ValueError):
        n = fallback
    if minimum is not None:
        n = max(minimum, n)
    if maximum is not None:
        n = min(maximum, n)
    return n


def _modelscope_base_url():
    return current_app.config.get('MODELSCOPE_BASE_URL') or MODELSCOPE_BASE_URL


def _request_api_key(data, *names):
    for name in names:
        value = data.get(name)
        if value:
            return str(value).strip()
    return ''


def _runtime_settings():
    settings = current_app.config.get(RUNTIME_WEB_SETTINGS_KEY)
    if not isinstance(settings, dict):
        settings = {}
        current_app.config[RUNTIME_WEB_SETTINGS_KEY] = settings
    return settings


def _configured_modelscope_api_key():
    return (
        current_app.config.get('MODELSCOPE_API_KEY')
        or current_app.config.get('OPENAI_API_KEY')
        or ''
    )


def _modelscope_api_key():
    runtime = _runtime_settings()
    return (
        runtime.get('modelscope_api_key')
        or _configured_modelscope_api_key()
        or ''
    )


def _analysis_api_key(data=None):
    data = data or {}
    runtime = _runtime_settings()
    return (
        _request_api_key(data, 'analysis_api_key', 'openai_api_key', 'modelscope_api_key', 'api_key')
        or runtime.get('analysis_api_key')
        or runtime.get('openai_api_key')
        or runtime.get('modelscope_api_key')
        or current_app.config.get('OPENAI_API_KEY')
        or current_app.config.get('MODELSCOPE_API_KEY')
        or ''
    )


def _generation_request_params(data):
    runtime = _runtime_settings()
    width = _int_value(
        data.get('width', runtime.get('width')),
        current_app.config.get('DEFAULT_WIDTH', DEFAULT_WIDTH),
        64,
        4096,
    )
    height = _int_value(
        data.get('height', runtime.get('height')),
        current_app.config.get('DEFAULT_HEIGHT', DEFAULT_HEIGHT),
        64,
        4096,
    )
    num_images = _int_value(
        data.get('num_images', data.get('numImages', runtime.get('num_images'))),
        current_app.config.get('DEFAULT_NUM_IMAGES', DEFAULT_NUM_IMAGES),
        1,
        4,
    )
    provider_params = data.get('providerParams') if isinstance(data.get('providerParams'), dict) else {}
    if 'loras' in data:
        loras = data.get('loras')
    elif 'loras' in provider_params:
        loras = provider_params.get('loras')
    elif 'modelscopeLoras' in provider_params:
        loras = provider_params.get('modelscopeLoras')
    else:
        loras = runtime.get('loras')
    model = str(
        data.get('model')
        or runtime.get('model')
        or current_app.config.get('MODELSCOPE_IMAGE_MODEL')
        or MODELSCOPE_IMAGE_MODEL
    )
    timeout = _int_value(data.get('timeout'), 60 * 60, 1, 60 * 60)
    poll_interval = float(data.get('poll_interval', data.get('pollInterval', 1.5)) or 1.5)
    return {
        'model': model,
        'width': width,
        'height': height,
        'loras': loras,
        'num_images': num_images,
        'timeout': timeout,
        'poll_interval': poll_interval,
    }


def _sanitize_loras(value):
    if not isinstance(value, list):
        return []

    loras = []
    for item in value:
        if isinstance(item, str):
            lora_id = item.strip()
            strength = 1
        elif isinstance(item, dict):
            lora_id = str(item.get('id') or item.get('loraId') or item.get('lora_id') or '').strip()
            strength = item.get('strength', item.get('weight', 1))
        else:
            continue

        if not lora_id:
            continue
        try:
            strength = float(strength)
        except (TypeError, ValueError):
            strength = 1
        loras.append({'id': lora_id, 'strength': max(0, min(1, strength))})
        if len(loras) >= 5:
            break
    return loras


def _public_runtime_settings():
    runtime = _runtime_settings()
    return {
        'model': runtime.get('model') or current_app.config.get('MODELSCOPE_IMAGE_MODEL') or MODELSCOPE_IMAGE_MODEL,
        'width': _int_value(
            runtime.get('width'),
            current_app.config.get('DEFAULT_WIDTH', DEFAULT_WIDTH),
            64,
            4096,
        ),
        'height': _int_value(
            runtime.get('height'),
            current_app.config.get('DEFAULT_HEIGHT', DEFAULT_HEIGHT),
            64,
            4096,
        ),
        'num_images': _int_value(
            runtime.get('num_images'),
            current_app.config.get('DEFAULT_NUM_IMAGES', DEFAULT_NUM_IMAGES),
            1,
            4,
        ),
        'loras': runtime.get('loras') if isinstance(runtime.get('loras'), list) else [],
        'has_analysis_api_key': bool(
            runtime.get('analysis_api_key')
            or runtime.get('openai_api_key')
            or runtime.get('modelscope_api_key')
            or current_app.config.get('OPENAI_API_KEY')
            or current_app.config.get('MODELSCOPE_API_KEY')
        ),
        'has_modelscope_api_key': bool(runtime.get('modelscope_api_key') or _configured_modelscope_api_key()),
    }


def _update_runtime_settings(data):
    runtime = _runtime_settings()

    if 'analysis_api_key' in data or 'openai_api_key' in data:
        value = data.get('analysis_api_key', data.get('openai_api_key'))
        value = str(value or '').strip()
        if value:
            runtime['analysis_api_key'] = value
        else:
            runtime.pop('analysis_api_key', None)
            runtime.pop('openai_api_key', None)

    if 'modelscope_api_key' in data or 'api_key' in data:
        value = data.get('modelscope_api_key', data.get('api_key'))
        value = str(value or '').strip()
        if value:
            runtime['modelscope_api_key'] = value
        else:
            runtime.pop('modelscope_api_key', None)

    if 'model' in data:
        model = str(data.get('model') or '').strip()
        if model:
            runtime['model'] = model
        else:
            runtime.pop('model', None)

    if 'width' in data:
        runtime['width'] = _int_value(data.get('width'), current_app.config.get('DEFAULT_WIDTH', DEFAULT_WIDTH), 64, 4096)
    if 'height' in data:
        runtime['height'] = _int_value(data.get('height'), current_app.config.get('DEFAULT_HEIGHT', DEFAULT_HEIGHT), 64, 4096)
    if 'num_images' in data or 'numImages' in data:
        runtime['num_images'] = _int_value(
            data.get('num_images', data.get('numImages')),
            current_app.config.get('DEFAULT_NUM_IMAGES', DEFAULT_NUM_IMAGES),
            1,
            4,
        )
    if 'loras' in data:
        runtime['loras'] = _sanitize_loras(data.get('loras'))

    current_app.config[RUNTIME_WEB_SETTINGS_KEY] = runtime
    return runtime


def _download_image_to_uploads(image_url):
    if not image_url or not str(image_url).lower().startswith(('http://', 'https://')):
        raise ValueError('仅支持 http/https 图片URL')

    response = requests.get(image_url, stream=True, timeout=30)
    response.raise_for_status()

    temp_dir = current_app.config['UPLOAD_FOLDER']
    os.makedirs(temp_dir, exist_ok=True)

    raw_name = os.path.basename(str(image_url).split('?', 1)[0])
    filename = secure_filename(raw_name) if raw_name else ''
    root, ext = os.path.splitext(filename)
    if not root:
        root = 'remote-image'
    if ext.lower().lstrip('.') not in {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'}:
        ext = '.jpg'

    temp_filename = f"{uuid.uuid4().hex}_{root}{ext}"
    temp_image_path = os.path.join(temp_dir, temp_filename)
    with open(temp_image_path, 'wb') as f:
        for chunk in response.iter_content(chunk_size=8192):
            if chunk:
                f.write(chunk)
    return temp_image_path


def _analyze_image_path(image_path, cleanup=False, api_key=None):
    try:
        success, result = analyze_image(image_path, api_key=api_key or _analysis_api_key())
        if success:
            return jsonify({'success': True, 'prompt': result})
        return jsonify({'success': False, 'error': result})
    finally:
        if cleanup and image_path and os.path.exists(image_path):
            try:
                os.remove(image_path)
            except OSError:
                logging.warning('清理临时图片失败: %s', image_path)


@main_bp.route('/')
def index():
    return render_template('index.html')


@main_bp.route('/health', methods=['GET'])
def health_check():
    """健康检查端点，用于插件检测服务器状态"""
    return jsonify({
        'success': True,
        'message': 'T8 图片反推+ModelScope 生图服务运行正常',
        'status': 'healthy',
        'timestamp': str(datetime.now()),
        'generation_provider': 'modelscope-api',
        'cookie_mode': False,
    })


@main_bp.route('/api/modelscope_options', methods=['GET'])
def modelscope_options():
    image_models = current_app.config.get('MODELSCOPE_IMAGE_MODELS') or MODELSCOPE_IMAGE_MODELS
    return jsonify({
        'success': True,
        'image_models': image_models,
        'available_loras': current_app.config.get('MODELSCOPE_AVAILABLE_LORAS') or MODELSCOPE_AVAILABLE_LORAS,
        'default_loras': current_app.config.get('MODELSCOPE_DEFAULT_LORAS') or MODELSCOPE_DEFAULT_LORAS,
        'defaults': {
            'model': current_app.config.get('MODELSCOPE_IMAGE_MODEL') or MODELSCOPE_IMAGE_MODEL,
            'width': current_app.config.get('DEFAULT_WIDTH', DEFAULT_WIDTH),
            'height': current_app.config.get('DEFAULT_HEIGHT', DEFAULT_HEIGHT),
            'num_images': current_app.config.get('DEFAULT_NUM_IMAGES', DEFAULT_NUM_IMAGES),
        },
    })


@main_bp.route('/api/runtime_settings', methods=['GET', 'POST'])
def runtime_settings():
    """共享 Web 页面当前配置给右键扩展；响应中不回传任何 Token 明文。"""
    if request.method == 'POST':
        _update_runtime_settings(_request_json())
    return jsonify({
        'success': True,
        'settings': _public_runtime_settings(),
    })


@main_bp.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'success': False, 'error': 'No file part'})
    file = request.files['file']
    if file.filename == '':
        return jsonify({'success': False, 'error': 'No selected file'})
    if file and allowed_file(file.filename):
        safe_name = secure_filename(file.filename)
        root, ext = os.path.splitext(safe_name)
        filename = f"{uuid.uuid4().hex}_{root or 'upload'}{ext or '.jpg'}"
        file_path = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
        file.save(file_path)

        session['image_path'] = file_path
        session['image_filename'] = filename

        return jsonify({'success': True, 'filename': filename})
    return jsonify({'success': False, 'error': 'File type not allowed'})


@main_bp.route('/analyze', methods=['POST'])
def analyze():
    data = _request_json()
    image_path = session.get('image_path')
    if not image_path or not os.path.exists(image_path):
        return jsonify({'success': False, 'message': '请先上传图片！'})

    try:
        return _analyze_image_path(image_path, cleanup=False, api_key=_analysis_api_key(data))
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@main_bp.route('/analyze_from_url', methods=['POST'])
def analyze_from_url():
    data = _request_json()
    image_url = data.get('url')
    if not image_url:
        return jsonify({'success': False, 'message': '缺少图片URL！'})

    try:
        temp_image_path = _download_image_to_uploads(image_url)
        return _analyze_image_path(temp_image_path, cleanup=True, api_key=_analysis_api_key(data))
    except requests.exceptions.RequestException as e:
        return jsonify({'success': False, 'error': f'下载图片失败: {e}'})
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)})
    except Exception as e:
        return jsonify({'success': False, 'error': f'图片分析出错: {e}'})


@main_bp.route('/api/generate_image', methods=['POST'])
def generate_image_proxy():
    """生成图片的后端代理API，使用 ModelScope API Token。"""
    data = _request_json()
    prompt = str(data.get('prompt', '')).strip()
    if not prompt:
        return jsonify({'success': False, 'error': '请输入提示词'})

    api_key = _request_api_key(data, 'modelscope_api_key', 'api_key') or _modelscope_api_key()
    if not api_key:
        return jsonify({'success': False, 'error': 'ModelScope API Token 未配置，请设置 MODELSCOPE_API_KEY'})

    params = _generation_request_params(data)

    try:
        result = generate_modelscope_image(
            api_key=api_key,
            prompt=prompt,
            model=params['model'],
            width=params['width'],
            height=params['height'],
            loras=params['loras'],
            num_images=params['num_images'],
            base_url=_modelscope_base_url(),
            timeout=params['timeout'],
            poll_interval=params['poll_interval'],
        )
    except Exception as e:
        logging.exception('ModelScope 生图调用异常')
        return jsonify({'success': False, 'error': f'ModelScope 生图调用异常: {e}'})

    if not result.get('ok'):
        return jsonify({
            'success': False,
            'error': result.get('error') or 'ModelScope 生图失败',
            'code': result.get('code'),
            'task_id': result.get('task_id'),
        })

    images = result.get('image_urls') or []
    return jsonify({
        'success': True,
        'images': images,
        'task_id': result.get('task_id'),
        'model': result.get('model'),
        'provider': 'modelscope-api',
    })


@main_bp.route('/api/submit_image_task', methods=['POST'])
def submit_image_task_proxy():
    """提交 ModelScope 生图任务，不阻塞等待完成，供前端异步轮询。"""
    data = _request_json()
    prompt = str(data.get('prompt', '')).strip()
    if not prompt:
        return jsonify({'success': False, 'error': '请输入提示词'})

    api_key = _request_api_key(data, 'modelscope_api_key', 'api_key') or _modelscope_api_key()
    if not api_key:
        return jsonify({'success': False, 'error': 'ModelScope API Token 未配置，请设置 MODELSCOPE_API_KEY'})

    params = _generation_request_params(data)
    try:
        result = submit_modelscope_image_task(
            api_key=api_key,
            prompt=prompt,
            model=params['model'],
            width=params['width'],
            height=params['height'],
            loras=params['loras'],
            num_images=params['num_images'],
            base_url=_modelscope_base_url(),
        )
    except Exception as e:
        logging.exception('ModelScope 生图任务提交异常')
        return jsonify({'success': False, 'error': f'ModelScope 生图任务提交异常: {e}'})

    if not result.get('ok'):
        return jsonify({
            'success': False,
            'error': result.get('error') or 'ModelScope 生图任务提交失败',
            'code': result.get('code'),
        })

    images = result.get('image_urls') or []
    task_id = result.get('task_id')
    if task_id:
        register_task_context(task_id, api_key=api_key, base_url=_modelscope_base_url())

    return jsonify({
        'success': True,
        'status': 'completed' if images else 'processing',
        'images': images,
        'task_id': task_id,
        'model': result.get('model'),
        'provider': 'modelscope-api',
    })


@main_bp.route('/reverse_image', methods=['POST'])
def reverse_image():
    data = _request_json()
    image_url = data.get('image_url')
    if not image_url:
        return jsonify({'success': False, 'message': '缺少图片URL！'})

    try:
        temp_image_path = _download_image_to_uploads(image_url)
        return _analyze_image_path(temp_image_path, cleanup=True, api_key=_analysis_api_key(data))
    except requests.exceptions.RequestException as e:
        return jsonify({'success': False, 'error': f'下载图片失败: {e}'})
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})
