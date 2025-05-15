chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    if (request.action === "makeCallViaServiceWorker") {
        // Lógica de llamadas (voz)
        const numberToCallForAPI = request.number;
        let callConfigUsed = {};
        const configKeys = ['ctcb_domain', 'ctcb_id', 'ctcb_token', 'ctcb_userId', 'ctcb_apiType'];
        chrome.storage.sync.get(configKeys, function(items) {
            if (chrome.runtime.lastError) {
                console.error('[CTCBi SW] Error al cargar config de voz:', chrome.runtime.lastError.message);
                sendResponse({ success: false, error: 'Error al cargar config de llamadas.' });
                return;
            }
            const { ctcb_domain, ctcb_id, ctcb_token, ctcb_userId, ctcb_apiType } = items;
            callConfigUsed = items;
            if (!ctcb_domain || !ctcb_id || !ctcb_token || !ctcb_userId || !ctcb_apiType) {
                 console.warn('[CTCBi SW] Faltan datos de config de llamadas:', items);
                 sendResponse({ success: false, error: 'Faltan datos de configuración de llamadas.', needsConfig: true });
                 return;
            }
            let callUrl = "";
            const domainFromConfig = ctcb_domain.trim() || "";
            const idFromConfig = ctcb_id.trim() || "";
            const tokenFromConfig = ctcb_token.trim() || "";
            const userIdFromConfig = ctcb_userId.trim() || "";

            let numberEncodedForParam = encodeURIComponent(numberToCallForAPI);
            numberEncodedForParam = numberEncodedForParam.replace(/%2B/g, '+');

            let domainWithProtocol = domainFromConfig;
            if (!domainWithProtocol.startsWith('http://') && !domainWithProtocol.startsWith('https://')) { domainWithProtocol = 'https://' + domainWithProtocol; }
            domainWithProtocol = domainWithProtocol.replace(/\/+$/, "");

            if (ctcb_apiType === 'vozipcenter') {
                callUrl = `${domainWithProtocol}/api/${idFromConfig}/${tokenFromConfig}/newcall.json?user_id=${userIdFromConfig}&remoto=${numberEncodedForParam}`;
            } else if (ctcb_apiType === 'rm') {
                callUrl = `${domainWithProtocol}/WSCentralita/json/RealizarLlamada/idCliente=${idFromConfig}&token=${tokenFromConfig}&llamado=${numberEncodedForParam}&llamante=${userIdFromConfig}`;
            } else {
                console.error('[CTCBi SW] Tipo de API de llamadas no reconocido:', ctcb_apiType);
                sendResponse({ success: false, error: `Tipo API de llamadas desconocido: ${ctcb_apiType}.` });
                return;
            }


            if (callUrl) {
                fetch(callUrl)
                    .then(response => {
                        if (!response.ok) {
                            return response.text().then(text => {
                                console.error(`[CTCBi SW] Error Llamada API ${response.status}. Cuerpo:`, text);
                                throw new Error(`Error API Llamada: ${response.status} ${response.statusText}. Det: ${text.substring(0,150)}`);
                            });
                        }
                        return response.text();
                    })
                    .then(data => {
                        sendResponse({ success: true, data: data, callConfig: callConfigUsed, calledNumber: numberToCallForAPI });
                    })
                    .catch(error => {
                        console.error('[CTCBi SW] Error en fetch de Llamada API:', error);
                        sendResponse({ success: false, error: error.message });
                    });
            } else {
                sendResponse({ success: false, error: 'URL de llamada vacía.' });
            }
        });
        return true;

    } else if (request.action === "hangupCall") {
        // Lógica para colgar llamadas (voz)
        const numberToHangup = request.number;
        const configKeysHangup = ['ctcb_domain', 'ctcb_id', 'ctcb_token', 'ctcb_userId', 'ctcb_apiType'];
         chrome.storage.sync.get(configKeysHangup, function(items) {
            if (chrome.runtime.lastError) {
                console.error('[CTCBi SW] Error al cargar config de voz para colgar:', chrome.runtime.lastError.message);
                sendResponse({ success: false, error: 'Error al cargar config para colgar.' });
                return;
            }
            const { ctcb_domain, ctcb_id, ctcb_token, ctcb_userId, ctcb_apiType } = items;

            if (!ctcb_domain || !ctcb_id || !ctcb_token || !ctcb_userId || !ctcb_apiType) {
                 console.warn('[CTCBi SW] Faltan datos de config de llamadas para colgar:', items);
                 sendResponse({ success: false, error: 'Faltan datos de configuración para colgar.' });
                 return;
            }

            let hangupUrl = "";
            const domainFromConfig = ctcb_domain.trim() || "";
            const idForHangup = ctcb_id.trim() || "";
            const tokenFromConfig = ctcb_token.trim() || "";
            const userIdFromConfig = ctcb_userId.trim() || "";

            let numberEncodedForParam = encodeURIComponent(numberToHangup);
            numberEncodedForParam = numberEncodedForParam.replace(/%2B/g, '+');


            let domainWithProtocol = domainFromConfig;
            if (!domainWithProtocol.startsWith('http://') && !domainWithProtocol.startsWith('https://')) { domainWithProtocol = 'https://' + domainWithProtocol; }
            domainWithProtocol = domainWithProtocol.replace(/\/+$/, "");

            if (ctcb_apiType === 'vozipcenter') {
                hangupUrl = `${domainWithProtocol}/api/${idForHangup}/${tokenFromConfig}/hangcall.json?user_id=${userIdFromConfig}&remoto=${numberEncodedForParam}`;
            } else if (ctcb_apiType === 'rm') {
                hangupUrl = `${domainWithProtocol}/WSCentralita/json/ColgarLlamada/idCliente=${idForHangup}&token=${tokenFromConfig}&llamado=${numberEncodedForParam}&llamante=${userIdFromConfig}`;
            } else {
                 console.error('[CTCBi SW] Tipo de API de llamadas no reconocido para colgar:', ctcb_apiType);
                sendResponse({ success: false, error: `Tipo API de llamadas desconocido para colgar: ${ctcb_apiType}.`});
                return;
            }

            if (hangupUrl) {
                fetch(hangupUrl)
                    .then(response => {
                         if (!response.ok) {
                            return response.text().then(text => {
                                console.error(`[CTCBi SW] Error Colgar API ${response.status}. Cuerpo:`, text);
                                throw new Error(`Error API colgar: ${response.status} ${response.statusText}. Det: ${text.substring(0,150)}`);
                            });
                        }
                        return response.text();
                    })
                    .then(data => {
                        sendResponse({ success: true, data: data });
                    })
                    .catch(error => {
                        console.error('[CTCBi SW] Error en fetch de Colgar API:', error);
                        sendResponse({ success: false, error: error.message });
                    });
            } else {
                sendResponse({ success: false, error: 'URL de colgar vacía.' });
            }
        });
        return true;

    } else if (request.action === "sendWhatsAppViaAPI") {
        // Lógica para enviar mensajes de WhatsApp
        const { origen, destino, mensaje } = request.payload;

        const configKeysWA = ['ctcb_whatsapp_domain', 'ctcb_whatsapp_id', 'ctcb_whatsapp_token', 'ctcb_whatsapp_origen'];
        chrome.storage.sync.get(configKeysWA, function(items) {
             if (chrome.runtime.lastError) {
                console.error('[CTCBi SW] Error al cargar config de WhatsApp en SW:', chrome.runtime.lastError.message);
                sendResponse({ success: false, error: 'Error al cargar config de WhatsApp en background.' });
                return;
            }

            const { ctcb_whatsapp_domain, ctcb_whatsapp_id, ctcb_whatsapp_token } = items;

            if (!ctcb_whatsapp_domain || !ctcb_whatsapp_id || !ctcb_whatsapp_token || !origen || !destino || mensaje === undefined) {
                 console.warn('[CTCBi SW] Faltan datos para enviar WhatsApp vía API (después de cargar config de WA):', {
                     domain: ctcb_whatsapp_domain,
                     id: ctcb_whatsapp_id,
                     token: ctcb_whatsapp_token,
                     origen_payload: origen,
                     destino_payload: destino,
                     mensaje_payload: mensaje
                 });
                 sendResponse({ success: false, error: 'Faltan datos de configuración de WhatsApp o del mensaje.' });
                 return;
            }

            let domainWA = ctcb_whatsapp_domain.trim();
            // Construir la URL del endpoint de WhatsApp API
            if (!domainWA.includes('.') && !domainWA.startsWith('http')) {
                 domainWA = `https://${domainWA}.vozipcenter.com`;
            } else if (!domainWA.startsWith('http')) {
                domainWA = `https://${domainWA}`;
            }
            domainWA = domainWA.replace(/\/+$/, "");

            const idNumberWA = ctcb_whatsapp_id.trim();
            const tokenWA = ctcb_whatsapp_token.trim();

            const endpointUrl = `${domainWA}/api/${idNumberWA}/${tokenWA}/WAenvio`;

            const bodyPayload = {
                origen: origen.replace(/\D/g, ''),
                destino: destino.replace(/\D/g, ''),
                mensaje: mensaje
                // No incluir archivo aquí a menos que la API lo soporte en este endpoint y formato. (Envio de achivos necesario configurar para cada API)
            };


            fetch(endpointUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyPayload)
            })
            .then(response => {
                if (!response.ok) {
                    return response.text().then(text => {
                        console.error(`[CTCBi SW] Error WhatsApp API ${response.status}. Cuerpo:`, text);
                        throw new Error(`Error API WhatsApp: ${response.status} ${response.statusText}. Det: ${text.substring(0,100)}`);
                    });
                }
                return response.json().catch(() => response.text());
            })
            .then(data => {
                 if (typeof data === 'object' && data !== null && data.status === -1) {
                     sendResponse({ success: false, error: data.msg || 'Error desconocido en respuesta API WhatsApp.', apiResponse: data });
                 } else {
                      sendResponse({ success: true, data: data });
                 }
            })
            .catch(error => {
                console.error('[CTCBi SW] Error en fetch de WhatsApp API:', error);
                sendResponse({ success: false, error: error.message });
            });
        });
        return true;

    }
     console.warn('[CTCBi SW] Acción no manejada:', request.action);
});

chrome.runtime.onInstalled.addListener(details => {
    if (details.reason === "install") {}
    else if (details.reason === "update") {}
});