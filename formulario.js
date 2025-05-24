// =========================================================================
// 1. INICIALIZACIÓN AL CARGAR EL POPUP
// =========================================================================

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


// =========================================================================
// 2. NAVEGACIÓN DEL MENÚ Y LISTENERS DE SWITCHES
// =========================================================================

function setupMenuNavigation() {
    const menuItems = document.querySelectorAll('#main-menu .menu-item');
    const configSections = document.querySelectorAll('.config-section');
    const mainMenu = document.getElementById('main-menu');
    const mainTitle = document.getElementById('mainTitle');
    const saveStatusArea = document.getElementById('save-status-area');

    if (!menuItems.length || !configSections.length || !mainMenu || !mainTitle || !saveStatusArea) {
        console.error('[CTCBi Form] Essential menu or section elements not found.');
        return;
    }

    function showSection(sectionId) {
        configSections.forEach(section => { section.classList.remove('visible'); });
        const targetSection = document.getElementById(sectionId);
        if (targetSection) {
            targetSection.classList.add('visible');
            mainMenu.classList.remove('visible');
            saveStatusArea.classList.add('visible');
            const sectionTitleElement = targetSection.querySelector('h2');
            if(sectionTitleElement) mainTitle.textContent = sectionTitleElement.textContent;
            else mainTitle.textContent = 'Sección';
        } else {
             console.error(`[CTCBi Form] Section with ID "${sectionId}" not found.`);
        }
    }

    function showMainMenu() {
        configSections.forEach(section => section.classList.remove('visible'));
        saveStatusArea.classList.remove('visible');
        mainMenu.classList.add('visible');
        mainTitle.textContent = 'Configuración';
    }

    menuItems.forEach(item => {
        item.addEventListener('click', (event) => {
            if (event.target.closest('.ctcb-toggle-switch')) {
                event.stopPropagation();
                return;
            }
            const targetSectionId = item.dataset.section + '-section';
            showSection(targetSectionId);
        });
    });

    function saveMenuSwitchStates() {
         const enableVozCheckbox = document.getElementById('enable_voz_api');
         const enableWhatsappCheckbox = document.getElementById('enable_whatsapp_api');
         const vozEnabled = enableVozCheckbox ? enableVozCheckbox.checked : true;
         const whatsappEnabled = enableWhatsappCheckbox ? enableWhatsappCheckbox.checked : true;
         if (typeof chrome === 'object' && chrome.storage && chrome.storage.sync) {
              chrome.storage.sync.set({
                  ctcb_enableVoz: vozEnabled,
                  ctcb_enableWhatsapp: whatsappEnabled
              }, function() {
                  if (chrome.runtime.lastError) { console.error('[CTCBi Form] Error saving menu switch states:', chrome.runtime.lastError.message); }
              });
         } else { console.error("[CTCBi Form] chrome.storage.sync not available. Cannot save menu switch states."); }
    }

    const enableVozCheckbox = document.getElementById('enable_voz_api');
    const enableWhatsappCheckbox = document.getElementById('enable_whatsapp_api');

    if (enableVozCheckbox) {
        enableVozCheckbox.addEventListener('change', saveMenuSwitchStates);
    } else { console.error("[CTCBi Form] Checkbox 'enable_voz_api' not found."); }

    if (enableWhatsappCheckbox) {
        enableWhatsappCheckbox.addEventListener('change', saveMenuSwitchStates);
    } else { console.error("[CTCBi Form] Checkbox 'enable_whatsapp_api' not found."); }

    showMainMenu();
}

// =========================================================================
// 3. GUARDAR OPCIONES COMPLETAS DEL FORMULARIO
// =========================================================================

