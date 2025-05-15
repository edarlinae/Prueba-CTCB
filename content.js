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

const PHONE_REGEX_PATTERN_SOURCE = /(\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{2,4}[-.\s]?\d{2,4}(?:[-.\s]?\d{1,4})?/g.source;
let CTBC_PHONE_REGEX;
try {
    CTBC_PHONE_REGEX = new RegExp(PHONE_REGEX_PATTERN_SOURCE, 'g');
} catch (e) {
    console.error("[CTCBi] Error compilando PHONE_REGEX:", e);
    CTBC_PHONE_REGEX = /disabled_regex/g;
}


// =========================================================================
// 2. FUNCIONES DE UTILIDAD GENERAL
// =========================================================================

function getSafeIconURL(path, callerFunction = "unknown") {
    if (typeof chrome !== "object" || !chrome.runtime || typeof chrome.runtime.getURL !== "function" || !chrome.runtime.id) {
        console.warn(`%c[CTCBi] Contexto invalidado o API no disponible (caller: ${callerFunction}). No se puede obtener URL para: ${path}`, "color: orange;");
        return "";
    }
    try {
        return chrome.runtime.getURL(path);
    } catch (e) {
        console.error(`%c[CTCBi] Error en getSafeIconURL para ${path} (caller: ${callerFunction}): ${e.message}`, "color: red;");
        return "";
    }
}

function isCurrentUrlAllowed() {
    try {
        if (!ctcb_isUrlListActive || ctcb_allowedUrls.length === 0) {
            return true;
        }

        const currentUrl = window.location.href;

        return ctcb_allowedUrls.some(pattern => {
            const regexPattern = pattern
                .replace(/[.+^${}()|[\]\\]/g, '\\$&')
                .replace(/\*/g, '.*')
                .replace(/\?/g, '.');

            try {
                 return new RegExp(`^${regexPattern}$`).test(currentUrl);
            } catch (e) {
                console.error(`[CTCBi] Error compilando/testeando regex para patrón "${pattern}":`, e);
                return false;
            }
        });
    } catch (e) {
        console.error('[CTCBi] Error en isCurrentUrlAllowed:', e);
        return false;
    }
}


// =========================================================================
// 3. INICIALIZACIÓN PRINCIPAL Y FILTRADO DE URLs
// =========================================================================

function loadConfigAndInitialize() {
     if (typeof chrome !== "object" || !chrome.storage || !chrome.storage.sync) {
         console.warn("[CTCBi] chrome.storage.sync no disponible.");
         ctcb_allowedUrls = [];
         ctcb_isUrlListActive = false;
         ctcb_isFloatingButtonEnabled = true;
         if (!ctcb_mainInitialized) {
              initializeMainFunctionality();
         }
         return;
     }

     const keysToGet = ['ctcb_urlList', 'ctcb_showFloatingButton'];
     chrome.storage.sync.get(keysToGet, function(items) {
         if (chrome.runtime.lastError) {
             console.error('[CTCBi] Error al cargar config inicial:', chrome.runtime.lastError.message);
             ctcb_allowedUrls = [];
             ctcb_isUrlListActive = false;
             ctcb_isFloatingButtonEnabled = true;
         } else {
             if (items.ctcb_urlList && items.ctcb_urlList.trim() !== "") {
                 ctcb_allowedUrls = items.ctcb_urlList.split('\n').map(url => url.trim()).filter(url => url);
                 ctcb_isUrlListActive = true;
             } else {
                 ctcb_allowedUrls = [];
                 ctcb_isUrlListActive = false;
             }

             ctcb_isFloatingButtonEnabled = items.ctcb_showFloatingButton !== undefined ? items.ctcb_showFloatingButton : true;
         }

         if (isCurrentUrlAllowed()) {
             initializeMainFunctionality();
         } else {
             if (ctcb_observer) {
                 ctcb_observer.disconnect();
                 ctcb_observer = null;
             }
             removeInjectedUI(true);
             ctcb_mainInitialized = false;
         }
     });
}

function initializeMainFunctionality() {
    if (ctcb_mainInitialized) {
         console.warn("[CTCBi] initializeMainFunctionality llamada de nuevo, pero ya inicializado. Abortando.");
        return;
    }

    if (!document.body) {
        console.warn('[CTCBi] document.body no encontrado. Esperando DOMContentLoaded para inicializar.');
        document.addEventListener('DOMContentLoaded', initializeMainFunctionality, { once: true });
        return;
    }

    ctcb_mainInitialized = true;

    try {
        scanDOMForPhoneNumbers(document.body);

        if (!ctcb_observer) {
            ctcb_observer = new MutationObserver(handleDOMChanges);
            ctcb_observer.observe(document.body, { childList: true, subtree: true });
        }

        if (ctcb_isFloatingButtonEnabled) {
            injectDialPadButton();
        } else {
            removeFloatingDialPadButton();
        }

    } catch (e) {
        console.error('[CTCBi] Error crítico en initializeMainFunctionality:', e);
        ctcb_mainInitialized = false;
    }
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
                         let currentNode = newNode;
                         let depth = 0;
                         while(currentNode && depth < 5) {
                             if (currentNode.id && currentNode.id.startsWith('ctcb-')) {
                                 isInsideExtensionUI = true;
                                 break;
                             }
                             if (currentNode.classList && Array.from(currentNode.classList).some(cls => cls.startsWith('ctcb-'))) {
                                isInsideExtensionUI = true;
                                break;
                             }
                             if(currentNode.closest && currentNode.closest('[id^="ctcb-"], [class^="ctcb-"]')) {
                                 isInsideExtensionUI = true;
                                 break;
                             }
                             currentNode = currentNode.parentElement;
                             depth++;
                         }

                         if (!isInsideExtensionUI) {
                            scanNodeForPhoneNumbers(newNode);
                         }
                    }
                });
            }
        }
    } catch (e) {
        console.error('[CTCBi] Error en MutationObserver callback:', e);
    }
}


