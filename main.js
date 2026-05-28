// ==========================================
// MAIN.JS - IGNITION SEQUENCE (V42)
// ==========================================

// Wait for the HTML structure to fully render before firing the engine
document.addEventListener("DOMContentLoaded", () => {
    if (window.db && typeof window.db.loadState === 'function') {
        console.log("Crew Wallet V42: Modules linked. Igniting database...");
        window.db.loadState();
    } else {
        console.error("CRITICAL ERROR: Core modules failed to link.");
        let errorMsg = document.createElement("div");
        errorMsg.style.cssText = "color: #f87171; text-align: center; padding: 40px; font-weight: bold; background: #0f172a; height: 100vh;";
        errorMsg.innerHTML = "⚠️ SYSTEM ERROR<br><br>The core modules failed to load. Please force close the app and reopen.";
        document.body.innerHTML = "";
        document.body.appendChild(errorMsg);
    }
});
