// Gerenciamento de estado
let products = JSON.parse(localStorage.getItem('products')) || [];
let currentTab = 'consultar';
let currentFoundProduct = null;

// Controle de leitura de código de barras
let barcodeReadings = [];
let isProcessingBarcode = false;
const REQUIRED_READINGS = 3; // Número de leituras consistentes necessárias
const READING_TIMEOUT = 2000; // Timeout em ms para limpar leituras

// Elementos do DOM - Abas
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Elementos do DOM - Aba Consultar
const startCameraConsultarBtn = document.getElementById('startCameraConsultar');
const stopCameraConsultarBtn = document.getElementById('stopCameraConsultar');
const scannerContainerConsultar = document.getElementById('scannerContainerConsultar');
const cameraSectionConsultar = document.getElementById('cameraSectionConsultar');
const consultaResultSection = document.getElementById('consultaResultSection');
const productNotFound = document.getElementById('productNotFound');
const productFound = document.getElementById('productFound');
const goToCreateTabBtn = document.getElementById('goToCreateTab');
const editFoundProductBtn = document.getElementById('editFoundProduct');
const deleteFoundProductBtn = document.getElementById('deleteFoundProduct');

// Elementos do DOM - Aba Criar
const startCameraCriarBtn = document.getElementById('startCameraCriar');
const stopCameraCriarBtn = document.getElementById('stopCameraCriar');
const scannerContainerCriar = document.getElementById('scannerContainerCriar');
const cameraSectionCriar = document.getElementById('cameraSectionCriar');
const createProductSection = document.getElementById('createProductSection');
const createProductForm = document.getElementById('createProductForm');
const cancelCreateBtn = document.getElementById('cancelCreateBtn');

// Event Listeners - Abas
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// Event Listeners - Consultar
startCameraConsultarBtn.addEventListener('click', () => startScanner('consultar'));
stopCameraConsultarBtn.addEventListener('click', () => stopScanner('consultar'));
goToCreateTabBtn.addEventListener('click', goToCreateFromNotFound);
editFoundProductBtn.addEventListener('click', editProductFromFound);
deleteFoundProductBtn.addEventListener('click', deleteProductFromFound);

// Event Listeners - Criar
startCameraCriarBtn.addEventListener('click', () => startScanner('criar'));
stopCameraCriarBtn.addEventListener('click', () => stopScanner('criar'));
createProductForm.addEventListener('submit', createNewProduct);
cancelCreateBtn.addEventListener('click', resetCreateForm);

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
    displayProducts();
    updateProductsCount();
});