function scanNodeForPhoneNumbers(node) {
    try {
        if (!node || (node.nodeType !== Node.TEXT_NODE && node.nodeType !== Node.ELEMENT_NODE)) return;
        if (node.nodeType === Node.TEXT_NODE && (node.nodeValue || '').length < 7) return;

         if (node.nodeType === Node.ELEMENT_NODE) {
              const tagName = node.tagName;
              if (tagName === 'SCRIPT' || tagName === 'STYLE' || node.isContentEditable || (node.closest && node.closest('[contenteditable="true"]'))) {
                  return;
              }
             if (node.id && node.id.startsWith('ctcb-') || (node.classList && Array.from(node.classList).some(cls => cls.startsWith('ctcb-')))) {
                 return;
             }
             if (node.closest && node.closest('[id^="ctcb-"], [class^="ctcb-"]')) {
                  return;
             }
         }

        if (node.nodeType === Node.TEXT_NODE) {
            const parent = node.parentNode;
             if (!parent) return;
             if (parent.id && parent.id.startsWith('ctcb-') || (parent.classList && Array.from(parent.classList).some(cls => cls.startsWith('ctcb-')))) {
                 return;
             }

            const nodeValue = node.nodeValue;
            CTBC_PHONE_REGEX.lastIndex = 0;
            let match;
            let lastIndex = 0;
            const fragment = document.createDocumentFragment();

            while ((match = CTBC_PHONE_REGEX.exec(nodeValue)) !== null) {
                const phoneNumberString = match[0];

                if (phoneNumberString.replace(/[^\d]/g, "").length < 7) {
                    CTBC_PHONE_REGEX.lastIndex = match.index + 1;
                    continue;
                }

                const cleanedNumber = phoneNumberString.replace(/[^\d+]/g, "");

                fragment.appendChild(document.createTextNode(nodeValue.substring(lastIndex, match.index)));

                const phoneSpan = document.createElement('span');
                phoneSpan.className = 'ctcb-phone-container';

                const icon = document.createElement('img');
                const iconSrc = getSafeIconURL('icons/phone_icon32.png', 'scanNodeForPhoneNumbers_inlineIcon');
                if (iconSrc) {
                    icon.src = iconSrc;
                    icon.className = 'ctcb-phone-icon-inline';
                    icon.title = 'Opciones del Teléfono CTCB';
                    icon.dataset.phoneNumber = cleanedNumber;

                    icon.addEventListener('click', (event) => {
                        event.stopPropagation();
                        event.preventDefault();
                        showOptionsModal(cleanedNumber, event.clientX, event.clientY);
                    });
                    phoneSpan.appendChild(icon);
                } else {
                     console.warn('[CTCBi] Icono inline no cargado, la funcionalidad del icono puede fallar.');
                }

                const linkElement = document.createElement('a');
                linkElement.href = `tel:${cleanedNumber}`;
                linkElement.innerText = phoneNumberString;
                linkElement.style.cssText = 'text-decoration:none !important;color:inherit !important;cursor:default !important;';
                linkElement.addEventListener('click', (e) => {
                    e.preventDefault();
                });
                phoneSpan.appendChild(linkElement);

                fragment.appendChild(phoneSpan);
                lastIndex = CTBC_PHONE_REGEX.lastIndex;
            }

            if (lastIndex > 0) {
                fragment.appendChild(document.createTextNode(nodeValue.substring(lastIndex)));
                parent.replaceChild(fragment, node);
            }
        }
        else if (node.nodeType === Node.ELEMENT_NODE) {
             if (node.id && node.id.startsWith('ctcb-') || (node.classList && Array.from(node.classList).some(cls => cls.startsWith('ctcb-')))) {
                return;
            }
             if (node.closest && node.closest('[id^="ctcb-"], [class^="ctcb-"]')) {
                  return;
             }

            Array.from(node.childNodes).forEach(scanNodeForPhoneNumbers);
        }
    } catch (e) {
        console.error('[CTCBi] Error en scanNodeForPhoneNumbers:', e, "Nodo afectado:", node.nodeName);
    }
}


function scanDOMForPhoneNumbers(rootNode) {
    if (!rootNode) {
        console.warn('[CTCBi] scanDOMForPhoneNumbers llamado con rootNode nulo.');
        return;
    }
    scanNodeForPhoneNumbers(rootNode);
}


// =========================================================================
// 5. GESTIÓN GENERAL DE LA UI INYECTADA
// =========================================================================

