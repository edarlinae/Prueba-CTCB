document.addEventListener('DOMContentLoaded', function() {
    loadOptions();
    setupMenuNavigation(); 

    const settingsForm = document.getElementById('apiSettingsForm');
    if (settingsForm) {
        settingsForm.addEventListener('submit', saveOptions);
    } else {
    }
});

// Función para configurar la navegación entre secciones
function setupMenuNavigation() {
    const menuItems = document.querySelectorAll('#main-menu .menu-item');
    const configSections = document.querySelectorAll('.config-section');
    const mainMenu = document.getElementById('main-menu');
    const mainTitle = document.getElementById('mainTitle');
    const saveStatusArea = document.getElementById('save-status-area');

    // Función para mostrar una sección específica y ocultar otras
    function showSection(sectionId) {

        configSections.forEach(section => {
            section.classList.remove('visible');
        });

        const targetSection = document.getElementById(sectionId);
        if (targetSection) {
            targetSection.classList.add('visible');

            mainMenu.classList.remove('visible');

            const sectionTitleElement = targetSection.querySelector('h2');
            if(sectionTitleElement) {
                mainTitle.textContent = sectionTitleElement.textContent;
            } else {
                 mainTitle.textContent = 'Sección';
                 console.warn(`[CTCBi Form] No se encontró <h2> en la sección ${sectionId}.`);
            }


             saveStatusArea.classList.add('visible');


        } else {
             console.error(`[CTCBi Form] Sección con ID "${sectionId}" no encontrada. Verifica HTML y data-section.`);
        }
    }

     // Función para volver al menú principal
    function showMainMenu() {
        configSections.forEach(section => section.classList.remove('visible'));
        saveStatusArea.classList.remove('visible');

        mainMenu.classList.add('visible');
         mainTitle.textContent = 'Configuración'; 
    }

    menuItems.forEach(item => {
        item.addEventListener('click', () => {

            const targetSectionId = item.dataset.section + '-section';
            showSection(targetSectionId);
        });
    });

     showMainMenu(); 

}


function saveOptions(e) {
    e.preventDefault();

    const status = document.getElementById('statusMessage');
    if (!status) {
        console.error("[CTCBi Form] Elemento 'statusMessage' no encontrado para guardar.");
        return;
    }
    status.textContent = ''; 
    status.className = '';   

    // Campos de Llamadas (Voz)
    const domainInput = document.getElementById('domain');
    const idInput = document.getElementById('id');
    const tokenInput = document.getElementById('token');
    const userIdInput = document.getElementById('user_id');
    const apiTypeInputVozipcenter = document.getElementById('api_vozipcenter'); 
    const apiTypeInputRm = document.getElementById('api_rm'); 

    const domain = domainInput ? domainInput.value : '';
    const id = idInput ? idInput.value : '';
    const token = tokenInput ? tokenInput.value : '';
    const userId = userIdInput ? userIdInput.value : '';
    const apiType = apiTypeInputVozipcenter && apiTypeInputVozipcenter.checked ? 'vozipcenter'
                  : apiTypeInputRm && apiTypeInputRm.checked ? 'rm'
                  : ''; 

    // Campo del interruptor de Botón Flotante
    const showFloatingButtonCheckbox = document.getElementById('show_floating_button');
    const showFloatingButton = showFloatingButtonCheckbox ? showFloatingButtonCheckbox.checked : true; 

    // Campos de WhatsApp
    const whatsappDomainInput = document.getElementById('whatsapp_domain');
    const whatsappIdInput = document.getElementById('whatsapp_id');
    const whatsappTokenInput = document.getElementById('whatsapp_token');
    const whatsappOrigenInput = document.getElementById('whatsapp_origen');

    const whatsappDomain = whatsappDomainInput ? whatsappDomainInput.value : '';
    const whatsappId = whatsappIdInput ? whatsappIdInput.value : '';
    const whatsappToken = whatsappTokenInput ? whatsappTokenInput.value : '';
    const whatsappOrigen = whatsappOrigenInput ? whatsappOrigenInput.value : '';


    // Campo de URLs
    const urlListInput = document.getElementById('url_list');
    const urlList = urlListInput ? urlListInput.value : '';


    console.log('[CTCBi Form] Valores leídos del formulario:', {
        domain: domain, id: id, token: token, userId: userId, apiType: apiType,
        showFloatingButton: showFloatingButton, 
        whatsappDomain: whatsappDomain, whatsappId: whatsappId, whatsappToken: whatsappToken, whatsappOrigen: whatsappOrigen,
        urlList: urlList
    });


    chrome.storage.sync.set({
        
        ctcb_domain: domain,       
        ctcb_id: id,                 
        ctcb_token: token,           
        ctcb_userId: userId,         
        ctcb_apiType: apiType,      
        ctcb_showFloatingButton: showFloatingButton, 
        ctcb_whatsapp_domain: whatsappDomain, 
        ctcb_whatsapp_id: whatsappId,         
        ctcb_whatsapp_token: whatsappToken,   
        ctcb_whatsapp_origen: whatsappOrigen, 
        ctcb_urlList: urlList 

    }, function() {
        if (chrome.runtime.lastError) {
            console.error('[CTCBi Form] Error al guardar opciones en storage:', chrome.runtime.lastError.message);
            status.textContent = 'Error al guardar: ' + chrome.runtime.lastError.message;
            status.className = 'error';
            setTimeout(() => { status.textContent = ''; status.className = ''; }, 3000); 
        } else {
            status.textContent = 'Opciones guardadas.';
            status.className = 'success';

            setTimeout(() => {
                window.close(); 
            }, 500); 
        }
    });
}

