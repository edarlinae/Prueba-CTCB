// =========================================================================
// 1. VARIABLES GLOBALES Y ESTADO DE LA EXTENSIÓN
// =========================================================================

let ctcb_allowedUrls = [];
let ctcb_isUrlListActive = false;
let ctcb_observer = null;
let ctcb_dialPadInstance = null;
let ctcb_inCallUIInstance = null;
let ctcb_optionsModalInstance = null;
let ctcb_whatsAppComposerInstance = null;
let ctcb_mainInitialized = false;
let ctcb_listenerStorageChanges = null;
let ctcb_currentCallInfo = null;
let ctcb_callTimerInterval = null;

let ctcb_isFloatingButtonEnabled = true;
let ctcb_isVozApiEnabled = true;
let ctcb_isWhatsappApiEnabled = true;


const PHONE_REGEX_PATTERN_SOURCE = /(\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{2,4}[-.\s]?\d{2,4}(?:[-.\s]?\d{1,4})?/g.source;
let CTBC_PHONE_REGEX;
try {
    CTBC_PHONE_REGEX = new RegExp(PHONE_REGEX_PATTERN_SOURCE, 'g');
} catch (e) {
    console.error("[CTCBi] Error compiling PHONE_REGEX:", e);
    CTBC_PHONE_REGEX = /disabled_regex/g;
}


// =========================================================================
// 2. FUNCIONES DE UTILIDAD GENERAL
// =========================================================================

function getSafeIconURL(path) {
    if (typeof chrome !== "object" || !chrome.runtime || typeof chrome.runtime.getURL !== "function" || !chrome.runtime.id) return "";
    try { return chrome.runtime.getURL(path); } catch (e) { console.error(`%c[CTCBi] Error getting URL for ${path}: ${e.message}`, "color: red;"); return ""; }
}

function isCurrentUrlAllowed() {
    try {
        if (!ctcb_isUrlListActive || ctcb_allowedUrls.length === 0) return true;
        const currentUrl = window.location.href;
        return ctcb_allowedUrls.some(pattern => {
            const regexPattern = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
            try { return new RegExp(`^${regexPattern}$`).test(currentUrl); } catch (e) { console.error(`[CTCBi] Error compiling/testing regex for pattern "${pattern}":`, e); return false; }
        });
    } catch (e) { console.error('[CTCBi] Error in isCurrentUrlAllowed:', e); return false; }
}


// =========================================================================
// 3. INICIALIZACIÓN PRINCIPAL Y FILTRADO DE URLs
// =========================================================================

function loadConfigAndInitialize() {
    // Usar defaults si chrome storage no está disponible
    if (typeof chrome !== "object" || !chrome.storage || !chrome.storage.sync) {
        ctcb_allowedUrls = []; ctcb_isUrlListActive = false; ctcb_isFloatingButtonEnabled = true; ctcb_isVozApiEnabled = true; ctcb_isWhatsappApiEnabled = true;
        if (!ctcb_mainInitialized) initializeMainFunctionality();
        return;
    }

    const keysToGet = ['ctcb_urlList', 'ctcb_showFloatingButton', 'ctcb_enableVoz', 'ctcb_enableWhatsapp'];
    chrome.storage.sync.get(keysToGet, function(items) {
        if (chrome.runtime.lastError) {
            console.error('[CTCBi] Error loading initial config:', chrome.runtime.lastError.message);
            ctcb_allowedUrls = []; ctcb_isUrlListActive = false; ctcb_isFloatingButtonEnabled = true; ctcb_isVozApiEnabled = true; ctcb_isWhatsappApiEnabled = true;
        } else {
            if (items.ctcb_urlList && items.ctcb_urlList.trim() !== "") {
                ctcb_allowedUrls = items.ctcb_urlList.split('\n').map(url => url.trim()).filter(url => url);
                ctcb_isUrlListActive = true;
            } else { ctcb_allowedUrls = []; ctcb_isUrlListActive = false; }
            ctcb_isFloatingButtonEnabled = items.ctcb_showFloatingButton !== undefined ? items.ctcb_showFloatingButton : true;
            ctcb_isVozApiEnabled = items.ctcb_enableVoz !== undefined ? items.ctcb_enableVoz : true;
            ctcb_isWhatsappApiEnabled = items.ctcb_enableWhatsapp !== undefined ? items.ctcb_enableWhatsapp : true;
        }

        if (isCurrentUrlAllowed()) initializeMainFunctionality();
        else { if (ctcb_observer) { ctcb_observer.disconnect(); ctcb_observer = null; } removeInjectedUI(true); ctcb_mainInitialized = false; }
    });
}

function initializeMainFunctionality() {
    if (ctcb_mainInitialized) return;
    if (!document.body) { document.addEventListener('DOMContentLoaded', initializeMainFunctionality, { once: true }); return; }

    ctcb_mainInitialized = true;

    try {
        scanDOMForPhoneNumbers(document.body);
        if (!ctcb_observer) {
            ctcb_observer = new MutationObserver(handleDOMChanges);
            ctcb_observer.observe(document.body, { childList: true, subtree: true });
        }

        if (ctcb_isFloatingButtonEnabled) injectDialPadButton();
        else removeFloatingDialPadButton();

    } catch (e) { console.error('[CTCBi] Critical error in initializeMain functionality:', e); ctcb_mainInitialized = false; }
}


// =========================================================================
// 4. DETECCIÓN DE NÚMEROS DE TELÉFONO Y MANEJO DE CAMBIOS EN EL DOM
// =========================================================================

function handleDOMChanges(mutationsList) {
    try {
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach(newNode => {
                    if ((newNode.nodeType === Node.ELEMENT_NODE || newNode.nodeType === Node.TEXT_NODE)) {
                        let isInsideExtensionUI = false;
                        let currentNode = newNode; let depth = 0;
                        while (currentNode && depth < 5) {
                            if (currentNode.id && currentNode.id.startsWith('ctcb-')) { isInsideExtensionUI = true; break; }
                            if (currentNode.classList && Array.from(currentNode.classList).some(cls => cls.startsWith('ctcb-'))) { isInsideExtensionUI = true; break; }
                            if (currentNode.closest && currentNode.closest('[id^="ctcb-"], [class^="ctcb-"]')) { isInsideExtensionUI = true; break; }
                            currentNode = currentNode.parentElement; depth++;
                        }
                        if (!isInsideExtensionUI) scanNodeForPhoneNumbers(newNode);
                    }
                });
            }
        }
    } catch (e) { console.error('[CTCBi] Error in MutationObserver callback:', e); }
}