function removeInjectedUI(fullClean = false) {
    const elementsToRemove = [
        document.getElementById('ctcb-open-dialpad-button'),
        ctcb_dialPadInstance,
        ctcb_inCallUIInstance,
        ctcb_optionsModalInstance,
        ctcb_whatsAppComposerInstance
    ];

    elementsToRemove.forEach(el => {
        if (el && el.parentNode) {
            try {
                el.parentNode.removeChild(el);
            } catch (e) {
                console.warn('[CTCBi] Error al eliminar elemento de UI:', el.id || el.className, e);
            }
        }
    });

    ctcb_inCallUIInstance = null;
    ctcb_optionsModalInstance = null;
    ctcb_whatsAppComposerInstance = null;
    ctcb_currentCallInfo = null;

    
    if (ctcb_callTimerInterval) {
        clearInterval(ctcb_callTimerInterval);
        ctcb_callTimerInterval = null;
    }

    if (fullClean) {
        const phoneSpans = document.querySelectorAll('.ctcb-phone-container');
        phoneSpans.forEach(span => {
            let originalText = "";
            const link = span.querySelector('a');
            if (link) {
                originalText = link.innerText;
            } else {
                 originalText = span.textContent || '';
            }

            if (span.parentNode) {
                try {
                    span.parentNode.replaceChild(document.createTextNode(originalText), span);
                } catch (e) {
                    console.warn("[CTCBi] No se pudo reemplazar el span contenedor, eliminando:", e, span);
                    span.remove();
                }
            } else {
                 console.warn('[CTCBi] Contenedor de teléfono sin parentNode, eliminando:', span);
                 span.remove();
            }
        });
    }
}

function closeAllModals() {
    closeOptionsModal();
    closeDialPad();
    closeWhatsAppComposer();
    closeInCallUI();
}

function removeFloatingDialPadButton() {
     const floatingButton = document.getElementById('ctcb-open-dialpad-button');
     if (floatingButton && floatingButton.parentNode) {
         try {
             floatingButton.parentNode.removeChild(floatingButton);
         } catch (e) {
             console.warn('[CTCBi] Error al eliminar botón flotante:', e);
         }
     }
}


// =========================================================================
// 6. GESTIÓN DE LA MODAL DE OPCIONES (al hacer clic en el icono inline)
// =========================================================================

function showOptionsModal(phoneNumber, x, y) {

    if (ctcb_optionsModalInstance) {
         console.warn('[CTCBi] Modal de opciones ya existe. Eliminando anterior.');
        ctcb_optionsModalInstance.remove();
    }

    if (!chrome.runtime || !chrome.runtime.id) {
        console.warn("[CTCBi] Contexto invalidado en showOptionsModal. No se mostrará la modal.");
        return;
    }

    closeAllModals();

    try {
        ctcb_optionsModalInstance = document.createElement('div');
        ctcb_optionsModalInstance.id = 'ctcb-modal-overlay';

        const nuevaLlamadaIconUrl = getSafeIconURL('icons_modal/telmodal_icon.png', 'showOptionsModal_nuevaLlamadaIcon');
        const whatsappIconUrl = getSafeIconURL('icons_modal/whatsapp_icon.png', 'showOptionsModal_whatsappIcon');

        ctcb_optionsModalInstance.innerHTML = `
            <div id="ctcb-modal-content">
                <div id="ctcb-modal-header">
                    <span>Opciones del Teléfono</span>
                    <button id="ctcb-modal-close">&times;</button>
                </div>
                <div id="ctcb-modal-body">
                    <p class="ctcb-modal-description">Selecciona una acción para realizar con el teléfono: <strong>${phoneNumber}</strong></p>
                    <button class="ctcb-action-button" id="ctcb-modal-open-dialpad">
                        <img src="${nuevaLlamadaIconUrl || '#'}" alt="Nueva llamada">
                        <div>
                            <strong>Nueva llamada</strong>
                            <span>Inicia una llamada con este contacto.</span>
                        </div>
                    </button>
                    <button class="ctcb-action-button" id="ctcb-modal-whatsapp-action">
                        <img src="${whatsappIconUrl || '#'}" alt="WhatsApp">
                        <div>
                            <strong>Nueva conversación WhatsApp</strong>
                            <span>Inicia una nueva conversación en WhatsApp con este contacto.</span>
                        </div>
                    </button>
                </div>
            </div>`;

        document.body.appendChild(ctcb_optionsModalInstance);

        const closeBtn = ctcb_optionsModalInstance.querySelector('#ctcb-modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', closeOptionsModal);
        } else { console.warn("[CTCBi] Botón de cerrar modal de opciones no encontrado."); }


        ctcb_optionsModalInstance.addEventListener('click', (e) => {
            if (e.target.id === 'ctcb-modal-overlay') {
                closeOptionsModal();
            }
        });

        const openDialpadBtn = ctcb_optionsModalInstance.querySelector('#ctcb-modal-open-dialpad');
        if (openDialpadBtn) {
            openDialpadBtn.addEventListener('click', () => {
                closeOptionsModal();
                showDialPad(phoneNumber);
            });
        } else { console.warn("[CTCBi] Botón 'Nueva llamada' en modal no encontrado."); }


        const whatsappActionBtn = ctcb_optionsModalInstance.querySelector('#ctcb-modal-whatsapp-action');
         if (whatsappActionBtn) {
            whatsappActionBtn.addEventListener('click', () => {
                 showWhatsAppComposer(phoneNumber);
                closeOptionsModal();
            });
        } else { console.warn("[CTCBi] Botón 'WhatsApp' en modal no encontrado."); }


    } catch (e) {
        console.error('[CTCBi] Error crítico en showOptionsModal:', e);
        closeOptionsModal();
    }
}

