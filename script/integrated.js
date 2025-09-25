// ==================== 全局常量和 DOM 元素引用 ====================
    const API_BASE_URL = 'https://img.liyao.sbs';
    const API_TOKEN_KEY = 'imgbed_api_token';

    // DOM 元素引用...
    const productsList = document.getElementById('products-list');
    const noProductsMessage = document.getElementById('no-products-message');
    const detailView = document.getElementById('product-detail-view');
    const detailPlaceholder = document.getElementById('detail-placeholder');
    const loadingOverlay = document.getElementById('loading-overlay');
    const apiTokenInput = document.getElementById('api-token');
    const apiTokenSaveButton = document.getElementById('save-api-token-btn');
    const styleNameInput = document.getElementById('style-name');
    const priceInput = document.getElementById('price');
    const newStyleInput = document.getElementById('new-style');
    const newTagInput = document.getElementById('new-tag');
    const newSeasonInput = document.getElementById('new-season');
    const newSceneInput = document.getElementById('new-scene');
    const dropArea = document.getElementById('drop-area');
    const dropAreaMessage = document.getElementById('drop-area-message'); // 新增 DOM 引用
    const fileListDiv = document.getElementById('file-list');
    const uploadButton = document.getElementById('upload-btn');
    const statusMessageDiv = document.getElementById('status-message');
    // 移除 adminSelectionStatus 和 adminSelectionMessage 的 DOM 引用，因为它们已被移除或隐藏
    // const adminSelectionStatus = document.getElementById('admin-selection-status'); // 已移除
    // const adminSelectionMessage = document.getElementById('admin-selection-message'); // 已移除
    const clearAdminSelectionBtn = document.getElementById('clear-admin-selection-btn'); // 按钮仍然存在，只是位置改变

    // ==================== 全局状态变量 ====================
    let allProducts = [];
    let currentSelectedProductForAdmin = null; // 存储当前在管理后台选中的商品对象
    
    // 用于画廊筛选
    let activeFilters = { 
        style: new Set(),
        tag: new Set(),
        season: new Set(),
        scene: new Set()
    };
    
    // 用于 "创建新商品" 模式下存储用户选择
    let createModeSelectedTags = {
        styles: new Set(),
        tags: new Set(),
        seasons: new Set(),
        scenes: new Set()
    };
    
    // 存储从所有商品中收集到的所有可能的标签值
    let allPossibleTags = {
        styles: [],
        tags: [],
        seasons: [],
        scenes: []
    };

    let filesToUpload = [];


    // ==================== 数据获取与解析 ====================
    async function fetchAllProducts() {
        showLoading();
        try {
            const apiToken = getApiToken(); // 尝试获取API Token
            if (!apiToken) {
                // 如果没有API Token，显示错误信息但不阻止页面加载其他内容
                showStatusMessage("API Token 未设置。请在管理后台输入并保存，方可进行数据管理、上传及删除操作。", 'error');
                productsList.innerHTML = '';
                noProductsMessage.style.display = 'block';
                noProductsMessage.textContent = '请设置API Token以加载商品数据。';
                hideLoading();
                return;
            }
            
            const response = await fetch(`${API_BASE_URL}/api/manage/list?dir=服装&count=-1&recursive=true`, {
                headers: { 'Authorization': `Bearer ${apiToken}` }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`获取商品列表失败：${response.status} - ${errorData.error || response.statusText}`);
            }

            const data = await response.json();
            const { directories = [], files = [] } = data;
            const productMap = new Map();

            directories.forEach(dirPath => {
                const folderName = dirPath.split('/').pop();
                const parsedInfo = parseFolderName(folderName);
                if (parsedInfo) {
                    productMap.set(dirPath, {
                        id: dirPath.replace(/[\/\.]/g, '_').replace(/-/g, '__'),
                        path: dirPath, // 完整路径，用于上传/删除
                        ...parsedInfo,
                        priceNum: parseFloat(parsedInfo.price.replace('¥', '')) || 0,
                        images: []
                    });
                }
            });

            files.forEach(file => {
                const productDirPath = file.name.substring(0, file.name.lastIndexOf('/'));
                if (productMap.has(productDirPath)) {
                    productMap.get(productDirPath).images.push({
                        src: `${API_BASE_URL}/file/${file.name}`,
                        fileName: file.name.split('/').pop(),
                        fullPath: file.name // 存储完整路径，用于删除
                    });
                }
            });

            allProducts = Array.from(productMap.values()).filter(p => p.images.length > 0);
            allProducts.forEach(p => p.images.sort((a, b) => a.fileName.localeCompare(b.fileName)));

            populateFiltersAndTags(); // 确保在渲染商品和管理标签前，allPossibleTags已更新
            applyFilters();
        } catch (error) {
            console.error("加载商品数据失败:", error);
            showStatusMessage(`加载商品数据失败: ${error.message}`, 'error');
            productsList.innerHTML = '';
            noProductsMessage.style.display = 'block';
            noProductsMessage.textContent = `加载商品失败，请检查API Token或网络连接。`;
        } finally {
            hideLoading();
        }
    }

    function parseFolderName(folderName) {
        const parts = folderName.split('-');
        // 确保文件夹名至少包含价格、款式、标签、季节、场景、名称六部分
        if (parts.length < 6 || isNaN(parseInt(parts[0]))) return null;
        return {
            price: `¥${parts[0]}`,
            styles: parts[1].split('_').filter(Boolean),
            tags: parts[2].split('_').filter(Boolean),
            seasons: parts[3].split('_').filter(Boolean),
            scenes: parts[4].split('_').filter(Boolean),
            name: parts.slice(5).join('-')
        };
    }

    // ==================== 筛选器与标签池 ====================
    function populateFiltersAndTags() {
        const filters = { style: new Set(), tag: new Set(), season: new Set(), scene: new Set() };
        // 重置 allPossibleTags 为 Set，以便收集唯一值
        allPossibleTags = { styles: new Set(), tags: new Set(), seasons: new Set(), scenes: new Set() };

        allProducts.forEach(p => {
            p.styles.forEach(s => { filters.style.add(s); allPossibleTags.styles.add(s); });
            p.tags.forEach(t => { filters.tag.add(t); allPossibleTags.tags.add(t); });
            p.seasons.forEach(s => { filters.season.add(s); allPossibleTags.seasons.add(s); });
            p.scenes.forEach(s => { filters.scene.add(s); allPossibleTags.scenes.add(s); });
        });
        
        // 将 Set 转换为排序后的数组，并更新全局 allPossibleTags
        for (const key in allPossibleTags) {
            allPossibleTags[key] = Array.from(allPossibleTags[key]).sort();
        }

        for (const type in filters) {
            const container = document.querySelector(`#filter-${type} .filter-tags`);
            if (container) {
                renderFilterGroup(container, Array.from(filters[type]).sort(), type);
            }
        }
        // 初始化 admin 区域的标签列表为可编辑状态
        renderAdminTagsInCreateMode();
    }

    function renderFilterGroup(container, items, filterType) {
        container.innerHTML = '';
        ['全部', ...items].forEach(item => {
            const tagLink = document.createElement('a');
            tagLink.className = 'filter-tag';
            tagLink.textContent = item;
            if ((item === '全部' && activeFilters[filterType].size === 0) || activeFilters[filterType].has(item)) {
                tagLink.classList.add('active');
            }
            tagLink.onclick = () => {
                if (item === '全部') activeFilters[filterType].clear();
                else activeFilters[filterType].has(item) ? activeFilters[filterType].delete(item) : activeFilters[filterType].add(item);
                applyFilters();
                populateFiltersAndTags(); // 重绘以更新激活状态，确保筛选器显示正确
            };
            container.appendChild(tagLink);
        });
    }

    function applyFilters() {
        const filteredProducts = allProducts.filter(product => {
            return ['style', 'tag', 'season', 'scene'].every(type => {
                if (activeFilters[type].size === 0) return true;
                return product[`${type}s`].some(attr => activeFilters[type].has(attr));
            });
        });
        renderProducts(filteredProducts);
    }

    // ==================== 渲染逻辑 ====================
    function renderProducts(products) {
        productsList.innerHTML = '';
        noProductsMessage.style.display = products.length === 0 ? 'block' : 'none';
        if (products.length > 0) noProductsMessage.textContent = '未找到匹配的商品。';

        products.forEach(product => {
            const productCard = document.createElement('article');
            productCard.className = 'product-card';
            productCard.innerHTML = `
                <a href="#">
                    <img src="${product.images.length > 0 ? product.images[0].src : ''}" alt="${product.name}" loading="lazy">
                    <div class="product-info">
                        <div class="product-name-price">
                            <p class="price">${product.price}</p>
                            <h2>${product.name}</h2>
                        </div>
                        <div class="product-season">${product.seasons.map(s => `<span>${s}</span>`).join('')}</div>
                        <div class="product-tags">${product.tags.map(t => `<span>${t}</span>`).join('')}</div>
                    </div>
                </a>
            `;
            productCard.onclick = (e) => {
                e.preventDefault();
                displayProductDetails(product);
            };
            productsList.appendChild(productCard);
        });
    }

    function displayProductDetails(product) {
        // 1. 显示详情
        const apiTokenExists = getApiToken() !== null;
        let imagesHtml = product.images.map(img => `
            <div class="image-wrapper">
                <img src="${img.src}" alt="${product.name} - ${img.fileName}" loading="lazy">
                <button class="delete-image-btn ${apiTokenExists ? 'visible' : ''}" data-image-path="${img.fullPath}" title="删除此图片"></button>
            </div>
        `).join('');

        detailView.innerHTML = `
            <div class="modal-nav">
                <a href="#" class="back-button" onclick="hideProductDetail()"></a>
                <div class="product-title">${product.name}</div>
                <div class="modal-nav-price">${product.price}</div>
            </div>
            <div class="modal-content-inner">
                ${imagesHtml}
                <p class="modal-description">
                    ${product.styles.length > 0 ? `<strong>款式:</strong> ${product.styles.join(', ')}<br>` : ''}
                    ${product.tags.length > 0 ? `<strong>标签:</strong> ${product.tags.join(', ')}<br>` : ''}
                    ${product.seasons.length > 0 ? `<strong>季节:</strong> ${product.seasons.join(', ')}<br>` : ''}
                    ${product.scenes.length > 0 ? `<strong>场景:</strong> ${product.scenes.join(', ')}` : ''}
                </p>
            </div>
        `;
        detailView.classList.add('active');
        detailPlaceholder.style.display = 'none';

        // 2. 填充并锁定管理区域
        loadProductIntoAdminForm(product);
    }
    
    function hideProductDetail() {
        detailView.classList.remove('active');
        detailView.innerHTML = '';
        detailPlaceholder.style.display = 'block';
    }

    // ==================== Admin 表单管理与交互 (核心逻辑) ====================
    function loadProductIntoAdminForm(product) {
        currentSelectedProductForAdmin = product;

        // 填充基本信息，这些输入框将被禁用
        styleNameInput.value = product.name;
        priceInput.value = product.priceNum;

        // 渲染管理区域的标签为 "显示模式" (非交互)
        renderAdminTagsInDisplayMode(product);
        
        // 设置管理后台表单状态为锁定，并更新拖拽区域的提示信息
        setAdminFormState(true, product);
    }

    function clearAdminProductSelection() {
        currentSelectedProductForAdmin = null;
        styleNameInput.value = '';
        priceInput.value = '';
        
        // 清空 "创建模式" 的已选标签
        for(const key in createModeSelectedTags) {
            createModeSelectedTags[key].clear();
        }
        
        filesToUpload = []; // 清空待上传文件列表
        updateFileListDisplay(); // 更新文件列表显示并相应地禁用/启用上传按钮
        
        // 渲染管理区域的标签为 "创建/编辑模式" (可交互)
        renderAdminTagsInCreateMode();

        setAdminFormState(false); // 解锁表单，并更新拖拽区域的提示信息
    }

    /**
     * 根据产品数据显示标签 (锁定状态)
     */
    function renderAdminTagsInDisplayMode(product) {
        renderSingleAdminTagGroup('style-list', allPossibleTags.styles, product.styles);
        renderSingleAdminTagGroup('tag-list', allPossibleTags.tags, product.tags);
        renderSingleAdminTagGroup('season-list', allPossibleTags.seasons, product.seasons);
        renderSingleAdminTagGroup('scene-list', allPossibleTags.scenes, product.scenes);
    }

    /**
     * 渲染可交互的标签 (创建模式)
     */
    function renderAdminTagsInCreateMode() {
        renderSingleAdminTagGroup('style-list', allPossibleTags.styles, createModeSelectedTags.styles, true, 'styles');
        renderSingleAdminTagGroup('tag-list', allPossibleTags.tags, createModeSelectedTags.tags, true, 'tags');
        renderSingleAdminTagGroup('season-list', allPossibleTags.seasons, createModeSelectedTags.seasons, true, 'seasons');
        renderSingleAdminTagGroup('scene-list', allPossibleTags.scenes, createModeSelectedTags.scenes, true, 'scenes');
    }

    /**
     * 渲染单个 admin 标签组的通用函数
     * @param {string} containerId - 容器元素的ID
     * @param {string[]} allItems - 该分类所有可能的标签 (来自 allPossibleTags)
     * @param {string[]|Set} selectedItems - 已选中的标签 (可能是产品已有的，或创建模式下用户选择的)
     * @param {boolean} isEditable - 是否可编辑 (创建模式)
     * @param {string} categoryKey - 'styles', 'tags' 等, 用于在编辑模式下更新状态
     */
    function renderSingleAdminTagGroup(containerId, allItems, selectedItems, isEditable = false, categoryKey = '') {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        const selectedSet = new Set(selectedItems); // 统一处理 Array 和 Set

        allItems.forEach(item => {
            const tagDiv = document.createElement('div');
            tagDiv.className = 'tag-item';
            tagDiv.textContent = item;

            if (selectedSet.has(item)) {
                tagDiv.classList.add('selected');
            }

            if (!isEditable) {
                tagDiv.classList.add('disabled'); // 在显示模式下，标签不可交互
            } else {
                tagDiv.onclick = () => {
                    const currentSelections = createModeSelectedTags[categoryKey];
                    if (currentSelections.has(item)) {
                        currentSelections.delete(item);
                        tagDiv.classList.remove('selected');
                    } else {
                        currentSelections.add(item);
                        tagDiv.classList.add('selected');
                    }
                };
            }
            container.appendChild(tagDiv);
        });
    }

    /**
     * 设置管理后台表单的启用/禁用状态，并更新提示信息
     * @param {boolean} locked - 是否锁定表单 (true for selecting an existing product)
     * @param {object|null} product - 当前选中的产品对象
     */
    function setAdminFormState(locked, product = null) {
        // 禁用/启用款式名称、价格和新增标签的输入框
        [styleNameInput, priceInput, newStyleInput, newTagInput, newSeasonInput, newSceneInput].forEach(el => el.disabled = locked);

        if (locked && product) {
            // adminSelectionMessage 已被移除，不再更新其内容
            clearAdminSelectionBtn.style.display = 'inline-block';
            dropAreaMessage.textContent = `拖拽图片或点击选择文件，将上传到“${product.name}”`; // 明确提示上传目标
        } else {
            // adminSelectionMessage 已被移除，不再更新其内容
            clearAdminSelectionBtn.style.display = 'none';
            dropAreaMessage.textContent = '拖拽图片到这里或点击选择文件'; // 恢复默认提示
            // clearAdminProductSelection 中已调用 showStatusMessage('已清除商品选择，可以输入信息创建新商品。', '');
        }
    }
    
    function handleFileSelect(files) {
      filesToUpload.push(...Array.from(files));
      updateFileListDisplay();
    }
    function updateFileListDisplay() {
        fileListDiv.innerHTML = filesToUpload.length > 0 
            ? `<p>已选择 ${filesToUpload.length} 个文件:</p>` + filesToUpload.map(f => `<p>${f.name}</p>`).join('')
            : '<p>无文件待上传</p>';
        uploadButton.disabled = filesToUpload.length === 0; // 上传按钮只在有文件时启用
    }
    dropArea.addEventListener('dragover', e => { e.preventDefault(); dropArea.classList.add('drag-over'); });
    dropArea.addEventListener('dragleave', e => { e.preventDefault(); dropArea.classList.remove('drag-over'); });
    dropArea.addEventListener('drop', e => { e.preventDefault(); dropArea.classList.remove('drag-over'); handleFileSelect(e.dataTransfer.files); });
    dropArea.addEventListener('click', () => document.getElementById('image').click());

    async function uploadImages() {
        const apiToken = getApiToken();
        if (!apiToken) { return; } // getApiToken() 会显示错误信息

        if (filesToUpload.length === 0) { showStatusMessage('请选择要上传的文件！', 'error'); return; }

        let uploadFolder = '';
        if (currentSelectedProductForAdmin) {
            // 如果已选择商品，上传到该商品的目录
            uploadFolder = currentSelectedProductForAdmin.path;
        } else {
            // 否则，创建新商品
            const name = styleNameInput.value.trim();
            const price = priceInput.value.trim();
            // 在这里使用 `createModeSelectedTags` 而不是 `allPossibleTags`，因为 allPossibleTags 包含所有可能标签，createModeSelectedTags 包含用户为新产品选择的标签
            const styles = Array.from(createModeSelectedTags.styles).join('_');
            const tags = Array.from(createModeSelectedTags.tags).join('_');
            const seasons = Array.from(createModeSelectedTags.seasons).join('_');
            const scenes = Array.from(createModeSelectedTags.scenes).join('_');

            if (!name || !price || styles==='' || tags==='' || seasons==='' || scenes==='') { // 检查标签是否为空字符串
                showStatusMessage('创建新商品时，名称、价格和各类标签都必须填写/选择。', 'error');
                return;
            }
            uploadFolder = `服装/${price}-${styles}-${tags}-${seasons}-${scenes}-${name}`;
        }
        
        uploadButton.disabled = true;
        uploadButton.textContent = '上传中...';
        let successCount = 0;
        let failCount = 0;
        
        for (const file of filesToUpload) {
            const success = await uploadSingleImage(file, uploadFolder, apiToken);
            if (success) successCount++;
            else failCount++;
        }
        
        let finalMessage = `上传完成。成功：${successCount}，失败：${failCount}。`;
        showStatusMessage(finalMessage, failCount > 0 ? 'error' : 'success');
        
        filesToUpload = []; // 清空待上传文件列表
        updateFileListDisplay(); // 更新显示，上传按钮会再次禁用
        uploadButton.textContent = '上传图片';

        // 刷新画廊以显示新上传的图片或商品
        resetAndLoad();
    }
    
    async function uploadSingleImage(file, uploadFolder, apiToken) {
        const formData = new FormData();
        formData.append('file', file);
        try {
            const response = await fetch(`${API_BASE_URL}/upload?uploadFolder=${encodeURIComponent(uploadFolder)}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiToken}` },
                body: formData
            });
            if (!response.ok) throw new Error(`服务器错误: ${response.statusText}`);
            return true;
        } catch (error) {
            console.error(`上传 "${file.name}" 失败:`, error);
            // 可以在这里细化错误处理，例如记录哪个文件失败了
            return false;
        }
    }

    /**
     * 删除指定路径的图片
     * @param {string} imagePath - 图片在ImgBed中的完整路径，例如 "服装/100-style_A-tag_X/image.jpg"
     */
    async function deleteImage(imagePath) {
        const apiToken = getApiToken();
        if (!apiToken) {
            return; // 错误信息已由 getApiToken() 显示
        }

        if (!confirm(`确定要删除图片：${imagePath.split('/').pop()} 吗？此操作不可撤销！`)) {
            return;
        }

        showLoading();
        try {
            const response = await fetch(`${API_BASE_URL}/api/manage/delete/${encodeURIComponent(imagePath)}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${apiToken}` }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`删除文件失败：${response.status} - ${errorData.error || response.statusText}`);
            }

            const result = await response.json();
            if (result.success) {
                showStatusMessage(`图片 "${imagePath.split('/').pop()}" 删除成功！`, 'success');
                resetAndLoad(); // 删除成功后刷新所有数据和视图
            } else {
                throw new Error(result.error || '未知删除错误');
            }
        } catch (error) {
            console.error("删除图片失败:", error);
            showStatusMessage(`删除图片失败: ${error.message}`, 'error');
        } finally {
            hideLoading();
        }
    }


    // ==================== 通用函数与事件监听 ====================
    function showLoading() { if (loadingOverlay) loadingOverlay.classList.remove('hidden'); }
    function hideLoading() { if (loadingOverlay) loadingOverlay.classList.add('hidden'); }
    function showStatusMessage(message, type) {
      statusMessageDiv.textContent = message;
      statusMessageDiv.className = type;
      statusMessageDiv.style.display = 'block';
      setTimeout(() => { // 消息显示3秒后自动消失
          statusMessageDiv.style.display = 'none';
      }, 3000);
    }
    
    /**
     * 获取存储的API Token
     * @returns {string|null} API Token 或 null（如果未设置或空）
     */
    function getApiToken() {
        const token = localStorage.getItem(API_TOKEN_KEY);
        if (!token || token.trim() === '') {
            // showStatusMessage('API Token 未设置。请在管理后台输入并保存。', 'error'); // 不在这里显示，由fetchAllProducts处理
            return null;
        }
        return token.trim();
    }


    function resetAndLoad() {
        activeFilters = { style: new Set(), tag: new Set(), season: new Set(), scene: new Set() };
        clearAdminProductSelection();
        fetchAllProducts();
        hideProductDetail();
    }
    
    document.addEventListener('DOMContentLoaded', () => {
        const storedToken = localStorage.getItem(API_TOKEN_KEY);
        if (storedToken) apiTokenInput.value = storedToken;
        
        resetAndLoad(); // 页面加载后立即重置并加载数据

        document.querySelector('.logo a').addEventListener('click', e => { e.preventDefault(); resetAndLoad(); });
        clearAdminSelectionBtn.addEventListener('click', clearAdminProductSelection);
        apiTokenSaveButton.addEventListener('click', () => {
            const tokenValue = apiTokenInput.value.trim();
            if (tokenValue) {
                localStorage.setItem(API_TOKEN_KEY, tokenValue);
                showStatusMessage('API Token 已保存。', 'success');
                resetAndLoad(); // 保存后立即刷新，重新加载数据
            } else {
                localStorage.removeItem(API_TOKEN_KEY); // 清除空的 token
                showStatusMessage('API Token 已清空。', 'success');
                resetAndLoad(); // 保存后立即刷新，重新加载数据
            }
        });
        
        // 为新标签输入框添加回车事件
        const setupNewTagInput = (inputId, categoryKey) => { 
            document.getElementById(inputId).addEventListener('keyup', (event) => {
                // 只有在未选择现有商品 (即创建新商品模式) 且按下回车键时才响应
                if (event.key === 'Enter' && !currentSelectedProductForAdmin) {
                    const input = event.target;
                    const newTag = input.value.trim();
                    if (newTag) {
                        // 直接从全局 allPossibleTags 对象获取最新引用
                        const currentAllTagsForCategory = allPossibleTags[categoryKey]; 
                        if (!currentAllTagsForCategory.includes(newTag)) {
                            currentAllTagsForCategory.push(newTag);
                            currentAllTagsForCategory.sort();
                        }
                        // 同时将新标签添加到当前创建中的商品的选择列表
                        createModeSelectedTags[categoryKey].add(newTag);
                        input.value = ''; // 清空输入框
                        renderAdminTagsInCreateMode(); // 重新渲染以显示新标签并选中
                    }
                }
            });
        };
        // 调用时不再传递第三个参数
        setupNewTagInput('new-style', 'styles');
        setupNewTagInput('new-tag', 'tags');
        setupNewTagInput('new-season', 'seasons');
        setupNewTagInput('new-scene', 'scenes');

        uploadButton.addEventListener('click', uploadImages); // 绑定上传按钮点击事件

        // 为中心详情视图中的删除按钮添加事件监听器（利用事件委托）
        detailView.addEventListener('click', async (e) => {
            const deleteButton = e.target.closest('.delete-image-btn');
            if (deleteButton) {
                e.preventDefault();
                const imagePath = deleteButton.dataset.imagePath;
                if (imagePath) {
                    await deleteImage(imagePath);
                } else {
                    showStatusMessage('无法获取图片路径进行删除。', 'error');
                }
            }
        });
    });