function scanNodeForPhoneNumbers(node) {
    try {
        if (!node || (node.nodeType !== Node.TEXT_NODE && node.nodeType !== Node.ELEMENT_NODE)) return;
        if (node.nodeType === Node.TEXT_NODE && (node.nodeValue || '').length < 7) return;

        if (node.nodeType === Node.ELEMENT_NODE) {
            const tagName = node.tagName;
            if (tagName === 'SCRIPT' || tagName === 'STYLE' || node.isContentEditable || (node.closest && node.closest('[contenteditable="true"]'))) return;
            if (node.id && node.id.startsWith('ctcb-') || (node.classList && Array.from(node.classList).some(cls => cls.startsWith('ctcb-')))) return;
            if (node.closest && node.closest('[id^="ctcb-"], [class^="ctcb-"]')) return;
        }

        if (node.nodeType === Node.TEXT_NODE) {
            const parent = node.parentNode;
            if (!parent) return;
            if (parent.id && parent.id.startsWith('ctcb-') || (parent.classList && Array.from(parent.classList).some(cls => cls.startsWith('ctcb-')))) return;

            const nodeValue = node.nodeValue;
            CTBC_PHONE_REGEX.lastIndex = 0;
            let match; let lastIndex = 0; const fragment = document.createDocumentFragment();

            while ((match = CTBC_PHONE_REGEX.exec(nodeValue)) !== null) {
                const phoneNumberString = match[0];
                if (phoneNumberString.replace(/[^\d]/g, "").length < 7) { CTBC_PHONE_REGEX.lastIndex = match.index + 1; continue; }
                const cleanedNumber = phoneNumberString.replace(/[^\d+]/g, "");

                fragment.appendChild(document.createTextNode(nodeValue.substring(lastIndex, match.index)));

                const phoneSpan = document.createElement('span');
                phoneSpan.className = 'ctcb-phone-container';

                const icon = document.createElement('img');
                if (ctcb_isVozApiEnabled || ctcb_isWhatsappApiEnabled) {
                    const iconSrc = getSafeIconURL('icons/phone_icon32.png');
                    if (iconSrc) {
                        icon.src = iconSrc; icon.className = 'ctcb-phone-icon-inline'; icon.title = `Opciones del Teléfono CTCB: ${phoneNumberString}`; icon.dataset.phoneNumber = cleanedNumber;
                        icon.addEventListener('click', (event) => { event.stopPropagation(); event.preventDefault(); showOptionsModal(cleanedNumber); }); // Pasar solo el número
                        phoneSpan.appendChild(icon);
                    }
                }

                const linkElement = document.createElement('a');
                linkElement.href = `tel:${cleanedNumber}`; linkElement.innerText = phoneNumberString;
                linkElement.style.cssText = 'text-decoration:none !important;color:inherit !important;cursor:default !important;';
                linkElement.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (ctcb_isVozApiEnabled || ctcb_isWhatsappApiEnabled) showOptionsModal(cleanedNumber); // Pasar solo el número
                });
                phoneSpan.appendChild(linkElement);

                fragment.appendChild(phoneSpan); lastIndex = CTBC_PHONE_REGEX.lastIndex;
            }

            if (lastIndex > 0) { fragment.appendChild(document.createTextNode(nodeValue.substring(lastIndex))); parent.replaceChild(fragment, node); }
        }
        else if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.id && node.id.startsWith('ctcb-') || (node.classList && Array.from(node.classList).some(cls => cls.startsWith('ctcb-')))) return;
            if (node.closest && node.closest('[id^="ctcb-"], [class^="ctcb-"]')) return;

            Array.from(node.childNodes).forEach(scanNodeForPhoneNumbers);
        }
    } catch (e) { console.error('[CTCBi] Error in scanNodeForPhoneNumbers:', e, "Affected Node:", node ? node.nodeName : 'null'); }
}

function scanDOMForPhoneNumbers(rootNode) {
    if (!rootNode) return;
    scanNodeForPhoneNumbers(rootNode);
}


// =========================================================================
// 5. GESTIÓN GENERAL DE LA UI INYECTADA
// =========================================================================