// Trocar de Aba
function switchTab(tabName) {
    currentTab = tabName;

    // Atualizar botões das abas
    tabBtns.forEach(btn => {
        if (btn.dataset.tab === tabName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Atualizar conteúdo das abas
    tabContents.forEach(content => {
        if (content.id === `${tabName}Tab`) {
            content.classList.add('active');
        } else {
            content.classList.remove('active');
        }
    });

    // Resetar estados ao trocar de aba
    stopScanner('consultar');
    stopScanner('criar');
    resetConsultaResults();
    resetCreateForm();
}

// Iniciar Scanner
function startScanner(mode) {
    const cameraSection = mode === 'consultar' ? cameraSectionConsultar : cameraSectionCriar;
    const scannerContainer = mode === 'consultar' ? scannerContainerConsultar : scannerContainerCriar;
    const targetElement = mode === 'consultar' ? '#interactiveConsultar' : '#interactiveCriar';

    cameraSection.classList.add('hidden');
    scannerContainer.classList.remove('hidden');

    Quagga.init({
        inputStream: {
            name: "Live",
            type: "LiveStream",
            target: document.querySelector(targetElement),
            constraints: {
                width: 640,
                height: 480,
                facingMode: "environment"
            },
        },
        decoder: {
            readers: [
                "code_128_reader",
                "ean_reader",
                "ean_8_reader",
                "code_39_reader",
                "code_39_vin_reader",
                "codabar_reader",
                "upc_reader",
                "upc_e_reader",
                "i2of5_reader"
            ]
        },
        locate: true,
        locator: {
            patchSize: "medium",
            halfSample: true
        },
    }, function(err) {
        if (err) {
            console.error(err);
            showToast('Erro ao acessar a câmera. Verifique as permissões.', 'error');
            stopScanner(mode);
            return;
        }
        console.log("Scanner iniciado - modo:", mode);
        Quagga.start();
    });

    // Processar resultado baseado no modo
    Quagga.offDetected(); // Limpar listeners anteriores
    Quagga.onDetected((result) => onBarcodeDetected(result, mode));
}

// Obter o código mais frequente de uma lista
function getMostFrequentCode(codes) {
    const frequency = {};
    codes.forEach(code => {
        frequency[code] = (frequency[code] || 0) + 1;
    });

    let maxCount = 0;
    let mostFrequent = null;

    for (const code in frequency) {
        if (frequency[code] > maxCount) {
            maxCount = frequency[code];
            mostFrequent = code;
        }
    }

    return mostFrequent;
}

// Parar Scanner
function stopScanner(mode) {
    Quagga.stop();
    Quagga.offDetected(); // Remover todos os listeners

    const cameraSection = mode === 'consultar' ? cameraSectionConsultar : cameraSectionCriar;
    const scannerContainer = mode === 'consultar' ? scannerContainerConsultar : scannerContainerCriar;

    scannerContainer.classList.add('hidden');
    cameraSection.classList.remove('hidden');

    // Limpar estado de leitura
    barcodeReadings = [];
    isProcessingBarcode = false;

    console.log("Scanner parado - modo:", mode);
}

// Callback quando código é detectado
function onBarcodeDetected(result, mode) {
    // Se já está processando, ignorar novas leituras
    if (isProcessingBarcode) return;

    const code = result.codeResult.code;

    // Validar código (mínimo 8 caracteres) e qualidade da leitura
    if (!code || code.length < 8) return;

    // Verificar qualidade da leitura (confiança)
    const quality = result.codeResult.decodedCodes
        .filter(x => x.error !== undefined)
        .map(x => x.error)
        .reduce((sum, error) => sum + error, 0) / result.codeResult.decodedCodes.length;

    // Só aceitar leituras com boa qualidade (erro < 0.1)
    if (quality > 0.1) {
        console.log(`Leitura descartada - qualidade baixa: ${quality.toFixed(3)}`);
        return;
    }

    // Adicionar leitura ao array
    barcodeReadings.push(code);
    console.log(`Leitura ${barcodeReadings.length}/${REQUIRED_READINGS}: ${code} (qualidade: ${quality.toFixed(3)})`);

    // Atualizar status visual
    updateScanStatus(mode, barcodeReadings.length);

    // Limpar leituras antigas após timeout
    setTimeout(() => {
        if (barcodeReadings.length > 0) {
            barcodeReadings = [];
            updateScanStatus(mode, 0);
        }
    }, READING_TIMEOUT);

    // Verificar se temos leituras suficientes
    if (barcodeReadings.length >= REQUIRED_READINGS) {
        // Verificar se todas as leituras são do mesmo código
        const uniqueCodes = [...new Set(barcodeReadings)];

        if (uniqueCodes.length === 1) {
            // Todas as leituras são consistentes
            isProcessingBarcode = true;
            const confirmedCode = uniqueCodes[0];

            console.log(`✓ Código confirmado: ${confirmedCode}`);
            updateScanStatus(mode, REQUIRED_READINGS, true);

            // Parar scanner após breve delay
            setTimeout(() => {
                stopScanner(mode);

                // Limpar array de leituras
                barcodeReadings = [];

                // Processar código
                if (mode === 'consultar') {
                    handleConsultaBarcode(confirmedCode);
                } else if (mode === 'criar') {
                    handleCriarBarcode(confirmedCode);
                }

                // Resetar flag
                isProcessingBarcode = false;
            }, 500);
        } else {
            // Leituras inconsistentes - limpar e tentar novamente
            console.log(`⚠ Leituras inconsistentes detectadas:`, uniqueCodes);
            barcodeReadings = [];
            updateScanStatus(mode, 0);
        }
    }
}

// Atualizar status visual de escaneamento
function updateScanStatus(mode, count, confirmed = false) {
    const statusElement = mode === 'consultar'
        ? document.getElementById('scanStatusConsultar')
        : document.getElementById('scanStatusCriar');

    if (!statusElement) return;

    if (confirmed) {
        statusElement.textContent = '✓ Código confirmado!';
        statusElement.style.color = '#00ff00';
    } else if (count > 0) {
        statusElement.textContent = `Lendo... ${count}/${REQUIRED_READINGS}`;
        statusElement.style.color = '#ffff00';
    } else {
        statusElement.textContent = 'Aguardando leitura...';
        statusElement.style.color = '#00ff00';
    }
}

// Lidar com código de barras na aba CONSULTAR
function handleConsultaBarcode(code) {
    const product = products.find(p => p.barcode === code);

    consultaResultSection.classList.remove('hidden');

    if (product) {
        // Produto encontrado
        currentFoundProduct = product;
        productNotFound.classList.add('hidden');
        productFound.classList.remove('hidden');

        document.getElementById('foundBarcode').textContent = product.barcode;
        document.getElementById('foundName').textContent = product.name;
        document.getElementById('foundPrice').textContent = `R$ ${product.price.toFixed(2)}`;
        document.getElementById('foundStock').textContent = `${product.stock} unidades`;
        document.getElementById('foundCategory').textContent = product.category || 'Não especificada';

        const descriptionContainer = document.getElementById('foundDescriptionContainer');
        if (product.description) {
            document.getElementById('foundDescription').textContent = product.description;
            descriptionContainer.style.display = 'flex';
        } else {
            descriptionContainer.style.display = 'none';
        }

        showToast('Produto encontrado com sucesso!', 'success');
    } else {
        // Produto não encontrado
        currentFoundProduct = null;
        productFound.classList.add('hidden');
        productNotFound.classList.remove('hidden');
        document.getElementById('notFoundBarcode').textContent = code;

        showToast('Produto não encontrado no sistema.', 'error');
    }

    consultaResultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Lidar com código de barras na aba CRIAR
function handleCriarBarcode(code) {
    // Verificar se já existe um produto com este código
    const existingProduct = products.find(p => p.barcode === code);

    if (existingProduct) {
        showToast('Este código de barras já está cadastrado! Use a aba "Consultar Produto" para visualizá-lo.', 'error');
        return;
    }

    // Código válido e não existe - preencher formulário
    document.getElementById('createProductCode').value = code;
    createProductSection.classList.remove('hidden');
    showToast('Código válido! Preencha as informações do produto.', 'success');

    createProductSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Criar novo produto
function createNewProduct(e) {
    e.preventDefault();

    const barcode = document.getElementById('createProductCode').value;

    // Verificação final - garantir que não existe produto com este código
    if (products.some(p => p.barcode === barcode)) {
        showToast('Erro: Código de barras já cadastrado!', 'error');
        return;
    }

    const productData = {
        id: Date.now(),
        barcode: barcode,
        name: document.getElementById('createProductName').value,
        description: document.getElementById('createProductDescription').value,
        price: parseFloat(document.getElementById('createProductPrice').value),
        stock: parseInt(document.getElementById('createProductStock').value),
        category: document.getElementById('createProductCategory').value,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    products.push(productData);
    localStorage.setItem('products', JSON.stringify(products));

    showToast('Produto cadastrado com sucesso!', 'success');

    displayProducts();
    updateProductsCount();
    resetCreateForm();
}

// Resetar formulário de criação
function resetCreateForm() {
    createProductForm.reset();
    createProductSection.classList.add('hidden');
    cameraSectionCriar.classList.remove('hidden');
}

// Resetar resultados da consulta
function resetConsultaResults() {
    consultaResultSection.classList.add('hidden');
    productNotFound.classList.add('hidden');
    productFound.classList.add('hidden');
    currentFoundProduct = null;
}

// Ir para aba criar quando produto não for encontrado
function goToCreateFromNotFound() {
    const barcode = document.getElementById('notFoundBarcode').textContent;
    switchTab('criar');

    // Preencher código automaticamente
    document.getElementById('createProductCode').value = barcode;
    createProductSection.classList.remove('hidden');
    cameraSectionCriar.classList.add('hidden');

    showToast('Preencha as informações do novo produto.', 'success');
    createProductSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Editar produto encontrado
function editProductFromFound() {
    if (!currentFoundProduct) return;

    const barcode = currentFoundProduct.barcode;
    switchTab('criar');

    // Preencher formulário com dados do produto
    document.getElementById('createProductCode').value = currentFoundProduct.barcode;
    document.getElementById('createProductName').value = currentFoundProduct.name;
    document.getElementById('createProductDescription').value = currentFoundProduct.description || '';
    document.getElementById('createProductPrice').value = currentFoundProduct.price;
    document.getElementById('createProductStock').value = currentFoundProduct.stock;
    document.getElementById('createProductCategory').value = currentFoundProduct.category || '';

    createProductSection.classList.remove('hidden');
    cameraSectionCriar.classList.add('hidden');

    // Modificar comportamento do formulário para atualização
    createProductForm.onsubmit = function(e) {
        e.preventDefault();

        const updatedProduct = {
            ...currentFoundProduct,
            name: document.getElementById('createProductName').value,
            description: document.getElementById('createProductDescription').value,
            price: parseFloat(document.getElementById('createProductPrice').value),
            stock: parseInt(document.getElementById('createProductStock').value),
            category: document.getElementById('createProductCategory').value,
            updatedAt: new Date().toISOString()
        };

        const index = products.findIndex(p => p.id === currentFoundProduct.id);
        products[index] = updatedProduct;
        localStorage.setItem('products', JSON.stringify(products));

        showToast('Produto atualizado com sucesso!', 'success');

        displayProducts();
        updateProductsCount();
        resetCreateForm();

        // Restaurar comportamento original do formulário
        createProductForm.onsubmit = createNewProduct;
    };

    showToast('Editando produto. Altere os campos necessários.', 'success');
    createProductSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Excluir produto encontrado
function deleteProductFromFound() {
    if (!currentFoundProduct) return;

    if (confirm(`Tem certeza que deseja excluir o produto "${currentFoundProduct.name}"?`)) {
        products = products.filter(p => p.id !== currentFoundProduct.id);
        localStorage.setItem('products', JSON.stringify(products));

        showToast('Produto excluído com sucesso!', 'success');

        displayProducts();
        updateProductsCount();
        resetConsultaResults();
    }
}

// Exibir produtos
function displayProducts() {
    const productsList = document.getElementById('productsList');

    if (products.length === 0) {
        productsList.innerHTML = '<div class="no-products">Nenhum produto cadastrado ainda.</div>';
        return;
    }

    // Ordenar por data de atualização (mais recente primeiro)
    const sortedProducts = [...products].sort((a, b) =>
        new Date(b.updatedAt) - new Date(a.updatedAt)
    );

    productsList.innerHTML = sortedProducts.map(product => `
        <div class="product-card">
            <h3>${product.name}</h3>
            <div class="product-barcode">${product.barcode}</div>
            <div class="product-info">
                ${product.description ? `<p><strong>Descrição:</strong> ${product.description}</p>` : ''}
                <p><strong>Preço:</strong> R$ ${product.price.toFixed(2)}</p>
                <p><strong>Estoque:</strong> ${product.stock} unidades</p>
                ${product.category ? `<p><strong>Categoria:</strong> ${product.category}</p>` : ''}
            </div>
            <div class="product-actions">
                <button class="btn-small btn-edit" onclick="editProduct(${product.id})">Editar</button>
                <button class="btn-small btn-delete" onclick="deleteProduct(${product.id})">Excluir</button>
            </div>
        </div>
    `).join('');
}

// Editar produto
function editProduct(id) {
    const product = products.find(p => p.id === id);
    if (product) {
        currentBarcode = product.barcode;
        barcodeValue.textContent = product.barcode;
        resultSection.classList.remove('hidden');
        fillProductForm(product);
        productTitle.textContent = 'Editar Produto';
        productSection.classList.remove('hidden');
        cameraSection.classList.add('hidden');

        // Scroll até o formulário
        productSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// Excluir produto da lista
function deleteProduct(id) {
    const product = products.find(p => p.id === id);
    if (confirm(`Tem certeza que deseja excluir o produto "${product.name}"?`)) {
        products = products.filter(p => p.id !== id);
        localStorage.setItem('products', JSON.stringify(products));
        displayProducts();
        updateProductsCount();
        showToast('Produto excluído com sucesso!', 'success');
    }
}

// Atualizar contador de produtos
function updateProductsCount() {
    document.getElementById('productsCount').textContent = products.length;
}

// Mostrar notificação (Toast)
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;

    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}