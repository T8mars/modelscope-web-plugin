(() => {
    if (window.__qwenReverseImageContentLoaded) {
        return;
    }
    window.__qwenReverseImageContentLoaded = true;

    const LOCAL_API_BASE = 'http://127.0.0.1:5000';
    let qwenReverseModal = null;
    let activeRunId = 0;

    function createModal(imageUrl) {
        activeRunId += 1;
        const runId = activeRunId;

        if (qwenReverseModal) {
            qwenReverseModal.remove();
        }

        qwenReverseModal = document.createElement('div');
        qwenReverseModal.id = 'qwen-reverse-modal';
        qwenReverseModal.innerHTML = `
            <div class="qwen-reverse-header">
                <h3>反推生图</h3>
                <button type="button" class="qwen-reverse-close" aria-label="Close">&times;</button>
            </div>
            <div class="qwen-reverse-body">
                <div class="qwen-reverse-error" hidden></div>
                <section class="qwen-prompt-section">
                    <label>反推提示词:</label>
                    <div class="qwen-prompt-display">正在分析图片...</div>
                </section>
                <section class="qwen-image-grid">
                    <div class="qwen-image-panel">
                        <div class="qwen-image-title">原始图片</div>
                        <img id="qwen-original-image" alt="Original image">
                    </div>
                    <div class="qwen-image-panel">
                        <div class="qwen-image-title">生成图片</div>
                        <div class="qwen-generated-stage">
                            <div class="qwen-spinner" aria-label="Loading"></div>
                            <div class="qwen-task-status">等待提交...</div>
                            <img id="qwen-generated-main" alt="Generated image" hidden>
                        </div>
                        <div id="qwen-thumbnail-strip" class="qwen-thumbnail-strip"></div>
                    </div>
                </section>
            </div>
        `;

        const originalImage = qwenReverseModal.querySelector('#qwen-original-image');
        originalImage.src = imageUrl;

        qwenReverseModal.querySelector('.qwen-reverse-close').addEventListener('click', () => {
            activeRunId += 1;
            qwenReverseModal.remove();
            qwenReverseModal = null;
        });

        document.body.appendChild(qwenReverseModal);
        return { modal: qwenReverseModal, runId };
    }

    function getStoredApiSettings() {
        if (typeof chrome === 'undefined' || !chrome.storage?.local) {
            return Promise.resolve({});
        }
        return chrome.storage.local.get([
            'openai_api_key',
            'modelscope_api_key',
            'modelscope_model',
            'image_width',
            'image_height',
            'num_images',
            'selected_loras'
        ]).catch(() => ({}));
    }

    async function getRuntimeWebSettings() {
        const response = await fetch(`${LOCAL_API_BASE}/api/runtime_settings`);
        if (!response.ok) {
            throw new Error(httpErrorMessage(response));
        }
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || '无法读取 Web 端配置');
        }
        return data.settings || {};
    }

    function firstValue(...values) {
        for (const value of values) {
            if (value !== undefined && value !== null && value !== '') {
                return value;
            }
        }
        return undefined;
    }

    async function getSharedGenerationSettings() {
        const runtimeSettings = await getRuntimeWebSettings();
        const storedSettings = await getStoredApiSettings();
        const runtimeLoras = Array.isArray(runtimeSettings.loras) ? runtimeSettings.loras : null;

        return {
            openai_api_key: storedSettings.openai_api_key || '',
            modelscope_api_key: storedSettings.modelscope_api_key || '',
            modelscope_model: firstValue(runtimeSettings.model, storedSettings.modelscope_model, 'Tongyi-MAI/Z-Image-Turbo'),
            image_width: firstValue(runtimeSettings.width, storedSettings.image_width, 1104),
            image_height: firstValue(runtimeSettings.height, storedSettings.image_height, 1472),
            num_images: firstValue(runtimeSettings.num_images, storedSettings.num_images, 1),
            selected_loras: runtimeLoras !== null ? runtimeLoras : (storedSettings.selected_loras || []),
            has_analysis_api_key: Boolean(
                runtimeSettings.has_analysis_api_key
                || storedSettings.openai_api_key
                || storedSettings.modelscope_api_key
            ),
            has_modelscope_api_key: Boolean(runtimeSettings.has_modelscope_api_key || storedSettings.modelscope_api_key)
        };
    }

    function httpErrorMessage(response) {
        if (response.status === 404) {
            return '本地服务版本过旧，请重启启动器或 Flask 后端';
        }
        return `HTTP ${response.status}`;
    }

    async function postJson(path, payload) {
        const response = await fetch(`${LOCAL_API_BASE}${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            throw new Error(httpErrorMessage(response));
        }
        return response.json();
    }

    function normalizeImages(data) {
        if (Array.isArray(data?.images) && data.images.length > 0) {
            return data.images;
        }
        if (data?.result?.image_url) {
            return [data.result.image_url];
        }
        return [];
    }

    function stillActive(runId) {
        return qwenReverseModal && activeRunId === runId;
    }

    function setTaskStatus(modal, message) {
        const taskStatus = modal.querySelector('.qwen-task-status');
        if (taskStatus) {
            taskStatus.textContent = message;
        }
    }

    function setPrompt(modal, prompt) {
        const promptDisplay = modal.querySelector('.qwen-prompt-display');
        if (promptDisplay) {
            promptDisplay.textContent = prompt || '';
        }
    }

    function setLoading(modal, loading) {
        const spinner = modal.querySelector('.qwen-spinner');
        if (spinner) {
            spinner.hidden = !loading;
        }
    }

    function showError(modal, message) {
        const errorBox = modal.querySelector('.qwen-reverse-error');
        if (errorBox) {
            errorBox.textContent = message;
            errorBox.hidden = false;
        }
        setLoading(modal, false);
        setTaskStatus(modal, '处理失败');
    }

    function renderGeneratedImages(modal, images) {
        const mainImage = modal.querySelector('#qwen-generated-main');
        const thumbnailStrip = modal.querySelector('#qwen-thumbnail-strip');
        if (!mainImage || !thumbnailStrip || images.length === 0) {
            showError(modal, '未能生成图片');
            return;
        }

        setLoading(modal, false);
        setTaskStatus(modal, `生成完成，共 ${images.length} 张`);
        thumbnailStrip.innerHTML = '';
        mainImage.src = images[0];
        mainImage.hidden = false;

        images.forEach((imageUrl, index) => {
            const thumb = document.createElement('button');
            thumb.type = 'button';
            thumb.className = index === 0 ? 'qwen-thumb selected' : 'qwen-thumb';
            thumb.setAttribute('aria-label', `查看生成图片 ${index + 1}`);

            const img = document.createElement('img');
            img.src = imageUrl;
            img.alt = `Generated thumbnail ${index + 1}`;
            thumb.appendChild(img);

            thumb.addEventListener('click', () => {
                mainImage.src = imageUrl;
                thumbnailStrip.querySelectorAll('.qwen-thumb').forEach(item => item.classList.remove('selected'));
                thumb.classList.add('selected');
            });

            thumbnailStrip.appendChild(thumb);
        });
    }

    async function pollGeneratedTask(modal, taskId, runId) {
        for (let attempt = 0; attempt < 1800; attempt++) {
            if (!stillActive(runId)) {
                return [];
            }

            const response = await fetch(`${LOCAL_API_BASE}/task_status/${encodeURIComponent(taskId)}`);
            if (!response.ok) {
                throw new Error(httpErrorMessage(response));
            }
            const data = await response.json();
            const status = String(data.status || 'processing').toLowerCase();
            const progress = data.progress || Math.min(95, 25 + attempt);
            setTaskStatus(modal, data.message || `生成中... ${progress}%`);

            if (status === 'completed') {
                const images = normalizeImages(data);
                if (images.length > 0) {
                    return images;
                }
                throw new Error('任务完成但未返回图片');
            }
            if (status === 'failed' || status === 'cancelled') {
                throw new Error(data.error || '任务执行失败');
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        throw new Error('任务轮询超时');
    }

    async function generateFromPrompt(modal, prompt, settings, runId) {
        setTaskStatus(modal, '正在提交生图任务...');
        const generateData = await postJson('/api/submit_image_task', {
            prompt,
            modelscope_api_key: settings.modelscope_api_key || '',
            model: settings.modelscope_model || 'Tongyi-MAI/Z-Image-Turbo',
            width: settings.image_width || 1104,
            height: settings.image_height || 1472,
            num_images: settings.num_images || 1,
            loras: settings.selected_loras || []
        });

        if (!generateData.success) {
            throw new Error(generateData.error || '未能提交生图任务');
        }

        const immediateImages = normalizeImages(generateData);
        if (immediateImages.length > 0) {
            return immediateImages;
        }

        const taskId = generateData.task_id || generateData.taskId;
        if (!taskId) {
            throw new Error('生图任务未返回 task_id');
        }
        setTaskStatus(modal, `任务已提交：${taskId}`);
        return pollGeneratedTask(modal, taskId, runId);
    }

    async function runReverseAndGenerate(imageUrl) {
        const { modal, runId } = createModal(imageUrl);
        setLoading(modal, true);

        try {
            setTaskStatus(modal, '正在读取 Web 端配置...');
            const settings = await getSharedGenerationSettings();
            if (!settings.has_modelscope_api_key) {
                throw new Error('Web 端未配置 ModelScope API Token，请在 127.0.0.1:5000 的生成设置中保存后重试');
            }

            const analysisApiKey = settings.openai_api_key || settings.modelscope_api_key || '';
            const modelscopeApiKey = settings.modelscope_api_key || '';

            setTaskStatus(modal, '正在反推图片...');
            const data = await postJson('/reverse_image', {
                image_url: imageUrl,
                analysis_api_key: analysisApiKey,
                modelscope_api_key: modelscopeApiKey
            });

            if (!stillActive(runId)) {
                return;
            }
            if (!data.success || !data.prompt) {
                throw new Error(data.error || '未能启动反推任务');
            }

            setPrompt(modal, data.prompt);
            const images = await generateFromPrompt(modal, data.prompt, settings, runId);
            if (stillActive(runId)) {
                renderGeneratedImages(modal, images);
            }
        } catch (error) {
            if (stillActive(runId)) {
                showError(modal, `请求失败: ${error.message}`);
            }
        }
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'qwenReverseImage.showModal' || request.action === 'showModal') {
            runReverseAndGenerate(request.imageUrl);
            sendResponse({ ok: true });
            return true;
        }
        return false;
    });
})();