function removeInjectedUI(fullClean = false) {
    const elementsToRemove = [document.getElementById('ctcb-open-dialpad-button'), ctcb_dialPadInstance, ctcb_inCallUIInstance, ctcb_optionsModalInstance, ctcb_whatsAppComposerInstance];
    elementsToRemove.forEach(el => { if (el && el.parentNode) { try { el.parentNode.removeChild(el); } catch (e) { console.warn('[CTCBi] Error removing UI element:', el.id || el.className, e); } } });
    ctcb_dialPadInstance = null; ctcb_inCallUIInstance = null; ctcb_optionsModalInstance = null; ctcb_whatsAppComposerInstance = null; ctcb_currentCallInfo = null;
    if (ctcb_callTimerInterval) { clearInterval(ctcb_callTimerInterval); ctcb_callTimerInterval = null; }
    if (fullClean) {
        const phoneSpans = document.querySelectorAll('.ctcb-phone-container');
        phoneSpans.forEach(span => {
            let originalText = span.querySelector('a') ? span.querySelector('a').innerText : span.textContent || '';
            if (span.parentNode) { try { span.parentNode.replaceChild(document.createTextNode(originalText), span); } catch (e) { span.remove(); } }
            else { span.remove(); }
        });
    }
}

function closeAllModals() { closeOptionsModal(); closeDialPad(); closeWhatsAppComposer(); closeInCallUI(); }
function removeFloatingDialPadButton() {
    const floatingButton = document.getElementById('ctcb-open-dialpad-button');
    if (floatingButton && floatingButton.parentNode) { try { floatingButton.parentNode.removeChild(floatingButton); } catch (e) { console.warn('[CTCBi] Error removing floating button:', e); } }
    ctcb_dialPadInstance = null;
}


// =========================================================================
// 6. GESTIÓN DE LA MODAL DE OPCIONES (al hacer clic en el icono inline)
// =========================================================================

function showOptionsModal(phoneNumber) { 
    if (ctcb_optionsModalInstance) ctcb_optionsModalInstance.remove();
    if (!chrome.runtime || !chrome.runtime.id) { alert('La extensión no está activa. Intenta recargar la página o la extensión.'); return; }
    closeAllModals();

    chrome.storage.sync.get(['ctcb_enableVoz', 'ctcb_enableWhatsapp'], function(items) {
        if (chrome.runtime.lastError) { console.error('[CTCBi] Error loading config for options modal:', chrome.runtime.lastError.message); alert('Error al cargar la configuración de la extensión. Intenta recargar la página.'); return; }
        const enableVoz = items.ctcb_enableVoz !== undefined ? items.ctcb_enableVoz : true;
        const enableWhatsapp = items.ctcb_enableWhatsapp !== undefined ? items.ctcb_enableWhatsapp : true;
        if (!enableVoz && !enableWhatsapp) { alert('Las opciones de Llamada y WhatsApp están deshabilitadas en la configuración de la extensión.'); return; }

        try {
            ctcb_optionsModalInstance = document.createElement('div'); ctcb_optionsModalInstance.id = 'ctcb-modal-overlay';
            const nuevaLlamadaIconUrl = getSafeIconURL('icons_modal/telmodal_icon.png');
            const whatsappIconUrl = getSafeIconURL('icons_modal/whatsapp_icon.png');
            let modalBodyContent = '';

            if (enableVoz) { 
                modalBodyContent += `<button class="ctcb-action-button" id="ctcb-modal-open-dialpad"> <img src="${nuevaLlamadaIconUrl || '#'}" alt="Nueva llamada"> <div> <strong>Nueva llamada</strong> <span>Inicia una llamada con este contacto.</span> </div> </button>`;
            }
            if (enableWhatsapp) { 
                modalBodyContent += `<button class="ctcb-action-button" id="ctcb-modal-whatsapp-action"> <img src="${whatsappIconUrl || '#'}" alt="WhatsApp"> <div> <strong>Nueva conversación WhatsApp</strong> <span>Inicia una nueva conversación en WhatsApp con este contacto.</span> </div> </button>`;
            }

            modalBodyContent = `<p class="ctcb-modal-description">Selecciona una acción para realizar con el teléfono: <strong>${phoneNumber}</strong></p>` + modalBodyContent;

            ctcb_optionsModalInstance.innerHTML = `<div id="ctcb-modal-content"> <div id="ctcb-modal-header"> <span>Opciones del Teléfono</span> <button id="ctcb-modal-close">&times;</button> </div> <div id="ctcb-modal-body">${modalBodyContent}</div> </div>`;
            document.body.appendChild(ctcb_optionsModalInstance);

            const closeBtn = ctcb_optionsModalInstance.querySelector('#ctcb-modal-close'); if (closeBtn) closeBtn.addEventListener('click', closeOptionsModal);
            ctcb_optionsModalInstance.addEventListener('click', (e) => { if (e.target.id === 'ctcb-modal-overlay') closeOptionsModal(); });

            if (enableVoz) { const openDialpadBtn = ctcb_optionsModalInstance.querySelector('#ctcb-modal-open-dialpad'); if (openDialpadBtn) { openDialpadBtn.addEventListener('click', () => { closeOptionsModal(); showDialPad(phoneNumber); }); } }
            if (enableWhatsapp) { const whatsappActionBtn = ctcb_optionsModalInstance.querySelector('#ctcb-modal-whatsapp-action'); if (whatsappActionBtn) { whatsappActionBtn.addEventListener('click', () => { showWhatsAppComposer(phoneNumber); closeOptionsModal(); }); } }

        } catch (e) { console.error('[CTCBi] Critical error building or showing showOptionsModal:', e); closeOptionsModal(); }
    });
}

function closeOptionsModal() {
    if (ctcb_optionsModalInstance) { ctcb_optionsModalInstance.remove(); ctcb_optionsModalInstance = null; }
}


