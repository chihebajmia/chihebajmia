// ==========================================
// DB.JS - STANDARD VAULT (V42)
// ==========================================

window.s = null;
const DB_NAME = 'CrewWalletDB';
const STORE_NAME = 'stateStore';

window.db = {
    initDB: function() {
        return new Promise((resolve, reject) => {
            let request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = (e) => {
                let database = e.target.result;
                if (!database.objectStoreNames.contains(STORE_NAME)) {
                    database.createObjectStore(STORE_NAME);
                }
            };
            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = (e) => reject(e.target.error);
        });
    },

    loadState: async function() {
        try {
            let database = await this.initDB();
            let tx = database.transaction(STORE_NAME, 'readonly');
            let store = tx.objectStore(STORE_NAME);
            let request = store.get('master_data');
            request.onsuccess = () => {
                if (request.result) { 
                    window.s = JSON.parse(request.result); 
                    window.engine.renderApp(); 
                } else { 
                    this.fallbackLoad(); 
                }
            };
            request.onerror = () => this.fallbackLoad();
        } catch (e) { this.fallbackLoad(); }
    },

    fallbackLoad: function() {
        // Pre-configured payload mapped to your specific timeline and goals
        window.s = { 
            "vault": { "ibkr": 0, "brightwell": 0, "wise": 0, "cash_usd": 0, "cash_tnd": 0, "savings": 0, "ibkr_cash": 0, "ibkr_shares": 0, "ibkr_cost": 0, "ibkr_price": 0, "lifetime_fees": 0 }, 
            "loan": { "arrears": 0, "overdraft": 0, "rate": 13.5, "schedule": [], "targetDate": "2026-11", "last_interest_ts": Date.now() }, 
            "ious": { "payables": [], "receivables": [] }, 
            "history": { "vacation": { "archive": [], "current": [], "limit": 49 }, "onboard": { "archive": [], "current": [], "limit": 7.25 } }, 
            "mode": "vacation", 
            "fx_rate": 2.923, 
            "capital_saved_tnd": 0,
            "capital_saved_usd": 0,
            "projects": { 
                "envelopes": {}, 
                "missions": {
                    "p_infra": { "name": "🎯 Port Infrastructure Tender Report", "spent": 0, "dead": 0, "hasLogistics": false, "archived": false, "bypass": false, "currency": "TND" }
                }, 
                "goals": [
                    { "id": 1, "name": "🏆 Used Toyota RAV4 Fund", "target": 50000, "saved": 0, "archived": false, "currency": "TND" }
                ] 
            }, 
            "settings": { "contractStart": "2026-08-03", "contractEnd": "2027-02-01", "vacationStart": "2026-05-15", "vacationEnd": "2026-08-02", "pin": "" }, 
            "vape_stash": { "count": 0, "empty_logs": [] }, 
            "custom_categories": ["⛽ Car Fuel", "📱 Telecommunications", "🚢 Visa & Seaman Docs"], 
            "income_logs": [], 
            "ledger": [] 
        };
        window.engine.renderApp();
    },

    forceSaveState: async function() {
        let dataStr = JSON.stringify(window.s);
        try {
            let database = await this.initDB();
            let tx = database.transaction(STORE_NAME, 'readwrite');
            let store = tx.objectStore(STORE_NAME);
            store.put(dataStr, 'master_data');
        } catch (e) { console.error("DB Save failed", e); }
    },

    saveState: async function() {
        await this.forceSaveState();
        if(window.engine) window.engine.renderApp(); 
    },

    logTransaction: function(type, amount, currency, wallet, details) {
        if(!window.s.ledger) window.s.ledger = [];
        window.s.ledger.push({ id: Date.now(), type, amount, currency, wallet, details, mode: window.s.mode, timestamp: Date.now() });
        this.forceSaveState();
    }
};