function loadOptions() {

    const keysToGet = [
        'ctcb_domain', 'ctcb_id', 'ctcb_token', 'ctcb_userId', 'ctcb_apiType',
        'ctcb_showFloatingButton', 
        'ctcb_whatsapp_domain', 'ctcb_whatsapp_id', 'ctcb_whatsapp_token', 'ctcb_whatsapp_origen',
        'ctcb_urlList'
    ];

    chrome.storage.sync.get(keysToGet, function(items) {
        if (chrome.runtime.lastError) {
            console.error('[CTCBi Form] Error al cargar opciones de storage:', chrome.runtime.lastError.message);
            const status = document.getElementById('statusMessage');
            if (status) { status.textContent = 'Error al cargar configuraciones.'; status.className = 'error';}
            return;
        }

        const domainInput = document.getElementById('domain');
        if (domainInput && items.ctcb_domain !== undefined) domainInput.value = items.ctcb_domain;

        const idInput = document.getElementById('id');
        if (idInput && items.ctcb_id !== undefined) idInput.value = items.ctcb_id;

        const tokenInput = document.getElementById('token');
        if (tokenInput && items.ctcb_token !== undefined) tokenInput.value = items.ctcb_token;

        const userIdInput = document.getElementById('user_id');
        if (userIdInput && items.ctcb_userId !== undefined) userIdInput.value = items.ctcb_userId;

        if (items.ctcb_apiType) {
            const radioToCheck = document.querySelector(`input[name="api_type"][value="${items.ctcb_apiType}"]`);
            if (radioToCheck) {
                radioToCheck.checked = true;
            } else {
                 console.warn(`[CTCBi Form] Tipo de API guardado "${items.ctcb_apiType}" no encontrado como radio button.`);
                 const defaultApiRadio = document.getElementById('api_vozipcenter');
                 if (defaultApiRadio) defaultApiRadio.checked = true;
            }
        } else {
            const defaultApiRadio = document.getElementById('api_vozipcenter');
            if (defaultApiRadio) {
                defaultApiRadio.checked = true;
            }
        }

        // Cargar estado del interruptor de Botón Flotante (para dialpad)
        const showFloatingButtonCheckbox = document.getElementById('show_floating_button');
        if (showFloatingButtonCheckbox) {
            showFloatingButtonCheckbox.checked = items.ctcb_showFloatingButton !== undefined ? items.ctcb_showFloatingButton : true;
        } else {
             console.warn("[CTCBi Form] Checkbox 'show_floating_button' no encontrado en el DOM para cargar opciones.");
        }


        // Cargar campos de WhatsApp desde sus separate keys
        const whatsappDomainInput = document.getElementById('whatsapp_domain');
        if (whatsappDomainInput && items.ctcb_whatsapp_domain !== undefined) whatsappDomainInput.value = items.ctcb_whatsapp_domain;

        const whatsappIdInput = document.getElementById('whatsapp_id');
        if (whatsappIdInput && items.ctcb_whatsapp_id !== undefined) whatsappIdInput.value = items.ctcb_whatsapp_id;

        const whatsappTokenInput = document.getElementById('whatsapp_token');
        if (whatsappTokenInput && items.ctcb_whatsapp_token !== undefined) whatsappTokenInput.value = items.ctcb_whatsapp_token;

        const whatsappOrigenInput = document.getElementById('whatsapp_origen');
        if (whatsappOrigenInput && items.ctcb_whatsapp_origen !== undefined) {
            whatsappOrigenInput.value = items.ctcb_whatsapp_origen;
        }


        // Cargar campo de URLs
        const urlListInput = document.getElementById('url_list');
        if (urlListInput && items.ctcb_urlList !== undefined) urlListInput.value = items.ctcb_urlList;


    });
}