// =========================================================================
// 7. GESTIÓN DEL DIALPAD DE MARCACIÓN (la cajita blanca)
// =========================================================================

function injectDialPadButton() {
    if (document.getElementById('ctcb-open-dialpad-button')) return;
    if (!ctcb_isFloatingButtonEnabled) { removeFloatingDialPadButton(); return; }
    if (!chrome.runtime || !chrome.runtime.id) return;
    try {
        const openDialPadButton = document.createElement('button'); openDialPadButton.id = 'ctcb-open-dialpad-button'; openDialPadButton.title = 'Abrir DialPad CTCB';
        const iconUrl = getSafeIconURL('icons_DialPad/dialpad_white_icon.png');
        openDialPadButton.innerHTML = `<img src="${iconUrl || '#'}" alt="DP">`;
        openDialPadButton.addEventListener('click', toggleDialPad); document.body.appendChild(openDialPadButton);
    } catch (e) { console.error('[CTCBi] Error injecting floating dialpad button:', e); removeFloatingDialPadButton(); }
}

function toggleDialPad() {
    if (!ctcb_isVozApiEnabled) { alert('La funcionalidad de Llamada está deshabilitada en la configuración.'); closeDialPad(); return; }
    if (ctcb_dialPadInstance) closeDialPad(); else { closeAllModals(); showDialPad(); }
}

function showDialPad(phoneNumber = "") {
    if (!ctcb_isVozApiEnabled) { alert('La funcionalidad de Llamada está deshabilitada en la configuración.'); return; }
    if (ctcb_dialPadInstance) { const display = ctcb_dialPadInstance.querySelector('#ctcb-dialpad-display'); if (display) { if (phoneNumber) display.value = phoneNumber; display.focus(); } return; }
    if (!chrome.runtime || !chrome.runtime.id) return;
    closeAllModals();

    try {
        ctcb_dialPadInstance = document.createElement('div'); ctcb_dialPadInstance.id = 'ctcb-dialpad-container';
        const backspaceIconUrl = getSafeIconURL('icons_DialPad/delete_icon.png'); const callBtnIconUrl = getSafeIconURL('icons_DialPad/conect_icon.png');
        ctcb_dialPadInstance.innerHTML =
            `<div id="ctcb-dialpad-header"> <input type="text" id="ctcb-dialpad-display" placeholder="Número..." autocomplete="off" value="${phoneNumber || ''}"> <button id="ctcb-dialpad-backspace" title="Borrar"> <img src="${backspaceIconUrl || '#'}" alt="Borrar"> </button> <button id="ctcb-dialpad-close" title="Cerrar DialPad">&times;</button> </div>
            <div id="ctcb-dialpad-grid"> ${['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map(c => `<button class="ctcb-dialpad-button" data-char="${c}">${c}</button>`).join('')} </div>
            <div id="ctcb-dialpad-actions"> <button id="ctcb-dialpad-callbutton" title="Llamar"> <img src="${callBtnIconUrl || '#'}" alt="Llamar"> </button> </div>`;

        document.body.appendChild(ctcb_dialPadInstance);

        const display = ctcb_dialPadInstance.querySelector('#ctcb-dialpad-display'); const callBtn = ctcb_dialPadInstance.querySelector('#ctcb-dialpad-callbutton'); const callIconImg = callBtn ? callBtn.querySelector('img') : null;
        const closeBtn = ctcb_dialPadInstance.querySelector('#ctcb-dialpad-close'); if (closeBtn) closeBtn.addEventListener('click', closeDialPad);
        const backspaceBtnInternal = ctcb_dialPadInstance.querySelector('#ctcb-dialpad-backspace'); if (backspaceBtnInternal) backspaceBtnInternal.addEventListener('click', () => { if (display) display.value = display.value.slice(0, -1); });
        ctcb_dialPadInstance.querySelectorAll('.ctcb-dialpad-button').forEach(btn => { btn.addEventListener('click', () => { if (display) display.value += btn.dataset.char; }); });

        if (callBtn && display) {
            callBtn.addEventListener('click', function() {
                if (!ctcb_isVozApiEnabled) { alert('La funcionalidad de Llamada está deshabilitada en la configuración.'); closeDialPad(); return; }
                try {
                    const numberToCallRaw = display.value.trim(); if (!numberToCallRaw) { alert("Introduce un número para llamar."); return; }
                    callBtn.disabled = true; const originalIconSrc = getSafeIconURL('icons_DialPad/conect_icon.png'); const activeIconSrc = getSafeIconURL('icons_DialPad/disconect_icon.png');
                    if (callIconImg && activeIconSrc) callIconImg.src = activeIconSrc; else if (callIconImg) callIconImg.style.opacity = '0.5'; callBtn.style.opacity = '0.7';
                    const numberToCallForAPI = numberToCallRaw.replace(/[\s-()]/g, ""); if (!chrome.runtime || !chrome.runtime.id) { alert("Error interno de la extensión. Recarga la página."); return; }

                    chrome.runtime.sendMessage({ action: "makeCallViaServiceWorker", number: numberToCallForAPI }, response => {
                        callBtn.disabled = false; callBtn.style.opacity = '1';
                        const currentCallIconImg = callBtn.querySelector('img'); const defaultCallIcon = getSafeIconURL('icons_DialPad/conect_icon.png');
                        if (currentCallIconImg && defaultCallIcon) currentCallIconImg.src = defaultCallIcon; else if (currentCallIconImg) currentCallIconImg.style.opacity = '1';

                        if (chrome.runtime.lastError) { console.error('[CTCBi] Error on chrome.runtime.sendMessage (make call):', chrome.runtime.lastError.message); alert('Error de comunicación con el servicio de la extensión al intentar llamar.'); return; }
                        if (response && response.success) {
                            closeDialPad();
                            if (response.calledNumber && response.callConfig) showInCallUI(response.calledNumber, response.callConfig);
                            else alert("Llamada iniciada. No se pudo mostrar la UI en llamada.");
                        } else {
                            console.error(`[CTCBi] Error initiating call via API: ${response ? response.error : "Unknown response."}`); alert(`Error al intentar llamar: ${response ? response.error : "Respuesta desconocida."}`);
                            if (response && response.needsConfig) { if (confirm('Faltan datos de configuración para llamadas. ¿Quieres abrir la página de opciones?')) { if (chrome.runtime && typeof chrome.runtime.openOptionsPage === 'function') chrome.runtime.openOptionsPage(); else { const optionsUrl = getSafeIconURL("formulario.html"); if (optionsUrl) window.open(optionsUrl, '_blank'); } } }
                        }
                    });
                } catch (e) { console.error('[CTCBi] Error in Dialpad call button click handler:', e); alert("Error interno al procesar la llamada."); if (callBtn) { callBtn.disabled = false; callBtn.style.opacity = '1'; const currentCallIconImg = callBtn.querySelector('img'); const defaultCallIcon = getSafeIconURL('icons_DialPad/conect_icon.png'); if (currentCallIconImg && defaultCallIcon) currentCallIconImg.src = defaultCallIcon; else if (currentCallIconImg) currentCallIconImg.style.opacity = '1'; } }
            });
        }
        if (display) { display.focus(); if (phoneNumber) display.select(); }
    } catch (e) { console.error('[CTCBi] Error in showDialPad:', e); closeDialPad(); }
}

