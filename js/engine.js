// ==========================================
// ENGINE.JS - CORE LOGIC & MATH (V39)
// ==========================================

window.engine = {
    hashPin: async function(pin) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    },

    processInterestBleed: function() {
        let s = window.s;
        let now = Date.now();
        let msPassed = now - s.loan.last_interest_ts;
        let daysPassed = msPassed / (1000 * 60 * 60 * 24);
        if (daysPassed >= 1 && s.loan.arrears > 0) {
            let dailyRate = (s.loan.rate / 100) / 365;
            let interestToApply = s.loan.arrears * dailyRate * daysPassed;
            s.loan.arrears += interestToApply;
            s.loan.last_interest_ts = now;
        } else if (daysPassed < 0) {
            s.loan.last_interest_ts = now; 
        }
    },

    processVacationArrears: function() {
        let s = window.s;
        if(!s.settings.vacationStart || !s.settings.vacationEnd) return;
        let vStart = new Date(s.settings.vacationStart).getTime();
        let vEnd = new Date(s.settings.vacationEnd).getTime();
        let now = Date.now();
        let shifted = false;

        s.loan.schedule.forEach(inst => {
            if(!inst.paid) {
                let dParts = inst.date.split(' ');
                if(dParts.length === 3) {
                    let estDate = new Date(`${dParts[0]} 28, ${dParts[2]}`).getTime();
                    if(estDate >= vStart && estDate <= vEnd && estDate <= now) {
                        inst.paid = true;
                        inst.shiftedToArrears = true;
                        s.loan.arrears += inst.amount;
                        shifted = true;
                    }
                }
            }
        });
        if(shifted) window.db.forceSaveState();
    },

    renderApp: function() {
        let s = window.s;
        if(window.ui) {
            window.ui.applyTheme(); 
            window.ui.populateCategories(); 
            window.ui.populateProjectDropdowns(); 
            window.ui.checkVapeField('adv'); 
            window.ui.checkVapeField('tm');
        }
        this.calculateBehavioralStreaks();
        this.processInterestBleed(); 
        
        let ibkrMktValue = s.vault.ibkr_shares * s.vault.ibkr_price;
        let ibkrUnrealized = ibkrMktValue - s.vault.ibkr_cost; let ibkrTotal = s.vault.ibkr_cash + ibkrMktValue;
        document.getElementById('v_ibkr_total').innerText = '$' + ibkrTotal.toFixed(2);
        let pnlEl = document.getElementById('v_ibkr_pnl');
        if(ibkrUnrealized > 0) { pnlEl.innerText = '+$' + ibkrUnrealized.toFixed(2); pnlEl.className = 'v-sub pnl-positive'; } 
        else if (ibkrUnrealized < 0) { pnlEl.innerText = '-$' + Math.abs(ibkrUnrealized).toFixed(2); pnlEl.className = 'v-sub pnl-negative'; } 
        else { pnlEl.innerText = '$0.00'; pnlEl.className = 'v-sub'; pnlEl.style.color = 'var(--text-muted)'; }

        document.getElementById('v_brightwell').innerText = '$' + s.vault.brightwell.toFixed(2); document.getElementById('v_wise').innerText = '$' + s.vault.wise.toFixed(2);
        document.getElementById('v_cash_usd').innerText = '$' + s.vault.cash_usd.toFixed(2); document.getElementById('v_cash_tnd').innerText = s.vault.cash_tnd.toFixed(2) + ' TND'; 
        document.getElementById('v_savings').innerText = s.vault.savings.toFixed(2) + ' TND';
        
        let unpaidsTND = s.loan.schedule.filter(x => !x.paid).reduce((sum, item) => sum + item.amount, 0);
        let totalTrueDebt = s.loan.arrears + s.loan.overdraft + unpaidsTND;
        document.getElementById('l_total_tnd').innerText = totalTrueDebt.toFixed(2) + " TND";
        document.getElementById('l_total_usd').innerText = "$" + (totalTrueDebt / s.fx_rate).toFixed(2);
        document.getElementById('l_arrears').innerText = s.loan.arrears.toFixed(2);
        document.getElementById('l_overdraft').innerText = s.loan.overdraft.toFixed(2);
        document.getElementById('l_scheduled').innerText = unpaidsTND.toFixed(2) + " TND";
        
        let dailyBleed = ((s.loan.arrears * (s.loan.rate / 100)) / 365);
        document.getElementById('l_bleed').innerText = dailyBleed.toFixed(2) + ' TND';

        if(document.getElementById('l_target_date')) {
            document.getElementById('l_target_date').value = s.loan.targetDate || "";
            this.calculateKillShot();
        }
        
        let capSavedStr = s.mode === 'vacation' ? s.capital_saved_tnd.toFixed(2) + ' TND' : '$' + s.capital_saved_usd.toFixed(2);
        let capSavedLbl = s.mode === 'vacation' ? 'Total Capital Saved (TND)' : 'Total Capital Saved (USD)';
        document.getElementById('uiCapitalSaved').innerText = capSavedStr;
        if(document.getElementById('uiCapitalSavedLbl')) document.getElementById('uiCapitalSavedLbl').innerText = capSavedLbl;

        let totUSD = ibkrTotal + s.vault.brightwell + s.vault.wise + s.vault.cash_usd; let totTND = (totUSD * s.fx_rate) + s.vault.cash_tnd + s.vault.savings;
        document.getElementById('totUSD').innerText = '$' + totUSD.toFixed(2); document.getElementById('totTND').innerText = totTND.toFixed(2) + ' TND';

        // --- V39 Dashboard Countdowns ---
        let now = Date.now();
        let countdownHtml = '';
        if (s.mode === 'vacation') {
            let vEnd = s.settings.contractStart ? new Date(s.settings.contractStart).getTime() : 0;
            if (vEnd > now) {
                let daysToBoard = Math.ceil((vEnd - now) / 86400000);
                countdownHtml = `<div style="font-size:11px; color:var(--text-muted); width:100%; text-align:center;">🚢 Days until Embarkation: <strong style="color:var(--accent); font-size:13px;">${daysToBoard}</strong></div>`;
            } else {
                countdownHtml = `<div style="font-size:11px; color:var(--text-muted); width:100%; text-align:center;">🚢 Awaiting Contract Start Date</div>`;
            }
        } else {
            let cEnd = s.settings.contractEnd ? new Date(s.settings.contractEnd).getTime() : 0;
            let daysToHome = cEnd > now ? Math.ceil((cEnd - now) / 86400000) : 0;
            
            let payDates = [
                "2026-08-21T00:00:00", "2026-09-04T00:00:00", "2026-09-18T00:00:00", 
                "2026-10-02T00:00:00", "2026-10-16T00:00:00", "2026-10-30T00:00:00", 
                "2026-11-13T00:00:00", "2026-11-27T00:00:00", "2026-12-11T00:00:00", 
                "2026-12-25T00:00:00", "2027-01-08T00:00:00", "2027-01-22T00:00:00", 
                "2027-02-05T00:00:00"
            ];
            let nextPayMs = 0;
            for (let d of payDates) {
                let pTime = new Date(d).getTime();
                if (pTime > now) { nextPayMs = pTime; break; }
            }
            let daysToPay = nextPayMs > 0 ? Math.ceil((nextPayMs - now) / 86400000) : 0;
            let payText = daysToPay > 0 ? `${daysToPay} Days` : 'N/A';

            countdownHtml = `
                <div style="font-size:11px; color:var(--text-muted); text-align:left;">💵 Next Pay: <strong style="color:var(--success); font-size:13px;">${payText}</strong></div>
                <div style="font-size:11px; color:var(--text-muted); text-align:right;">🏖️ Contract End: <strong style="color:var(--accent); font-size:13px;">${daysToHome} Days</strong></div>
            `;
        }
        let countdownBox = document.getElementById('uiCountdownBox');
        if (countdownBox) countdownBox.innerHTML = countdownHtml;

        let vapeLockedCost = 0;
        if(s.history[s.mode]) {
            let vLogs = [];
            if(s.history[s.mode].archive) s.history[s.mode].archive.forEach(a => { a.logs.forEach(l => { if (l.category === '💨 Vape') vLogs.push({...l, ts: l.ts}); }); });
            if(s.history[s.mode].current) s.history[s.mode].current.forEach(l => { if (l.category === '💨 Vape') vLogs.push({...l, ts: l.ts}); });
            vLogs.sort((a,b) => a.ts - b.ts);
            
            let stash = s.vape_stash.count; let empties = s.vape_stash.empty_logs; let avgLifespan = 0;
            let totalVapeSpent = vLogs.reduce((sum, l) => sum + l.amount, 0);
            let totalBought = vLogs.reduce((sum, l) => sum + (l.vapeQty || 1), 0);

            if (vLogs.length > 0 && empties.length > 0) {
                let firstPurchaseTs = vLogs[0].ts; let latestEmptyTs = empties[empties.length - 1];
                let totalLifespanDays = (latestEmptyTs - firstPurchaseTs) / 86400000;
                if (totalLifespanDays > 0) avgLifespan = totalLifespanDays / empties.length;
            }

            let targetEndVape = (s.mode === 'vacation') ? 
                (s.settings.vacationEnd ? new Date(s.settings.vacationEnd).getTime() : 0) : 
                (s.settings.contractEnd ? new Date(s.settings.contractEnd).getTime() : 0);
            let modeDaysLeftVape = (targetEndVape > now) ? (targetEndVape - now) / 86400000 : 0;

            if (modeDaysLeftVape > 0 && avgLifespan > 0 && totalBought > 0) {
                let avgCost = totalVapeSpent / totalBought;
                let vapesNeeded = modeDaysLeftVape / avgLifespan;
                let netVapesToBuy = Math.max(0, vapesNeeded - stash);
                vapeLockedCost = netVapesToBuy * avgCost;
            }
        }

        let totalLiquid = 0; let activeEnvLocked = 0;
        let isUSDMode = (s.mode === 'onboard');
        
        if (isUSDMode) { totalLiquid = s.vault.cash_usd + s.vault.brightwell + s.vault.wise; } 
        else { totalLiquid = (s.vault.cash_usd * s.fx_rate) + s.vault.cash_tnd + s.vault.savings + (s.vault.brightwell * s.fx_rate) + (s.vault.wise * s.fx_rate); }
        
        Object.keys(s.projects.envelopes).forEach(k => {
            let env = s.projects.envelopes[k];
            if(!env.archived) {
                let remaining = Math.max(0, env.limit - env.spent);
                if (isUSDMode) {
                    if (env.currency === 'USD') activeEnvLocked += remaining;
                    else activeEnvLocked += (remaining / s.fx_rate);
                } else {
                    if (env.currency === 'TND') activeEnvLocked += remaining;
                    else activeEnvLocked += (remaining * s.fx_rate);
                }
            }
        });

        if (vapeLockedCost > 0) activeEnvLocked += vapeLockedCost;

        let daily = s.history[s.mode] ? s.history[s.mode].limit : 0; 
        document.getElementById('uiRunway').innerText = daily > 0 ? Math.floor(totalLiquid / daily) + " Days" : "N/A";
        let rBudget = document.getElementById('uiRunwayBudget');
        if(rBudget) rBudget.innerText = daily > 0 ? `(at ${daily.toFixed(2)} ${isUSDMode?'USD':'TND'}/day)` : '';
        
        let netLiquid = Math.max(0, totalLiquid - activeEnvLocked);
        let netRunway = daily > 0 ? Math.floor(netLiquid / daily) : 0;
        let netLiquidDisplay = isUSDMode ? `$${netLiquid.toFixed(2)}` : `${netLiquid.toFixed(2)} TND`;
        document.getElementById('uiNetRunway').innerText = `Net (Excl. Envelopes & Vapes): ${netRunway} Days | ${netLiquidDisplay}`;

        if(s.history[s.mode]) {
            let curHist = s.history[s.mode]; let sym = s.mode === 'vacation' ? ' TND' : ' USD'; let pre = s.mode === 'onboard' ? '$' : '';
            document.getElementById('balanceTitle').innerText = `Remaining Today (${s.mode === 'vacation' ? 'Vacation' : 'Onboard'})`;
            
            let spilloverActive = false;
            let spentToday = curHist.current.reduce((sum, item) => {
                if (item.category === "🏦 Financial & Fees") return sum;
                if (item.bypassLimit) { if (item.spillover && item.spillover > 0) spilloverActive = true; return sum + (item.spillover || 0); }
                return sum + item.amount;
            }, 0);
            
            let currentBalance = curHist.limit - spentToday;
            document.getElementById('balanceDisplay').innerText = pre + currentBalance.toFixed(2) + sym;
            document.getElementById('spilloverAlert').style.display = spilloverActive ? 'block' : 'none';
            
            let diff = currentBalance; const badge = document.getElementById('surplusBadge');
            badge.innerText = (diff >= 0 ? '+' : '') + diff.toFixed(2); 
            badge.style.color = diff >= 0 ? 'var(--success)' : 'var(--danger)'; badge.style.background = diff >= 0 ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)';
            
            const pb = document.getElementById('progressBar'); 
            pb.style.width = Math.max(0, (currentBalance / curHist.limit) * 100) + "%"; 
            pb.style.backgroundColor = diff <= 0 ? 'var(--danger)' : (currentBalance < (curHist.limit * 0.3) ? 'var(--warning)' : 'var(--success)');
            
            const listNode = document.getElementById('historyList'); listNode.innerHTML = '';
            if (curHist.current.length === 0) { listNode.innerHTML = '<div class="history-item" style="color:var(--text-muted); justify-content:center;">No metrics logged.</div>'; } 
            else {
                curHist.current.slice().reverse().forEach((item, index) => {
                    let actualIndex = curHist.current.length - 1 - index; let subtextArr = [];
                    if(item.location) subtextArr.push(`📍 ${item.location}`); if(item.items) subtextArr.push(`🛒 ${item.items}`); if(item.whom) subtextArr.push(`👥 For: ${item.whom}`);
                    let bypassNote = (item.bypassLimit || item.category === "🏦 Financial & Fees") ? `<span style="color:var(--warning); font-size:9px;">(Bypass)</span>` : '';
                    let spillNote = (item.spillover && item.spillover > 0) ? `<span style="color:var(--danger); font-size:9px;">(Spill: ${item.spillover.toFixed(2)})</span>` : '';
                    let projNote = '';
                    if(item.project && item.project !== 'none') {
                        if(item.project.startsWith('env_')) { let k = item.project.replace('env_', ''); if(s.projects.envelopes[k]) projNote = `<span class="project-badge">${s.projects.envelopes[k].name}</span>`; } 
                        else if (item.project.startsWith('mis_')) { let k = item.project.replace('mis_', ''); if(s.projects.missions[k]) projNote = `<span class="project-badge">${s.projects.missions[k].name}</span>`; }
                    }
                    let origSym = s.mode === 'vacation' ? 'TND' : 'USD'; let convSym = s.mode === 'vacation' ? 'USD' : 'TND'; let convAmount = 0; let rate = item.fxRate && !isNaN(item.fxRate) ? item.fxRate : s.fx_rate;
                    let isTargetUSD = ['brightwell', 'wise', 'cash_usd', 'ibkr_cash'].includes(item.walletSource);
                    if (s.mode === 'vacation') { if (isTargetUSD && item.deductedAmount !== undefined) convAmount = item.deductedAmount; else convAmount = item.amount / rate; } 
                    else { if (!isTargetUSD && item.deductedAmount !== undefined) convAmount = item.deductedAmount; else convAmount = item.amount * rate; }
                    
                    listNode.innerHTML += `<div class="history-item"><div style="flex:1;"><div style="font-weight:600;">${item.tag} <span class="cat-badge">${item.category}</span></div><div style="font-size:9px; color:var(--text-muted);">${item.walletSource} ${bypassNote} ${spillNote}</div>${projNote}${subtextArr.length ? `<div class="history-details">${subtextArr.join(' | ')}</div>` : ''}</div><div style="display:flex; align-items:center; gap:8px; text-align:right;"><div><span style="font-weight:bold; color:var(--danger);">-${item.amount.toFixed(2)} ${origSym}</span><br><span style="font-size:9px; color:var(--text-muted);">(≈ ${convAmount.toFixed(2)} ${convSym})</span></div><button class="edit-btn" onclick="window.engine.editExpense(${actualIndex})">✏️</button><button class="edit-btn" onclick="window.engine.deleteExpense(${actualIndex})">❌</button></div></div>`;
                });
            }
        }
        this.renderIOUs(); this.renderSchedule();
    },

    calculateBehavioralStreaks: function() {
        let s = window.s;
        if(!s.history.vacation || !s.history.onboard) return;
        let curStreak = 0; let maxStreak = 0; let safeDays = 0; let overDays = 0; let totalOver = 0; let totalSafe = 0;
        let combined = [...s.history.vacation.archive.map(a=>({d:a.date, l:a.limit, logs:a.logs, m:'vacation'})), ...s.history.onboard.archive.map(a=>({d:a.date, l:a.limit, logs:a.logs, m:'onboard'}))].sort((a,b) => new Date(a.d) - new Date(b.d));
        
        combined.forEach(day => {
            let activeLimit = day.l || s.history[day.m].limit;
            let spent = day.logs.reduce((sum, item) => sum + ((item.category === "🏦 Financial & Fees") ? 0 : (item.bypassLimit ? (item.spillover||0) : item.amount)), 0);
            if(spent <= activeLimit) { safeDays++; curStreak++; totalSafe += spent; if(curStreak > maxStreak) maxStreak = curStreak; } 
            else { overDays++; totalOver += spent; curStreak = 0; }
        });

        document.getElementById('safeDaysCount').innerText = safeDays; document.getElementById('overDaysCount').innerText = overDays;
        document.getElementById('curStreakCount').innerText = curStreak; document.getElementById('maxStreakCount').innerText = maxStreak;
        document.getElementById('b_curStreak').innerText = curStreak + " Days"; document.getElementById('b_maxStreak').innerText = maxStreak + " Days";
        document.getElementById('b_avgSafe').innerText = safeDays > 0 ? (totalSafe / safeDays).toFixed(2) : "0.00";
        document.getElementById('b_avgOver').innerText = overDays > 0 ? (totalOver / overDays).toFixed(2) : "0.00";

        let modeArch = s.history[s.mode].archive;
        let totalModeSpend = 0; let validModeDays = 0;
        modeArch.forEach(day => { let spent = day.logs.reduce((sum, item) => sum + ((item.category === "🏦 Financial & Fees") ? 0 : (item.bypassLimit ? (item.spillover||0) : item.amount)), 0); totalModeSpend += spent; validModeDays++; });
        let spentToday = s.history[s.mode].current.reduce((sum, item) => sum + ((item.category === "🏦 Financial & Fees") ? 0 : (item.bypassLimit ? (item.spillover||0) : item.amount)), 0);
        if (s.history[s.mode].current.length > 0) { totalModeSpend += spentToday; validModeDays++; }

        let avgSpend = validModeDays > 0 ? (totalModeSpend / validModeDays) : 0;
        let sym = s.mode === 'vacation' ? ' TND' : ' USD';
        let avgEl = document.getElementById('uiAvgSpend');
        if (avgEl) { avgEl.innerText = avgSpend.toFixed(2) + sym; document.getElementById('uiAvgSpendMode').innerText = s.mode === 'vacation' ? 'Vacation' : 'Onboard'; }
    },

    editLoanComponent: async function(comp) {
        let s = window.s;
        let currentVal = (comp === 'arrears') ? s.loan.arrears : s.loan.overdraft;
        let newValStr = await window.ui.openUPrompt(`Edit ${comp}`, `Current: ${currentVal.toFixed(2)} TND\nEnter new exact amount:`, currentVal.toFixed(2));
        if(newValStr === null) return;
        let newVal = parseFloat(newValStr);
        if (!isNaN(newVal) && newVal >= 0) {
            if (comp === 'arrears') s.loan.arrears = newVal;
            else s.loan.overdraft = newVal;
            window.db.saveState();
        }
    },

    editInstallmentAmount: async function(id) {
        let s = window.s;
        let p = s.loan.schedule.find(x => x.id === id); if(!p) return;
        let val = await window.ui.openUPrompt("Edit Installment", `Current Amount: ${p.amount.toFixed(2)} TND\nEnter new amount for ${p.date}:`, p.amount.toFixed(2));
        if(val === null) return;
        let n = parseFloat(val);
        if(!isNaN(n) && n > 0) { p.amount = n; window.db.saveState(); }
    },

    calculateKillShot: function() {
        let s = window.s;
        let targetDateStr = document.getElementById('l_target_date').value;
        if(!targetDateStr) {
            document.getElementById('l_months_left').innerText = "0";
            document.getElementById('l_months_breakdown').innerText = "(0 Active + 0 Vacation)";
            document.getElementById('l_kill_shot').innerText = "0.00 TND";
            s.loan.targetDate = "";
            return;
        }
        s.loan.targetDate = targetDateStr;

        let targetDate = new Date(targetDateStr + "-01");
        let now = new Date();
        let totalMonthsLeft = (targetDate.getFullYear() - now.getFullYear()) * 12 + (targetDate.getMonth() - now.getMonth());

        if (totalMonthsLeft <= 0) {
            document.getElementById('l_months_left').innerText = "0";
            document.getElementById('l_months_breakdown').innerText = "(0 Active + 0 Vacation)";
            document.getElementById('l_kill_shot').innerText = "Past Due";
            window.db.saveState();
            return;
        }

        let vStart = s.settings.vacationStart ? new Date(s.settings.vacationStart).getTime() : 0;
        let vEnd = s.settings.vacationEnd ? new Date(s.settings.vacationEnd).getTime() : 0;
        
        let vacationMonths = 0;
        if(vStart && vEnd && vEnd > now) {
            let effectiveStart = Math.max(vStart, now);
            let effectiveEnd = Math.min(vEnd, targetDate.getTime());
            if(effectiveEnd > effectiveStart) {
                vacationMonths = (effectiveEnd - effectiveStart) / (1000 * 60 * 60 * 24 * 30.44);
            }
        }
        
        let activeMonths = Math.max(0, totalMonthsLeft - vacationMonths);

        let unpaidsTND = s.loan.schedule.filter(x => !x.paid).reduce((sum, item) => sum + item.amount, 0);
        let totalTrueDebt = s.loan.arrears + s.loan.overdraft + unpaidsTND;
        let killShot = activeMonths > 0 ? (totalTrueDebt / activeMonths) : totalTrueDebt;

        document.getElementById('l_months_left').innerText = totalMonthsLeft;
        document.getElementById('l_months_breakdown').innerText = `(${activeMonths.toFixed(1)} Active + ${vacationMonths.toFixed(1)} Vacation)`;
        document.getElementById('l_kill_shot').innerText = killShot.toFixed(2) + " TND";
        window.db.forceSaveState(); 
    },

    renderProjects: function() {
        let s = window.s;
        const envBox = document.getElementById('envelopeContainer'); envBox.innerHTML = '';
        const misBox = document.getElementById('missionContainer'); misBox.innerHTML = '';
        const goalBox = document.getElementById('goalsContainer'); goalBox.innerHTML = '';
        const archBox = document.getElementById('archiveSection'); archBox.innerHTML = '<div style="font-size:10px; font-weight:bold; margin-bottom:8px;">Archived Trackers</div>';

        Object.keys(s.projects.envelopes).forEach(k => {
            let e = s.projects.envelopes[k]; let isOver = e.spent > e.limit; let pct = Math.min(100, (e.spent / e.limit) * 100);
            let actionIcon = e.spent > 0 ? '📦' : '❌'; let bypassTag = e.bypass ? '' : '<span style="color:var(--danger);font-size:8px;">(Hits Limit)</span>';
            let currTag = `<span style="font-size:8px; color:var(--text-muted);">${e.currency}</span>`;
            let html = `<div style="background:var(--card-bg); padding:10px; border-radius:8px; border:1px solid ${isOver ? 'var(--danger)' : 'var(--panel-border)'}; opacity:${e.archived?0.6:1};"><div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:6px;"><strong>${e.name} ${bypassTag}</strong><div><span style="color:${isOver ? 'var(--danger)' : 'var(--text)'}; font-weight:bold;">${e.spent.toFixed(2)}</span> / ${e.limit.toFixed(2)} ${currTag} ${e.archived ? `<button onclick="window.engine.restoreTracker('env', '${k}')" style="background:none;border:none;margin-left:5px;cursor:pointer;">🔙</button><button onclick="window.engine.hardDeleteTracker('env', '${k}')" style="background:none;border:none;margin-left:5px;cursor:pointer;">🗑️</button>` : `<button onclick="window.engine.editProjectTracker('env', '${k}')" style="background:none;border:none;margin-left:5px;cursor:pointer;">⚙️</button><button onclick="window.engine.processProjectAction('env', '${k}', ${e.spent})" style="background:none;border:none;margin-left:5px;cursor:pointer;">${actionIcon}</button>`}</div></div><div class="progress-container" style="height:4px; margin-top:0;"><div class="progress-bar" style="width:${pct}%; background:${isOver ? 'var(--danger)' : 'var(--accent)'};"></div></div>${isOver && !e.archived ? `<div style="font-size:9px; color:var(--danger); margin-top:4px;">⚠️ Overbudget: Spillover affecting daily limit</div>` : ''}</div>`;
            if(!e.archived) envBox.innerHTML += html; else archBox.innerHTML += html;
        });

        Object.keys(s.projects.missions).forEach(k => {
            let m = s.projects.missions[k]; let actionIcon = m.spent > 0 ? '📦' : '❌'; let bypassTag = m.bypass ? '<span style="color:var(--warning);font-size:8px;display:block;">(Bypass Active)</span>' : ''; 
            let currTag = m.currency;
            let displayVal = m.spent.toFixed(2);
            let convVal = (m.currency === 'USD') ? (m.spent * s.fx_rate).toFixed(2) + " TND" : (m.spent / s.fx_rate).toFixed(2) + " USD";
            
            let html = `<div style="background:var(--card-bg); padding:10px; border-radius:8px; border:1px solid var(--panel-border); text-align:center; opacity:${m.archived?0.6:1}; position:relative;">${m.archived ? `<div style="position:absolute;top:5px;right:5px;"><button onclick="window.engine.restoreTracker('mis', '${k}')" style="background:none;border:none;font-size:12px;cursor:pointer;">🔙</button><button onclick="window.engine.hardDeleteTracker('mis', '${k}')" style="background:none;border:none;font-size:12px;cursor:pointer;">🗑️</button></div>` : `<div style="position:absolute;top:5px;right:5px;"><button onclick="window.engine.editProjectTracker('mis', '${k}')" style="background:none;border:none;font-size:10px;cursor:pointer;">⚙️</button><button onclick="window.engine.processProjectAction('mis', '${k}', ${m.spent})" style="background:none;border:none;font-size:10px;cursor:pointer;">${actionIcon}</button></div>`}<div style="font-size:10px; color:var(--text-muted); font-weight:bold; margin-bottom:4px;">${m.name} ${bypassTag}</div><div style="font-size:16px; font-weight:800; color:var(--text);">${displayVal} <span style="font-size:10px;">${currTag}</span></div><div style="font-size:10px; color:var(--text-muted); margin-top:2px;">(≈ ${convVal})</div>${m.hasLogistics ? `<div style="font-size:9px; color:var(--danger); margin-top:4px;">Dead Money: ${m.dead.toFixed(2)} ${currTag}</div>` : ''}</div>`;
            if(!m.archived) misBox.innerHTML += html; else archBox.innerHTML += html;
        });

        s.projects.goals.forEach(g => {
            let pct = Math.min(100, (g.saved / g.target) * 100); let actionIcon = g.saved > 0 ? '📦' : '❌';
            let currTag = `<span style="font-size:8px; color:var(--text-muted);">${g.currency}</span>`;
            let html = `<div style="background:var(--card-bg); padding:10px; border-radius:8px; border:1px solid rgba(74, 222, 128, 0.4); opacity:${g.archived?0.6:1};"><div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:6px;"><strong>${g.name}</strong><div><span style="color:var(--success); font-weight:bold;">${g.saved.toFixed(0)} / ${g.target.toFixed(0)}</span> ${currTag} ${g.archived ? `<button onclick="window.engine.restoreTracker('goal', ${g.id})" style="background:none;border:none;margin-left:5px;cursor:pointer;">🔙</button><button onclick="window.engine.hardDeleteTracker('goal', ${g.id})" style="background:none;border:none;margin-left:5px;cursor:pointer;">🗑️</button>` : `<button onclick="window.engine.editProjectTracker('goal', ${g.id})" style="background:none;border:none;margin-left:5px;cursor:pointer;">⚙️</button><button onclick="window.engine.processProjectAction('goal', ${g.id}, ${g.saved})" style="background:none;border:none;margin-left:5px;cursor:pointer;">${actionIcon}</button></div></div><div class="progress-container" style="height:4px; margin-top:0;"><div class="progress-bar" style="width:${pct}%;"></div></div>${g.archived ? '' : `<button class="v-btn" style="width:100%; margin-top:10px; background:#16a34a;" onclick="window.engine.fundGoal(${g.id})">➕ Add Funds (Virtual Hold)</button>`}</div>`;
            if(!g.archived) goalBox.innerHTML += html; else archBox.innerHTML += html;
        });

        if(archBox.innerHTML === '<div style="font-size:10px; font-weight:bold; margin-bottom:8px;">Archived Trackers</div>') archBox.innerHTML += '<div style="font-size:11px;color:var(--text-muted);">No archived items.</div>';
    },

    submitNewProject: async function() {
        let s = window.s;
        let type = document.getElementById('npType').value; let name = document.getElementById('npName').value.trim();
        if(!name) { await window.ui.openUConfirm("Error", "Please provide a name."); return; }
        let limitVal = parseFloat(document.getElementById('npLimit').value); 
        if(isNaN(limitVal) || limitVal <= 0) { await window.ui.openUConfirm("Error", "Please enter a valid numeric amount."); return; }
        let currency = document.getElementById('npCurrency').value; let key = 'p_' + Date.now();
        if(type === 'env') { 
            let bypass = document.getElementById('npBypass').checked;
            s.projects.envelopes[key] = { name: '🏖️ ' + name, limit: limitVal, spent: 0, archived: false, bypass: bypass, currency: currency }; 
        } else if(type === 'mis') { 
            let bypass = document.getElementById('npBypass').checked;
            let logistics = document.getElementById('npLogistics').checked; 
            s.projects.missions[key] = { name: '🎯 ' + name, spent: 0, dead: 0, hasLogistics: logistics, archived: false, bypass: bypass, currency: currency }; 
        } else if(type === 'goal') { 
            s.projects.goals.push({ id: Date.now(), name: '🏆 ' + name, target: limitVal, saved: 0, archived: false, currency: currency }); 
        }
        document.getElementById('addProjectModal').style.display = 'none'; window.db.saveState();
    },

    editProjectTracker: async function(type, id) {
        let s = window.s;
        let p = null; if (type === 'env') p = s.projects.envelopes[id]; else if (type === 'mis') p = s.projects.missions[id]; else p = s.projects.goals.find(g => g.id == id);
        if(!p) return;
        let currVal = type === 'goal' ? p.target : p.limit;
        let newLimitStr = await window.ui.openUPrompt("Edit Limit", `Current limit: ${currVal} ${p.currency}\nEnter new numerical amount:`, currVal);
        let newLim = parseFloat(newLimitStr);
        if (!isNaN(newLim) && newLim > 0) { if (type === 'goal') p.target = newLim; else p.limit = newLim; window.db.saveState(); }
    },

    processProjectAction: async function(type, id, spentAmount) {
        let s = window.s;
        if (spentAmount > 0) {
            let ok = await window.ui.openUConfirm("Archive", "Archive this tracker? It will be hidden from active dropdowns but data is saved."); if(!ok) return;
            if(type === 'env') s.projects.envelopes[id].archived = true; if(type === 'mis') s.projects.missions[id].archived = true; if(type === 'goal') s.projects.goals.find(g => g.id == id).archived = true;
        } else {
            let ok = await window.ui.openUConfirm("Delete", "Zero spent. Hard delete this tracker completely?"); if(!ok) return;
            if(type === 'env') delete s.projects.envelopes[id]; if(type === 'mis') delete s.projects.missions[id]; if(type === 'goal') s.projects.goals = s.projects.goals.filter(g => g.id != id);
        }
        window.db.saveState();
    },

    hardDeleteTracker: async function(type, id) {
        let s = window.s;
        let ok = await window.ui.openUConfirm("Hard Delete", "Permanently delete this archived tracker? Historical logs will lose their association.");
        if(!ok) return;
        if(type === 'env') delete s.projects.envelopes[id];
        if(type === 'mis') delete s.projects.missions[id];
        if(type === 'goal') s.projects.goals = s.projects.goals.filter(g => g.id == id);
        window.db.saveState();
    },

    restoreTracker: async function(type, id) {
        let s = window.s;
        let ok = await window.ui.openUConfirm("Restore", "Restore this tracker to active status?");
        if(!ok) return;
        if(type === 'env') s.projects.envelopes[id].archived = false;
        if(type === 'mis') s.projects.missions[id].archived = false;
        if(type === 'goal') s.projects.goals.find(g => g.id == id).archived = false;
        window.db.saveState();
    },

    fundGoal: async function(id) {
        let s = window.s;
        let amtStr = await window.ui.openUPrompt("Fund Goal", "Amount to hold for this goal:"); 
        let amt = parseFloat(amtStr); if(isNaN(amt) || amt <= 0) return; 
        let goal = s.projects.goals.find(g => g.id == id); 
        if(goal) { goal.saved += amt; window.db.saveState(); await window.ui.openUConfirm("Success", `Assigned ${amt} to ${goal.name}. (Virtual hold).`); } 
    },

    reverseProjectTracking: function(item, histMode) {
        let s = window.s;
        if (!item.project || item.project === 'none') return; 
        let trackingCost = 0;
        if (item.project.startsWith('env_')) { 
            let envKey = item.project.replace('env_', ''); let env = s.projects.envelopes[envKey]; 
            if(env) { 
                trackingCost = item.amount;
                if (env.currency === 'USD' && histMode === 'vacation') trackingCost = item.amount / item.fxRate;
                if (env.currency === 'TND' && histMode === 'onboard') trackingCost = item.amount * item.fxRate;
                env.spent -= trackingCost; if(env.spent < 0) env.spent = 0; 
            } 
        } 
        else if (item.project.startsWith('mis_')) { 
            let misKey = item.project.replace('mis_', ''); let mis = s.projects.missions[misKey]; 
            if(mis) { 
                trackingCost = item.amount;
                if (mis.currency === 'USD' && histMode === 'vacation') trackingCost = item.amount / item.fxRate;
                if (mis.currency === 'TND' && histMode === 'onboard') trackingCost = item.amount * item.fxRate;
                mis.spent -= trackingCost; if(mis.spent < 0) mis.spent = 0; 
                if(mis.hasLogistics && item.deadMoney) { 
                    let deadTrack = item.deadMoney;
                    if (mis.currency === 'USD' && histMode === 'vacation') deadTrack = item.deadMoney / item.fxRate;
                    if (mis.currency === 'TND' && histMode === 'onboard') deadTrack = item.deadMoney * item.fxRate;
                    mis.dead -= deadTrack; if(mis.dead < 0) mis.dead = 0; 
                } 
            } 
        }
    },

    logExpense: function() {
        let s = window.s;
        let baseCost = parseFloat(document.getElementById('customAmount').value); if (isNaN(baseCost) || baseCost <= 0) return;
        let src = document.getElementById('advSourceWallet').value; let project = document.getElementById('advProject').value; let cat = document.getElementById('advCategory').value;
        let targetWallet = s.mode === 'vacation' ? 'cash_tnd' : 'cash_usd'; if (src !== 'default') targetWallet = src;
        let bypass = (src !== 'default'); let shipping = 0, tax = 0, vapeQty = 0; 
        
        if (cat === '💨 Vape') { vapeQty = parseInt(document.getElementById('advVapeQty').value) || 1; s.vape_stash.count += vapeQty; }
        if(project.startsWith('mis_') && s.projects.missions[project.replace('mis_','')]?.hasLogistics) { shipping = parseFloat(document.getElementById('advShipping').value) || 0; tax = parseFloat(document.getElementById('advTax').value) || 0; }
        let totalCost = baseCost + shipping + tax; 
        let isTargetUSD = ['brightwell', 'wise', 'cash_usd', 'ibkr_cash'].includes(targetWallet); let deductAmount = totalCost; 
        let isMismatch = (s.mode === 'vacation' && isTargetUSD) || (s.mode === 'onboard' && !isTargetUSD); let actualInput = document.getElementById('advActualDeduct').value;
        if (isMismatch) { if (actualInput && parseFloat(actualInput) > 0) deductAmount = parseFloat(actualInput); else deductAmount = s.mode === 'vacation' ? totalCost / s.fx_rate : totalCost * s.fx_rate; }
        
        s.vault[targetWallet] -= deductAmount; 
        let spillover = 0;
        
        if (project.startsWith('env_')) { 
            let envKey = project.replace('env_', ''); let env = s.projects.envelopes[envKey]; bypass = env.bypass; 
            let trackingCost = totalCost;
            if (env.currency === 'USD' && s.mode === 'vacation') trackingCost = totalCost / s.fx_rate;
            if (env.currency === 'TND' && s.mode === 'onboard') trackingCost = totalCost * s.fx_rate;
            if (env.spent + trackingCost > env.limit) { 
                let over = (env.spent + trackingCost) - env.limit;
                if (env.currency === 'USD' && s.mode === 'onboard') spillover = over;
                else if (env.currency === 'TND' && s.mode === 'vacation') spillover = over;
                else if (env.currency === 'USD' && s.mode === 'vacation') spillover = over * s.fx_rate; 
                else if (env.currency === 'TND' && s.mode === 'onboard') spillover = over / s.fx_rate;
                if (env.spent >= env.limit) spillover = totalCost; 
            } 
            env.spent += trackingCost; 
        } 
        else if (project.startsWith('mis_')) { 
            let misKey = project.replace('mis_', ''); let mis = s.projects.missions[misKey]; bypass = mis.bypass; 
            let trackingCost = totalCost;
            if (mis.currency === 'USD' && s.mode === 'vacation') trackingCost = totalCost / s.fx_rate;
            if (mis.currency === 'TND' && s.mode === 'onboard') trackingCost = totalCost * s.fx_rate;
            mis.spent += trackingCost; 
            if(mis.hasLogistics) {
                let deadTrack = shipping + tax;
                if (mis.currency === 'USD' && s.mode === 'vacation') deadTrack = deadTrack / s.fx_rate;
                if (mis.currency === 'TND' && s.mode === 'onboard') deadTrack = deadTrack * s.fx_rate;
                mis.dead += deadTrack;
            }
        }

        let logDesc = document.getElementById('customDescription').value.trim() || "💸 Expense"; if (shipping > 0 || tax > 0) logDesc += ` [Incl. ${(shipping+tax).toFixed(2)} Dead Money]`;
        s.history[s.mode].current.push({ amount: totalCost, tag: logDesc, category: cat, location: document.getElementById('advLocation').value.trim(), items: document.getElementById('advItems').value.trim(), whom: document.getElementById('advWhom').value.trim(), walletSource: targetWallet, bypassLimit: bypass, spillover: spillover, project: project, deadMoney: (shipping+tax), deductedAmount: deductAmount, fxRate: s.fx_rate, ts: Date.now(), vapeQty: vapeQty });
        
        document.getElementById('customDescription').value = ''; document.getElementById('customAmount').value = ''; document.getElementById('advLocation').value = ''; document.getElementById('advItems').value = ''; document.getElementById('advWhom').value = ''; document.getElementById('advShipping').value = ''; document.getElementById('advTax').value = ''; document.getElementById('advMain').style.display = 'none'; document.getElementById('advProject').value = 'none'; document.getElementById('advSourceWallet').value = 'default'; document.getElementById('advActualDeduct').value = ''; document.getElementById('advFXOverrideBox').style.display = 'none'; document.getElementById('advVapeQty').value = ''; 
        if(window.ui) window.ui.toggleOnlineFields('adv'); 
        window.db.saveState();
    },

    editExpense: function(idx) {
        let s = window.s;
        let item = s.history[s.mode].current[idx]; 
        if(item.category === '💨 Vape' && item.vapeQty) s.vape_stash.count = Math.max(0, s.vape_stash.count - item.vapeQty);

        if(item.walletSource && s.vault[item.walletSource] !== undefined) { 
            let refundAmount = item.amount; let isTargetUSD = ['brightwell', 'wise', 'cash_usd', 'ibkr_cash'].includes(item.walletSource); 
            if (item.deductedAmount !== undefined) refundAmount = item.deductedAmount; else { let rate = item.fxRate && !isNaN(item.fxRate) ? item.fxRate : s.fx_rate; if (s.mode === 'vacation' && isTargetUSD) refundAmount = item.amount / rate; else if (s.mode === 'onboard' && !isTargetUSD) refundAmount = item.amount * rate; }
            s.vault[item.walletSource] += refundAmount; 
        } 
        this.reverseProjectTracking(item, s.mode);
        document.getElementById('customDescription').value = item.tag.split(' [Incl.')[0]; document.getElementById('customAmount').value = item.amount - (item.deadMoney||0); document.getElementById('advCategory').value = item.category; document.getElementById('advProject').value = item.project || 'none'; 
        if(window.ui) window.ui.toggleOnlineFields('adv'); 
        document.getElementById('advSourceWallet').value = item.walletSource; 
        if(window.ui) { window.ui.toggleFXOverride('adv'); window.ui.checkVapeField('adv'); }
        if (item.deductedAmount !== undefined) document.getElementById('advActualDeduct').value = item.deductedAmount;
        if (item.vapeQty) document.getElementById('advVapeQty').value = item.vapeQty;
        if(item.project && item.project.startsWith('mis_') && s.projects.missions[item.project.replace('mis_','')].hasLogistics) { document.getElementById('advShipping').value = item.deadMoney || 0; document.getElementById('advTax').value = ''; } 
        document.getElementById('advLocation').value = item.location || ''; document.getElementById('advItems').value = item.items || ''; document.getElementById('advWhom').value = item.whom || ''; document.getElementById('advMain').style.display = 'flex'; 
        s.history[s.mode].current.splice(idx, 1); window.db.saveState(); document.getElementById('customAmount').focus(); 
    },

    deleteExpense: async function(idx) { 
        let s = window.s;
        let ok = await window.ui.openUConfirm("Delete", "Delete this expense entirely?"); if(!ok) return; 
        let item = s.history[s.mode].current[idx]; 
        if(item.category === '💨 Vape' && item.vapeQty) s.vape_stash.count = Math.max(0, s.vape_stash.count - item.vapeQty);
        if(item.walletSource && s.vault[item.walletSource] !== undefined) { 
            let refundAmount = item.amount; let isTargetUSD = ['brightwell', 'wise', 'cash_usd', 'ibkr_cash'].includes(item.walletSource); 
            if (item.deductedAmount !== undefined) refundAmount = item.deductedAmount; else { let rate = item.fxRate && !isNaN(item.fxRate) ? item.fxRate : s.fx_rate; if (s.mode === 'vacation' && isTargetUSD) refundAmount = item.amount / rate; else if (s.mode === 'onboard' && !isTargetUSD) refundAmount = item.amount * rate; }
            s.vault[item.walletSource] += refundAmount; 
        } 
        this.reverseProjectTracking(item, s.mode); s.history[s.mode].current.splice(idx, 1); window.db.saveState(); 
    },

    searchLogs: function() {
        let s = window.s;
        let q = document.getElementById('tmSearch').value.toLowerCase(); let res = document.getElementById('tmSearchResults');
        if (!q) { res.style.display = 'none'; document.getElementById('tmNormalView').style.display = 'block'; return; }
        res.style.display = 'block'; res.innerHTML = ''; document.getElementById('tmNormalView').style.display = 'none';
        let allLogs = []; ['vacation', 'onboard'].forEach(m => { s.history[m].archive.forEach(a => allLogs.push(...a.logs.map(l => ({...l, d: a.date, m: m})))); allLogs.push(...s.history[m].current.map(l => ({...l, d: 'Today', m: m}))); });
        let filtered = allLogs.filter(l => l.tag.toLowerCase().includes(q) || l.category.toLowerCase().includes(q) || (l.location && l.location.toLowerCase().includes(q)));
        filtered.forEach(l => { res.innerHTML += `<div style="border-bottom:1px solid #334155; padding:8px 0; font-size:12px;"><strong>${l.d}</strong>: ${l.tag} <span style="color:var(--danger);">-${l.amount.toFixed(2)}</span></div>`; });
        if(filtered.length === 0) res.innerHTML = '<div style="font-size:11px; color:var(--text-muted);">No matches found.</div>';
    },

    loadPastDay: function() {
        let s = window.s;
        let dVal = document.getElementById('tmDate').value; if(!dVal) return; let [y, month, d] = dVal.split('-'); let targetStr = new Date(y, month - 1, d).toDateString();
        let listNode = document.getElementById('tmList'); listNode.innerHTML = ''; let found = false;
        ['vacation', 'onboard'].forEach(m => {
            let dayData = s.history[m].archive.find(a => new Date(a.date).toDateString() === targetStr);
            if(dayData) { 
                found = true; 
                dayData.logs.forEach((item, idx) => { 
                    let bypassNote = (item.bypassLimit || item.category === "🏦 Financial & Fees") ? `<span style="color:var(--warning); font-size:9px;">(Bypass)</span>` : ''; 
                    listNode.innerHTML += `<div class="history-item"><div><div style="font-weight:600;">${item.tag} <span class="cat-badge">${item.category}</span></div><div style="font-size:9px;">[${m.toUpperCase()}] ${item.walletSource} ${bypassNote}</div></div><div style="display:flex; align-items:center; gap:8px;"><span style="color:var(--danger); font-weight:bold;">-${item.amount.toFixed(2)}</span><button class="edit-btn" onclick="window.engine.duplicatePastExpense('${m}', '${dayData.date}', ${idx})">📄</button><button class="edit-btn" onclick="window.engine.editPastExpense('${m}', '${dayData.date}', ${idx})">✏️</button><button class="edit-btn" onclick="window.engine.deletePastExpense('${m}', '${dayData.date}', ${idx})">❌</button></div></div>`; 
                }); 
            }
        });
        if(!found) listNode.innerHTML = '<div style="font-size:11px;text-align:center; color:var(--text-muted);">No logs found for this date.</div>';
    },

    duplicatePastExpense: async function(m, dateStr, idx) {
        let s = window.s;
        let ok = await window.ui.openUConfirm("Duplicate", "Copy this past expense to today's Dashboard logger?");
        if(!ok) return;
        let item = s.history[m].archive.find(a => a.date === dateStr).logs[idx];
        
        window.ui.switchTab('dash');
        document.getElementById('setMode').value = m; this.changeMode();
        document.getElementById('customDescription').value = item.tag.split(' [Incl.')[0]; 
        document.getElementById('customAmount').value = item.amount - (item.deadMoney||0); 
        document.getElementById('advCategory').value = item.category; 
        document.getElementById('advProject').value = item.project || 'none'; window.ui.toggleOnlineFields('adv'); 
        document.getElementById('advSourceWallet').value = item.walletSource; window.ui.toggleFXOverride('adv'); window.ui.checkVapeField('adv');
        
        if (item.deductedAmount !== undefined) document.getElementById('advActualDeduct').value = item.deductedAmount;
        if (item.vapeQty) document.getElementById('advVapeQty').value = item.vapeQty;
        if(item.project && item.project.startsWith('mis_') && s.projects.missions[item.project.replace('mis_','')].hasLogistics) { document.getElementById('advShipping').value = item.deadMoney || 0; document.getElementById('advTax').value = ''; } 
        document.getElementById('advLocation').value = item.location || ''; document.getElementById('advItems').value = item.items || ''; document.getElementById('advWhom').value = item.whom || ''; 
        document.getElementById('advMain').style.display = 'flex';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    editPastExpense: function(m, dateStr, idx) {
        let s = window.s;
        let dayIdx = s.history[m].archive.findIndex(a => a.date === dateStr); if(dayIdx === -1) return;
        let item = s.history[m].archive[dayIdx].logs[idx];
        window.tmEditingIdx = idx; window.tmEditingMode = m; window.tmEditingDate = dateStr; 
        window.ui.toggleTMForm();
        document.getElementById('tmEditBanner').style.display = 'block';
        let dObj = new Date(dateStr); document.getElementById('tmDate').value = `${dObj.getFullYear()}-${String(dObj.getMonth() + 1).padStart(2, '0')}-${String(dObj.getDate()).padStart(2, '0')}`; document.getElementById('setMode').value = m;
        document.getElementById('tmTag').value = item.tag.split(' [Incl.')[0]; document.getElementById('tmAmount').value = item.amount - (item.deadMoney||0); document.getElementById('tmCategory').value = item.category; document.getElementById('tmProject').value = item.project || 'none'; window.ui.toggleOnlineFields('tm'); document.getElementById('tmSourceWallet').value = item.walletSource; window.ui.toggleFXOverride('tm'); window.ui.checkVapeField('tm');
        if (item.deductedAmount !== undefined) document.getElementById('tmActualDeduct').value = item.deductedAmount;
        if (item.vapeQty) document.getElementById('tmVapeQty').value = item.vapeQty;
        if(item.project && item.project.startsWith('mis_') && s.projects.missions[item.project.replace('mis_','')].hasLogistics) { document.getElementById('tmShipping').value = item.deadMoney || 0; document.getElementById('tmTax').value = ''; } 
        document.getElementById('tmLocation').value = item.location || ''; document.getElementById('tmItems').value = item.items || ''; document.getElementById('tmWhom').value = item.whom || ''; document.getElementById('advTM').style.display = 'flex'; 
        window.scrollTo({ top: document.getElementById('advTM').offsetTop - 50, behavior: 'smooth' });
    },

    logPastExpense: function() {
        let s = window.s;
        let dVal = document.getElementById('tmDate').value; if(!dVal) return; 
        let [y, month, d] = dVal.split('-'); let targetStr = new Date(y, month - 1, d).toDateString(); 
        let baseCost = parseFloat(document.getElementById('tmAmount').value); let tag = document.getElementById('tmTag').value.trim() || '💸 Past Item'; if(isNaN(baseCost) || baseCost <= 0) return; 
        let src = document.getElementById('tmSourceWallet').value; let project = document.getElementById('tmProject').value; let cat = document.getElementById('tmCategory').value; let m = document.getElementById('setMode').value; 
        let targetWallet = m === 'vacation' ? 'cash_tnd' : 'cash_usd'; if (src !== 'default') targetWallet = src;
        let bypass = (src !== 'default'); let shipping = 0, tax = 0, vapeQty = 0; 
        if (cat === '💨 Vape') { vapeQty = parseInt(document.getElementById('tmVapeQty').value) || 1; s.vape_stash.count += vapeQty; }
        if(project.startsWith('mis_') && s.projects.missions[project.replace('mis_','')]?.hasLogistics) { shipping = parseFloat(document.getElementById('tmShipping').value) || 0; tax = parseFloat(document.getElementById('tmTax').value) || 0; } 
        let totalCost = baseCost + shipping + tax; 
        let isTargetUSD = ['brightwell', 'wise', 'cash_usd', 'ibkr_cash'].includes(targetWallet); let deductAmount = totalCost; let isMismatch = (m === 'vacation' && isTargetUSD) || (m === 'onboard' && !isTargetUSD); let actualInput = document.getElementById('tmActualDeduct').value;
        if (isMismatch) { if (actualInput && parseFloat(actualInput) > 0) deductAmount = parseFloat(actualInput); else deductAmount = m === 'vacation' ? totalCost / s.fx_rate : totalCost * s.fx_rate; }

        if (window.tmEditingIdx > -1) {
            let dayIdxOld = s.history[window.tmEditingMode].archive.findIndex(a => a.date === window.tmEditingDate); let oldItem = s.history[window.tmEditingMode].archive[dayIdxOld].logs[window.tmEditingIdx];
            if(oldItem.category === '💨 Vape' && oldItem.vapeQty) s.vape_stash.count = Math.max(0, s.vape_stash.count - oldItem.vapeQty);
            if(oldItem.walletSource && s.vault[oldItem.walletSource] !== undefined) { 
                let isOldTargetUSD = ['brightwell', 'wise', 'cash_usd', 'ibkr_cash'].includes(oldItem.walletSource); let refundAmount = oldItem.amount; 
                if (oldItem.deductedAmount !== undefined) refundAmount = oldItem.deductedAmount; else { let rate = oldItem.fxRate && !isNaN(oldItem.fxRate) ? oldItem.fxRate : s.fx_rate; if (window.tmEditingMode === 'vacation' && isOldTargetUSD) { refundAmount = oldItem.amount / rate; } else if (window.tmEditingMode === 'onboard' && !isOldTargetUSD) { refundAmount = oldItem.amount * rate; } }
                s.vault[oldItem.walletSource] += refundAmount; 
            } 
            this.reverseProjectTracking(oldItem, window.tmEditingMode); s.history[window.tmEditingMode].archive[dayIdxOld].logs.splice(window.tmEditingIdx, 1);
            if (s.history[window.tmEditingMode].archive[dayIdxOld].logs.length === 0) s.history[window.tmEditingMode].archive.splice(dayIdxOld, 1);
            window.ui.cancelTMEdit();
        }

        s.vault[targetWallet] -= deductAmount; 
        let spillover = 0; 

        if (project.startsWith('env_')) { 
            let envKey = project.replace('env_', ''); let env = s.projects.envelopes[envKey]; bypass = env.bypass; 
            let trackingCost = totalCost;
            if (env.currency === 'USD' && m === 'vacation') trackingCost = totalCost / s.fx_rate;
            if (env.currency === 'TND' && m === 'onboard') trackingCost = totalCost * s.fx_rate;
            if (env.spent + trackingCost > env.limit) { 
                let over = (env.spent + trackingCost) - env.limit;
                if (env.currency === 'USD' && m === 'onboard') spillover = over;
                else if (env.currency === 'TND' && m === 'vacation') spillover = over;
                else if (env.currency === 'USD' && m === 'vacation') spillover = over * s.fx_rate; 
                else if (env.currency === 'TND' && m === 'onboard') spillover = over / s.fx_rate;
                if (env.spent >= env.limit) spillover = totalCost; 
            } 
            env.spent += trackingCost; 
        } 
        else if (project.startsWith('mis_')) { 
            let misKey = project.replace('mis_', ''); let mis = s.projects.missions[misKey]; bypass = mis.bypass; 
            let trackingCost = totalCost;
            if (mis.currency === 'USD' && m === 'vacation') trackingCost = totalCost / s.fx_rate;
            if (mis.currency === 'TND' && m === 'onboard') trackingCost = totalCost * s.fx_rate;
            mis.spent += trackingCost; 
            if(mis.hasLogistics) {
                let deadTrack = shipping + tax;
                if (mis.currency === 'USD' && m === 'vacation') deadTrack = deadTrack / s.fx_rate;
                if (mis.currency === 'TND' && m === 'onboard') deadTrack = deadTrack * s.fx_rate;
                mis.dead += deadTrack;
            }
        }

        if (shipping > 0 || tax > 0) tag += ` [Incl. ${(shipping+tax).toFixed(2)} Dead Money]`; 
        let dayIdx = s.history[m].archive.findIndex(a => new Date(a.date).toDateString() === targetStr); 
        let newLog = { amount: totalCost, tag: tag, category: cat, location: document.getElementById('tmLocation').value.trim(), items: document.getElementById('tmItems').value.trim(), whom: document.getElementById('tmWhom').value.trim(), walletSource: targetWallet, bypassLimit: bypass, spillover: spillover, project: project, deadMoney: (shipping+tax), deductedAmount: deductAmount, fxRate: s.fx_rate, ts: new Date(y, month-1, d).getTime(), vapeQty: vapeQty }; 
        if(dayIdx === -1) s.history[m].archive.push({ date: targetStr, limit: s.history[m].limit, logs: [newLog] }); else s.history[m].archive[dayIdx].logs.push(newLog); 
        window.ui.cancelTMEdit(); window.db.saveState(); this.loadPastDay();
    },

    deletePastExpense: async function(m, dateStr, idx) { 
        let s = window.s;
        let ok = await window.ui.openUConfirm("Delete", "Delete this past expense entirely?"); if(!ok) return;
        let dayIdx = s.history[m].archive.findIndex(a => a.date === dateStr); 
        if(dayIdx > -1) { 
            let item = s.history[m].archive[dayIdx].logs[idx]; 
            if(item.category === '💨 Vape' && item.vapeQty) s.vape_stash.count = Math.max(0, s.vape_stash.count - item.vapeQty);
            if(item.walletSource && s.vault[item.walletSource] !== undefined) { 
                let isTargetUSD = ['brightwell', 'wise', 'cash_usd', 'ibkr_cash'].includes(item.walletSource); let refundAmount = item.amount; 
                if (item.deductedAmount !== undefined) refundAmount = item.deductedAmount; else { let rate = item.fxRate && !isNaN(item.fxRate) ? item.fxRate : s.fx_rate; if (m === 'vacation' && isTargetUSD) { refundAmount = item.amount / rate; } else if (m === 'onboard' && !isTargetUSD) { refundAmount = item.amount * rate; } }
                s.vault[item.walletSource] += refundAmount; 
            } 
            this.reverseProjectTracking(item, m); s.history[m].archive[dayIdx].logs.splice(idx, 1); if(s.history[m].archive[dayIdx].logs.length === 0) s.history[m].archive.splice(dayIdx, 1); 
            window.db.saveState(); this.loadPastDay(); 
        } 
    },

    closeOutDay: async function() { 
        let s = window.s;
        let curHist = s.history[s.mode]; let guessDate = new Date(); 
        if (curHist.current.length > 0) guessDate = new Date(curHist.current[0].ts); else if (guessDate.getHours() < 5) guessDate.setDate(guessDate.getDate() - 1); 
        let archiveDate = await window.ui.openUPrompt("Close Day", "Archive today's logs under which date?", guessDate.toDateString()); if (!archiveDate) return; 
        
        let spentTND = 0; let spentUSD = 0;
        if (curHist.current.length > 0) { 
            let spent = curHist.current.reduce((sum, item) => sum + ((item.category === "🏦 Financial & Fees") ? 0 : (item.bypassLimit ? (item.spillover||0) : item.amount)), 0); 
            if (s.mode === 'onboard') spentUSD = spent; else spentTND = spent;
        }

        let existingIdx = curHist.archive.findIndex(a => a.date === archiveDate); 
        if (existingIdx > -1) { 
            curHist.archive[existingIdx].logs.push(...curHist.