function saveOptions(e) {
    e.preventDefault(); 

    const status = document.getElementById('statusMessage');
    if (!status) { console.error("[CTCBi Form] Elemento 'statusMessage' not found."); return; }
    status.textContent = ''; status.className = '';


    // Campos de Formulario (Voz)
    const domainInput = document.getElementById('domain');
    const idInput = document.getElementById('id'); 
    const tokenInput = document.getElementById('token');
    const userIdInput = document.getElementById('user_id');
    const apiTypeInputVozipcenter = document.getElementById('api_vozipcenter'); const apiTypeInputRm = document.getElementById('api_rm');
    const domain = domainInput ? domainInput.value : '';
    const id = idInput ? idInput.value : ''; 
    const token = tokenInput ? tokenInput.value : '';
    const userId = userIdInput ? userIdInput.value : '';
    const apiType = apiTypeInputVozipcenter && apiTypeInputVozipcenter.checked ? 'vozipcenter' : apiTypeInputRm && apiTypeInputRm.checked ? 'rm' : '';

    const showFloatingButtonCheckbox = document.getElementById('show_floating_button');
    const showFloatingButton = showFloatingButtonCheckbox ? showFloatingButtonCheckbox.checked : true;

    // Campos de Formulario (WhatsApp)
    const whatsappDomainInput = document.getElementById('whatsapp_domain');
    const whatsappIdInput = document.getElementById('whatsapp_id'); 
    const whatsappTokenInput = document.getElementById('whatsapp_token');
    const whatsappOrigenInput = document.getElementById('whatsapp_origen');

    const whatsappDomain = whatsappDomainInput ? whatsappDomainInput.value : '';
    const whatsappId = whatsappIdInput ? whatsappIdInput.value : ''; 
    const whatsappToken = whatsappTokenInput ? whatsappTokenInput.value : '';
    const whatsappOrigen = whatsappOrigenInput ? whatsappOrigenInput.value : '';

    const urlListInput = document.getElementById('url_list');
    const urlList = urlListInput ? urlListInput.value : '';

    if (typeof chrome === 'object' && chrome.storage && chrome.storage.sync) {
         const itemsToSave = {
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
         };
         chrome.storage.sync.set(itemsToSave, function() {
             if (chrome.runtime.lastError) {
                 console.error('[CTCBi Form] Error saving section options:', chrome.runtime.lastError.message);
                 status.textContent = 'Error al guardar: ' + chrome.runtime.lastError.message;
                 status.className = 'error';
                 setTimeout(() => { status.textContent = ''; status.className = ''; }, 3000);
             }
             else {
                 status.textContent = 'Opciones guardadas.';
                 status.className = 'success';
                 setTimeout(() => {
                     window.close();
                 }, 700);
             }
         });
    } else { console.error("[CTCBi Form] chrome.storage.sync not available. Cannot save section options."); status.textContent = 'Error: Almacenamiento no disponible.'; status.className = 'error'; setTimeout(() => { status.textContent = ''; status.className = ''; }, 3000); }
}


// =========================================================================
// 4. CARGAR OPCIONES COMPLETAS DEL FORMULARIO
// =========================================================================