function closeDialPad() {
    if (ctcb_dialPadInstance) { ctcb_dialPadInstance.remove(); ctcb_dialPadInstance = null; }
}


// =========================================================================
// 8. GESTIÓN DE LA UI "EN LLAMADA" (la cajita azul)
// =========================================================================

function showInCallUI(calledNumber, callConfig) {
    if (ctcb_inCallUIInstance) { ctcb_inCallUIInstance.remove(); if (ctcb_callTimerInterval) { clearInterval(ctcb_callTimerInterval); ctcb_callTimerInterval = null; } }
    ctcb_currentCallInfo = { number: calledNumber, config: callConfig };
    if (!chrome.runtime || !chrome.runtime.id) return;
    closeAllModals();

    try {
        ctcb_inCallUIInstance = document.createElement('div'); ctcb_inCallUIInstance.id = 'ctcb-in-call-ui-container';
        const hangupIconUrl = getSafeIconURL('icons_DialPad/disconect_icon.png'); const addIconUrl = getSafeIconURL('icons_DialPad/add_icon.png'); const pauseIconUrl = getSafeIconURL('icons_DialPad/pause_icon.png'); const recordIconUrl = getSafeIconURL('icons_DialPad/record_icon.png'); const transferIconUrl = getSafeIconURL('icons_DialPad/transfer_icon.png'); const muteIconUrl = getSafeIconURL('icons_DialPad/mute_icon.png'); const keypadIconUrl = getSafeIconURL('icons_DialPad/dialpad_icon.png');

        ctcb_inCallUIInstance.innerHTML =
            `<div class="ctcb-in-call-header"> <span id="ctcb-in-call-timer">00:00</span> </div>
            <div class="ctcb-in-call-info"> <span id="ctcb-in-call-number">${calledNumber}</span> <span id="ctcb-in-call-status">España</span> </div>
            <div class="ctcb-in-call-controls">
                <div class="ctcb-in-call-grid">
                    <button class="ctcb-in-call-button" title="Añadir"> <img src="${addIconUrl || '#'}" alt="+"> <span class="ctcb-icon-label">Añadir</span> </button>
                    <button class="ctcb-in-call-button" title="Pausar"> <img src="${pauseIconUrl || '#'}" alt="||"> <span class="ctcb-icon-label">Pausar</span> </button>
                    <button class="ctcb-in-call-button" title="Grabar"> <img src="${recordIconUrl || '#'}" alt="◉"> <span class="ctcb-icon-label">Grabar</span> </button>
                    <button class="ctcb-in-call-button" title="Transferir"> <img src="${transferIconUrl || '#'}" alt="⤷"> <span class="ctcb-icon-label">Transferir</span> </button>
                    <button class="ctcb-in-call-button" title="Silenciar"> <img src="${muteIconUrl || '#'}" alt="🔇"> <span class="ctcb-icon-label">Silenciar</span> </button>
                    <button class="ctcb-in-call-button" title="Teclado"> <img src="${keypadIconUrl || '#'}" alt="⠿"> <span class="ctcb-icon-label">Teclado</span> </button>
                </div>
                <button id="ctcb-in-call-hangup-button" class="ctcb-hangup-btn" title="Colgar"> <img src="${hangupIconUrl || '#'}" alt="Colgar"> </button>
            </div>`; 

        document.body.appendChild(ctcb_inCallUIInstance);

        let seconds = 0; const timerElement = ctcb_inCallUIInstance.querySelector('#ctcb-in-call-timer');
        if (ctcb_callTimerInterval) clearInterval(ctcb_callTimerInterval);
        ctcb_callTimerInterval = setInterval(() => { let m = Math.floor(seconds / 60).toString().padStart(2, '0'), s = (seconds % 60).toString().padStart(2, '0'); if (timerElement && document.contains(timerElement)) timerElement.textContent = `${m}:${s}`; else clearInterval(ctcb_callTimerInterval); seconds++; }, 1000);

        const hangupBtn = ctcb_inCallUIInstance.querySelector('#ctcb-in-call-hangup-button');
        if (hangupBtn) hangupBtn.addEventListener('click', () => {
            if (!ctcb_currentCallInfo) { console.warn('[CTCBi] No current call info to hang up.'); closeInCallUI(); return; }
            if (!ctcb_isVozApiEnabled) { alert('La funcionalidad de Llamada está deshabilitada en la configuración.'); closeInCallUI(); return; }
            if (!chrome.runtime || !chrome.runtime.id) { alert("Contexto inválido de la extensión. Recarga la página."); closeInCallUI(); return; }
            hangupBtn.disabled = true;
            chrome.runtime.sendMessage({ action: "hangupCall", number: ctcb_currentCallInfo.number, config: ctcb_currentCallInfo.config }, response => {
                hangupBtn.disabled = false;
                if (chrome.runtime.lastError) { console.error('[CTCBi] Error on chrome.runtime.sendMessage (hang up):', chrome.runtime.lastError.message); alert('Error de comunicación con el servicio de la extensión al intentar colgar.'); }
                else if (!response || !response.success) { console.error(`[CTCBi] Error hanging up call via API: ${response ? response.error : "Unknown response."}`); alert(`Error al colgar la llamada: ${response ? response.error : "Respuesta desconocida."}`); }
                closeInCallUI();
            });
        });
        ctcb_inCallUIInstance.querySelectorAll('.ctcb-in-call-button').forEach(btn => { btn.addEventListener('click', () => { /* Funcionalidad no implementada */ }); }); // Botones de control sin funcionalidad.
    } catch (e) { console.error('[CTCBi] Error in showInCallUI:', e); closeInCallUI(); }
}

