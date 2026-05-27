// ==========================================
// UI.JS - INTERFACE CONTROLLER (V38)
// ==========================================

window.ui = {
    resolvePrompt: null,
    resolveConfirm: null,
    pinBuffer: "",
    bioAttempts: 0,
    lastActive: Date.now(),
    isLocked: false,
    hasBiometricsEnabled: localStorage.getItem('cw_bio_enabled') === 'true',

    checkLock: function() {
        if (!window.s.settings.pin || window.s.settings.pin === "") { this.unlockApp(); return; }
        this.isLocked = true;
        document.getElementById('appLockScreen').style.display = 'flex';
        document.getElementById('appWrapper').style.display = 'none';
        
        if (this.hasBiometricsEnabled) {
            document.getElementById('btnTriggerBio').style.display = 'block';
            this.triggerBiometrics();
        } else {
            document.getElementById('btnTriggerBio').style.display = 'none';
            this.showPinPad();
        }
    },

    registerFaceID: async function() {
        if (!window.PublicKeyCredential) { await this.openUConfirm("Error", "Biometrics not supported on this device."); return; }
        try {
            const challenge = new Uint8Array(32); crypto.getRandomValues(challenge);
            const userID = new Uint8Array(16); crypto.getRandomValues(userID);
            const credential = await navigator.credentials.create({
                publicKey: {
                    challenge: challenge,
                    rp: { name: "Crew Wallet Master", id: window.location.hostname },
                    user: { id: userID, name: "owner", displayName: "Owner" },
                    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
                    authenticatorSelection: { userVerification: "required" },
                    timeout: 60000
                }
            });
            if (credential) {
                localStorage.setItem('cw_bio_enabled', 'true');
                this.hasBiometricsEnabled = true;
                await this.openUConfirm("Success", "FaceID / TouchID registered successfully.");
            }
        } catch (err) {
            await this.openUConfirm("Error", "Biometric registration failed or was cancelled.");
        }
    },

    triggerBiometrics: async function() {
        if (!window.PublicKeyCredential || !this.hasBiometricsEnabled) { this.showPinPad(); return; }
        try {
            const challenge = new Uint8Array(32); crypto.getRandomValues(challenge);
            const credential = await navigator.credentials.get({
                publicKey: { challenge: challenge, rpId: window.location.hostname, userVerification: "required", timeout: 60000 }
            });
            if (credential) this.unlockApp();
        } catch (err) {
            this.bioAttempts++;
            if (this.bioAttempts >= 3) { this.showPinPad(); } 
            else { document.getElementById('lockMessage').innerText = `FaceID Failed. Attempts: ${this.bioAttempts}/3`; document.getElementById('lockMessage').style.color = "var(--danger)"; }
        }
    },

    showPinPad: function() {
        document.getElementById('lockMessage').innerText = "Enter PIN to unlock.";
        document.getElementById('lockMessage').style.color = "var(--warning)";
        document.getElementById('pinPad').style.display = "grid";
        document.getElementById('pinDots').style.display = "flex";
    },

    enterPin: async function(num) {
        if(this.pinBuffer.length < 4) this.pinBuffer += num;
        this.updatePinDots();
        if(this.pinBuffer.length === 4) {
            let hashed = await window.engine.hashPin(this.pinBuffer);
            if(hashed === window.s.settings.pin) this.unlockApp();
            else {
                document.getElementById('lockMessage').innerText = "Incorrect PIN. Try again.";
                document.getElementById('lockMessage').style.color = "var(--danger)";
                this.pinBuffer = "";
                setTimeout(() => this.updatePinDots(), 300);
            }
        }
    },

    clearPin: function() { if(this.pinBuffer.length > 0) this.pinBuffer = this.pinBuffer.slice(0, -1); this.updatePinDots(); },
    
    updatePinDots: function() {
        let dots = document.querySelectorAll('.pin-dot');
        dots.forEach((dot, idx) => { if(idx < this.pinBuffer.length) dot.classList.add('filled'); else dot.classList.remove('filled'); });
    },

    unlockApp: function() {
        this.isLocked = false; this.pinBuffer = ""; this.bioAttempts = 0;
        document.getElementById('appLockScreen').style.display = 'none';
        document.getElementById('appWrapper').style.display = 'flex';
        this.lastActive = Date.now();
        if(window.engine) window.engine.renderApp();
    },

    switchTab: function(tabId) {
        document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
        document.getElementById('tab-' + tabId).classList.add('active');
        document.getElementById('nav-' + tabId).classList.add('active');
        
        if(tabId === 'dash') window.engine.calculateBehavioralStreaks();
        if(tabId === 'analytics') { window.engine.renderChart(30); window.engine.renderProjects(); window.engine.renderLeaderboard(); window.engine.renderVapeStats(); }
        if(tabId === 'time') { window.engine.loadPastDay(); window.engine.renderIncomeLogs(); document.getElementById('tmSearch').value = ''; window.engine.searchLogs(); }
        if(tabId === 'settings') window.engine.populateSettings();
    },

    applyTheme: function() {
        if(window.s.mode === 'vacation') document.documentElement.style.setProperty('--accent', '#fbbf24');
        else document.documentElement.style.setProperty('--accent', '#38bdf8');
    },

    populateCategories: function() {
        let html = '';
        let allCats = ["Coffee & Drinks", "Dining & Lifestyle", "Groceries & Essentials", "Transit & Travel", "Utilities & Tech", "Clothing & Gear", "Home Improvement", "💨 Vape", "🏦 Financial & Fees"].concat(window.s.custom_categories || []);
        allCats.forEach(c => html += `<option value="${c}">${c}</option>`);
        html += `<option value="ADD_NEW">➕ Add New Category...</option>`;
        document.getElementById('advCategory').innerHTML = html;
        document.getElementById('tmCategory').innerHTML = html;
    },

    handleCategoryChange: async function(selectId) {
        let select = document.getElementById(selectId);
        if (select.value === 'ADD_NEW') {
            let newCat = await this.openUPrompt("New Category", "Enter name (e.g. ⛽ Car Fuel):");
            if (newCat && newCat.trim() !== '') {
                window.s.custom_categories.push(newCat.trim());
                window.db.saveState(); this.populateCategories();
                select.value = newCat.trim();
            } else { select.selectedIndex = 0; }
        }
        this.checkVapeField(selectId === 'advCategory' ? 'adv' : 'tm');
    },

    manageCategories: async function() {
        if(window.s.custom_categories.length === 0) { await this.openUConfirm("Notice", "You have no custom categories."); return; }
        let menuStr = "Type the number to delete:\n";
        window.s.custom_categories.forEach((c, i) => menuStr += `${i+1}: ${c}\n`);
        let ans = await this.openUPrompt("Manage Categories", menuStr);
        let idx = parseInt(ans) - 1;
        if (!isNaN(idx) && idx >= 0 && idx < window.s.custom_categories.length) {
            let ok = await this.openUConfirm("Delete", `Delete '${window.s.custom_categories[idx]}'? Past logs will retain the text, but it won't appear in dropdowns.`);
            if (ok) { window.s.custom_categories.splice(idx, 1); window.db.saveState(); this.populateCategories(); }
        }
    },

    populateProjectDropdowns: function() {
        let html = `<option value="none">📌 General Daily Spend (No Project)</option>`;
        let actEnv = [], archEnv = [], actMis = [], archMis = [];
        Object.keys(window.s.projects.envelopes).forEach(k => { if(window.s.projects.envelopes[k].archived) archEnv.push(k); else actEnv.push(k); });
        Object.keys(window.s.projects.missions).forEach(k => { if(window.s.projects.missions[k].archived) archMis.push(k); else actMis.push(k); });

        if(actEnv.length > 0) { html += `<optgroup label="Active Envelopes">`; actEnv.forEach(k => html += `<option value="env_${k}">${window.s.projects.envelopes[k].name}</option>`); html += `</optgroup>`; }
        if(actMis.length > 0) { html += `<optgroup label="Active Missions">`; actMis.forEach(k => html += `<option value="mis_${k}">${window.s.projects.missions[k].name}</option>`); html += `</optgroup>`; }
        if(archEnv.length > 0) { html += `<optgroup label="Archived Envelopes">`; archEnv.forEach(k => html += `<option value="env_${k}">[Archived] ${window.s.projects.envelopes[k].name}</option>`); html += `</optgroup>`; }
        if(archMis.length > 0) { html += `<optgroup label="Archived Missions">`; archMis.forEach(k => html += `<option value="mis_${k}">[Archived] ${window.s.projects.missions[k].name}</option>`); html += `</optgroup>`; }

        document.getElementById('advProject').innerHTML = html; document.getElementById('tmProject').innerHTML = html;
    },

    checkVapeField: function(prefix) {
        let cat = document.getElementById(prefix + 'Category').value;
        let box = document.getElementById(prefix + 'VapeQtyBox');
        if (cat === '💨 Vape') box.style.display = 'block'; else box.style.display = 'none';
    },

    toggleOnlineFields: function(prefix) { 
        let val = document.getElementById(prefix + 'Project').value; let show = false; 
        if(val.startsWith('mis_')) { let key = val.replace('mis_', ''); if(window.s.projects.missions[key] && window.s.projects.missions[key].hasLogistics) show = true; } 
        document.getElementById(prefix + 'OnlineBox').style.display = show ? 'flex' : 'none'; 
    },

    toggleFXOverride: function(prefix) {
        try {
            let costField = document.getElementById(prefix === 'adv' ? 'customAmount' : 'tmAmount'); let cost = parseFloat(costField.value) || 0;
            let walletSelect = document.getElementById(prefix + 'SourceWallet'); let wallet = walletSelect ? walletSelect.value : 'default';
            let m = prefix === 'tm' ? document.getElementById('setMode').value : window.s.mode;
            let targetWallet = m === 'vacation' ? 'cash_tnd' : 'cash_usd'; if (wallet !== 'default') targetWallet = wallet;
            let isTargetUSD = ['brightwell', 'wise', 'cash_usd', 'ibkr_cash'].includes(targetWallet);
            let box = document.getElementById(prefix + 'FXOverrideBox'); let input = document.getElementById(prefix + 'ActualDeduct');
            if (!box || !input) return;
            let isMismatch = (m === 'vacation' && isTargetUSD) || (m === 'onboard' && !isTargetUSD);
            if (isMismatch) { box.style.display = 'flex'; let est = m === 'vacation' ? cost / window.s.fx_rate : cost * window.s.fx_rate; if(cost > 0) input.placeholder = `Est: ${est.toFixed(2)}`; else input.placeholder = "Exact bank charge"; } else { box.style.display = 'none'; input.value = ''; }
        } catch (error) {}
    },

    openAddProjectModal: function(type) { 
        document.getElementById('npType').value = type; document.getElementById('npName').value = ''; document.getElementById('npLimit').value = ''; document.getElementById('npCurrency').value = window.s.mode === 'vacation' ? 'TND' : 'USD'; 
        this.toggleProjectFields(); document.getElementById('addProjectModal').style.display = 'flex'; 
    },

    toggleProjectFields: function() {
        let type = document.getElementById('npType').value; document.getElementById('npOptions').style.display = (type === 'goal') ? 'none' : 'block'; document.getElementById('npLogisticsBox').style.display = (type === 'mis') ? 'flex' : 'none';
        if (type === 'env') { document.getElementById('npLimit').placeholder = "Total Budget Limit"; document.getElementById('npBypass').checked = true; } 
        else if (type === 'mis') { document.getElementById('npLimit').placeholder = "Estimated Cap (Optional)"; document.getElementById('npBypass').checked = false; } 
        else { document.getElementById('npLimit').placeholder = "Target Goal Amount"; }
    },

    openTransferModal: function() { document.getElementById('trfAmount').value = ''; document.getElementById('transferModal').style.display = 'flex'; },
    
    openPaycheckModal: function() { 
        document.getElementById('pwGross').value = ''; 
        document.getElementById('pwLoanAmt').value = ''; 
        document.getElementById('pwSavAmt').value = ''; 
        document.getElementById('pwOpAmt').value = ''; 
        document.getElementById('pwLoanPct').value = 40; 
        document.getElementById('pwSavPct').value = 15; 
        document.getElementById('pwOpPct').value = 45; 
        document.getElementById('paycheckModal').style.display = 'flex'; 
    },

    calcPaycheck: function(mode, target) { 
        let gross = parseFloat(document.getElementById('pwGross').value) || 0; 
        if(gross <= 0) return;

        if (mode === 'gross') {
            let pLoan = parseFloat(document.getElementById('pwLoanPct').value) || 0; 
            let pSav = parseFloat(document.getElementById('pwSavPct').value) || 0; 
            let pOp = parseFloat(document.getElementById('pwOpPct').value) || 0; 
            document.getElementById('pwLoanAmt').value = (gross * (pLoan/100)).toFixed(2); 
            document.getElementById('pwSavAmt').value = (gross * (pSav/100)).toFixed(2); 
            document.getElementById('pwOpAmt').value = (gross * (pOp/100)).toFixed(2); 
        } else if (mode === 'pct') {
            let pct = parseFloat(document.getElementById(target === 'loan' ? 'pwLoanPct' : target === 'sav' ? 'pwSavPct' : 'pwOpPct').value) || 0;
            let amtBox = document.getElementById(target === 'loan' ? 'pwLoanAmt' : target === 'sav' ? 'pwSavAmt' : 'pwOpAmt');
            amtBox.value = (gross * (pct/100)).toFixed(2);
        } else if (mode === 'amt') {
            let amt = parseFloat(document.getElementById(target === 'loan' ? 'pwLoanAmt' : target === 'sav' ? 'pwSavAmt' : 'pwOpAmt').value) || 0;
            let pctBox = document.getElementById(target === 'loan' ? 'pwLoanPct' : target === 'sav' ? 'pwSavPct' : 'pwOpPct');
            pctBox.value = ((amt / gross) * 100).toFixed(2);
        }
    },

    openIBKRModal: function() { document.getElementById('ibkrIdle').value = window.s.vault.ibkr_cash.toFixed(2); document.getElementById('ibkrShares').value = window.s.vault.ibkr_shares.toFixed(4); document.getElementById('ibkrCost').value = window.s.vault.ibkr_cost.toFixed(2); document.getElementById('ibkrPrice').value = window.s.vault.ibkr_price.toFixed(2); document.getElementById('ibkrModal').style.display = 'flex'; },
    openSweepModal: function() { document.getElementById('swAmount').value = ''; document.getElementById('sweepModal').style.display = 'flex'; },
    openATMModal: function() { document.getElementById('atmAmt').value = ''; document.getElementById('atmAmt').placeholder = window.s.mode === 'vacation' ? "Withdrawal Amount (TND)" : "Withdrawal Amount (USD)"; document.getElementById('atmLoc').value = window.s.mode === 'vacation' ? 'tunisia' : 'intl'; this.toggleATMFee(); document.getElementById('atmFee').value = ''; document.getElementById('atmModal').style.display = 'flex'; },
    toggleATMFee: function() { document.getElementById('atmFeeGroup').style.display = document.getElementById('atmLoc').value === 'intl' ? 'flex' : 'none'; },
    openIncomeModal: function() { document.getElementById('incAmount').value = ''; document.getElementById('incDetails').value = ''; document.getElementById('incSource').value = 'gig'; document.getElementById('incWallet').value = 'cash_tnd'; this.updateIncPlaceholder(); document.getElementById('incomeModal').style.display = 'flex'; },
    updateIncPlaceholder: function() { let src = document.getElementById('incSource').value; document.getElementById('incBorrowWarning').style.display = src === 'borrow' ? 'block' : 'none'; },
    openBehaviorModal: function() { document.getElementById('behaviorModal').style.display = 'flex'; },
    openSTBModal: function() { document.getElementById('stbModal').style.display = 'flex'; },
    toggleTMForm: function() { document.getElementById('tmFormContainer').style.display = 'block'; document.getElementById('btnToggleTMForm').style.display = 'none'; },
    
    cancelTMEdit: function() { 
        window.tmEditingIdx = -1; window.tmEditingMode = null; window.tmEditingDate = null; 
        document.getElementById('tmEditBanner').style.display = 'none'; 
        document.getElementById('tmAmount').value = ''; document.getElementById('tmTag').value = ''; document.getElementById('tmShipping').value = ''; document.getElementById('tmTax').value = ''; document.getElementById('tmActualDeduct').value = ''; document.getElementById('tmVapeQty').value = ''; 
        document.getElementById('advTM').style.display = 'none'; 
        document.getElementById('tmFormContainer').style.display = 'none';
        document.getElementById('btnToggleTMForm').style.display = 'block';
    },

    openUPrompt: function(title, msg, defaultVal = '') {
        return new Promise(resolve => {
            document.getElementById('uPromptTitle').innerText = title;
            document.getElementById('uPromptMsg').innerText = msg;
            document.getElementById('uPromptInput').value = defaultVal;
            document.getElementById('uPromptModal').style.display = 'flex';
            setTimeout(() => document.getElementById('uPromptInput').focus(), 100);
            this.resolvePrompt = resolve;
        });
    },
    
    closeUPrompt: function(isOk) { 
        document.getElementById('uPromptModal').style.display = 'none'; 
        if(this.resolvePrompt) this.resolvePrompt(isOk ? document.getElementById('uPromptInput').value : null); 
    },
    
    openUConfirm: function(title, msg) { 
        return new Promise(resolve => { 
            document.getElementById('uConfirmTitle').innerText = title; 
            document.getElementById('uConfirmMsg').innerText = msg; 
            document.getElementById('uConfirmModal').style.display = 'flex'; 
            this.resolveConfirm = resolve; 
        }); 
    },
    
    closeUConfirm: function(isOk) { 
        document.getElementById('uConfirmModal').style.display = 'none'; 
        if(this.resolveConfirm) this.resolveConfirm(isOk); 
    }
};

// Global Listener for App Lock based on browser visibility
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === 'hidden') { window.ui.lastActive = Date.now(); } 
    else if (document.visibilityState === 'visible') {
        if (window.s && window.s.settings.pin && !window.ui.isLocked && (Date.now() - window.ui.lastActive > 120000)) window.ui.checkLock(); 
    }
});
