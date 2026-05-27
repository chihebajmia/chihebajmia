// ==========================================
// DB.JS - CREW WALLET MASTER VAULT (V39)
// ==========================================

window.s = null; 

const DB_NAME = 'CrewWalletDB';
const STORE_NAME = 'stateStore';

const USER_PRISTINE_DATA = {
    "vault": { "ibkr": 0, "brightwell": 0, "wise": 0, "cash_usd": 0, "cash_tnd": 0, "savings": 0, "ibkr_fees": 0, "lifetime_fees": 0, "ibkr_cash": 0, "ibkr_shares": 0, "ibkr_cost": 0, "ibkr_price": 0 },
    "loan": {
        "arrears": 18746.54, "overdraft": 516.00, "rate": 13.5, "last_interest_ts": Date.now(), "targetDate": "",
        "schedule": [
            { "id": 1, "date": "May 31, 2026", "amount": 1010, "paid": false }, { "id": 2, "date": "Jun 30, 2026", "amount": 1010, "paid": false },
            { "id": 3, "date": "Jul 31, 2026", "amount": 1010, "paid": false }, { "id": 4, "date": "Aug 31, 2026", "amount": 1010, "paid": false },
            { "id": 5, "date": "Sep 30, 2026", "amount": 1010, "paid": false }, { "id": 6, "date": "Oct 31, 2026", "amount": 1010, "paid": false },
            { "id": 7, "date": "Nov 30, 2026", "amount": 1010, "paid": false }
        ]
    },
    "ious": { "payables": [], "receivables": [] },
    "history": { "vacation": { "archive": [], "current": [], "limit": 35, "balance": 35 }, "onboard": { "archive": [], "current": [], "limit": 7.25, "balance": 7.25 } },
    "capital_saved_tnd": 0, "capital_saved_usd": 0, "fx_rate": 2.923, "mode": "vacation", "income_logs": [],
    "projects": { "envelopes": {}, "missions": {}, "goals": [] },
    "settings": { "contractStart": "", "contractEnd": "", "vacationStart": "", "vacationEnd": "", "pin": "" },
    "vape_stash": { "count": 0, "empty_logs": [] }, "custom_categories": [], "ledger": [] 
};