function loadOptions() {
     if (typeof chrome === 'object' && chrome.storage && chrome.storage.sync) {
        const keysToGet = [
            'ctcb_domain', 'ctcb_id', 'ctcb_token', 'ctcb_userId', 'ctcb_apiType',
            'ctcb_showFloatingButton',
            'ctcb_whatsapp_domain', 'ctcb_whatsapp_id', 'ctcb_whatsapp_token', 'ctcb_whatsapp_origen', 
            'ctcb_urlList',
            'ctcb_enableVoz', 'ctcb_enableWhatsapp'
        ];

        chrome.storage.sync.get(keysToGet, function(items) {
            if (chrome.runtime.lastError) { console.error('[CTCBi Form] Error loading options:', chrome.runtime.lastError.message); const status = document.getElementById('statusMessage'); if (status) { status.textContent = 'Error al cargar configuraciones.'; status.className = 'error';} applyDefaultOptionsToForm(); return; }

            const domainInput = document.getElementById('domain'); if (domainInput && items.ctcb_domain !== undefined) domainInput.value = items.ctcb_domain;
            const idInput = document.getElementById('id'); if (idInput && items.ctcb_id !== undefined) idInput.value = items.ctcb_id;
            const tokenInput = document.getElementById('token'); if (tokenInput && items.ctcb_token !== undefined) tokenInput.value = items.ctcb_token;
            const userIdInput = document.getElementById('user_id'); if (userIdInput && items.ctcb_userId !== undefined) userIdInput.value = items.ctcb_userId;

            const apiTypeInputVozipcenter = document.getElementById('api_vozipcenter'); const apiTypeInputRm = document.getElementById('api_rm');
            if (items.ctcb_apiType && (apiTypeInputVozipcenter || apiTypeInputRm)) { const radioToCheck = document.querySelector(`input[name="api_type"][value="${items.ctcb_apiType}"]`); if (radioToCheck) radioToCheck.checked = true; else if (apiTypeInputVozipcenter) apiTypeInputVozipcenter.checked = true; }
            else if (apiTypeInputVozipcenter) apiTypeInputVozipcenter.checked = true;

            const showFloatingButtonCheckbox = document.getElementById('show_floating_button');
            if (showFloatingButtonCheckbox) showFloatingButtonCheckbox.checked = items.ctcb_showFloatingButton !== undefined ? items.ctcb_showFloatingButton : true;

            const whatsappDomainInput = document.getElementById('whatsapp_domain'); if (whatsappDomainInput && items.ctcb_whatsapp_domain !== undefined) whatsappDomainInput.value = items.ctcb_whatsapp_domain;
            const whatsappIdInput = document.getElementById('whatsapp_id'); if (whatsappIdInput && items.ctcb_whatsapp_id !== undefined) whatsappIdInput.value = items.ctcb_whatsapp_id; // <- CORREGIDO: Carga el ID de WhatsApp del campo con ID unico
            const whatsappTokenInput = document.getElementById('whatsapp_token'); if (whatsappTokenInput && items.ctcb_whatsapp_token !== undefined) whatsappTokenInput.value = items.ctcb_whatsapp_token;
            const whatsappOrigenInput = document.getElementById('whatsapp_origen'); if (whatsappOrigenInput && items.ctcb_whatsapp_origen !== undefined) whatsappOrigenInput.value = items.ctcb_whatsapp_origen;

            const urlListInput = document.getElementById('url_list'); if (urlListInput && items.ctcb_urlList !== undefined) urlListInput.value = items.ctcb_urlList;

            const enableVozCheckbox = document.getElementById('enable_voz_api');
            if (enableVozCheckbox) enableVozCheckbox.checked = items.ctcb_enableVoz !== undefined ? items.ctcb_enableVoz : true;
            else console.error("[CTCBi Form] Checkbox 'enable_voz_api' not found on load.");

            const enableWhatsappCheckbox = document.getElementById('enable_whatsapp_api');
            if (enableWhatsappCheckbox) enableWhatsappCheckbox.checked = items.ctcb_enableWhatsapp !== undefined ? items.ctcb_enableWhatsapp : true;
            else console.error("[CTCBi Form] Checkbox 'enable_whatsapp_api' not found on load.");
        });
     } else { console.warn("[CTCBi Form] chrome.storage.sync not available. Applying defaults."); applyDefaultOptionsToForm(); }
}
function applyDefaultOptionsToForm() {
     const enableVozCheckbox = document.getElementById('enable_voz_api'); if (enableVozCheckbox) enableVozCheckbox.checked = true;
     const enableWhatsappCheckbox = document.getElementById('enable_whatsapp_api'); if (enableWhatsappCheckbox) enableWhatsappCheckbox.checked = true;
     const showFloatingButtonCheckbox = document.getElementById('show_floating_button'); if (showFloatingButtonCheckbox) showFloatingButtonCheckbox.checked = true;
     const defaultApiRadio = document.getElementById('api_vozipcenter'); if (defaultApiRadio) defaultApiRadio.checked = true;
}