function closeInCallUI() {
    if (ctcb_callTimerInterval) { clearInterval(ctcb_callTimerInterval); ctcb_callTimerInterval = null; }
    if (ctcb_inCallUIInstance) { ctcb_inCallUIInstance.remove(); ctcb_inCallUIInstance = null; ctcb_currentCallInfo = null; }
}

// =========================================================================
// 9. GESTIÓN DEL COMPOSITOR DE WHATSAPP (la ventana grande)
// =========================================================================

function showWhatsAppComposer(phoneNumber) {
    if (!ctcb_isWhatsappApiEnabled) { alert('La funcionalidad de WhatsApp está deshabilitada en la configuración.'); return; }
    if (ctcb_whatsAppComposerInstance) ctcb_whatsAppComposerInstance.remove();
    if (!chrome.runtime || !chrome.runtime.id) { alert("Error interno de la extensión. Recarga la página."); return; }
    closeAllModals();

    try {
        ctcb_whatsAppComposerInstance = document.createElement('div');
        ctcb_whatsAppComposerInstance.id = 'ctcb-whatsapp-composer-overlay';

        ctcb_whatsAppComposerInstance.innerHTML = `
            <div id="ctcb-whatsapp-composer-content">
                <div id="ctcb-whatsapp-composer-header">
                    <span>Enviar WhatsApp</span>
                    <button id="ctcb-wc-close-btn" class="ctcb-wc-button-close" title="Cerrar">&times;</button>
                </div>
                <div id="ctcb-whatsapp-composer-body">
                    <h2 id="ctcb-wc-contact-identifier">${phoneNumber}</h2>
                    <div class="ctcb-form-group">
                        <label for="ctcb-wc-phone-number-display">Número de teléfono:</label>
                        <input type="text" id="ctcb-wc-phone-number-display" value="${phoneNumber}" readonly title="Número de destino">
                    </div>
                    <div class="ctcb-form-group">
                        <label for="ctcb-wc-message-input">Mensaje:</label>
                        <textarea id="ctcb-wc-message-input" placeholder="Escribe tu mensaje..."></textarea>
                    </div>
                    <div class="ctcb-form-group ctcb-file-input-area">
                        <input type="file" id="ctcb-wc-file-input" style="display: none;">
                        <button type="button" id="ctcb-wc-select-file-btn" class="ctcb-file-input-button">Seleccionar archivo</button>
                        <span id="ctcb-wc-file-name-display">Ningún archivo seleccionado</span>
                    </div>
                </div>
                <div id="ctcb-whatsapp-composer-footer">
                    <p id="ctcb-wc-status-message"></p>
                    <button type="button" id="ctcb-wc-cancel-btn" class="ctcb-wc-button-cancel">Cancelar</button>
                    <button type="button" id="ctcb-wc-send-btn" class="ctcb-wc-button-send">Enviar</button>
                </div>
            </div>`;

        document.body.appendChild(ctcb_whatsAppComposerInstance);

        const messageInput = ctcb_whatsAppComposerInstance.querySelector('#ctcb-wc-message-input');
        const sendBtn = ctcb_whatsAppComposerInstance.querySelector('#ctcb-wc-send-btn');
        const statusMessageElement = ctcb_whatsAppComposerInstance.querySelector('#ctcb-wc-status-message');
        const selectFileBtn = ctcb_whatsAppComposerInstance.querySelector('#ctcb-wc-select-file-btn');
        const fileInput = ctcb_whatsAppComposerInstance.querySelector('#ctcb-wc-file-input');
        const fileNameDisplay = ctcb_whatsAppComposerInstance.querySelector('#ctcb-wc-file-name-display');


        const closeBtn = ctcb_whatsAppComposerInstance.querySelector('#ctcb-wc-close-btn'); if (closeBtn) closeBtn.addEventListener('click', closeWhatsAppComposer);
        const cancelBtn = ctcb_whatsAppComposerInstance.querySelector('#ctcb-wc-cancel-btn'); if (cancelBtn) cancelBtn.addEventListener('click', closeWhatsAppComposer);
        ctcb_whatsAppComposerInstance.addEventListener('click', (e) => { if (e.target.id === 'ctcb-whatsapp-composer-overlay') closeWhatsAppComposer(); });

        if (selectFileBtn && fileInput && fileNameDisplay) {
            selectFileBtn.addEventListener('click', () => {
                fileInput.click(); 
            });
            fileInput.addEventListener('change', () => {
                if (fileInput.files.length > 0) {
                    fileNameDisplay.textContent = fileInput.files[0].name;
                } else {
                    fileNameDisplay.textContent = 'Ningún archivo seleccionado';
                }
            });
        } else {
            console.error("[CTCBi] WhatsApp composer file input elements not found.");
        }


        if (sendBtn) {
            sendBtn.addEventListener('click', async () => { 
                if (!ctcb_isWhatsappApiEnabled) {
                    if (statusMessageElement) { statusMessageElement.textContent = "WhatsApp deshabilitado."; statusMessageElement.className = 'error'; } else alert('La funcionalidad de WhatsApp está deshabilitada.');
                    closeWhatsAppComposer(); return;
                }
                if (statusMessageElement) { statusMessageElement.textContent = ''; statusMessageElement.className = ''; }

                sendBtn.disabled = true; sendBtn.textContent = "Enviando...";

                const mensaje = messageInput ? messageInput.value.trim() : '';
                const destino = phoneNumber ? phoneNumber.replace(/\D/g, '') : '';
                const fileInput = ctcb_whatsAppComposerInstance.querySelector('#ctcb-wc-file-input');
                const selectedFile = fileInput && fileInput.files.length > 0 ? fileInput.files[0] : null;

                if (!mensaje && !selectedFile) { 
                    if (statusMessageElement) { statusMessageElement.textContent = "Por favor, escribe un mensaje o selecciona un archivo."; statusMessageElement.className = 'error'; } else alert("Escribe un mensaje o selecciona un archivo.");
                    sendBtn.disabled = false; sendBtn.textContent = "Enviar";
                    return;
                }

                if (!destino || destino.replace('+', '').length < 7) {
                    if (statusMessageElement) { statusMessageElement.textContent = "Número de destino inválido."; statusMessageElement.className = 'error'; } else alert("Número de destino inválido.");
                    console.error("[CTCBi] Attempt to send WhatsApp to invalid number:", phoneNumber);
                    sendBtn.disabled = false; sendBtn.textContent = "Enviar";
                    return;
                }

                if (!chrome.runtime || !chrome.runtime.id) {
                    if (statusMessageElement) { statusMessageElement.textContent = "Error: Contexto inválido."; statusMessageElement.className = 'error'; } else alert("Error de extensión.");
                    sendBtn.disabled = false; sendBtn.textContent = "Enviar";
                    return;
                }

                // Lógica de manejo de archivo
                let fileData = null;
                if (selectedFile) {
                    try {
                        // Leer como (Base64)
                        const fileReader = new FileReader();
                        fileData = await new Promise((resolve, reject) => {
                            fileReader.onload = (e) => resolve(e.target.result); 
                            fileReader.onerror = (e) => reject(e);
                            fileReader.readAsDataURL(selectedFile);
                        });

                        console.log("[CTCBi] File read as Data URL:", fileData ? fileData.substring(0, 50) + '...' : 'null'); // Log parcial para no llenar consola
                    } catch (e) {
                        console.error('[CTCBi] Error reading file:', e);
                        if (statusMessageElement) { statusMessageElement.textContent = "Error al leer el archivo."; statusMessageElement.className = 'error'; } else alert("Error al leer el archivo.");
                        sendBtn.disabled = false; sendBtn.textContent = "Enviar";
                        return;
                    }
                }


                chrome.storage.sync.get(['ctcb_whatsapp_origen'], function(items) {
                    if (chrome.runtime.lastError) {
                        console.error('[CTCBi] Error loading WhatsApp origin config:', chrome.runtime.lastError.message);
                        if (statusMessageElement) { statusMessageElement.textContent = 'Error al cargar origen.'; statusMessageElement.className = 'error'; } else alert('Error al cargar origen.');
                        sendBtn.disabled = false; sendBtn.textContent = "Enviar";
                        return;
                    }

                    const { ctcb_whatsapp_origen } = items;
                    if (!ctcb_whatsapp_origen) {
                        if (statusMessageElement) { statusMessageElement.textContent = "Falta número de origen."; statusMessageElement.className = 'error'; } else alert("Falta el número de origen.");
                        const openOptions = confirm('Falta el número de origen. ¿Abrir opciones?');
                        if (openOptions) { if (chrome.runtime && typeof chrome.runtime.openOptionsPage === 'function') chrome.runtime.openOptionsPage(); else { const optionsUrl = getSafeIconURL("formulario.html"); if (optionsUrl) window.open(optionsUrl, '_blank'); } }
                        sendBtn.disabled = false; sendBtn.textContent = "Enviar";
                        return;
                    }

                    const payload = {
                        origen: ctcb_whatsapp_origen.replace(/\D/g, '') || '',
                        destino: destino,
                        mensaje: mensaje,
                        file: fileData, 
                        fileName: selectedFile ? selectedFile.name : null,
                        fileType: selectedFile ? selectedFile.type : null
                    };

                    console.log("[CTCBi] Sending WhatsApp payload:", payload);

                    chrome.runtime.sendMessage({ action: "sendWhatsAppViaAPI", payload: payload }, response => {
                        sendBtn.disabled = false; sendBtn.textContent = "Enviar"; 
                        if (chrome.runtime.lastError) {
                            console.error('[CTCBi] Error SW (WhatsApp API):', chrome.runtime.lastError.message);
                            if (statusMessageElement) { statusMessageElement.textContent = 'Error de comunicación.'; statusMessageElement.className = 'error'; } else alert('Error de comunicación.');
                            return;
                        }
                        if (response && response.success) {
                            if (statusMessageElement) { statusMessageElement.textContent = "Mensaje enviado."; statusMessageElement.className = 'success'; setTimeout(() => { if (statusMessageElement) { statusMessageElement.textContent = ''; statusMessageElement.className = ''; } }, 3000); }
                            if (messageInput) { messageInput.value = ""; } 
                            if (fileInput) { fileInput.value = ""; }
                            if (fileNameDisplay) { fileNameDisplay.textContent = 'Ningún archivo seleccionado'; } 
                        }
                        else {
                            console.error(`[CTCBi] Error sending WhatsApp via API: ${response ? response.error : "Unknown response."}`);
                            if (statusMessageElement) { statusMessageElement.textContent = `Error al enviar: ${response ? response.error : "Desconocido"}`; statusMessageElement.className = 'error'; setTimeout(() => { if (statusMessageElement) { statusMessageElement.textContent = ''; statusMessageElement.className = ''; } }, 5000); } else alert(`Error al enviar WhatsApp: ${response ? response.error : "Desconocido"}`);
                        }
                    });
                });
            });
        }

        if (messageInput) messageInput.focus();
    } catch (e) { console.error('[CTCBi] Error in showWhatsAppComposer:', e); closeWhatsAppComposer(); }
}