function closeOptionsModal() {
    if (ctcb_optionsModalInstance) {
        ctcb_optionsModalInstance.remove();
        ctcb_optionsModalInstance = null;
    }
}


// =========================================================================
// 7. GESTIÓN DEL DIALPAD DE MARCACIÓN (la cajita blanca)
// =========================================================================

function injectDialPadButton() {
    if (document.getElementById('ctcb-open-dialpad-button')) {
        return;
    }

    if (!ctcb_isFloatingButtonEnabled) {
        removeFloatingDialPadButton();
        return;
    }


    if (!chrome.runtime || !chrome.runtime.id) {
        console.warn("[CTCBi] Contexto invalidado, no se inyectará botón dialpad flotante.");
        return;
    }

    try {
        const openDialPadButton = document.createElement('button');
        openDialPadButton.id = 'ctcb-open-dialpad-button';
        openDialPadButton.title = 'Abrir DialPad CTCB';

        const iconUrl = getSafeIconURL('icons_DialPad/dialpad_white_icon.png', 'injectDialPadButton');

        if (iconUrl) {
            openDialPadButton.innerHTML = `<img src="${iconUrl}" alt="DP" style="width:100%; height:100%; display:block; object-fit:contain;">`;
        } else {
            openDialPadButton.innerText = "DP";
            console.warn('[CTCBi] Icono para botón flotante no cargado, usando texto fallback.');
        }

        openDialPadButton.addEventListener('click', toggleDialPad);

        document.body.appendChild(openDialPadButton);

    } catch (e) {
        console.error('[CTCBi] Error en injectDialPadButton:', e);
        removeFloatingDialPadButton();
    }
}

function toggleDialPad() {
    if (ctcb_dialPadInstance) {
        closeDialPad();
    } else {
        closeAllModals();
        showDialPad();
    }
}

function showDialPad(phoneNumber = "") {

    if (ctcb_dialPadInstance) {
        const display = ctcb_dialPadInstance.querySelector('#ctcb-dialpad-display');
        if (display) {
            if (phoneNumber) display.value = phoneNumber;
            display.focus();
        }
        return;
    }

    if (!chrome.runtime || !chrome.runtime.id) {
        console.warn("[CTCBi] Contexto invalidado, no se mostrará dialpad de marcación.");
        return;
    }

    closeAllModals();

    try {
        ctcb_dialPadInstance = document.createElement('div');
        ctcb_dialPadInstance.id = 'ctcb-dialpad-container';

        const backspaceIconUrl = getSafeIconURL('icons_DialPad/delete_icon.png', 'showDialPad_backspace');
        const callBtnIconUrl = getSafeIconURL('icons_DialPad/conect_icon.png', 'showDialPad_call');

        ctcb_dialPadInstance.innerHTML = `
            <div id="ctcb-dialpad-header">
                <input type="text" id="ctcb-dialpad-display" placeholder="Número..." autocomplete="off" value="${phoneNumber || ''}">
                <button id="ctcb-dialpad-backspace" title="Borrar">
                    <img src="${backspaceIconUrl || '#'}" alt="Borrar">
                </button>
                <button id="ctcb-dialpad-close" title="Cerrar DialPad">&times;</button>
            </div>
            <div id="ctcb-dialpad-grid">
                ${['1','2','3','4','5','6','7','8','9','*','0','#'].map(c =>
                    `<button class="ctcb-dialpad-button" data-char="${c}">${c}</button>`
                ).join('')}
            </div>
            <div id="ctcb-dialpad-actions">
                <button id="ctcb-dialpad-callbutton" title="Llamar">
                    <img src="${callBtnIconUrl || '#'}" alt="Llamar">
                </button>
            </div>`;

        document.body.appendChild(ctcb_dialPadInstance);

        const display = ctcb_dialPadInstance.querySelector('#ctcb-dialpad-display');
        const callBtn = ctcb_dialPadInstance.querySelector('#ctcb-dialpad-callbutton');
        const callIconImg = callBtn ? callBtn.querySelector('img') : null;

        const closeBtn = ctcb_dialPadInstance.querySelector('#ctcb-dialpad-close');
        if(closeBtn) closeBtn.addEventListener('click', closeDialPad); else console.warn("[CTCBi] Botón de cerrar dialpad no encontrado.");

        ctcb_dialPadInstance.querySelectorAll('.ctcb-dialpad-button').forEach(btn => {
            btn.addEventListener('click', () => {
                if (display) display.value += btn.dataset.char;
            });
        });

        const backspaceBtnInternal = ctcb_dialPadInstance.querySelector('#ctcb-dialpad-backspace');
        if (backspaceBtnInternal) {
            backspaceBtnInternal.addEventListener('click', () => {
                if (display) display.value = display.value.slice(0, -1);
            });
        } else { console.warn("[CTCBi] Botón de retroceso dialpad no encontrado."); }


        if (callBtn && display) {
            callBtn.addEventListener('click', function() {
                try {
                    const numberToCallRaw = display.value.trim();
                    if (!numberToCallRaw) {
                        alert("Introduce un número para llamar.");
                        return;
                    }

                    callBtn.disabled = true;

                    const originalIconSrc = getSafeIconURL('icons_DialPad/conect_icon.png', 'showDialPad_call_original');
                    const activeIconSrc = getSafeIconURL('icons_DialPad/disconect_icon.png', 'showDialPad_call_active');

                    if (callIconImg && activeIconSrc) callIconImg.src = activeIconSrc;
                    else if(callIconImg) callIconImg.style.opacity = '0.5';
                    callBtn.style.opacity = '0.7';


                    const numberToCallForAPI = numberToCallRaw.replace(/[\s-()]/g, "");

                    if (!chrome.runtime || !chrome.runtime.id) {
                         alert("Contexto de extensión inválido. Recarga la página o la extensión.");
                         callBtn.disabled = false;
                         callBtn.style.opacity = '1';
                         if (callIconImg && originalIconSrc) callIconImg.src = originalIconSrc;
                         else if(callIconImg) callIconImg.style.opacity = '1';
                         return;
                    }

                    chrome.runtime.sendMessage({ action: "makeCallViaServiceWorker", number: numberToCallForAPI }, response => {
                        callBtn.disabled = false;
                        callBtn.style.opacity = '1';
                        if (callIconImg && originalIconSrc) callIconImg.src = originalIconSrc;
                        else if(callIconImg) callIconImg.style.opacity = '1';

                        if (chrome.runtime.lastError) {
                            console.error('[CTCBi] Error en chrome.runtime.sendMessage (llamar):', chrome.runtime.lastError.message);
                            alert('Error de comunicación con el servicio de la extensión al intentar llamar.');
                            return;
                        }

                        if (response && response.success) {
                            closeDialPad();
                            if (response.calledNumber && response.callConfig) {
                                showInCallUI(response.calledNumber, response.callConfig);
                            } else {
                                console.error("[CTCBi] Respuesta exitosa del SW, pero faltan calledNumber o callConfig para la UI en llamada.", response);
                                alert("Llamada iniciada. No se pudo mostrar la UI en llamada.");
                            }
                        } else {
                            alert(`Error al intentar llamar: ${response ? response.error : "Respuesta desconocida."}`);
                        }
                    });
                } catch (e) {
                    console.error('[CTCBi] Error en click del botón de llamar del DialPad:', e);
                    alert("Error interno al procesar la llamada.");
                    if(callBtn) {
                        callBtn.disabled = false;
                        callBtn.style.opacity = '1';
                        const currentCallIconImg = callBtn.querySelector('img');
                         const defaultCallIcon = getSafeIconURL('icons_DialPad/conect_icon.png', 'showDialPad_call_error_restore');
                         if (currentCallIconImg && defaultCallIcon) currentCallIconImg.src = defaultCallIcon;
                         else if(currentCallIconImg) currentCallIconImg.style.opacity = '1';
                    }
                }
            });
        } else {
             console.warn("[CTCBi] Botón de llamar o display del dialpad no encontrado.");
        }

        if(display) {
             display.focus();
             if (phoneNumber) {
                 display.select();
             }
        }

    } catch (e) {
        console.error('[CTCBi] Error en showDialPad (marcación):', e);
        closeDialPad();
    }
}


