// static/js/api.js

async function uploadFile(file, onUploadProgress) {
    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await axios.post('/upload', formData, {
            headers: {
                'Content-Type': 'multipart/form-data'
            },
            onUploadProgress: onUploadProgress
        });
        return response.data;
    } catch (error) {
        console.error('Upload error:', error);
        throw error.response ? new Error(error.response.data.error || '服务器错误') : error;
    }
}

function apiKeyPayload(apiKeys = {}) {
    const payload = {};
    if (apiKeys.analysis_api_key) {
        payload.analysis_api_key = apiKeys.analysis_api_key;
    }
    if (apiKeys.modelscope_api_key) {
        payload.modelscope_api_key = apiKeys.modelscope_api_key;
    }
    return payload;
}

async function analyzeImage(showSuccessToast = false, apiKeys = {}) {
    try {
        const response = await axios.post('/analyze', apiKeyPayload(apiKeys));
        if (response.data.success) {
            if (showSuccessToast) {
                showToast('图片分析成功！', 'success');
            }
            return { success: true, prompt: response.data.prompt };
        }
        throw new Error(response.data.error || '分析失败');
    } catch (error) {
        console.error('分析图片时出错:', error);
        showToast('分析图片时出错: ' + error.message, 'danger');
        return { success: false, error: error.message };
    }
}

async function analyzeImageFromUrl(imageUrl, apiKeys = {}) {
    try {
        showToast('正在分析网络图片...', 'info');
        const response = await axios.post('/analyze_from_url', {
            url: imageUrl,
            ...apiKeyPayload(apiKeys)
        });
        if (response.data.success) {
            showToast('网络图片分析成功！', 'success');
            return { success: true, prompt: response.data.prompt };
        }
        throw new Error(response.data.error || '网络图片分析失败');
    } catch (error) {
        console.error('分析网络图片时出错:', error);
        showToast('分析网络图片时出错: ' + error.message, 'danger');
        return { success: false, error: error.message };
    }
}

async function getModelscopeOptions() {
    try {
        const response = await axios.get('/api/modelscope_options');
        const data = response.data;
        if (!data.success) {
            throw new Error(data.error || '获取 ModelScope 配置失败');
        }
        return data;
    } catch (error) {
        console.error('获取 ModelScope 配置时出错:', error);
        throw error.response ? new Error(error.response.data.error || '服务器错误') : error;
    }
}

function normalizeApiError(error, fallbackMessage = '服务器错误') {
    if (error.response && error.response.status === 404) {
        return new Error('本地服务版本过旧，请重启启动器或 Flask 后端');
    }
    return error.response ? new Error(error.response.data.error || fallbackMessage) : error;
}

async function syncRuntimeSettings(settings = {}) {
    try {
        const response = await axios.post('/api/runtime_settings', settings);
        const data = response.data;
        if (!data.success) {
            throw new Error(data.error || '同步 Web 端配置失败');
        }
        return data.settings || {};
    } catch (error) {
        console.warn('同步 Web 端配置时出错:', error);
        throw normalizeApiError(error);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeTaskImages(data) {
    if (data && Array.isArray(data.images) && data.images.length > 0) {
        return data.images;
    }
    if (data && data.result && data.result.image_url) {
        return [data.result.image_url];
    }
    return [];
}

async function pollImageTask(taskId, onProgress, intervalMs = 2000, maxAttempts = 1800) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const response = await axios.get(`/task_status/${encodeURIComponent(taskId)}`);
        const data = response.data || {};
        const status = String(data.status || 'processing').toLowerCase();
        const progress = Number(data.progress || (status === 'completed' ? 100 : Math.min(95, 25 + attempt)));

        if (onProgress) {
            onProgress({
                status,
                progress,
                message: data.message || (status === 'processing' ? 'ModelScope 正在生成图片...' : ''),
                task_id: taskId
            });
        }

        if (status === 'completed') {
            const images = normalizeTaskImages(data);
            if (images.length > 0) {
                return images;
            }
            throw new Error('任务完成但未返回图片');
        }

        if (status === 'failed' || status === 'cancelled') {
            throw new Error(data.error || 'ModelScope 生图任务失败');
        }

        await sleep(intervalMs);
    }

    throw new Error('ModelScope 生图任务轮询超时');
}

async function generateQwenImage(prompt, options = {}, onProgress = null) {
    const requestData = {
        prompt: prompt,
        ...options
    };

    try {
        showToast('正在提交生成任务...', 'info');
        const response = await axios.post('/api/submit_image_task', requestData);
        const data = response.data;

        if (!data.success) {
            throw new Error(data.error || '生成图片失败');
        }

        const immediateImages = normalizeTaskImages(data);
        if (immediateImages.length > 0) {
            if (onProgress) {
                onProgress({ status: 'completed', progress: 100, message: '图片生成完成' });
            }
            console.log(`图片生成成功，获取到${immediateImages.length}张图片`);
            return immediateImages;
        }

        const taskId = data.task_id || data.taskId;
        if (!taskId) {
            throw new Error('生成任务已提交但未返回 task_id');
        }

        if (onProgress) {
            onProgress({
                status: 'processing',
                progress: 20,
                message: `任务已提交：${taskId}`,
                task_id: taskId
            });
        }

        return await pollImageTask(taskId, onProgress);
    } catch (error) {
        console.error(`生成图片时出错: ${error.message}`);
        throw error;
    }
}
