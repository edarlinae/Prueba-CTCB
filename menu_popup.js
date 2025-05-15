document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('open-url-setup').addEventListener('click', function() {
        chrome.storage.local.set({ ctcb_show_section: 'urls' }, function() {
            if (chrome.runtime.lastError) {
                console.error("Error al guardar ctcb_show_section:", chrome.runtime.lastError);
            } else {
                chrome.runtime.openOptionsPage();
            }
        });
    });

    document.getElementById('open-voice-setup').addEventListener('click', function() {
        chrome.storage.local.set({ ctcb_show_section: 'voice' }, function() {
            if (chrome.runtime.lastError) {
                console.error("Error al guardar ctcb_show_section:", chrome.runtime.lastError);
            } else {
                chrome.runtime.openOptionsPage();
            }
        });
    });

    document.getElementById('open-whatsapp-setup').addEventListener('click', function() {
        chrome.storage.local.set({ ctcb_show_section: 'whatsapp' }, function() {
            if (chrome.runtime.lastError) {
                console.error("Error al guardar ctcb_show_section:", chrome.runtime.lastError);
            } else {
                chrome.runtime.openOptionsPage();
            }
        });
    });
});