function closeDialPad() {
    if (ctcb_dialPadInstance) {
        ctcb_dialPadInstance.remove();
        ctcb_dialPadInstance = null;
    }
}


// =========================================================================
// 8. GESTIÓN DE LA UI "EN LLAMADA" (la cajita azul)
// =========================================================================

function showInCallUI(calledNumber, callConfig) {

    if (ctcb_inCallUIInstance) {
        console.warn("[CTCBi] UI 'En Llamada' ya existe. Eliminando anterior antes de mostrar la nueva.");
        ctcb_inCallUIInstance.remove();
         if (ctcb_callTimerInterval) { clearInterval(ctcb_callTimerInterval); ctcb_callTimerInterval = null; }
    }

    ctcb_currentCallInfo = { number: calledNumber, config: callConfig };

    if (!chrome.runtime || !chrome.runtime.id) {
        console.warn("[CTCBi] Contexto invalidado en showInCallUI. No se mostrará la UI en llamada.");
        return;
    }

    closeAllModals();

    try {
        ctcb_inCallUIInstance = document.createElement('div');
        ctcb_inCallUIInstance.id = 'ctcb-in-call-ui-container';

        const hangupIconUrl = getSafeIconURL('icons_DialPad/disconect_icon.png', 'showInCallUI_hangupIcon');
        const addIconUrl = getSafeIconURL('icons_DialPad/add_icon.png', 'showInCallUI_add');
        const pauseIconUrl = getSafeIconURL('icons_DialPad/pause_icon.png', 'showInCallUI_pause');
        const recordIconUrl = getSafeIconURL('icons_DialPad/record_icon.png', 'showInCallUI_record');
        const transferIconUrl = getSafeIconURL('icons_DialPad/transfer_icon.png', 'showInCallUI_transfer');
        const muteIconUrl = getSafeIconURL('icons_DialPad/mute_icon.png', 'showInCallUI_mute');
        const keypadIconUrl = getSafeIconURL('icons_DialPad/dialpad_icon.png', 'showInCallUI_keypad');

        //Funcionalidad botones DialPad llamada no implementada
        ctcb_inCallUIInstance.innerHTML = `
            <div class="ctcb-in-call-header">
                <span id="ctcb-in-call-timer">00:00</span>
            </div>
            <div class="ctcb-in-call-info">
                <span id="ctcb-in-call-number">${calledNumber}</span>
                <span id="ctcb-in-call-status">España</span>
            </div>
            <div class="ctcb-in-call-controls">
                <div class="ctcb-in-call-grid">
                    <button class="ctcb-in-call-button" title="Añadir">
                        <img src="${addIconUrl || '#'}" alt="+">
                        <span class="ctcb-icon-label">Añadir</span>
                    </button>
                    <button class="ctcb-in-call-button" title="Pausar">
                        <img src="${pauseIconUrl || '#'}" alt="||">
                        <span class="ctcb-icon-label">Pausar</span>
                    </button>
                    <button class="ctcb-in-call-button" title="Grabar">
                        <img src="${recordIconUrl || '#'}" alt="◉">
                        <span class="ctcb-icon-label">Grabar</span>
                    </button>
                    <button class="ctcb-in-call-button" title="Transferir">
                        <img src="${transferIconUrl || '#'}" alt="⤷">
                        <span class="ctcb-icon-label">Transferir</span>
                    </button>
                    <button class="ctcb-in-call-button" title="Silenciar">
                        <img src="${muteIconUrl || '#'}" alt="🔇">
                        <span class="ctcb-icon-label">Silenciar</span>
                    </button>
                    <button class="ctcb-in-call-button" title="Teclado">
                        <img src="${keypadIconUrl || '#'}" alt="⠿">
                        <span class="ctcb-icon-label">Teclado</span>
                    </button>
                </div>
                <button id="ctcb-in-call-hangup-button" class="ctcb-hangup-btn" title="Colgar">
                    <img src="${hangupIconUrl || '#'}" alt="Colgar">
                </button>
            </div>`;

        document.body.appendChild(ctcb_inCallUIInstance);

        let seconds = 0;
        const timerElement = ctcb_inCallUIInstance.querySelector('#ctcb-in-call-timer');
        if(ctcb_callTimerInterval) clearInterval(ctcb_callTimerInterval);

        ctcb_callTimerInterval = setInterval(() => {
            seconds++;
            const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
            const secs = (seconds % 60).toString().padStart(2, '0');
            if(timerElement && document.contains(timerElement)) {
                timerElement.textContent = `${mins}:${secs}`;
            } else {
                 clearInterval(ctcb_callTimerInterval);
                 ctcb_callTimerInterval = null;
            }
        }, 1000);

        const hangupBtn = ctcb_inCallUIInstance.querySelector('#ctcb-in-call-hangup-button');
        if (hangupBtn) {
            hangupBtn.addEventListener('click', () => {
                if (!ctcb_currentCallInfo) {
                    console.warn('[CTCBi] No hay información de llamada actual para colgar.');
                    closeInCallUI();
                    return;
                }

                if (!chrome.runtime || !chrome.runtime.id) {
                    alert("Contexto inválido de la extensión. Recarga la página.");
                    closeInCallUI();
                    return;
                }

                hangupBtn.disabled = true;

                chrome.runtime.sendMessage({ action: "hangupCall", number: ctcb_currentCallInfo.number, config: ctcb_currentCallInfo.config }, response => {
                    hangupBtn.disabled = false;

                    if (chrome.runtime.lastError) {
                        console.error('[CTCBi] Error en chrome.runtime.sendMessage (colgar):', chrome.runtime.lastError.message);
                        alert('Error de comunicación con el servicio de la extensión al intentar colgar.');
                    }

                    if (response && response.success) {
                    } else {
                         console.error(`[CTCBi] Error al colgar vía API: ${response ? response.error : "Respuesta desconocida."}`);
                        alert(`Error al colgar la llamada: ${response ? response.error : "Respuesta desconocida."}`);
                    }

                    closeInCallUI();
                });
            });
        } else {
             console.warn("[CTCBi] Botón de colgar en UI en llamada no encontrado.");
        }

        ctcb_inCallUIInstance.querySelectorAll('.ctcb-in-call-button').forEach(btn => {
             btn.addEventListener('click', () => {
             });
        });

    } catch (e) {
        console.error('[CTCBi] Error en showInCallUI:', e);
        closeInCallUI();
    }
}