window.db = {
    initDB: function() {
        return new Promise((resolve, reject) => {
            let request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = (e) => { let database = e.target.result; if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME); };
            request.onsuccess = (e) => resolve(e.target.result); request.onerror = (e) => reject(e.target.error);
        });
    },

    loadState: async function() {
        try {
            let database = await this.initDB();
            let tx = database.transaction(STORE_NAME, 'readonly');
            let store = tx.objectStore(STORE_NAME);
            let request = store.get('master_data');
            request.onsuccess = () => { if (request.result) { window.s = JSON.parse(request.result); this.migrateData(); } else this.fallbackLoad(); };
            request.onerror = () => this.fallbackLoad();
        } catch (e) { this.fallbackLoad(); }
    },

    fallbackLoad: function() {
        try { window.s = JSON.parse(localStorage.getItem('CrewWalletMaster')); } catch(e) {}
        this.migrateData();
    },

    migrateData: async function() {
        if (!window.s || !window.s.vault || !window.s.history) window.s = USER_PRISTINE_DATA;
        
        // V39 Backup Corruption Fail-Safe: Force restructuring of old history objects
        if (!window.s.history.vacation || !window.s.history.onboard) {
            console.warn("Old backup detected. Rebuilding history object.");
            window.s.history = USER_PRISTINE_DATA.history;
        }

        if (!window.s.projects) window.s.projects = USER_PRISTINE_DATA.projects;
        if (!window.s.projects.envelopes) window.s.projects.envelopes = {};
        if (!window.s.projects.missions) window.s.projects.missions = {};
        if (!window.s.projects.goals) window.s.projects.goals = [];
        if (!window.s.income_logs) window.s.income_logs = [];
        if (!window.s.fx_rate || isNaN(window.s.fx_rate)) window.s.fx_rate = 2.923;
        if (!window.s.settings) window.s.settings = USER_PRISTINE_DATA.settings;
        if (!window.s.vape_stash) window.s.vape_stash = {"count":0, "empty_logs":[]};
        if (!window.s.vape_stash.empty_logs) window.s.vape_stash.empty_logs = []; 
        if (!window.s.custom_categories) window.s.custom_categories = [];
        if (!window.s.ledger) window.s.ledger = []; 
        if (window.s.settings.vacationStart === undefined) window.s.settings.vacationStart = "";
        if (window.s.settings.vacationEnd === undefined) window.s.settings.vacationEnd = "";

        if (window.s.capital_saved_tnd === undefined) {
            window.s.capital_saved_tnd = (window.s.capital_saved !== undefined) ? window.s.capital_saved : 0;
            window.s.capital_saved_usd = 0; delete window.s.capital_saved;
        }

        if(window.s.vault.ibkr_cash === undefined) window.s.vault.ibkr_cash = window.s.vault.ibkr || 0;
        if(window.s.vault.ibkr_shares === undefined) window.s.vault.ibkr_shares = 0;
        if(window.s.vault.ibkr_cost === undefined) window.s.vault.ibkr_cost = 0;
        if(window.s.vault.ibkr_price === undefined) window.s.vault.ibkr_price = 805.79;

        if (window.s.settings.pin && window.s.settings.pin.length === 4 && window.engine) {
            window.s.settings.pin = await window.engine.hashPin(window.s.settings.pin);
            await this.forceSaveState();
        }

        if (!window.s.loan.overdraft) window.s.loan.overdraft = 0;
        if (!window.s.loan.last_interest_ts) window.s.loan.last_interest_ts = Date.now();
        if (window.s.loan.targetDate === undefined) window.s.loan.targetDate = "";
        
        if (!window.s.loan.schedule || window.s.loan.schedule.length === 0) {
            window.s.loan.schedule = USER_PRISTINE_DATA.loan.schedule;
            window.s.loan.arrears = 18746.54; window.s.loan.rate = 13.5; window.s.loan.overdraft = 516.00;
        }

        Object.keys(window.s.projects.envelopes).forEach(k => { 
            if(window.s.projects.envelopes[k].archived === undefined) window.s.projects.envelopes[k].archived = false; 
            if(window.s.projects.envelopes[k].bypass === undefined) window.s.projects.envelopes[k].bypass = true;
            if(!window.s.projects.envelopes[k].currency) window.s.projects.envelopes[k].currency = 'TND';
        });
        Object.keys(window.s.projects.missions).forEach(k => { 
            if(window.s.projects.missions[k].archived === undefined) window.s.projects.missions[k].archived = false; 
            if(window.s.projects.missions[k].bypass === undefined) window.s.projects.missions[k].bypass = false;
            if(!window.s.projects.missions[k].currency) window.s.projects.missions[k].currency = 'TND';
        });
        window.s.projects.goals.forEach(g => { if(!g.currency) g.currency = 'TND'; });

        if(window.engine) { window.engine.processInterestBleed(); window.engine.processVacationArrears(); }
        if(window.ui) window.ui.checkLock();
    },

    forceSaveState: async function() {
        let dataStr = JSON.stringify(window.s); localStorage.setItem('CrewWalletMaster', dataStr); 
        try { let database = await this.initDB(); let tx = database.transaction(STORE_NAME, 'readwrite'); let store = tx.objectStore(STORE_NAME); store.put(dataStr, 'master_data'); } catch (e) {}
    },

    saveState: async function() { await this.forceSaveState(); if(window.engine) window.engine.renderApp(); },

    logTransaction: function(type, amount, currency, wallet, details) {
        if(!window.s.ledger) window.s.ledger = [];
        window.s.ledger.push({ id: Date.now(), type: type, amount: amount, currency: currency, wallet: wallet, details: details, mode: window.s.mode, fxRate: window.s.fx_rate, timestamp: Date.now() });
        if(window.s.ledger.length > 500) window.s.ledger.shift();
        this.forceSaveState();
    }
};
