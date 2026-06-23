// static/js/main.js

document.addEventListener('DOMContentLoaded', function() {
    document.title = 'T8 图片反推+ModelScope 生图';

    const MAX_LORAS_PER_REQUEST = 5;
    const LORA_TOTAL_WEIGHT = 1;
    const LORA_WEIGHT_DECIMALS = 4;

    const fileInput = document.getElementById('file_input');
    const fileDropArea = document.getElementById('file_drop_area');
    const imagePreview = document.getElementById('image_preview');
    const urlImagePreview = document.getElementById('url_image_preview');
    const urlPreviewImg = document.getElementById('url_preview_img');
    const dropPlaceholder = document.getElementById('drop_placeholder');
    const uploadedFileInfo = document.getElementById('uploaded_file_info');
    const analyzeAndGenerateButton = document.getElementById('analyze_and_generate');
    const modelSelect = document.getElementById('generation_model');
    const widthInput = document.getElementById('image_width');
    const heightInput = document.getElementById('image_height');
    const numImagesInput = document.getElementById('num_images');
    const loraOptions = document.getElementById('lora_options');
    const optionsStatus = document.getElementById('options_status');
    const modelscopeApiKeyInput = document.getElementById('modelscope_api_key');
    const analysisApiKeyInput = document.getElementById('analysis_api_key');
    const saveApiKeysButton = document.getElementById('save_api_keys');
    const clearApiKeysButton = document.getElementById('clear_api_keys');
    const apiKeyStatus = document.getElementById('api_key_status');
    const promptResultPanel = document.getElementById('prompt_result_panel');
    const reversePromptInput = document.getElementById('reverse_prompt');
    const copyReversePromptButton = document.getElementById('copy_reverse_prompt');
    const customLoraIdInput = document.getElementById('custom_lora_id');
    const customLoraStrengthInput = document.getElementById('custom_lora_strength');
    const addCustomLoraButton = document.getElementById('add_custom_lora');
    const customLoraList = document.getElementById('custom_lora_list');
    const loraWeightSummary = document.getElementById('lora_weight_summary');
    const balanceLorasButton = document.getElementById('balance_loras');

    let availableLoras = [];
    let defaultLoras = [];
    let customLoras = [];
    let runtimeSettingsSyncTimer = null;

    loadApiKeySettings();
    loadCustomLoras();
    const optionsPromise = loadModelscopeOptions();
    const urlParams = new URLSearchParams(window.location.search);
    const imageUrlFromParam = urlParams.get('imageUrl');

    if (imageUrlFromParam) {
        if (dropPlaceholder) dropPlaceholder.style.display = 'none';
        if (uploadedFileInfo) uploadedFileInfo.style.display = 'none';
        if (imagePreview) imagePreview.style.display = 'none';
        if (fileInput) fileInput.style.display = 'none';
        if (fileDropArea) fileDropArea.style.pointerEvents = 'none';

        if (urlImagePreview) urlImagePreview.style.display = 'block';
        if (urlPreviewImg) urlPreviewImg.src = imageUrlFromParam;
        if (analyzeAndGenerateButton) analyzeAndGenerateButton.disabled = false;

        optionsPromise.finally(() => analyzeAndGenerate(imageUrlFromParam));
    } else {
        if (dropPlaceholder) dropPlaceholder.style.display = 'flex';
        if (urlImagePreview) urlImagePreview.style.display = 'none';
        if (fileInput) fileInput.style.display = 'block';
        if (fileDropArea) fileDropArea.style.pointerEvents = 'auto';
    }

    if (modelSelect) {
        modelSelect.addEventListener('change', () => {
            renderLoraOptions();
            renderCustomLoraList();
            updateLoraWeightSummary();
            scheduleRuntimeSettingsSync();
        });
    }
    [widthInput, heightInput, numImagesInput].forEach(input => {
        if (!input) return;
        input.addEventListener('input', scheduleRuntimeSettingsSync);
        input.addEventListener('change', scheduleRuntimeSettingsSync);
    });
    if (saveApiKeysButton) {
        saveApiKeysButton.addEventListener('click', saveApiKeySettings);
    }
    if (clearApiKeysButton) {
        clearApiKeysButton.addEventListener('click', clearApiKeySettings);
    }
    if (copyReversePromptButton) {
        copyReversePromptButton.addEventListener('click', copyReversePrompt);
    }
    if (addCustomLoraButton) {
        addCustomLoraButton.addEventListener('click', addCustomLora);
    }
    if (balanceLorasButton) {
        balanceLorasButton.addEventListener('click', distributeLoraWeights);
    }
    if (customLoraIdInput) {
        customLoraIdInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                addCustomLora();
            }
        });
    }

    if (fileDropArea) {
        fileDropArea.addEventListener('click', (e) => {
            if (e.target.closest('#image_preview')) {
                return;
            }
            fileInput.value = '';
            fileInput.click();
        });
    }

    if (imagePreview) {
        imagePreview.addEventListener('click', (e) => {
            e.stopPropagation();
            fileInput.value = '';
            fileInput.click();
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                handleFileUpload(e.target.files[0]);
            }
        });
    }

    if (fileDropArea) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            fileDropArea.addEventListener(eventName, preventDefaults, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            fileDropArea.addEventListener(eventName, () => fileDropArea.classList.add('active'), false);
        });
        ['dragleave', 'drop'].forEach(eventName => {
            fileDropArea.addEventListener(eventName, () => fileDropArea.classList.remove('active'), false);
        });

        fileDropArea.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files && files[0]) {
                handleFileUpload(files[0]);
            }
        }, false);
    }

    if (analyzeAndGenerateButton) {
        analyzeAndGenerateButton.addEventListener('click', () => analyzeAndGenerate());
    }

    async function loadModelscopeOptions() {
        try {
            const data = await getModelscopeOptions();
            const defaults = data.defaults || {};
            const models = data.image_models || [];
            availableLoras = data.available_loras || [];
            defaultLoras = Array.isArray(data.default_loras) ? data.default_loras : [];

            if (modelSelect) {
                modelSelect.innerHTML = '';
                models.forEach(model => {
                    const option = document.createElement('option');
                    option.value = model;
                    option.textContent = model;
                    modelSelect.appendChild(option);
                });
                modelSelect.value = defaults.model || models[0] || '';
            }

            if (widthInput) widthInput.value = defaults.width || widthInput.value;
            if (heightInput) heightInput.value = defaults.height || heightInput.value;
            if (numImagesInput) numImagesInput.value = defaults.num_images || numImagesInput.value;

            bindUnscopedCustomLorasToCurrentModel();
            renderLoraOptions();
            renderCustomLoraList();
            updateLoraWeightSummary();
            if (optionsStatus) optionsStatus.textContent = '已加载';
        } catch (error) {
            if (optionsStatus) optionsStatus.textContent = '配置加载失败';
            if (loraOptions) {
                loraOptions.innerHTML = '<div class="text-muted small">无法加载 LoRA 列表</div>';
            }
            renderCustomLoraList();
            updateLoraWeightSummary();
        } finally {
            scheduleRuntimeSettingsSync();
        }
    }

    function renderLoraOptions() {
        if (!loraOptions) return;

        const selectedModel = getCurrentModel();
        const visibleLoras = availableLoras.filter(item => {
            return !item.targetModel || item.targetModel === selectedModel;
        });

        loraOptions.innerHTML = '';
        if (visibleLoras.length === 0) {
            loraOptions.innerHTML = '<div class="text-muted small">当前模型暂无预设 LoRA</div>';
            return;
        }

        visibleLoras.forEach(item => {
            const label = document.createElement('label');
            label.className = 'lora-option';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = item.id;
            checkbox.dataset.strength = normalizeLoraStrength(item.strength);
            checkbox.checked = defaultLoras.some(lora => {
                if (typeof lora === 'string') return lora === item.id;
                return lora && (lora.id === item.id || lora.loraId === item.id);
            });

            const copy = document.createElement('span');
            copy.className = 'lora-copy';
            const name = document.createElement('strong');
            name.textContent = item.name || item.id;
            const id = document.createElement('small');
            id.textContent = item.id;
            copy.appendChild(name);
            copy.appendChild(id);

            const strengthInput = document.createElement('input');
            strengthInput.type = 'number';
            strengthInput.min = '0';
            strengthInput.max = '1';
            strengthInput.step = '0.01';
            strengthInput.value = normalizeLoraStrength(item.strength).toFixed(2);
            strengthInput.className = 'form-control form-control-sm lora-strength-input';
            strengthInput.title = 'LoRA 原始权重；多 LoRA 提交前会归一到总和 1.00';
            strengthInput.disabled = !checkbox.checked;
            strengthInput.addEventListener('click', event => event.stopPropagation());
            strengthInput.addEventListener('input', () => {
                updateLoraWeightSummary();
                scheduleRuntimeSettingsSync();
            });
            strengthInput.addEventListener('change', () => {
                strengthInput.value = normalizeLoraStrength(strengthInput.value).toFixed(2);
                updateLoraWeightSummary();
                scheduleRuntimeSettingsSync();
            });
            checkbox.addEventListener('change', () => {
                strengthInput.disabled = !checkbox.checked;
                updateLoraWeightSummary();
                scheduleRuntimeSettingsSync();
            });

            label.appendChild(checkbox);
            label.appendChild(copy);
            label.appendChild(strengthInput);
            loraOptions.appendChild(label);
        });
        updateLoraWeightSummary();
    }

    function getGenerationOptions() {
        const selectedLoras = normalizeLoraWeightsTotal(getSelectedLoraItems());
        const currentCustomLoras = getCustomLorasForCurrentModel();

        return {
            model: modelSelect ? modelSelect.value : undefined,
            width: widthInput ? Number(widthInput.value) : undefined,
            height: heightInput ? Number(heightInput.value) : undefined,
            num_images: numImagesInput ? Number(numImagesInput.value) : undefined,
            loras: selectedLoras.map(item => ({ id: item.id, strength: item.strength })),
            custom_loras: currentCustomLoras.map(item => item.id)
        };
    }

    function loadCustomLoras() {
        try {
            const stored = JSON.parse(localStorage.getItem('qwen_web_custom_loras') || '[]');
            customLoras = Array.isArray(stored)
                ? stored.filter(item => item && item.id).map(item => ({
                    id: String(item.id).trim(),
                    strength: normalizeLoraStrength(item.strength),
                    targetModel: String(item.targetModel || item.target_model || item.model || '').trim()
                }))
                : [];
        } catch (error) {
            customLoras = [];
        }
        renderCustomLoraList();
    }

    function saveCustomLoras() {
        localStorage.setItem('qwen_web_custom_loras', JSON.stringify(customLoras));
    }

    function getCurrentModel() {
        return modelSelect ? String(modelSelect.value || '').trim() : '';
    }

    function bindUnscopedCustomLorasToCurrentModel() {
        const targetModel = getCurrentModel();
        if (!targetModel) return;

        let changed = false;
        customLoras = customLoras.map(item => {
            if (item.targetModel) return item;
            changed = true;
            return { ...item, targetModel };
        });
        if (changed) {
            saveCustomLoras();
        }
    }

    function getCustomLorasForCurrentModel() {
        const targetModel = getCurrentModel();
        return customLoras.filter(item => item.targetModel === targetModel);
    }

    function normalizeLoraStrength(value) {
        const number = Number(value);
        if (!Number.isFinite(number)) return 0.8;
        return Math.max(0, Math.min(1, number));
    }

    function roundLoraWeight(value) {
        return Number(Number(value || 0).toFixed(LORA_WEIGHT_DECIMALS));
    }

    function getSelectedPresetLoras() {
        return Array.from(document.querySelectorAll('#lora_options input[type="checkbox"]:checked')).map(input => {
            const option = input.closest('.lora-option');
            const strengthInput = option ? option.querySelector('.lora-strength-input') : null;
            return {
                id: input.value,
                strength: normalizeLoraStrength(strengthInput ? strengthInput.value : input.dataset.strength),
                targetModel: getCurrentModel(),
                source: 'preset'
            };
        });
    }

    function getSelectedLoraItems() {
        const out = [];
        const seen = new Set();
        const add = (item) => {
            const id = String(item && item.id || '').trim();
            if (!id || seen.has(id) || out.length >= MAX_LORAS_PER_REQUEST) return;
            seen.add(id);
            out.push({
                id,
                strength: normalizeLoraStrength(item.strength),
                targetModel: item.targetModel || getCurrentModel(),
                source: item.source || 'custom'
            });
        };

        getSelectedPresetLoras().forEach(add);
        getCustomLorasForCurrentModel().forEach(add);
        return out;
    }

    function loraWeightTotal(values) {
        return roundLoraWeight(values.reduce((sum, item) => sum + normalizeLoraStrength(item.strength), 0));
    }

    function normalizeLoraWeightsTotal(values) {
        const weighted = values
            .map(item => ({ ...item, strength: normalizeLoraStrength(item.strength) }))
            .filter(item => item.id && item.strength > 0)
            .slice(0, MAX_LORAS_PER_REQUEST);

        if (weighted.length <= 1) return weighted;
        const total = loraWeightTotal(weighted);
        if (total <= 0) return [];

        let used = 0;
        return weighted.map((item, index) => {
            const strength = index === weighted.length - 1
                ? Math.max(0, roundLoraWeight(LORA_TOTAL_WEIGHT - used))
                : roundLoraWeight(item.strength / total);
            used = roundLoraWeight(used + strength);
            return { ...item, strength };
        });
    }

    function updateLoraWeightSummary() {
        if (!loraWeightSummary) return;

        const selected = getSelectedLoraItems();
        const normalized = normalizeLoraWeightsTotal(selected);
        if (balanceLorasButton) {
            balanceLorasButton.disabled = selected.length < 2;
        }
        if (selected.length === 0) {
            loraWeightSummary.textContent = '未选择 LoRA';
            return;
        }
        if (selected.length === 1) {
            loraWeightSummary.textContent = `已选 1/${MAX_LORAS_PER_REQUEST} · 单 LoRA 直接提交`;
            return;
        }

        const rawTotal = loraWeightTotal(selected);
        const normalizedTotal = loraWeightTotal(normalized);
        loraWeightSummary.textContent = `已选 ${selected.length}/${MAX_LORAS_PER_REQUEST} · 原始总和 ${rawTotal.toFixed(2)} · 提交权重 ${normalizedTotal.toFixed(2)}/1.00`;
    }

    function distributeWeightsForItems(items) {
        if (!items.length) return [];
        const base = roundLoraWeight(LORA_TOTAL_WEIGHT / items.length);
        let used = 0;
        return items.map((item, index) => {
            const strength = index === items.length - 1
                ? Math.max(0, roundLoraWeight(LORA_TOTAL_WEIGHT - used))
                : base;
            used = roundLoraWeight(used + strength);
            return { ...item, strength };
        });
    }

    function distributeLoraWeights() {
        const selected = getSelectedLoraItems();
        if (selected.length < 2) return;

        const distributed = distributeWeightsForItems(selected);
        const byId = new Map(distributed.map(item => [item.id, item.strength]));

        document.querySelectorAll('#lora_options input[type="checkbox"]:checked').forEach(input => {
            const option = input.closest('.lora-option');
            const strengthInput = option ? option.querySelector('.lora-strength-input') : null;
            const nextStrength = byId.get(input.value);
            if (strengthInput && nextStrength !== undefined) {
                strengthInput.value = nextStrength.toFixed(2);
            }
        });

        const targetModel = getCurrentModel();
        customLoras = customLoras.map(item => (
            item.targetModel === targetModel && byId.has(item.id)
                ? { ...item, strength: byId.get(item.id) }
                : item
        ));
        saveCustomLoras();
        renderCustomLoraList();
        updateLoraWeightSummary();
        showToast('LoRA 权重已均分到 1.00', 'success');
        scheduleRuntimeSettingsSync();
    }

    function addCustomLora() {
        if (!customLoraIdInput) return;

        const targetModel = getCurrentModel();
        if (!targetModel) {
            showToast('请先选择生图模型', 'warning');
            return;
        }

        const id = customLoraIdInput.value.trim();
        if (!id) {
            showToast('请输入自定义 LoRA ID', 'warning');
            return;
        }
        if (id.length > 180 || /[\u0000-\u001f\u007f]/.test(id)) {
            showToast('LoRA ID 格式不合法', 'danger');
            return;
        }

        const strength = normalizeLoraStrength(customLoraStrengthInput ? customLoraStrengthInput.value : 0.8);
        const existing = customLoras.find(item => item.id === id && item.targetModel === targetModel);
        if (existing) {
            existing.strength = strength;
        } else {
            if (getSelectedLoraItems().length >= MAX_LORAS_PER_REQUEST) {
                showToast(`单次最多 ${MAX_LORAS_PER_REQUEST} 个 LoRA，请先移除或取消选择一个`, 'warning');
                return;
            }
            customLoras.push({ id, strength, targetModel });
        }
        saveCustomLoras();
        renderCustomLoraList();
        updateLoraWeightSummary();
        customLoraIdInput.value = '';
        showToast('自定义 LoRA 已绑定到当前模型', 'success');
        scheduleRuntimeSettingsSync();
    }

    function updateCustomLoraStrength(id, targetModel, value) {
        const strength = normalizeLoraStrength(value);
        customLoras = customLoras.map(item => (
            item.id === id && item.targetModel === targetModel
                ? { ...item, strength }
                : item
        ));
        saveCustomLoras();
        updateLoraWeightSummary();
        scheduleRuntimeSettingsSync();
    }

    function removeCustomLora(id, targetModel) {
        customLoras = customLoras.filter(item => !(item.id === id && item.targetModel === targetModel));
        saveCustomLoras();
        renderCustomLoraList();
        updateLoraWeightSummary();
        scheduleRuntimeSettingsSync();
    }

    function renderCustomLoraList() {
        if (!customLoraList) return;

        customLoraList.innerHTML = '';
        const currentCustomLoras = getCustomLorasForCurrentModel();
        if (currentCustomLoras.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'custom-lora-empty';
            empty.textContent = '当前模型还没有自定义 LoRA';
            customLoraList.appendChild(empty);
            return;
        }

        currentCustomLoras.forEach(item => {
            const row = document.createElement('div');
            row.className = 'custom-lora-item';

            const label = document.createElement('span');
            label.textContent = item.id;

            const strengthInput = document.createElement('input');
            strengthInput.type = 'number';
            strengthInput.min = '0';
            strengthInput.max = '1';
            strengthInput.step = '0.01';
            strengthInput.value = normalizeLoraStrength(item.strength).toFixed(2);
            strengthInput.className = 'form-control form-control-sm';
            strengthInput.title = '自定义 LoRA 原始权重；多 LoRA 提交前会归一到总和 1.00';
            strengthInput.addEventListener('change', () => {
                strengthInput.value = normalizeLoraStrength(strengthInput.value).toFixed(2);
                updateCustomLoraStrength(item.id, item.targetModel, strengthInput.value);
            });
            strengthInput.addEventListener('input', () => {
                updateCustomLoraStrength(item.id, item.targetModel, strengthInput.value);
            });

            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.className = 'btn btn-outline-danger btn-sm';
            removeButton.textContent = '移除';
            removeButton.addEventListener('click', () => removeCustomLora(item.id, item.targetModel));

            row.appendChild(label);
            row.appendChild(strengthInput);
            row.appendChild(removeButton);
            customLoraList.appendChild(row);
        });
    }

    function showReversePrompt(prompt) {
        if (!promptResultPanel || !reversePromptInput) return;
        reversePromptInput.value = prompt || '';
        promptResultPanel.classList.remove('d-none');
    }

    async function copyReversePrompt() {
        const prompt = reversePromptInput ? reversePromptInput.value : '';
        if (!prompt) {
            showToast('暂无可复制的反推提示词', 'warning');
            return;
        }

        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(prompt);
            } else {
                reversePromptInput.select();
                document.execCommand('copy');
                reversePromptInput.blur();
            }
            showToast('反推提示词已复制', 'success');
        } catch (error) {
            showToast('复制失败，请手动选择文本复制', 'warning');
        }
    }

    function loadApiKeySettings() {
        if (!modelscopeApiKeyInput || !analysisApiKeyInput) return;

        const modelscopeApiKey = localStorage.getItem('qwen_web_modelscope_api_key') || '';
        const analysisApiKey = localStorage.getItem('qwen_web_analysis_api_key') || '';
        modelscopeApiKeyInput.value = modelscopeApiKey;
        analysisApiKeyInput.value = analysisApiKey;
        updateApiKeyStatus();
    }

    async function saveApiKeySettings() {
        const modelscopeApiKey = modelscopeApiKeyInput ? modelscopeApiKeyInput.value.trim() : '';
        const analysisApiKey = analysisApiKeyInput ? analysisApiKeyInput.value.trim() : '';
        localStorage.setItem('qwen_web_modelscope_api_key', modelscopeApiKey);
        localStorage.setItem('qwen_web_analysis_api_key', analysisApiKey);
        updateApiKeyStatus();
        const syncResult = await syncWebRuntimeSettings();
        showToast(
            syncResult.ok ? 'API Key 已保存，并同步给右键插件' : `API Key 已保存；右键同步失败：${syncResult.message}`,
            syncResult.ok ? 'success' : 'warning'
        );
    }

    function clearApiKeySettings() {
        localStorage.removeItem('qwen_web_modelscope_api_key');
        localStorage.removeItem('qwen_web_analysis_api_key');
        if (modelscopeApiKeyInput) modelscopeApiKeyInput.value = '';
        if (analysisApiKeyInput) analysisApiKeyInput.value = '';
        updateApiKeyStatus();
        syncWebRuntimeSettings();
        showToast('API Key 已清空', 'info');
    }

    function updateApiKeyStatus() {
        if (!apiKeyStatus) return;
        const keys = getApiKeySettings();
        apiKeyStatus.textContent = keys.modelscope_api_key ? '已设置' : '未设置';
        apiKeyStatus.classList.toggle('text-success', !!keys.modelscope_api_key);
        apiKeyStatus.classList.toggle('text-muted', !keys.modelscope_api_key);
    }

    function getApiKeySettings() {
        const modelscopeApiKey = modelscopeApiKeyInput ? modelscopeApiKeyInput.value.trim() : '';
        const analysisApiKey = analysisApiKeyInput ? analysisApiKeyInput.value.trim() : '';
        return {
            analysis_api_key: analysisApiKey || modelscopeApiKey,
            modelscope_api_key: modelscopeApiKey
        };
    }

    function getWebRuntimeSettings() {
        return {
            ...getApiKeySettings(),
            ...getGenerationOptions()
        };
    }

    async function syncWebRuntimeSettings() {
        try {
            await syncRuntimeSettings(getWebRuntimeSettings());
            return { ok: true, message: '' };
        } catch (error) {
            return { ok: false, message: error.message || '请确认本地服务正常' };
        }
    }

    function scheduleRuntimeSettingsSync() {
        window.clearTimeout(runtimeSettingsSyncTimer);
        runtimeSettingsSyncTimer = window.setTimeout(syncWebRuntimeSettings, 250);
    }

    async function handleFileUpload(file) {
        const uploadProgressContainer = document.getElementById('upload_progress_container');
        const uploadProgressBar = document.getElementById('upload_progress_bar');

        const validExtensions = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/bmp'];
        if (!validExtensions.includes(file.type)) {
            showToast('不支持的文件类型，请上传图片文件', 'danger');
            return;
        }
        if (file.size > 16 * 1024 * 1024) {
            showToast('文件太大，请上传小于16MB的图片', 'danger');
            return;
        }

        if (uploadProgressContainer) uploadProgressContainer.style.display = 'block';
        if (uploadProgressBar) uploadProgressBar.style.width = '0%';
        if (analyzeAndGenerateButton) analyzeAndGenerateButton.disabled = true;

        try {
            const onUploadProgress = (progressEvent) => {
                const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                if (uploadProgressBar) uploadProgressBar.style.width = percentCompleted + '%';
            };

            const data = await uploadFile(file, onUploadProgress);

            if (data.success) {
                const imageUrl = '/uploads/' + data.filename;
                showImagePreview(imageUrl);
                if (analyzeAndGenerateButton) analyzeAndGenerateButton.disabled = false;
                showToast('文件上传成功！', 'success');
            } else {
                throw new Error(data.error || '上传失败');
            }
        } catch (error) {
            showToast('上传文件时出错，请重试', 'danger');
            if (analyzeAndGenerateButton) analyzeAndGenerateButton.disabled = true;
        } finally {
            if (uploadProgressContainer) uploadProgressContainer.style.display = 'none';
        }
    }

    async function analyzeAndGenerate(imageUrl = null) {
        if (analyzeAndGenerateButton) {
            analyzeAndGenerateButton.disabled = true;
            analyzeAndGenerateButton.textContent = '处理中...';
        }

        try {
            await syncWebRuntimeSettings();
            const apiKeys = getApiKeySettings();
            showQueueInfo('正在分析图片内容...', 8);
            const analysisResponse = imageUrl
                ? await analyzeImageFromUrl(imageUrl, apiKeys)
                : await analyzeImage(true, apiKeys);

            if (!analysisResponse || !analysisResponse.success) {
                throw new Error((analysisResponse && analysisResponse.error) || '图片分析失败');
            }

            showReversePrompt(analysisResponse.prompt);
            updateQueueInfo('已获得提示词，正在提交生图任务...', 18);
            const images = await generateQwenImage(
                analysisResponse.prompt,
                {
                    ...getGenerationOptions(),
                    ...apiKeys
                },
                updateTaskProgress
            );

            displayGeneratedImages(images);
            updateQueueInfo('图片生成完成', 100);
            setTimeout(hideQueueInfo, 500);
            showToast('图片生成成功！', 'success');
        } catch (error) {
            updateQueueInfo('处理失败：' + error.message, 100);
            showToast('生成图片时出错：' + error.message, 'danger');
        } finally {
            if (analyzeAndGenerateButton) {
                analyzeAndGenerateButton.disabled = !imageUrl && !currentImageUrl;
                analyzeAndGenerateButton.textContent = '反推并生成';
            }
        }
    }

    function updateTaskProgress(status) {
        const progress = status.progress || 25;
        const message = status.message || (
            status.status === 'completed'
                ? '图片生成完成'
                : 'ModelScope 正在生成图片...'
        );
        updateQueueInfo(message, progress);
    }

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
});