function closeInCallUI() {
    if (ctcb_callTimerInterval) {
        clearInterval(ctcb_callTimerInterval);
        ctcb_callTimerInterval = null;
    }

    if (ctcb_inCallUIInstance) {
        ctcb_inCallUIInstance.remove();
        ctcb_inCallUIInstance = null;
        ctcb_currentCallInfo = null;
    }
}

// =========================================================================
// 9. GESTIÓN DEL COMPOSITOR DE WHATSAPP (la ventana grande)
// =========================================================================

function showWhatsAppComposer(phoneNumber) {

    if (ctcb_whatsAppComposerInstance) {
         console.warn("[CTCBi] Compositor de WhatsApp ya existe. Eliminando anterior.");
        ctcb_whatsAppComposerInstance.remove();
    }

     if (!chrome.runtime || !chrome.runtime.id) {
         console.warn("[CTCBi] Contexto invalidado en showWhatsAppComposer. No se mostrará el compositor.");
         alert("Contexto de extensión inválido. Recarga la página o la extensión.");
         return;
     }

    closeAllModals();

    try {
        ctcb_whatsAppComposerInstance = document.createElement('div');
        ctcb_whatsAppComposerInstance.id = 'ctcb-whatsapp-composer-overlay';

        ctcb_whatsAppComposerInstance.innerHTML = `
            <div id="ctcb-whatsapp-composer-content">
                <div id="ctcb-whatsapp-composer-header">
                    <span>Enviar WhatsApp</span>
                    <button id="ctcb-wc-close-btn" class="ctcb-wc-button-close">&times;</button>
                </div>
                <div id="ctcb-whatsapp-composer-body">
                    <h2 id="ctcb-wc-contact-identifier">${phoneNumber}</h2>
                    <div class="ctcb-form-group">
                        <label for="ctcb-wc-phone-number-display">Número de teléfono:</label>
                        <input type="text" id="ctcb-wc-phone-number-display" value="${phoneNumber}" readonly>
                    </div>
                    <div class="ctcb-form-group">
                        <label for="ctcb-wc-message-input">Mensaje:</label>
                        <textarea id="ctcb-wc-message-input" placeholder="Escribe tu mensaje..."></textarea>
                    </div>
                    </div>
                <div id="ctcb-whatsapp-composer-footer">
                     <p id="ctcb-wc-status-message"></p> <button type="button" id="ctcb-wc-cancel-btn" class="ctcb-wc-button-cancel">Cancelar</button>
                    <button type="button" id="ctcb-wc-send-btn" class="ctcb-wc-button-send">Enviar</button>
                </div>
            </div>`;
        document.body.appendChild(ctcb_whatsAppComposerInstance);

        const messageInput = ctcb_whatsAppComposerInstance.querySelector('#ctcb-wc-message-input');
        const sendBtn = ctcb_whatsAppComposerInstance.querySelector('#ctcb-wc-send-btn');
        const statusMessageElement = ctcb_whatsAppComposerInstance.querySelector('#ctcb-wc-status-message');

        ctcb_whatsAppComposerInstance.querySelector('#ctcb-wc-close-btn').addEventListener('click', closeWhatsAppComposer);
        ctcb_whatsAppComposerInstance.querySelector('#ctcb-wc-cancel-btn').addEventListener('click', closeWhatsAppComposer);
        ctcb_whatsAppComposerInstance.addEventListener('click', (e) => {
            if (e.target.id === 'ctcb-whatsapp-composer-overlay') closeWhatsAppComposer();
        });

        sendBtn.addEventListener('click', () => {
            if(statusMessageElement) {
                statusMessageElement.textContent = '';
                statusMessageElement.className = '';
            }

            const mensaje = messageInput.value.trim();
            const destino = phoneNumber ? phoneNumber.replace(/\D/g, '') : '';

            if (!mensaje) {
                 if(statusMessageElement) {
                     statusMessageElement.textContent = "Por favor, escribe un mensaje.";
                     statusMessageElement.className = 'error';
                 } else {
                    alert("Por favor, escribe un mensaje.");
                 }
                return;
            }
            if (!destino || destino.replace('+', '').length < 7) {
                 if(statusMessageElement) {
                     statusMessageElement.textContent = "Número de destino inválido.";
                     statusMessageElement.className = 'error';
                 } else {
                     alert("Número de destino inválido.");
                 }
                 console.error("[CTCBi] Intento de enviar WhatsApp a número inválido:", phoneNumber);
                 return;
            }

            sendBtn.disabled = true;
            sendBtn.textContent = "Enviando...";

            const configKeysForWA = ['ctcb_whatsapp_origen'];
             if (!chrome.runtime || !chrome.runtime.id) {
                if(statusMessageElement) {
                    statusMessageElement.textContent = "Error: Contexto inválido.";
                    statusMessageElement.className = 'error';
                } else {
                    alert("Contexto de extensión inválido. No se puede obtener el origen.");
                }
                sendBtn.disabled = false; sendBtn.textContent = "Enviar";
                return;
            }
            chrome.storage.sync.get(configKeysForWA, function(items) {
                 if (chrome.runtime.lastError) {
                    console.error('[CTCBi] Error al cargar origen WhatsApp:', chrome.runtime.lastError.message);
                     if(statusMessageElement) {
                         statusMessageElement.textContent = 'Error al cargar origen.';
                         statusMessageElement.className = 'error';
                     } else {
                        alert('Error al cargar origen para WhatsApp.');
                     }
                    sendBtn.disabled = false; sendBtn.textContent = "Enviar";
                    return;
                }

                const { ctcb_whatsapp_origen } = items;

                if (!ctcb_whatsapp_origen) {
                     if(statusMessageElement) {
                         statusMessageElement.textContent = "Falta número de origen.";
                         statusMessageElement.className = 'error';
                     } else {
                        alert("Falta el número de origen de WhatsApp en la configuración.");
                         if (chrome.runtime && typeof chrome.runtime.openOptionsPage === 'function') {
                              chrome.runtime.openOptionsPage();
                         } else {
                            const optionsUrl = getSafeIconURL("formulario.html");
                            if(optionsUrl) window.open(optionsUrl, '_blank');
                         }
                     }
                    sendBtn.disabled = false; sendBtn.textContent = "Enviar";
                    return;
                }

                const payload = {
                    origen: ctcb_whatsapp_origen ? ctcb_whatsapp_origen.replace(/\D/g, '') : '',
                    destino: destino,
                    mensaje: mensaje,
                };

                // El manejo de archivos no está implementado actualmente. (Depende de API)

                if (!chrome.runtime || !chrome.runtime.id) {
                    if(statusMessageElement) {
                         statusMessageElement.textContent = "Error de extensión.";
                         statusMessageElement.className = 'error';
                    } else {
                        alert("Contexto de extensión inválido antes de enviar mensaje al SW.");
                    }
                    sendBtn.disabled = false; sendBtn.textContent = "Enviar";
                    return;
                }

                chrome.runtime.sendMessage({ action: "sendWhatsAppViaAPI", payload: payload }, response => {
                    sendBtn.disabled = false;
                    sendBtn.textContent = "Enviar";

                    if (chrome.runtime.lastError) {
                        console.error('[CTCBi] Error SW (WhatsApp API):', chrome.runtime.lastError.message);
                         if(statusMessageElement) {
                             statusMessageElement.textContent = 'Error de comunicación.';
                             statusMessageElement.className = 'error';
                         } else {
                             alert('Error de comunicación con el servicio de la extensión para enviar WhatsApp.');
                         }
                        return;
                    }

                    if (response && response.success) {
                        if(statusMessageElement) {
                             statusMessageElement.textContent = "Mensaje enviado.";
                             statusMessageElement.className = 'success';
                             setTimeout(() => {
                                statusMessageElement.textContent = '';
                                statusMessageElement.className = '';
                             }, 3000);
                        }

                        if (messageInput) {
                            messageInput.value = "";
                            messageInput.focus();
                        }
                    } else {
                         console.error(`[CTCBi] Error al enviar vía API: ${response ? response.error : "Respuesta desconocida."}`);
                         if(statusMessageElement) {
                             statusMessageElement.textContent = `Error al enviar: ${response ? response.error : "Desconocido"}`;
                             statusMessageElement.className = 'error';
                              setTimeout(() => {
                                statusMessageElement.textContent = '';
                                statusMessageElement.className = '';
                             }, 5000);
                         } else {
                            alert(`Error al enviar WhatsApp vía API: ${response ? response.error : "Respuesta desconocida."}`);
                         }
                    }
                });
            });
        });

        if(messageInput) messageInput.focus();

    } catch (e) { console.error('[CTCBi] Error en showWhatsAppComposer:', e); closeWhatsAppComposer(); }
}

