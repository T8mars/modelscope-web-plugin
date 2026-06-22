// UI 管理类
const MAX_LORAS_PER_REQUEST = 5;
const LORA_TOTAL_WEIGHT = 1;
const LORA_WEIGHT_DECIMALS = 4;

class UIManager {
    constructor() {
        this.elements = {};
        this.currentImageData = null;
        this.generatedImages = [];
        this.selectedThumbnail = null;
        this.customLoras = [];

        this.initializeElements();
        this.bindEvents();
        this.loadSettings();
    }

    initializeElements() {
        this.elements = {
            fileDropArea: document.getElementById('fileDropArea'),
            fileInput: document.getElementById('fileInput'),
            dropPlaceholder: document.getElementById('dropPlaceholder'),
            imagePreview: document.getElementById('imagePreview'),
            previewImg: document.getElementById('previewImg'),
            uploadProgress: document.getElementById('uploadProgress'),
            progressFill: document.getElementById('progressFill'),
            progressText: document.getElementById('progressText'),
            analyzeBtn: document.getElementById('analyzeBtn'),
            settingsBtn: document.getElementById('settingsBtn'),
            queueInfo: document.getElementById('queueInfo'),
            queueDetail: document.getElementById('queueDetail'),
            queueProgress: document.getElementById('queueProgress'),
            mainPreview: document.getElementById('mainPreview'),
            thumbnailsContainer: document.getElementById('thumbnailsContainer'),
            settingsPanel: document.getElementById('settingsPanel'),
            closeSettings: document.getElementById('closeSettings'),
            serverStatus: document.getElementById('serverStatus'),
            openaiKey: document.getElementById('openaiKey'),
            modelscopeApiKey: document.getElementById('modelscopeApiKey'),
            generationModel: document.getElementById('generationModel'),
            imageWidth: document.getElementById('imageWidth'),
            imageHeight: document.getElementById('imageHeight'),
            numImages: document.getElementById('numImages'),
            loraOptions: document.getElementById('loraOptions'),
            customLoraId: document.getElementById('customLoraId'),
            customLoraStrength: document.getElementById('customLoraStrength'),
            addCustomLora: document.getElementById('addCustomLora'),
            customLoraList: document.getElementById('customLoraList'),
            loraWeightSummary: document.getElementById('loraWeightSummary'),
            balanceLoras: document.getElementById('balanceLoras'),
            saveSettings: document.getElementById('saveSettings'),
            resetSettings: document.getElementById('resetSettings'),
            toastContainer: document.getElementById('toastContainer')
        };
    }

