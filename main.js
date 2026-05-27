// ==========================================
// MAIN.JS - IGNITION SEQUENCE (V38)
// ==========================================

// Wait for the HTML structure to fully render before firing the engine
document.addEventListener("DOMContentLoaded", () => {
    
    // Verify that the modular architecture loaded successfully
    if (window.db && typeof window.db.loadState === 'function') {
        console.log("Crew Wallet V38: Modules linked. Igniting database...");
        
        // Boot the vault, migrate data, and trigger the UI
        window.db.loadState();
        
    } else {
        // Fallback fail-safe if a script fails to load over a bad connection
        console.error("CRITICAL ERROR: Core modules failed to link.");
        let errorMsg = document.createElement("div");
        errorMsg.style.cssText = "color: var(--danger); text-align: center; padding: 40px; font-weight: bold; background: var(--bg-color); height: 100vh;";
        errorMsg.innerHTML = "⚠️ CRITICAL SYSTEM ERROR<br><br>The core logic modules failed to load. Please force close the app, ensure you have an internet connection, and reopen to refresh the Service Worker cache.";
        document.body.innerHTML = "";
        document.body.appendChild(errorMsg);
    }
});