function closeWhatsAppComposer() {
    if (ctcb_whatsAppComposerInstance) {
        ctcb_whatsAppComposerInstance.remove();
        ctcb_whatsAppComposerInstance = null;
    }
}

function closeAllModals() {
    closeOptionsModal();
    closeDialPad();
    closeWhatsAppComposer();
    closeInCallUI();
}


// =========================================================================
// 10. LISTENER DE CAMBIOS EN CHROME STORAGE
// =========================================================================

function handleStorageChanges(changes, namespace) {
    try {
        if (namespace === 'sync') {
            if (typeof changes.ctcb_urlList !== 'undefined') {
                 if (ctcb_observer) { ctcb_observer.disconnect(); ctcb_observer = null; }
                 removeInjectedUI(true);
                 ctcb_mainInitialized = false;
                 loadConfigAndInitialize();
            }

            if (typeof changes.ctcb_showFloatingButton !== 'undefined') {
                 const newValue = changes.ctcb_showFloatingButton.newValue;

                 ctcb_isFloatingButtonEnabled = newValue !== undefined ? newValue : true;

                 if (ctcb_mainInitialized && isCurrentUrlAllowed()) {
                      if (ctcb_isFloatingButtonEnabled) {
                          injectDialPadButton();
                      } else {
                          removeFloatingDialPadButton();
                      }
                 }
            }
        }
    } catch (e) {
        console.error('[CTCBi] Error en handleStorageChanges:', e);
    }
}


