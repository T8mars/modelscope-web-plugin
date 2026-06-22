import logging

import requests
from flask import Blueprint, current_app, jsonify, request

from config import MODELSCOPE_API_KEY, MODELSCOPE_BASE_URL
from providers.modelscope import poll_modelscope_task
from runtime_tasks import clear_task_context, get_task_context

task_poller_bp = Blueprint('task_poller', __name__)


def _api_key(context=None):
    context = context or {}
    return context.get('api_key') or current_app.config.get('MODELSCOPE_API_KEY') or MODELSCOPE_API_KEY or current_app.config.get('OPENAI_API_KEY') or ''


def _base_url(context=None):
    context = context or {}
    return context.get('base_url') or current_app.config.get('MODELSCOPE_BASE_URL') or MODELSCOPE_BASE_URL


def _poll_task_result(task_id):
    context = get_task_context(task_id)
    api_key = _api_key(context)
    if not api_key:
        return {'ok': False, 'status': 'failed', 'error': 'ModelScope API Token 未配置'}

    result = poll_modelscope_task(
        api_key=api_key,
        task_id=task_id,
        base_url=_base_url(context),
        timeout=120,
    )
    if result.get('status') in {'completed', 'failed'}:
        clear_task_context(task_id)
    return result


@task_poller_bp.route('/poll_task', methods=['POST'])
def poll_task():
    """轮询 ModelScope API-Inference 任务状态"""
    data = request.get_json(silent=True) or {}
    task_id = data.get('task_id')

    if not task_id:
        return jsonify({'success': False, 'error': '缺少任务ID'})

    try:
        result = _poll_task_result(task_id)
        status = result.get('status') or 'processing'
        logging.info('轮询 ModelScope 任务 %s 状态: %s', task_id, status)

        if status == 'completed':
            images = result.get('image_urls') or []
            if images:
                return jsonify({'success': True, 'status': 'COMPLETED', 'images': images})
            return jsonify({'success': False, 'status': 'FAILED', 'error': '图片生成成功但未找到图片URL'})
        if status == 'failed' or not result.get('ok'):
            return jsonify({'success': False, 'status': 'FAILED', 'error': result.get('error') or '任务执行失败'})

        return jsonify({'success': True, 'status': 'PROCESSING', 'progress': 25, 'message': '正在处理中...'})
    except requests.exceptions.RequestException as e:
        logging.error('轮询任务状态时出错: %s', e)
        return jsonify({'success': False, 'error': f'轮询任务状态时出错: {e}'})


@task_poller_bp.route('/task_status/<task_id>', methods=['GET'])
def get_task_status(task_id):
    """兼容旧扩展的任务状态查询接口"""
    try:
        result = _poll_task_result(task_id)
        status = result.get('status') or 'processing'
        if status == 'completed':
            images = result.get('image_urls') or []
            if images:
                return jsonify({'status': 'completed', 'result': {'image_url': images[0]}, 'images': images})
            return jsonify({'status': 'failed', 'error': 'Image generation succeeded but no image URL found'})
        if status == 'failed' or not result.get('ok'):
            return jsonify({'status': 'failed', 'error': result.get('error') or 'Task failed'})
        return jsonify({'status': 'processing', 'progress': 25, 'message': '正在处理中...'})
    except requests.exceptions.RequestException as e:
        logging.error('Error polling task status for %s: %s', task_id, e)
        return jsonify({'status': 'failed', 'error': f'Error polling task status: {e}'})