    bindEvents() {
        this.elements.fileDropArea.addEventListener('dragover', this.handleDragOver.bind(this));
        this.elements.fileDropArea.addEventListener('dragleave', this.handleDragLeave.bind(this));
        this.elements.fileDropArea.addEventListener('drop', this.handleDrop.bind(this));
        this.elements.fileDropArea.addEventListener('click', () => this.elements.fileInput.click());
        this.elements.fileInput.addEventListener('change', this.handleFileSelect.bind(this));
        this.elements.analyzeBtn.addEventListener('click', this.handleAnalyze.bind(this));
        this.elements.settingsBtn.addEventListener('click', this.showSettings.bind(this));
        this.elements.closeSettings.addEventListener('click', this.hideSettings.bind(this));
        this.elements.saveSettings.addEventListener('click', this.saveSettings.bind(this));
        this.elements.resetSettings.addEventListener('click', this.resetSettings.bind(this));
        this.elements.mainPreview.addEventListener('click', this.handleMainPreviewClick.bind(this));
        this.elements.generationModel.addEventListener('change', () => {
            this.renderLoraOptions(this.elements.generationModel.value, this.getSelectedLoras());
            this.renderCustomLoraList();
            this.updateLoraWeightSummary();
        });
        this.elements.addCustomLora.addEventListener('click', this.addCustomLora.bind(this));
        this.elements.balanceLoras.addEventListener('click', this.distributeLoraWeights.bind(this));
        this.elements.customLoraId.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                this.addCustomLora();
            }
        });
    }

    handleDragOver(event) {
        event.preventDefault();
        this.elements.fileDropArea.classList.add('active');
    }

    handleDragLeave(event) {
        event.preventDefault();
        this.elements.fileDropArea.classList.remove('active');
    }

    handleDrop(event) {
        event.preventDefault();
        this.elements.fileDropArea.classList.remove('active');
        if (event.dataTransfer.files.length > 0) {
            this.handleFile(event.dataTransfer.files[0]);
        }
    }

    handleFileSelect(event) {
        if (event.target.files.length > 0) {
            this.handleFile(event.target.files[0]);
        }
    }

    async handleFile(file) {
        const validation = Utils.validateFile(file);
        if (!validation.valid) {
            this.showToast(validation.error, 'error');
            return;
        }

        try {
            const previewUrl = await Utils.createImagePreview(file);
            this.showImagePreview(previewUrl);
            this.currentImageData = file;
            this.elements.analyzeBtn.disabled = false;
        } catch (error) {
            this.showToast('图片预览失败', 'error');
        }
    }

    showImagePreview(url) {
        this.elements.previewImg.src = url;
        this.elements.dropPlaceholder.style.display = 'none';
        this.elements.imagePreview.style.display = 'flex';
    }

    hideImagePreview() {
        this.elements.previewImg.src = '';
        this.elements.dropPlaceholder.style.display = 'block';
        this.elements.imagePreview.style.display = 'none';
    }

    async handleAnalyze() {
        if (!this.currentImageData) {
            this.showToast('请先选择图片', 'warning');
            return;
        }

        const settings = await this.getSettings();
        if (!settings.openaiKey && !settings.modelscopeApiKey) {
            this.showToast(CONFIG.ERRORS.MISSING_API_KEY, 'error');
            this.showSettings();
            return;
        }
        if (!settings.modelscopeApiKey) {
            this.showToast(CONFIG.ERRORS.MISSING_MODELSCOPE_TOKEN, 'error');
            this.showSettings();
            return;
        }

        try {
            this.elements.analyzeBtn.disabled = true;
            this.elements.analyzeBtn.textContent = '处理中...';
            await this.processImage(settings);
        } catch (error) {
            this.showToast('处理失败: ' + error.message, 'error');
        } finally {
            this.elements.analyzeBtn.disabled = false;
            this.elements.analyzeBtn.textContent = '反推并生成';
        }
    }

    async processImage(settings) {
        const app = typeof window !== 'undefined' && window.getPopupApp ? window.getPopupApp() : null;
        if (app && typeof app.processImageWithRealAPI === 'function') {
            return app.processImageWithRealAPI(settings || await this.getSettings());
        }
        throw new Error('真实 API 管理器未初始化');
    }

    showUploadProgress(percent) {
        this.elements.uploadProgress.style.display = 'block';
        this.elements.progressFill.style.width = percent + '%';
        this.elements.progressText.textContent = `上传中... ${percent}%`;
    }

    hideUploadProgress() {
        this.elements.uploadProgress.style.display = 'none';
    }

    showQueueInfo(message, progress) {
        this.elements.queueInfo.style.display = 'block';
        this.elements.queueDetail.textContent = message;
        this.elements.queueProgress.style.width = progress + '%';
    }

    updateQueueInfo(message, progress) {
        this.elements.queueDetail.textContent = message;
        this.elements.queueProgress.style.width = progress + '%';
    }

    updateQueueProgress(progress) {
        this.elements.queueProgress.style.width = progress + '%';
    }

    hideQueueInfo() {
        this.elements.queueInfo.style.display = 'none';
    }

    showGeneratedImages(images) {
        this.generatedImages = images;
        this.selectedThumbnail = null;
        this.elements.thumbnailsContainer.innerHTML = '';

        images.forEach((imageUrl, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'thumbnail-wrapper';
            wrapper.dataset.index = index;

            const img = document.createElement('img');
            img.src = imageUrl;
            img.alt = `生成图片 ${index + 1}`;

            wrapper.appendChild(img);
            this.elements.thumbnailsContainer.appendChild(wrapper);
            wrapper.addEventListener('click', () => this.selectThumbnail(index));
        });

        if (images.length > 0) {
            this.selectThumbnail(0);
        }
    }

    selectThumbnail(index) {
        if (this.selectedThumbnail !== null) {
            const previous = this.elements.thumbnailsContainer.children[this.selectedThumbnail];
            if (previous) {
                previous.classList.remove('selected');
            }
        }

        this.selectedThumbnail = index;
        const wrapper = this.elements.thumbnailsContainer.children[index];
        if (wrapper) {
            wrapper.classList.add('selected');
        }
        this.showMainPreview(this.generatedImages[index]);
    }

    showMainPreview(imageUrl) {
        this.elements.mainPreview.innerHTML = `<img src="${imageUrl}" alt="预览图片">`;
    }

    handleMainPreviewClick() {
        if (this.selectedThumbnail !== null && this.generatedImages[this.selectedThumbnail]) {
            window.open(this.generatedImages[this.selectedThumbnail], '_blank');
        }
    }

    showSettings() {
        this.elements.settingsPanel.style.display = 'block';
        this.renderCustomLoraList();
        this.updateLoraWeightSummary();
    }

    hideSettings() {
        this.elements.settingsPanel.style.display = 'none';
    }

    async applyGenerationOptions(options) {
        this.generationOptions = options || {};
        const defaults = this.generationOptions.defaults || {};
        const models = this.generationOptions.image_models || [];
        const settings = await this.getSettings();
        this.customLoras = settings.customLoras || [];

        this.elements.generationModel.innerHTML = '';
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model;
            option.textContent = model;
            this.elements.generationModel.appendChild(option);
        });

        this.elements.generationModel.value = settings.modelscopeModel || defaults.model || models[0] || CONFIG.DEFAULTS.MODELSCOPE_MODEL;
        this.elements.imageWidth.value = settings.imageWidth || defaults.width || CONFIG.DEFAULTS.IMAGE_WIDTH;
        this.elements.imageHeight.value = settings.imageHeight || defaults.height || CONFIG.DEFAULTS.IMAGE_HEIGHT;
        this.elements.numImages.value = settings.numImages || defaults.num_images || CONFIG.DEFAULTS.NUM_IMAGES;
        this.bindUnscopedCustomLorasToCurrentModel();
        this.renderLoraOptions(this.elements.generationModel.value, settings.selectedLoras || []);
        this.renderCustomLoraList();
        this.updateLoraWeightSummary();
    }

    renderLoraOptions(selectedModel, selectedLoras = []) {
        const loras = (this.generationOptions && this.generationOptions.available_loras) || [];
        const defaultLoras = (this.generationOptions && this.generationOptions.default_loras) || [];
        const selectedItems = selectedLoras.length ? selectedLoras : defaultLoras;
        const selectedIds = new Set(selectedItems.map(item => {
            if (typeof item === 'string') return item;
            return item && (item.id || item.loraId);
        }).filter(Boolean));
        const selectedStrengths = new Map(selectedItems.map(item => {
            if (!item || typeof item === 'string') return [item, undefined];
            return [item.id || item.loraId, item.strength || item.loraStrength || item.weight || item.scale];
        }));
        const visibleLoras = loras.filter(item => !item.targetModel || item.targetModel === selectedModel);

        this.elements.loraOptions.innerHTML = '';
        if (visibleLoras.length === 0) {
            this.elements.loraOptions.innerHTML = '<div class="setting-hint">当前模型暂无预设 LoRA</div>';
            return;
        }

        visibleLoras.forEach(item => {
            const label = document.createElement('label');
            label.className = 'lora-option';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = item.id;
            checkbox.dataset.strength = this.normalizeLoraStrength(item.strength);
            checkbox.checked = selectedIds.has(item.id);

            const copy = document.createElement('span');
            copy.className = 'lora-copy';
            const name = document.createElement('strong');
            name.textContent = item.name || item.id;
            const id = document.createElement('small');
            id.textContent = item.id;
            const strengthInput = document.createElement('input');
            strengthInput.type = 'number';
            strengthInput.min = '0';
            strengthInput.max = '1';
            strengthInput.step = '0.01';
            strengthInput.value = this.normalizeLoraStrength(selectedStrengths.get(item.id) ?? item.strength).toFixed(2);
            strengthInput.className = 'lora-strength-input';
            strengthInput.disabled = !checkbox.checked;
            strengthInput.title = '原始权重，多 LoRA 会归一到 1.00';
            strengthInput.addEventListener('click', event => event.stopPropagation());
            strengthInput.addEventListener('input', this.updateLoraWeightSummary.bind(this));
            strengthInput.addEventListener('change', () => {
                strengthInput.value = this.normalizeLoraStrength(strengthInput.value).toFixed(2);
                this.updateLoraWeightSummary();
            });
            checkbox.addEventListener('change', () => {
                strengthInput.disabled = !checkbox.checked;
                this.updateLoraWeightSummary();
            });

            copy.appendChild(name);
            copy.appendChild(id);
            label.appendChild(checkbox);
            label.appendChild(copy);
            label.appendChild(strengthInput);
            this.elements.loraOptions.appendChild(label);
        });
        this.updateLoraWeightSummary();
    }

    getSelectedLoras() {
        return this.normalizeLoraWeightsTotal(this.getSelectedLoraItems()).map(item => ({
            id: item.id,
            strength: item.strength
        }));
    }

    getCurrentModel() {
        return this.elements.generationModel.value || CONFIG.DEFAULTS.MODELSCOPE_MODEL;
    }

    normalizeLoraStrength(value) {
        const number = Number(value);
        if (!Number.isFinite(number)) return 0.8;
        return Math.max(0, Math.min(1, number));
    }

    roundLoraWeight(value) {
        return Number(Number(value || 0).toFixed(LORA_WEIGHT_DECIMALS));
    }

    loraWeightTotal(values) {
        return this.roundLoraWeight(values.reduce((sum, item) => sum + this.normalizeLoraStrength(item.strength), 0));
    }

    normalizeLoraWeightsTotal(values) {
        const weighted = values
            .map(item => ({ ...item, strength: this.normalizeLoraStrength(item.strength) }))
            .filter(item => item.id && item.strength > 0)
            .slice(0, MAX_LORAS_PER_REQUEST);

        if (weighted.length <= 1) return weighted;
        const total = this.loraWeightTotal(weighted);
        if (total <= 0) return [];

        let used = 0;
        return weighted.map((item, index) => {
            const strength = index === weighted.length - 1
                ? Math.max(0, this.roundLoraWeight(LORA_TOTAL_WEIGHT - used))
                : this.roundLoraWeight(item.strength / total);
            used = this.roundLoraWeight(used + strength);
            return { ...item, strength };
        });
    }

    getSelectedPresetLoras() {
        return Array.from(this.elements.loraOptions.querySelectorAll('input[type="checkbox"]:checked')).map(input => {
            const option = input.closest('.lora-option');
            const strengthInput = option ? option.querySelector('.lora-strength-input') : null;
            return {
                id: input.value,
                strength: this.normalizeLoraStrength(strengthInput ? strengthInput.value : input.dataset.strength),
                targetModel: this.getCurrentModel(),
                source: 'preset'
            };
        });
    }

    getCurrentModelCustomLoras() {
        const targetModel = this.getCurrentModel();
        return this.customLoras.filter(item => item.targetModel === targetModel);
    }

    getSelectedLoraItems() {
        const out = [];
        const seen = new Set();
        const add = (item) => {
            const id = String(item && item.id || '').trim();
            if (!id || seen.has(id) || out.length >= MAX_LORAS_PER_REQUEST) return;
            seen.add(id);
            out.push({
                id,
                strength: this.normalizeLoraStrength(item.strength),
                targetModel: item.targetModel || this.getCurrentModel(),
                source: item.source || 'custom'
            });
        };

        this.getSelectedPresetLoras().forEach(add);
        this.getCurrentModelCustomLoras().forEach(add);
        return out;
    }

    bindUnscopedCustomLorasToCurrentModel() {
        const targetModel = this.getCurrentModel();
        let changed = false;
        this.customLoras = this.customLoras.map(item => {
            if (item.targetModel) return item;
            changed = true;
            return { ...item, targetModel };
        });
        if (changed && typeof chrome !== 'undefined' && chrome.storage?.local) {
            chrome.storage.local.set({ [CONFIG.STORAGE_KEYS.CUSTOM_LORAS]: this.customLoras });
        }
    }

    addCustomLora() {
        const id = this.elements.customLoraId.value.trim();
        const targetModel = this.getCurrentModel();
        if (!id) {
            this.showToast('请输入自定义 LoRA ID', 'warning');
            return;
        }
        if (id.length > 180 || /[\u0000-\u001f\u007f]/.test(id)) {
            this.showToast('LoRA ID 格式不合法', 'error');
            return;
        }
        if (this.getSelectedLoraItems().length >= MAX_LORAS_PER_REQUEST && !this.customLoras.some(item => item.id === id && item.targetModel === targetModel)) {
            this.showToast(`单次最多 ${MAX_LORAS_PER_REQUEST} 个 LoRA`, 'warning');
            return;
        }

        const strength = this.normalizeLoraStrength(this.elements.customLoraStrength.value);
        const existing = this.customLoras.find(item => item.id === id && item.targetModel === targetModel);
        if (existing) {
            existing.strength = strength;
        } else {
            this.customLoras.push({ id, strength, targetModel });
        }
        this.elements.customLoraId.value = '';
        this.renderCustomLoraList();
        this.updateLoraWeightSummary();
        this.showToast('自定义 LoRA 已添加', 'success');
    }

    removeCustomLora(id, targetModel) {
        this.customLoras = this.customLoras.filter(item => !(item.id === id && item.targetModel === targetModel));
        this.renderCustomLoraList();
        this.updateLoraWeightSummary();
    }

    updateCustomLoraStrength(id, targetModel, value) {
        const strength = this.normalizeLoraStrength(value);
        this.customLoras = this.customLoras.map(item => (
            item.id === id && item.targetModel === targetModel ? { ...item, strength } : item
        ));
        this.updateLoraWeightSummary();
    }

    renderCustomLoraList() {
        this.elements.customLoraList.innerHTML = '';
        const current = this.getCurrentModelCustomLoras();
        if (current.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'setting-hint';
            empty.textContent = '当前模型还没有自定义 LoRA';
            this.elements.customLoraList.appendChild(empty);
            return;
        }

        current.forEach(item => {
            const row = document.createElement('div');
            row.className = 'custom-lora-item';

            const label = document.createElement('span');
            label.textContent = item.id;

            const strength = document.createElement('input');
            strength.type = 'number';
            strength.min = '0';
            strength.max = '1';
            strength.step = '0.01';
            strength.value = this.normalizeLoraStrength(item.strength).toFixed(2);
            strength.title = '原始权重，多 LoRA 会归一到 1.00';
            strength.addEventListener('input', () => this.updateCustomLoraStrength(item.id, item.targetModel, strength.value));
            strength.addEventListener('change', () => {
                strength.value = this.normalizeLoraStrength(strength.value).toFixed(2);
                this.updateCustomLoraStrength(item.id, item.targetModel, strength.value);
            });

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'inline-btn danger';
            remove.textContent = '移除';
            remove.addEventListener('click', () => this.removeCustomLora(item.id, item.targetModel));

            row.appendChild(label);
            row.appendChild(strength);
            row.appendChild(remove);
            this.elements.customLoraList.appendChild(row);
        });
    }

    updateLoraWeightSummary() {
        const selected = this.getSelectedLoraItems();
        const normalized = this.normalizeLoraWeightsTotal(selected);
        this.elements.balanceLoras.disabled = selected.length < 2;
        if (selected.length === 0) {
            this.elements.loraWeightSummary.textContent = '未选择 LoRA';
            return;
        }
        if (selected.length === 1) {
            this.elements.loraWeightSummary.textContent = `已选 1/${MAX_LORAS_PER_REQUEST} · 单 LoRA 直接提交`;
            return;
        }
        this.elements.loraWeightSummary.textContent = `已选 ${selected.length}/${MAX_LORAS_PER_REQUEST} · 原始总和 ${this.loraWeightTotal(selected).toFixed(2)} · 提交权重 ${this.loraWeightTotal(normalized).toFixed(2)}/1.00`;
    }

    distributeLoraWeights() {
        const selected = this.getSelectedLoraItems();
        if (selected.length < 2) return;

        const base = this.roundLoraWeight(LORA_TOTAL_WEIGHT / selected.length);
        let used = 0;
        const byId = new Map(selected.map((item, index) => {
            const strength = index === selected.length - 1
                ? Math.max(0, this.roundLoraWeight(LORA_TOTAL_WEIGHT - used))
                : base;
            used = this.roundLoraWeight(used + strength);
            return [item.id, strength];
        }));

        this.elements.loraOptions.querySelectorAll('input[type="checkbox"]:checked').forEach(input => {
            const row = input.closest('.lora-option');
            const strengthInput = row ? row.querySelector('.lora-strength-input') : null;
            if (strengthInput && byId.has(input.value)) {
                strengthInput.value = byId.get(input.value).toFixed(2);
            }
        });
        const targetModel = this.getCurrentModel();
        this.customLoras = this.customLoras.map(item => (
            item.targetModel === targetModel && byId.has(item.id)
                ? { ...item, strength: byId.get(item.id) }
                : item
        ));
        this.renderCustomLoraList();
        this.updateLoraWeightSummary();
        this.showToast('LoRA 权重已均分到 1.00', 'success');
    }

    setServerStatus(connected) {
        if (!this.elements.serverStatus) return;
        this.elements.serverStatus.textContent = connected
            ? '本地服务已连接，右键图片可使用“反推生图 图片”'
            : '本地服务未连接，请先运行启动器或 python web_app.py';
        this.elements.serverStatus.classList.toggle('connected', !!connected);
        this.elements.serverStatus.classList.toggle('disconnected', !connected);
    }

    async saveSettings() {
        const settings = {
            openaiKey: this.elements.openaiKey.value.trim(),
            modelscopeApiKey: this.elements.modelscopeApiKey.value.trim(),
            modelscopeModel: this.elements.generationModel.value || CONFIG.DEFAULTS.MODELSCOPE_MODEL,
            imageWidth: parseInt(this.elements.imageWidth.value) || CONFIG.DEFAULTS.IMAGE_WIDTH,
            imageHeight: parseInt(this.elements.imageHeight.value) || CONFIG.DEFAULTS.IMAGE_HEIGHT,
            numImages: Math.max(1, Math.min(4, parseInt(this.elements.numImages.value) || CONFIG.DEFAULTS.NUM_IMAGES)),
            selectedLoras: this.getSelectedLoras(),
            customLoras: this.customLoras
        };

        try {
            await chrome.storage.local.set({
                [CONFIG.STORAGE_KEYS.OPENAI_API_KEY]: settings.openaiKey,
                [CONFIG.STORAGE_KEYS.MODELSCOPE_API_KEY]: settings.modelscopeApiKey,
                [CONFIG.STORAGE_KEYS.MODELSCOPE_MODEL]: settings.modelscopeModel,
                [CONFIG.STORAGE_KEYS.IMAGE_WIDTH]: settings.imageWidth,
                [CONFIG.STORAGE_KEYS.IMAGE_HEIGHT]: settings.imageHeight,
                [CONFIG.STORAGE_KEYS.NUM_IMAGES]: settings.numImages,
                [CONFIG.STORAGE_KEYS.SELECTED_LORAS]: settings.selectedLoras,
                [CONFIG.STORAGE_KEYS.CUSTOM_LORAS]: settings.customLoras,
                [CONFIG.STORAGE_KEYS.SETTINGS]: settings
            });
            this.showToast(CONFIG.SUCCESS.SETTINGS_SAVED, 'success');
            this.hideSettings();
        } catch (error) {
            this.showToast('设置保存失败', 'error');
        }
    }

    async resetSettings() {
        this.elements.openaiKey.value = '';
        this.elements.modelscopeApiKey.value = '';
        this.elements.generationModel.value = CONFIG.DEFAULTS.MODELSCOPE_MODEL;
        this.elements.imageWidth.value = CONFIG.DEFAULTS.IMAGE_WIDTH;
        this.elements.imageHeight.value = CONFIG.DEFAULTS.IMAGE_HEIGHT;
        this.elements.numImages.value = CONFIG.DEFAULTS.NUM_IMAGES;
        this.customLoras = [];
        this.renderLoraOptions(this.elements.generationModel.value, []);
        this.renderCustomLoraList();
        this.updateLoraWeightSummary();

        try {
            await chrome.storage.local.remove([
                CONFIG.STORAGE_KEYS.OPENAI_API_KEY,
                CONFIG.STORAGE_KEYS.MODELSCOPE_API_KEY,
                CONFIG.STORAGE_KEYS.MODELSCOPE_MODEL,
                CONFIG.STORAGE_KEYS.IMAGE_WIDTH,
                CONFIG.STORAGE_KEYS.IMAGE_HEIGHT,
                CONFIG.STORAGE_KEYS.NUM_IMAGES,
                CONFIG.STORAGE_KEYS.SELECTED_LORAS,
                CONFIG.STORAGE_KEYS.CUSTOM_LORAS,
                CONFIG.STORAGE_KEYS.SETTINGS
            ]);
            this.showToast(CONFIG.SUCCESS.SETTINGS_RESET, 'success');
        } catch (error) {
            this.showToast('设置重置失败', 'error');
        }
    }

    async loadSettings() {
        try {
            const result = await chrome.storage.local.get([
                CONFIG.STORAGE_KEYS.OPENAI_API_KEY,
                CONFIG.STORAGE_KEYS.MODELSCOPE_API_KEY,
                CONFIG.STORAGE_KEYS.MODELSCOPE_MODEL,
                CONFIG.STORAGE_KEYS.IMAGE_WIDTH,
                CONFIG.STORAGE_KEYS.IMAGE_HEIGHT,
                CONFIG.STORAGE_KEYS.NUM_IMAGES,
                CONFIG.STORAGE_KEYS.SELECTED_LORAS,
                CONFIG.STORAGE_KEYS.CUSTOM_LORAS
            ]);

            this.elements.openaiKey.value = result[CONFIG.STORAGE_KEYS.OPENAI_API_KEY] || '';
            this.elements.modelscopeApiKey.value = result[CONFIG.STORAGE_KEYS.MODELSCOPE_API_KEY] || '';
            this.customLoras = Array.isArray(result[CONFIG.STORAGE_KEYS.CUSTOM_LORAS])
                ? result[CONFIG.STORAGE_KEYS.CUSTOM_LORAS].filter(item => item && item.id).map(item => ({
                    id: String(item.id).trim(),
                    strength: this.normalizeLoraStrength(item.strength),
                    targetModel: String(item.targetModel || item.target_model || item.model || '').trim()
                }))
                : [];
            if (result[CONFIG.STORAGE_KEYS.MODELSCOPE_MODEL]) {
                this.elements.generationModel.value = result[CONFIG.STORAGE_KEYS.MODELSCOPE_MODEL];
            }
            this.elements.imageWidth.value = result[CONFIG.STORAGE_KEYS.IMAGE_WIDTH] || CONFIG.DEFAULTS.IMAGE_WIDTH;
            this.elements.imageHeight.value = result[CONFIG.STORAGE_KEYS.IMAGE_HEIGHT] || CONFIG.DEFAULTS.IMAGE_HEIGHT;
            this.elements.numImages.value = result[CONFIG.STORAGE_KEYS.NUM_IMAGES] || CONFIG.DEFAULTS.NUM_IMAGES;
        } catch (error) {
            this.showToast('设置加载失败', 'warning');
        }
    }

    async getSettings() {
        try {
            const result = await chrome.storage.local.get([
                CONFIG.STORAGE_KEYS.OPENAI_API_KEY,
                CONFIG.STORAGE_KEYS.MODELSCOPE_API_KEY,
                CONFIG.STORAGE_KEYS.MODELSCOPE_MODEL,
                CONFIG.STORAGE_KEYS.IMAGE_WIDTH,
                CONFIG.STORAGE_KEYS.IMAGE_HEIGHT,
                CONFIG.STORAGE_KEYS.NUM_IMAGES,
                CONFIG.STORAGE_KEYS.SELECTED_LORAS,
                CONFIG.STORAGE_KEYS.CUSTOM_LORAS
            ]);
            const customLoras = Array.isArray(result[CONFIG.STORAGE_KEYS.CUSTOM_LORAS])
                ? result[CONFIG.STORAGE_KEYS.CUSTOM_LORAS].filter(item => item && item.id).map(item => ({
                    id: String(item.id).trim(),
                    strength: this.normalizeLoraStrength(item.strength),
                    targetModel: String(item.targetModel || item.target_model || item.model || '').trim()
                }))
                : [];
            this.customLoras = customLoras;

            return {
                openaiKey: result[CONFIG.STORAGE_KEYS.OPENAI_API_KEY] || '',
                modelscopeApiKey: result[CONFIG.STORAGE_KEYS.MODELSCOPE_API_KEY] || '',
                modelscopeModel: result[CONFIG.STORAGE_KEYS.MODELSCOPE_MODEL] || CONFIG.DEFAULTS.MODELSCOPE_MODEL,
                imageWidth: result[CONFIG.STORAGE_KEYS.IMAGE_WIDTH] || CONFIG.DEFAULTS.IMAGE_WIDTH,
                imageHeight: result[CONFIG.STORAGE_KEYS.IMAGE_HEIGHT] || CONFIG.DEFAULTS.IMAGE_HEIGHT,
                numImages: result[CONFIG.STORAGE_KEYS.NUM_IMAGES] || CONFIG.DEFAULTS.NUM_IMAGES,
                selectedLoras: result[CONFIG.STORAGE_KEYS.SELECTED_LORAS] || CONFIG.DEFAULTS.LORAS,
                customLoras
            };
        } catch (error) {
            return {
                openaiKey: '',
                modelscopeApiKey: '',
                modelscopeModel: CONFIG.DEFAULTS.MODELSCOPE_MODEL,
                imageWidth: CONFIG.DEFAULTS.IMAGE_WIDTH,
                imageHeight: CONFIG.DEFAULTS.IMAGE_HEIGHT,
                numImages: CONFIG.DEFAULTS.NUM_IMAGES,
                selectedLoras: CONFIG.DEFAULTS.LORAS,
                customLoras: []
            };
        }
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        this.elements.toastContainer.appendChild(toast);

        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, CONFIG.UI.TOAST_DURATION);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIManager;
} else if (typeof window !== 'undefined') {
    window.UIManager = UIManager;
}