document.addEventListener('DOMContentLoaded', function() {
    loadOptions();
    setupMenuNavigation(); 
    const settingsForm = document.getElementById('apiSettingsForm');
    if (settingsForm) {
        settingsForm.addEventListener('submit', saveOptions);
    } else {
        console.error("[CTCBi Form] Formulario 'apiSettingsForm' no encontrado.");
    }

});

function setupMenuNavigation() {
    const menuItems = document.querySelectorAll('#main-menu .menu-item');
    const configSections = document.querySelectorAll('.config-section');
    const mainMenu = document.getElementById('main-menu');
    const mainTitle = document.getElementById('mainTitle');
    const saveStatusArea = document.getElementById('save-status-area');


    function showSection(sectionId) {

        configSections.forEach(section => {
            section.classList.remove('visible');
        });

        const targetSection = document.getElementById(sectionId);
        if (targetSection) {
            targetSection.classList.add('visible');

            mainMenu.classList.remove('visible');


            const sectionTitleElement = targetSection.querySelector('h2');
            if(sectionTitleElement) {
                mainTitle.textContent = sectionTitleElement.textContent;
            } else {
                 mainTitle.textContent = 'Sección';
                 console.warn(`[CTCBi Form] No se encontró <h2> en la sección ${sectionId}.`);
            }


             saveStatusArea.classList.add('visible');


        } else {
             console.error(`[CTCBi Form] Sección con ID "${sectionId}" no encontrada. Verifica HTML y data-section.`);
        }
    }

     // Función para volver al menú principal
    function showMainMenu() {
        configSections.forEach(section => section.classList.remove('visible'));
        saveStatusArea.classList.remove('visible');

        mainMenu.classList.add('visible');
         mainTitle.textContent = 'Configuración';
    }

    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetSectionId = item.dataset.section + '-section'; 
            showSection(targetSectionId); 
        });
    });

     showMainMenu();

}


function saveOptions(e) {
    e.preventDefault();

    const status = document.getElementById('statusMessage');
    if (!status) {
        console.error("[CTCBi Form] Elemento 'statusMessage' no encontrado para guardar.");
        return;
    }
    status.textContent = ''; 
    status.className = ''; 

    // Campos de Llamadas (Voz)
    const domainInput = document.getElementById('domain');
    const idInput = document.getElementById('id');
    const tokenInput = document.getElementById('token');
    const userIdInput = document.getElementById('user_id');
    const apiTypeInputVozipcenter = document.getElementById('api_vozipcenter'); 
    const apiTypeInputRm = document.getElementById('api_rm'); 

    const domain = domainInput ? domainInput.value : '';
    const id = idInput ? idInput.value : '';
    const token = tokenInput ? tokenInput.value : '';
    const userId = userIdInput ? userIdInput.value : '';
    const apiType = apiTypeInputVozipcenter && apiTypeInputVozipcenter.checked ? 'vozipcenter'
                  : apiTypeInputRm && apiTypeInputRm.checked ? 'rm'
                  : ''; 

    // Campo del interruptor de Botón Flotante
    const showFloatingButtonCheckbox = document.getElementById('show_floating_button');
    const showFloatingButton = showFloatingButtonCheckbox ? showFloatingButtonCheckbox.checked : true; // Default a true si el elemento no existe (seguro que existirá ahora)


    // Campos de WhatsApp
    const whatsappDomainInput = document.getElementById('whatsapp_domain');
    const whatsappIdInput = document.getElementById('whatsapp_id');
    const whatsappTokenInput = document.getElementById('whatsapp_token');
    const whatsappOrigenInput = document.getElementById('whatsapp_origen');

    const whatsappDomain = whatsappDomainInput ? whatsappDomainInput.value : '';
    const whatsappId = whatsappIdInput ? whatsappIdInput.value : '';
    const whatsappToken = whatsappTokenInput ? whatsappTokenInput.value : '';
    const whatsappOrigen = whatsappOrigenInput ? whatsappOrigenInput.value : '';


    // Campo de URLs
    const urlListInput = document.getElementById('url_list');
    const urlList = urlListInput ? urlListInput.value : '';


    console.log('[CTCBi Form] Valores leídos del formulario:', {
        domain: domain, id: id, token: token, userId: userId, apiType: apiType,
        showFloatingButton: showFloatingButton, 
        whatsappDomain: whatsappDomain, whatsappId: whatsappId, whatsappToken: whatsappToken, whatsappOrigen: whatsappOrigen,
        urlList: urlList
    });


    chrome.storage.sync.set({
        ctcb_domain: domain,       
        ctcb_id: id,                 
        ctcb_token: token,          
        ctcb_userId: userId,         
        ctcb_apiType: apiType,       

        ctcb_showFloatingButton: showFloatingButton, 

        ctcb_whatsapp_domain: whatsappDomain, 
        ctcb_whatsapp_id: whatsappId,        
        ctcb_whatsapp_token: whatsappToken,   
        ctcb_whatsapp_origen: whatsappOrigen, 

        ctcb_urlList: urlList 

    }, function() {
        if (chrome.runtime.lastError) {
            console.error('[CTCBi Form] Error al guardar opciones en storage:', chrome.runtime.lastError.message);
            status.textContent = 'Error al guardar: ' + chrome.runtime.lastError.message;
            status.className = 'error';
            setTimeout(() => { status.textContent = ''; status.className = ''; }, 3000); // Mantener el mensaje de error por 3 segundos
        } else {
            status.textContent = 'Opciones guardadas.';
            status.className = 'success';

            // Cierra formulario/popup después de guardar (permite que el usuario aprecie el mensaje de guardado previamente) ---
            setTimeout(() => {
                window.close(); 
            }, 500); 
        }
    });
}