// =========================================================================
// 11. PUNTO DE ENTRADA DEL SCRIPT Y VERIFICACIÓN DEL DOM
// =========================================================================

let ctcb_script_executed_main = false;

function guardedMain() {
     if (typeof chrome !== "object" || !chrome.runtime || !chrome.runtime.id) {
         console.warn("[CTCBi] Contexto de extensión ya invalidado ANTES de guardedMain. No se puede ejecutar main.");
         ctcb_script_executed_main = true;
         return;
     }

    if (!ctcb_script_executed_main) {
        ctcb_script_executed_main = true;
        main();
    }
}

function main() {
    ctcb_mainInitialized = false;
    loadConfigAndInitialize();

    if(ctcb_listenerStorageChanges && chrome.storage && chrome.storage.onChanged && chrome.storage.onChanged.hasListener(ctcb_listenerStorageChanges)) {
        chrome.storage.onChanged.removeListener(ctcb_listenerStorageChanges);
    }
    ctcb_listenerStorageChanges = handleStorageChanges;
    if (chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener(ctcb_listenerStorageChanges);
    } else {
        console.warn("[CTCBi] chrome.storage.onChanged no disponible. Los cambios en configuración no se detectarán automáticamente.");
        ctcb_listenerStorageChanges = null;
    }
}

// =========================================================================
// 12. VERIFICAR ESTADO DEL DOM Y EJECUTAR EL PUNTO DE ENTRADA
// =========================================================================

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", guardedMain, { once: true });
} else {
    guardedMain();
}