function closeWhatsAppComposer() {
    if (ctcb_whatsAppComposerInstance) { ctcb_whatsAppComposerInstance.remove(); ctcb_whatsAppComposerInstance = null; }
}


// =========================================================================
// 10. LISTENER DE CAMBIOS EN CHROME STORAGE
// =========================================================================

function handleStorageChanges(changes, namespace) {
    try {
        if (namespace === 'sync') {
            if (typeof changes.ctcb_urlList !== 'undefined') {
                if (ctcb_observer) { ctcb_observer.disconnect(); ctcb_observer = null; }
                removeInjectedUI(true); ctcb_mainInitialized = false; loadConfigAndInitialize();
            }

            if (typeof changes.ctcb_showFloatingButton !== 'undefined') {
                const newValue = changes.ctcb_showFloatingButton.newValue; ctcb_isFloatingButtonEnabled = newValue !== undefined ? newValue : true;
                if (ctcb_mainInitialized && isCurrentUrlAllowed()) { if (ctcb_isFloatingButtonEnabled) injectDialPadButton(); else removeFloatingDialPadButton(); }
            }

            if (typeof changes.ctcb_enableVoz !== 'undefined') {
                const newValue = changes.ctcb_enableVoz.newValue; ctcb_isVozApiEnabled = newValue !== undefined ? newValue : true;
                if (ctcb_optionsModalInstance) closeOptionsModal();
                if (!ctcb_isVozApiEnabled && ctcb_dialPadInstance) closeDialPad();
                if (!ctcb_isVozApiEnabled && ctcb_inCallUIInstance) closeInCallUI();
            }

            if (typeof changes.ctcb_enableWhatsapp !== 'undefined') {
                const newValue = changes.ctcb_enableWhatsapp.newValue; ctcb_isWhatsappApiEnabled = newValue !== undefined ? newValue : true;
                if (ctcb_optionsModalInstance) closeOptionsModal();
                if (!ctcb_isWhatsappApiEnabled && ctcb_whatsAppComposerInstance) closeWhatsAppComposer();
            }
        }
    } catch (e) { console.error('[CTCBi] Error in handleStorageChanges:', e); }
}


// =========================================================================
// 11. PUNTO DE ENTRADA DEL SCRIPT Y VERIFICACIÓN DEL DOM
// =========================================================================

let ctcb_script_executed_main = false;

function guardedMain() {
    if (typeof chrome !== "object" || !chrome.runtime || !chrome.runtime.id) return;
    if (!ctcb_script_executed_main) { ctcb_script_executed_main = true; main(); }
}

function main() {
    ctcb_mainInitialized = false; loadConfigAndInitialize();
    if (ctcb_listenerStorageChanges && chrome.storage && chrome.storage.onChanged && chrome.storage.onChanged.hasListener(ctcb_listenerStorageChanges)) chrome.storage.onChanged.removeListener(ctcb_listenerStorageChanges);
    ctcb_listenerStorageChanges = handleStorageChanges;
    if (typeof chrome === 'object' && chrome.storage && chrome.storage.onChanged) chrome.storage.onChanged.addListener(ctcb_listenerStorageChanges);
}

// =========================================================================
// 12. VERIFICAR ESTADO DEL DOM Y EJECUTAR EL PUNTO DE ENTRADA
// =========================================================================

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", guardedMain, { once: true });
else guardedMain();