function loadOptions() {

    
    const keysToGet = [
        'ctcb_domain', 'ctcb_id', 'ctcb_token', 'ctcb_userId', 'ctcb_apiType',
        'ctcb_showFloatingButton', 
        'ctcb_whatsapp_domain', 'ctcb_whatsapp_id', 'ctcb_whatsapp_token', 'ctcb_whatsapp_origen',
        'ctcb_urlList'
    ];

    chrome.storage.sync.get(keysToGet, function(items) {
        if (chrome.runtime.lastError) {
            console.error('[CTCBi Form] Error al cargar opciones de storage:', chrome.runtime.lastError.message);
            const status = document.getElementById('statusMessage');
            if (status) { status.textContent = 'Error al cargar configuraciones.'; status.className = 'error';}
            return;
        }

        const domainInput = document.getElementById('domain');
        if (domainInput && items.ctcb_domain !== undefined) domainInput.value = items.ctcb_domain;

        const idInput = document.getElementById('id');
        if (idInput && items.ctcb_id !== undefined) idInput.value = items.ctcb_id;

        const tokenInput = document.getElementById('token');
        if (tokenInput && items.ctcb_token !== undefined) tokenInput.value = items.ctcb_token;

        const userIdInput = document.getElementById('user_id');
        if (userIdInput && items.ctcb_userId !== undefined) userIdInput.value = items.ctcb_userId;

        if (items.ctcb_apiType) {
            const radioToCheck = document.querySelector(`input[name="api_type"][value="${items.ctcb_apiType}"]`);
            if (radioToCheck) {
                radioToCheck.checked = true;
            } else {
                 console.warn(`[CTCBi Form] Tipo de API guardado "${items.ctcb_apiType}" no encontrado como radio button.`);
                 const defaultApiRadio = document.getElementById('api_vozipcenter');
                 if (defaultApiRadio) defaultApiRadio.checked = true;
            }
        } else {
            const defaultApiRadio = document.getElementById('api_vozipcenter');
            if (defaultApiRadio) {
                defaultApiRadio.checked = true;
            }
        }

        const showFloatingButtonCheckbox = document.getElementById('show_floating_button');
        if (showFloatingButtonCheckbox) {
            showFloatingButtonCheckbox.checked = items.ctcb_showFloatingButton !== undefined ? items.ctcb_showFloatingButton : true;
        } else {
             console.warn("[CTCBi Form] Checkbox 'show_floating_button' no encontrado en el DOM para cargar opciones.");
        }


        const whatsappDomainInput = document.getElementById('whatsapp_domain');
        if (whatsappDomainInput && items.ctcb_whatsapp_domain !== undefined) whatsappDomainInput.value = items.ctcb_whatsapp_domain;

        const whatsappIdInput = document.getElementById('whatsapp_id');
        if (whatsappIdInput && items.ctcb_whatsapp_id !== undefined) whatsappIdInput.value = items.ctcb_whatsapp_id;

        const whatsappTokenInput = document.getElementById('whatsapp_token');
        if (whatsappTokenInput && items.ctcb_whatsapp_token !== undefined) whatsappTokenInput.value = items.ctcb_whatsapp_token;

        const whatsappOrigenInput = document.getElementById('whatsapp_origen');
        if (whatsappOrigenInput && items.ctcb_whatsapp_origen !== undefined) {
            whatsappOrigenInput.value = items.ctcb_whatsapp_origen;
        }


        const urlListInput = document.getElementById('url_list');
        if (urlListInput && items.ctcb_urlList !== undefined) urlListInput.value = items.ctcb_urlList;

    });
}