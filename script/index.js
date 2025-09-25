    const API_BASE_URL = 'https://img.liyao.sbs';
    const API_TOKEN = 'imgbed_5pv5JE1P2Z4ZnYDicuZzsHzBfMlzy2rz';

    let allProducts = [];
    let activeFilters = {
        style: new Set(),
        tag: new Set(),
        season: new Set(),
        scene: new Set()
    };
    
    // --- 数据获取与解析 ---
    async function fetchAllProducts() {
        showLoading();
        try {
            const response = await fetch(`${API_BASE_URL}/api/manage/list?dir=服装&count=-1&recursive=true`, {
                headers: { 'Authorization': `Bearer ${API_TOKEN}` }
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
                        path: dirPath,
                        ...parsedInfo,
                        price: parseFloat(parsedInfo.price.replace('¥', '')) || 0,
                        images: []
                    });
                }
            });

            files.forEach(file => {
                const productDirPath = file.name.substring(0, file.name.lastIndexOf('/'));
                if (productMap.has(productDirPath)) {
                    productMap.get(productDirPath).images.push({
                        src: `${API_BASE_URL}/file/${encodeURIComponent(file.name)}`,
                        fileName: file.name.split('/').pop()
                    });
                }
            });

            allProducts = Array.from(productMap.values()).filter(p => p.images.length > 0);
            allProducts.forEach(p => p.images.sort((a, b) => a.fileName.localeCompare(b.fileName)));

            populateFilters();
            applyFilters();
        } catch (error) {
            console.error("加载商品数据失败:", error);
            alert(`加载商品数据失败：${error.message}`);
        } finally {
            hideLoading();
        }
    }

    function parseFolderName(folderName) {
        const parts = folderName.split('-');
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

    // --- 筛选器逻辑 ---
    function populateFilters() {
        const filters = { style: new Set(), tag: new Set(), season: new Set(), scene: new Set() };
        allProducts.forEach(p => {
            p.styles.forEach(s => filters.style.add(s));
            p.tags.forEach(t => filters.tag.add(t));
            p.seasons.forEach(s => filters.season.add(s));
            p.scenes.forEach(s => filters.scene.add(s));
        });

        for (const type in filters) {
            const container = document.querySelector(`#filter-${type} .filter-tags`);
            if (container) {
                renderFilterGroup(container, Array.from(filters[type]).sort(), type);
            }
        }
    }

    function renderFilterGroup(container, items, filterType) {
        container.innerHTML = '';
        ['全部', ...items].forEach(item => {
            const tagLink = document.createElement('a');
            tagLink.className = 'filter-tag';
            tagLink.textContent = item;
            
            if (item === '全部' && activeFilters[filterType].size === 0) {
                tagLink.classList.add('active');
            } else if (activeFilters[filterType].has(item)) {
                tagLink.classList.add('active');
            }

            tagLink.onclick = () => {
                if (item === '全部') {
                    activeFilters[filterType].clear();
                } else {
                    activeFilters[filterType].has(item) ?
                        activeFilters[filterType].delete(item) :
                        activeFilters[filterType].add(item);
                }
                applyFilters();
                populateFilters(); // Re-render all filters to update active states
            };
            container.appendChild(tagLink);
        });
    }

    // [修复 2] 修正筛选逻辑
    function applyFilters() {
        const filteredProducts = allProducts.filter(product => {
            // 遍历所有筛选类别 (style, tag, season, scene)
            return Object.entries(activeFilters).every(([type, filterSet]) => {
                // 如果这个类别的筛选器没有被激活，则认为该商品通过此项检查
                if (filterSet.size === 0) {
                    return true;
                }
                // 否则，检查商品的属性数组中是否至少有一个元素存在于筛选集合中
                const productAttributes = product[`${type}s`]; // e.g., product.styles
                return productAttributes.some(attribute => filterSet.has(attribute));
            });
        });
        renderProducts(filteredProducts);
    }


    // --- 渲染逻辑 ---
    function renderProducts(products) {
        const productsList = document.getElementById('products-list');
        const noProductsMessage = document.getElementById('no-products-message');
        productsList.innerHTML = '';
        document.getElementById('modal-container').innerHTML = ''; // 清空旧模态框

        noProductsMessage.style.display = products.length === 0 ? 'block' : 'none';

        products.forEach(product => {
            const modalId = `modal-${product.id}`;
            const productCard = document.createElement('article');
            productCard.className = 'product-card';
            // [修复 3] 改用 onclick 事件
            productCard.innerHTML = `
                <a href="#${modalId}" onclick="event.preventDefault(); openModal('${modalId}');">
                    <img src="${product.images.length > 0 ? product.images[0].src : ''}" alt="${product.name}" loading="lazy">
                    <div class="product-info">
                        <div class="product-name-price">
                            <p class="price">¥${product.price}</p>
                            <h2>${product.name}</h2>
                        </div>
                        <div class="product-season">${product.seasons.length > 0 ?  product.seasons.map(s => `<span>${s}</span>`).join('') : ''}</div>
                        <div class="product-tags">${product.tags.length > 0 ?  product.tags.map(t => `<span>${t}</span>`).join('') : ''}</div>
                    </div>
                </a>
            `;
            productsList.appendChild(productCard);
            createProductModal(product, modalId);
        });
    }

    function createProductModal(product, modalId) {
        const modalContainer = document.getElementById('modal-container');
        const modalDiv = document.createElement('div');
        modalDiv.className = 'modal';
        modalDiv.id = modalId;
        const galleryId = `gallery-${product.id}`;

        const imagesHtml = product.images.map((img, index) => `
            <a href="${img.src}" data-fancybox="gallery-${product.id}" data-caption="${product.name} - ${index + 1}">
                <img src="${img.src}" alt="${product.name}" loading="lazy">
            </a>
        `).join('');
        
        modalDiv.innerHTML = `
            <div class="modal-nav">
                <a href="#" class="back-button" onclick="closeModal('${modalId}')"></a>
                <div class="product-title">
                    ${product.name}
                </div>
                <div class="modal-nav-price">¥${product.price}</div>
            </div>
            <div class="modal-content" id="${galleryId}">
                ${imagesHtml}
                <div class="modal-header">
                    <!-- <h3>${product.name}</h3> -->
                    <!-- <p class="modal-price">¥${product.price}</p> -->
                </div>
                <p class="modal-description">
                    ${product.styles.length > 0 ? `<strong>款式:</strong> ${product.styles.join(', ')}<br>` : ''}
                    ${product.tags.length > 0 ? `<strong>标签:</strong> ${product.tags.join(', ')}<br>` : ''}
                    ${product.seasons.length > 0 ? `<strong>季节:</strong> ${product.seasons.join(', ')}<br>` : ''}
                    ${product.scenes.length > 0 ? `<strong>场景:</strong> ${product.scenes.join(', ')}` : ''}
                </p>
            </div>
        `;
        modalContainer.appendChild(modalDiv);
    }

    // --- 模态框控制 ---
    // [修复 3] 新增模态框打开和关闭函数
    function openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            window.location.hash = modalId; // 可选：仍然更新哈希以便分享
            // Fancybox 会自动处理点击事件，无需手动初始化
        }
    }

    function closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
            // 清除哈希，避免用户刷新页面时模态框仍然打开
            if (window.location.hash === `#${modalId}`) {
                history.pushState("", document.title, window.location.pathname + window.location.search);
            }
            // Fancybox 会自动关闭，无需手动销毁
        }
    }

    // --- 通用函数与事件监听 ---
    function showLoading() {
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) loadingOverlay.classList.remove('hidden');
    }

    function hideLoading() {
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
    }

    function resetAndLoad() {
        activeFilters = { style: new Set(), tag: new Set(), season: new Set(), scene: new Set() };
        fetchAllProducts();
        closeAllModalsAndClearHash();
    }
    
    function closeAllModalsAndClearHash() {
        document.querySelectorAll('.modal.active').forEach(modal => modal.classList.remove('active'));
        document.body.style.overflow = '';
        if (window.location.hash) {
            history.pushState("", document.title, window.location.pathname + window.location.search);
        }
        // Fancybox 会自动关闭，无需手动销毁
    }
    
    // 按下 Esc 键关闭模态框
    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeAllModalsAndClearHash();
        }
    });

    document.addEventListener('DOMContentLoaded', () => {
        resetAndLoad();
        document.querySelector('.logo a').addEventListener('click', (event) => {
            event.preventDefault();
            resetAndLoad();
        });
    });
