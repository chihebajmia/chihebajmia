// ==========================================
// ENGINE.JS - CORE LOGIC & MATH (V41 - No Lock)
// ==========================================

window.engine = {
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

        // --- V41 Dashboard Countdowns ---
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
            
            // Hardcoded Bi-Weekly Pay Dates for Contract
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

        // Predictive Vape Lock
        let vapeLockedCost = 0;
        let vLogs = [];
        s.history[s.mode].archive.forEach(a => { a.logs.forEach(l => { if (l.category === '💨 Vape') vLogs.push({...l, ts: l.ts}); }); });
        s.history[s.mode].current.forEach(l => { if (l.category === '💨 Vape') vLogs.push({...l, ts: l.ts}); });
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

        let daily = s.history[s.mode].limit; 
        document.getElementById('uiRunway').innerText = daily > 0 ? Math.floor(totalLiquid / daily) + " Days" : "N/A";
        let rBudget = document.getElementById('uiRunwayBudget');
        if(rBudget) rBudget.innerText = daily > 0 ? `(at ${daily.toFixed(2)} ${isUSDMode?'USD':'TND'}/day)` : '';
        
        let netLiquid = Math.max(0, totalLiquid - activeEnvLocked);
        let netRunway = daily > 0 ? Math.floor(netLiquid / daily) : 0;
        let netLiquidDisplay = isUSDMode ? `$${netLiquid.toFixed(2)}` : `${netLiquid.toFixed(2)} TND`;
        document.getElementById('uiNetRunway').innerText = `Net (Excl. Envelopes & Vapes): ${netRunway} Days | ${netLiquidDisplay}`;

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
        this.renderIOUs(); this.renderSchedule();
    },

    calculateBehavioralStreaks: function() {
        let s = window.s;
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
            curHist.archive[existingIdx].logs.push(...curHist.current); 
            if (s.mode === 'onboard') s.capital_saved_usd -= spentUSD; else s.capital_saved_tnd -= spentTND;
        } else { 
            if (s.mode === 'onboard') s.capital_saved_usd += (curHist.limit - spentUSD); else s.capital_saved_tnd += (curHist.limit - spentTND);
            curHist.archive.push({ date: archiveDate, limit: curHist.limit, logs: [...curHist.current] }); 
        } 
        curHist.current = []; curHist.balance = curHist.limit; window.db.saveState(); 
    },

    renderIOUs: function() {
        let s = window.s;
        const pList = document.getElementById('payablesList'); pList.innerHTML = '';
        s.ious.payables.forEach(p => { pList.innerHTML += `<div class="iou-item"><div><div style="font-weight:bold;">${p.name}</div><div style="color:var(--warning); font-size:11px;">Owe: ${p.amount.toFixed(2)} ${p.currency}</div></div><div><button class="iou-btn" onclick="window.engine.processIOU('payable', ${p.id})">Pay</button> <button class="iou-del" style="background:none;border:none;color:var(--danger);" onclick="window.engine.deleteIOU('payable', ${p.id})">❌</button></div></div>`; });
        const rList = document.getElementById('receivablesList'); rList.innerHTML = '';
        s.ious.receivables.forEach(r => { rList.innerHTML += `<div class="iou-item"><div><div style="font-weight:bold;">${r.name}</div><div style="color:var(--success); font-size:11px;">Owed: ${r.amount.toFixed(2)} ${r.currency}</div></div><div><button class="iou-btn" style="background:var(--success);" onclick="window.engine.processIOU('receivable', ${r.id})">Collect</button> <button class="iou-del" style="background:none;border:none;color:var(--danger);" onclick="window.engine.deleteIOU('receivable', ${r.id})">❌</button></div></div>`; });
    },

    addIOU: async function(type) { 
        let s = window.s;
        let name = await window.ui.openUPrompt("New IOU", "Entity Name:"); if(!name) return; 
        let amtStr = await window.ui.openUPrompt("Amount", "Enter Amount:"); let amount = parseFloat(amtStr); if(isNaN(amount) || amount <= 0) return; 
        let currency = await window.ui.openUPrompt("Currency", "Currency (USD/TND):", "USD"); if(!currency) return; 
        let actionWord = type === 'payable' ? 'added to' : 'deducted from';
        let w = await window.ui.openUPrompt("Wallet Transfer", `Map this IOU to a wallet? (Money was ${actionWord}):\n1: Brightwell\n2: Cash(USD)\n3: Wise\n4: Cash(TND)\n5: Savings\n6: Skip`); 
        if (w && w !== '6') { let key = ""; if(w==='1') key='brightwell'; else if(w==='2') key='cash_usd'; else if(w==='3') key='wise'; else if(w==='4') key='cash_tnd'; else if(w==='5') key='savings'; if (key) { if (type === 'payable') s.vault[key] += amount; else s.vault[key] -= amount; } }
        s.ious[type + 's'].push({ id: Date.now(), name: name, amount: amount, currency: currency.toUpperCase() }); window.db.saveState(); 
    },

    processIOU: async function(type, id) { 
        let s = window.s;
        let list = s.ious[type + 's']; let idx = list.findIndex(i => i.id === id); if(idx === -1) return; let item = list[idx]; 
        let amtStr = await window.ui.openUPrompt("Process IOU", `Clear how much of ${item.amount}?`, item.amount); let reduceAmount = parseFloat(amtStr); if(isNaN(reduceAmount) || reduceAmount <= 0) return; 
        let w = await window.ui.openUPrompt("Wallet", `Wallet to process this transaction?\n1: Brightwell\n2: Cash(USD)\n3: Wise\n4: Cash(TND)\n5: Savings\n6: Skip`); 
        if (w && w !== '6') { let key = ""; if(w==='1') key='brightwell'; else if(w==='2') key='cash_usd'; else if(w==='3') key='wise'; else if(w==='4') key='cash_tnd'; else if(w==='5') key='savings'; else return; let deductStr = await window.ui.openUPrompt("Wallet Amount", `Amount mathematically deducted/added to ${key}:`, reduceAmount); let walletDeduct = parseFloat(deductStr); if(isNaN(walletDeduct)) return; if(type === 'payable') s.vault[key] -= walletDeduct; else s.vault[key] += walletDeduct; }
        item.amount -= reduceAmount; if(item.amount <= 0) list.splice(idx, 1); window.db.saveState(); 
    },

    deleteIOU: async function(type, id) { 
        let s = window.s;
        let ok = await window.ui.openUConfirm("Delete", "Delete record without affecting vaults?"); if(ok) { s.ious[type + 's'] = s.ious[type + 's'].filter(i => i.id !== id); window.db.saveState(); } 
    },

    renderSchedule: function() {
        let s = window.s;
        let html = ''; let pending = s.loan.schedule.filter(x => !x.paid); let paid = s.loan.schedule.filter(x => x.paid);
        if(pending.length === 0 && paid.length === 0) html = '<div style="font-size:11px;color:var(--text-muted);text-align:center;">No installments logged.</div>';
        
        let vStart = s.settings.vacationStart ? new Date(s.settings.vacationStart).getTime() : 0;
        let vEnd = s.settings.vacationEnd ? new Date(s.settings.vacationEnd).getTime() : 0;

        pending.forEach((p, idx) => { 
            let dParts = p.date.split(' ');
            let pDate = dParts.length === 3 ? new Date(`${dParts[0]} 28, ${dParts[2]}`).getTime() : new Date(p.date).getTime();
            let isVacation = (vStart && vEnd && pDate >= vStart && pDate <= vEnd);
            
            let badge = '';
            if (isVacation) {
                badge = `<span style="background:var(--warning);color:black;padding:2px 4px;border-radius:4px;font-size:8px;font-weight:bold;">🏖️ Vacation Hold (Will shift to Arrears)</span>`;
            } else {
                badge = idx === 0 ? `<span style="background:var(--danger);color:white;padding:2px 4px;border-radius:4px;font-size:8px;">🔴 Next</span>` : `<span style="background:#38bdf8;color:white;padding:2px 4px;border-radius:4px;font-size:8px;">🔵 Upcoming</span>`;
            }
            
            html += `<div class="iou-item" style="border-color:var(--panel-border);"><div><strong style="font-size:12px;">🗓️ ${p.date}</strong> <button onclick="window.engine.editInstallmentAmount(${p.id})" style="background:none;border:none;cursor:pointer;">✏️</button><div style="font-size:11px;color:var(--danger); font-weight:bold; margin-top:4px;">${p.amount.toFixed(2)} TND</div><div style="margin-top:4px;">${badge}</div></div><div><button class="iou-btn" onclick="window.engine.payInstallment(${p.id})">Manual Pay</button></div></div>`; 
        });
        
        if(paid.length > 0) { 
            html += `<div style="font-size:10px; color:var(--text-muted); margin:10px 0 5px 0; text-align:center;">Archived Payments</div>`; 
            paid.forEach(p => { 
                let shiftNote = p.shiftedToArrears ? `<span style="color:var(--warning);font-size:8px; display:block; margin-top:2px;">(Shifted to Arrears via Vacation)</span>` : "";
                html += `<div class="iou-item" style="opacity:0.6; border-color:var(--success);"><div><strike style="font-size:12px;">${p.date}</strike> <span style="background:var(--success);color:white;padding:2px 4px;border-radius:4px;font-size:8px;">🟢 Paid</span><div style="font-size:11px;color:var(--success); font-weight:bold; margin-top:4px;">${p.amount.toFixed(2)} TND</div>${shiftNote}</div></div>`; 
            }); 
        }
        document.getElementById('loanScheduleList').innerHTML = html;
    },

    payInstallment: async function(id) {
        let s = window.s;
        let p = s.loan.schedule.find(x => x.id === id); if(!p) return;
        let w = await window.ui.openUPrompt("Pay Installment", `Pay ${p.amount.toFixed(2)} TND from:\n1: Brightwell (FX Converted)\n2: Savings TND\n3: Cash TND\n4: External Source (No deduction)`); if(!w) return;
        let deductAmt = 0; let walletKey = '';
        if(w==='1') { deductAmt = (p.amount / s.fx_rate); walletKey = 'brightwell'; }
        else if(w==='2') { deductAmt = p.amount; walletKey = 'savings'; }
        else if(w==='3') { deductAmt = p.amount; walletKey = 'cash_tnd'; }
        
        if (walletKey !== '') {
            if (s.vault[walletKey] < deductAmt) {
                let ok = await window.ui.openUConfirm("Warning", `This pushes ${walletKey} into negative. Proceed?`);
                if(!ok) return;
            }
            s.vault[walletKey] -= deductAmt;
            s.history[s.mode].current.push({ amount: deductAmt, tag: `🏦 Manual Installment Pay`, category: "🏦 Financial & Fees", location: "Bank", walletSource: walletKey, bypassLimit: true, fxRate: s.fx_rate, ts: Date.now() });
            window.db.logTransaction('STB Installment', deductAmt, (w==='1')?'USD':'TND', walletKey, 'Manual schedule payment');
        }
        p.paid = true; p.paidOn = Date.now();
        window.db.saveState();
    },

    processPaycheck: async function() {
        let s = window.s;
        let gross = parseFloat(document.getElementById('pwGross').value); if(isNaN(gross) || gross <= 0) return;
        let toLoanUSD = parseFloat(document.getElementById('pwLoanAmt').value) || 0; 
        let toSavUSD = parseFloat(document.getElementById('pwSavAmt').value) || 0; 
        let toOpUSD = parseFloat(document.getElementById('pwOpAmt').value) || 0;
        
        let toLoanTND = toLoanUSD * s.fx_rate; 
        let remainingLoanTND = toLoanTND;
        let waterfallLogs = [];
        
        let unpaids = s.loan.schedule.filter(x => !x.paid);
        if (unpaids.length > 0 && remainingLoanTND > 0) {
            let inst = unpaids[0];
            if (remainingLoanTND >= inst.amount) {
                inst.paid = true;
                inst.paidOn = Date.now();
                remainingLoanTND -= inst.amount;
                waterfallLogs.push(`1 New Inst: ${inst.amount} TND`);
            }
        }
        
        if (s.loan.overdraft > 0 && remainingLoanTND > 0) {
            if (remainingLoanTND >= s.loan.overdraft) {
                remainingLoanTND -= s.loan.overdraft;
                waterfallLogs.push(`Clr Overdraft: ${s.loan.overdraft.toFixed(2)} TND`);
                s.loan.overdraft = 0;
            } else {
                s.loan.overdraft -= remainingLoanTND;
                waterfallLogs.push(`Red. Overdraft: ${remainingLoanTND.toFixed(2)} TND`);
                remainingLoanTND = 0;
            }
        }
        
        if (remainingLoanTND > 0) {
            s.loan.arrears -= remainingLoanTND;
            if(s.loan.arrears < 0) s.loan.arrears = 0; 
            waterfallLogs.push(`Arrears (Oldest): ${remainingLoanTND.toFixed(2)} TND`);
        }
        
        s.history[s.mode].current.push({ amount: toLoanUSD, tag: `🏦 STB Bank Auto-Wire ($${toLoanUSD.toFixed(2)}) [${waterfallLogs.join(' | ')}]`, category: "🏦 Financial & Fees", location: "International Wire", walletSource: "brightwell", bypassLimit: true, fxRate: s.fx_rate, ts: Date.now() });

        let savDest = document.getElementById('pwSavDest').value; 
        if(savDest === 'ibkr') s.vault.ibkr_cash += toSavUSD; else s.vault.savings += (toSavUSD * s.fx_rate);
        s.vault.brightwell += toOpUSD; 
        
        window.db.logTransaction('Paycheck Waterfall', gross, 'USD', 'brightwell', `Processed $${gross} paycheck splits`);
        
        document.getElementById('paycheckModal').style.display = 'none'; 
        window.db.saveState(); 
        await window.ui.openUConfirm("Success", `Processed: -$${toLoanUSD.toFixed(2)} to Debt, +$${toSavUSD.toFixed(2)} to ${savDest.toUpperCase()}, +$${toOpUSD.toFixed(2)} to Brightwell`);
    },

    saveIBKR: function() { 
        let s = window.s;
        s.vault.ibkr_cash = parseFloat(document.getElementById('ibkrIdle').value) || 0; s.vault.ibkr_shares = parseFloat(document.getElementById('ibkrShares').value) || 0; s.vault.ibkr_cost = parseFloat(document.getElementById('ibkrCost').value) || 0; s.vault.ibkr_price = parseFloat(document.getElementById('ibkrPrice').value) || 0; window.db.saveState(); 
    },
    
    fetchStockPrice: async function() {
        if (!navigator.onLine) { await window.ui.openUConfirm("Offline", "You are currently offline. Manual entry only."); return; }
        try { const res = await fetch('https://api.allorigins.win/get?url=' + encodeURIComponent('https://query1.finance.yahoo.com/v8/finance/chart/CSPX.L')); const data = await res.json(); const price = JSON.parse(data.contents).chart.result[0].meta.regularMarketPrice; document.getElementById('ibkrPrice').value = price.toFixed(2); this.saveIBKR(); await window.ui.openUConfirm("Success", "Market price updated: $" + price.toFixed(2)); } catch (e) { await window.ui.openUConfirm("Error", "Network Error: Could not fetch stock price."); }
    },

    processTransfer: async function() {
        let s = window.s;
        let amt = parseFloat(document.getElementById('trfAmount').value);
        if(isNaN(amt) || amt <= 0) return;
        let fromW = document.getElementById('trfFrom').value;
        let toW = document.getElementById('trfTo').value;
        if(fromW === toW) return;
        
        if(s.vault[fromW] < amt) {
            let ok = await window.ui.openUConfirm("Warning", "Insufficient funds in source wallet. Proceed into negative balance?");
            if(!ok) return;
        }

        let isFromUSD = ['brightwell', 'wise', 'cash_usd', 'ibkr_cash'].includes(fromW);
        let isToUSD = ['brightwell', 'wise', 'cash_usd', 'ibkr_cash'].includes(toW);
        
        let deductAmt = amt;
        let addAmt = amt;
        
        if (isFromUSD && !isToUSD) addAmt = amt * s.fx_rate;
        if (!isFromUSD && isToUSD) addAmt = amt / s.fx_rate;
        
        s.vault[fromW] -= deductAmt;
        s.vault[toW] += addAmt;
        
        window.db.logTransaction('Transfer', deductAmt, isFromUSD?'USD':'TND', fromW, `Transferred to ${toW}`);
        document.getElementById('transferModal').style.display = 'none';
        window.db.saveState();
        await window.ui.openUConfirm("Success", `Transferred ${deductAmt.toFixed(2)} out of source wallet.`);
    },

    processSweep: async function() { 
        let s = window.s;
        let amt = parseFloat(document.getElementById('swAmount').value); if(isNaN(amt) || amt <= 0) return; let src = document.getElementById('swSource').value; s.vault[src] -= amt; s.vault.ibkr_cash += amt; 
        window.db.logTransaction('Sweep', amt, 'USD', src, 'Swept to IBKR Idle Cash');
        document.getElementById('sweepModal').style.display = 'none'; window.db.saveState(); await window.ui.openUConfirm("Success", `Swept $${amt.toFixed(2)} into IBKR Idle Cash.`); 
    },

    vaultWise: async function() { 
        let s = window.s;
        let aStr = await window.ui.openUPrompt("Wise Transfer", "Amount to Wise (USD):"); let amount = parseFloat(aStr); if(isNaN(amount) || amount <= 0) return; let mStr = await window.ui.openUPrompt("Fee Method", "1: Wire ($1) | 2: Apple Pay ($1.25)"); let fee = mStr === '1' ? 1.00 : (mStr === '2' ? 1.25 : 0); if(fee === 0) return; s.vault.brightwell -= (amount + fee); s.vault.wise += amount; s.vault.lifetime_fees += fee; 
        window.db.logTransaction('Wise Transfer', amount, 'USD', 'brightwell', `Sent to Wise (Fee: $${fee})`);
        window.db.saveState(); 
    },

    vaultExchange: async function() { 
        let s = window.s;
        let uStr = await window.ui.openUPrompt("Exchange", "USD given:"); let usdGiven = parseFloat(uStr); if(isNaN(usdGiven) || usdGiven <= 0) return; let tStr = await window.ui.openUPrompt("Exchange", "TND received:"); let tndRec = parseFloat(tStr); if(!isNaN(tndRec) && tndRec > 0) { s.vault.cash_usd -= usdGiven; s.vault.cash_tnd += tndRec; 
            window.db.logTransaction('FX Exchange', usdGiven, 'USD', 'cash_usd', `Received ${tndRec} TND`);
            window.db.saveState(); 
        } 
    },

    processATM: function() { 
        let s = window.s;
        let amt = parseFloat(document.getElementById('atmAmt').value); if(isNaN(amt) || amt <= 0) return; let src = document.getElementById('atmSource').value; let loc = document.getElementById('atmLoc').value; let feeUSD = 0; if (loc === 'tunisia') { feeUSD = (10 / s.fx_rate); } else if (loc === 'intl') { feeUSD = (parseFloat(document.getElementById('atmFee').value) || 0); } let isUSDMode = (s.mode === 'onboard'); let amtUSD = isUSDMode ? amt : (amt / s.fx_rate); let amtTND = isUSDMode ? (amt * s.fx_rate) : amt; if (src === 'savings') { s.vault.savings -= amtTND; } else { s.vault[src] -= (amtUSD + feeUSD); } if (isUSDMode) { s.vault.cash_usd += amt; } else { s.vault.cash_tnd += amt; } if (feeUSD > 0) { let logAmount = (loc === 'tunisia') ? 10 : (isUSDMode ? feeUSD : (feeUSD * s.fx_rate)); let locLabel = loc === 'tunisia' ? "Tunisia" : "International"; s.history[s.mode].current.push({ amount: logAmount, tag: "ATM Withdrawal Fee", category: "🏦 Financial & Fees", location: locLabel, walletSource: src, bypassLimit: true, fxRate: s.fx_rate, ts: Date.now() }); } 
        
        window.db.logTransaction('ATM Withdrawal', amt, isUSDMode ? 'USD' : 'TND', src, `Location: ${loc}`);
        document.getElementById('atmModal').style.display = 'none'; window.db.saveState(); 
    },

    processIncome: async function() { 
        let s = window.s;
        let amt = parseFloat(document.getElementById('incAmount').value); if(isNaN(amt) || amt <= 0) return; let source = document.getElementById('incSource').value; let wallet = document.getElementById('incWallet').value; let details = document.getElementById('incDetails').value.trim() || "No details"; 
        if(wallet === 'ibkr_cash') s.vault.ibkr_cash += amt; else s.vault[wallet] += amt; 
        let isUSD = ['brightwell', 'wise', 'cash_usd', 'ibkr_cash'].includes(wallet); let currency = isUSD ? 'USD' : 'TND'; if(source === 'borrow') { s.ious.payables.push({ id: Date.now(), name: details, amount: amt, currency: currency }); await window.ui.openUConfirm("Success", "Added to vault AND created Payable IOU."); } s.income_logs.push({ id: Date.now(), amount: amt, currency: currency, wallet: wallet, source: source, details: details, ts: Date.now() }); 
        
        window.db.logTransaction('Income/Funding', amt, currency, wallet, `Source: ${source} - ${details}`);
        document.getElementById('incomeModal').style.display = 'none'; window.db.saveState(); 
    },

    renderIncomeLogs: function() { 
        let s = window.s;
        const listNode = document.getElementById('incomeList'); listNode.innerHTML = ''; if(s.income_logs.length === 0) { listNode.innerHTML = '<div style="font-size:11px;text-align:center;color:var(--text-muted);">No income.</div>'; return; } s.income_logs.slice().reverse().forEach((inc, idx) => { let actualIdx = s.income_logs.length - 1 - idx; let srcIcon = inc.source === 'gig' ? '🛠️' : (inc.source === 'sale' ? '🏷️' : (inc.source === 'borrow' ? '🤝' : '✏️')); listNode.innerHTML += `<div class="history-item"><div><div style="font-weight:600;">${srcIcon} ${inc.details}</div><div style="font-size:9px; color:var(--text-muted);">To: ${inc.wallet}</div></div><div style="display:flex; gap:10px; align-items:center;"><span style="color:var(--success); font-weight:bold;">+${inc.amount.toFixed(2)} ${inc.currency}</span><button class="edit-btn" onclick="window.engine.deleteIncome(${actualIdx})">❌</button></div></div>`; }); 
    },

    deleteIncome: async function(idx) { 
        let s = window.s;
        let ok = await window.ui.openUConfirm("Delete", "Delete this income log?"); if(ok) { s.income_logs.splice(idx, 1); window.db.saveState(); this.renderIncomeLogs(); } 
    },

    saveEditModal: function() { 
        let s = window.s;
        ['brightwell','wise','cash_usd','cash_tnd','savings'].forEach(k => s.vault[k] = parseFloat(document.getElementById('m_'+k).value) || 0); document.getElementById('editModal').style.display='none'; window.db.saveState(); 
    },
    
    logSTBPayment: function() { 
        let s = window.s;
        let amt = parseFloat(document.getElementById('stbPayAmt').value); if(isNaN(amt) || amt <= 0) return; 
        let w = document.getElementById('stbPayWallet').value; 
        
        if(w !== 'none') {
            let deductAmt = (w === 'brightwell') ? amt/s.fx_rate : amt;
            s.vault[w] -= deductAmt;
            s.history[s.mode].current.push({ amount: deductAmt, tag: `🏦 Manual STB Direct Payment`, category: "🏦 Financial & Fees", location: "Bank", walletSource: w, bypassLimit: true, fxRate: s.fx_rate, ts: Date.now() });
        } 
        
        if (s.loan.overdraft > 0) {
            if (amt >= s.loan.overdraft) { amt -= s.loan.overdraft; s.loan.overdraft = 0; }
            else { s.loan.overdraft -= amt; amt = 0; }
        }
        if (amt > 0) {
            s.loan.arrears -= amt; if(s.loan.arrears < 0) s.loan.arrears = 0; 
        }
        
        window.db.logTransaction('STB Manual Pay', amt, 'TND', w, 'Direct payment outside waterfall');
        window.db.saveState(); 
        document.getElementById('stbModal').style.display = 'none'; 
        document.getElementById('stbPayAmt').value = '';
    },

    renderChart: function(days) { 
        let s = window.s;
        let vol = 0; let cats = {}; let cutoff = Date.now() - (days * 86400000); 
        ['vacation', 'onboard'].forEach(m => { 
            s.history[m].archive.forEach(d => d.logs.forEach(l => { if(l.ts >= cutoff || days === 9999) { let amtTND = m === 'onboard' ? l.amount * l.fxRate : l.amount; vol += amtTND; cats[l.category] = (cats[l.category] || 0) + amtTND; } })); 
            s.history[m].current.forEach(l => { if(l.ts >= cutoff || days === 9999) { let amtTND = m === 'onboard' ? l.amount * l.fxRate : l.amount; vol += amtTND; cats[l.category] = (cats[l.category] || 0) + amtTND; } }); 
        }); 
        const bd = document.getElementById('catGraphContainer'); bd.innerHTML = ''; 
        if (vol === 0) { bd.innerHTML = '<div style="font-size:11px;color:var(--text-muted);text-align:center;">No data.</div>'; return; } 
        Object.keys(cats).sort((a,b) => cats[b] - cats[a]).forEach(tag => { let pct = (cats[tag] / vol) * 100; bd.innerHTML += `<div class="chart-row"><span style="width:110px; font-weight:bold; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">${tag}</span><div class="chart-bar-bg"><div class="chart-bar-fill" style="width:${pct}%"></div></div><span style="font-weight:bold;width:80px;text-align:right;">${cats[tag].toFixed(1)} TND</span></div>`; }); 
    },

    renderLeaderboard: function() {
        let s = window.s;
        const bd = document.getElementById('leaderboardHtml'); let locs = {};
        ['vacation', 'onboard'].forEach(m => { 
            s.history[m].archive.forEach(d => d.logs.forEach(l => { if(l.location) { let key = l.location.trim().toUpperCase(); let amt = m === 'onboard' ? l.amount * l.fxRate : l.amount; locs[key] = (locs[key] || 0) + amt; } })); 
            s.history[m].current.forEach(l => { if(l.location) { let key = l.location.trim().toUpperCase(); let amt = m === 'onboard' ? l.amount * l.fxRate : l.amount; locs[key] = (locs[key] || 0) + amt; } });
        }); 
        let sorted = Object.keys(locs).sort((a,b) => locs[b] - locs[a]); 
        if(sorted.length === 0) { bd.innerHTML = '<div style="font-size:11px;color:var(--text-muted);text-align:center;">No location data logged.</div>'; return; }
        let html = ''; sorted.forEach((loc, i) => { html += `<div style="display:flex; justify-content:space-between; font-size:12px; padding:6px 0; border-bottom:1px solid var(--panel-border);"><span><span style="color:var(--text-muted); margin-right:5px;">#${i+1}</span> ${loc}</span><strong style="color:var(--danger);">${locs[loc].toFixed(2)} TND</strong></div>`; });
        bd.innerHTML = html;
    },

    renderVapeStats: function() {
        let s = window.s;
        const bd = document.getElementById('vapeStatsHtml'); if (!bd) return;
        let vLogs = [];
        s.history[s.mode].archive.forEach(a => { a.logs.forEach(l => { if (l.category === '💨 Vape') vLogs.push({...l, ts: l.ts}); }); });
        s.history[s.mode].current.forEach(l => { if (l.category === '💨 Vape') vLogs.push({...l, ts: l.ts}); });
        vLogs.sort((a,b) => a.ts - b.ts);

        let totalSpent = vLogs.reduce((sum, l) => sum + l.amount, 0);
        let totalBought = vLogs.reduce((sum, l) => sum + (l.vapeQty || 1), 0);
        let sym = s.mode === 'vacation' ? 'TND' : 'USD';

        let stash = s.vape_stash.count;
        let empties = s.vape_stash.empty_logs;
        let avgLifespan = 0;
        
        if (vLogs.length > 0 && empties.length > 0) {
            let firstPurchaseTs = vLogs[0].ts;
            let latestEmptyTs = empties[empties.length - 1];
            let totalLifespanDays = (latestEmptyTs - firstPurchaseTs) / 86400000;
            if (totalLifespanDays > 0) avgLifespan = totalLifespanDays / empties.length;
        }

        let runOut = "Need more data";
        if (avgLifespan > 0 && stash > 0) { 
            let daysLeft = stash * avgLifespan; 
            let runDate = new Date(Date.now() + (daysLeft * 86400000)); 
            runOut = runDate.toDateString(); 
        } else if (stash === 0 && empties.length > 0) { runOut = "Stash Empty"; }

        let vapeLockedCost = 0;
        let now = Date.now();
        let targetEnd = (s.mode === 'vacation') ? 
            (s.settings.vacationEnd ? new Date(s.settings.vacationEnd).getTime() : 0) : 
            (s.settings.contractEnd ? new Date(s.settings.contractEnd).getTime() : 0);
            
        let modeDaysLeft = (targetEnd > now) ? (targetEnd - now) / 86400000 : 0;
        let costLabel = (s.mode === 'vacation') ? 'Est. Vacation Cost' : 'Est. Contract Cost';

        if (modeDaysLeft > 0 && avgLifespan > 0 && totalBought > 0) {
            let avgCost = totalSpent / totalBought;
            let vapesNeeded = modeDaysLeft / avgLifespan;
            let netVapesToBuy = Math.max(0, vapesNeeded - stash);
            vapeLockedCost = netVapesToBuy * avgCost;
        }

        let vapeLockDisplay = '';
        if (targetEnd === 0) {
            vapeLockDisplay = `<div style="font-size:11px; margin-top:5px;">${costLabel}: <strong style="color:var(--text-muted);">Set End Date in Setup</strong></div>`;
        } else if (avgLifespan === 0) {
            vapeLockDisplay = `<div style="font-size:11px; margin-top:5px;">${costLabel}: <strong style="color:var(--text-muted);">Need Empty Log to calculate</strong></div>`;
        } else if (vapeLockedCost === 0 && stash > 0) {
            vapeLockDisplay = `<div style="font-size:11px; margin-top:5px;">${costLabel}: <strong style="color:var(--success);">0.00 ${sym} (Stash Sufficient)</strong></div>`;
        } else if (vapeLockedCost > 0) {
            vapeLockDisplay = `<div style="font-size:11px; margin-top:5px;">${costLabel}: <strong style="color:var(--danger);">${vapeLockedCost.toFixed(2)} ${sym} (Locked)</strong></div>`;
        }

        let html = `
            <div style="display:flex; justify-content:space-between; font-size:11px; align-items:center; border-bottom:1px dashed var(--panel-border); padding-bottom:8px; margin-bottom:8px;">
                <div>Lifetime Bought: <strong style="font-size:12px;">${totalBought}</strong></div>
                <div>Total Spent: <strong style="font-size:12px; color:var(--danger);">${totalSpent.toFixed(2)} ${sym}</strong></div>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:11px; align-items:center;">
                <div>Active Stash: <strong style="font-size:16px; color:var(--accent);">${stash}</strong></div>
                <button class="v-btn" style="background:var(--danger);" onclick="window.engine.markVapeEmpty()">📉 Mark 1 Empty</button>
            </div>
            <div style="font-size:11px; margin-top:10px;">Avg Hardware Lifespan: <strong style="color:var(--success);">${avgLifespan > 0 ? avgLifespan.toFixed(1) + ' Days' : 'Need more data'}</strong></div>
            <div style="font-size:11px; margin-top:5px;">Stash Depletion Est: <strong style="color:var(--warning);">${runOut}</strong></div>
            ${vapeLockDisplay}
        `;
        bd.innerHTML = html;
    },

    markVapeEmpty: async function() {
        let s = window.s;
        if (s.vape_stash.count <= 0) { await window.ui.openUConfirm("Error", "Your stash is already at 0."); return; }
        let ok = await window.ui.openUConfirm("Confirm", "Mark 1 vape as fully consumed?"); if (!ok) return;
        s.vape_stash.count--; s.vape_stash.empty_logs.push(Date.now()); window.db.saveState();
    },

    fetchLiveFX: async function() { 
        let s = window.s; 
        if (!navigator.onLine) { await window.ui.openUConfirm("Offline", "You are offline. Cannot fetch FX."); return; }
        try { 
            const res = await fetch('https://open.er-api.com/v6/latest/USD'); 
            const data = await res.json(); 
            if (data && data.rates && data.rates.TND) { 
                s.fx_rate = parseFloat(data.rates.TND); 
                window.engine.populateSettings(); 
                window.db.saveState(); 
                await window.ui.openUConfirm("Success", "FX updated to " + s.fx_rate); 
            } 
        } catch (e) { await window.ui.openUConfirm("Error", "Network Error."); } 
    },

    updateContractDates: function() { 
        let s = window.s; 
        s.settings.contractStart = document.getElementById('setContractStart').value; 
        s.settings.contractEnd = document.getElementById('setContractEnd').value; 
        s.settings.vacationStart = document.getElementById('setVacationStart').value;
        s.settings.vacationEnd = document.getElementById('setVacationEnd').value;
        this.processVacationArrears(); 
        window.db.saveState(); 
    },

    populateSettings: function() { 
        let s = window.s; 
        document.getElementById('setMode').value = s.mode; 
        document.getElementById('setVacLimit').value = s.history.vacation.limit; 
        document.getElementById('setOnbLimit').value = s.history.onboard.limit; 
        document.getElementById('setFX').value = s.fx_rate; 
        document.getElementById('setContractStart').value = s.settings.contractStart || ''; 
        document.getElementById('setContractEnd').value = s.settings.contractEnd || ''; 
        document.getElementById('setVacationStart').value = s.settings.vacationStart || ''; 
        document.getElementById('setVacationEnd').value = s.settings.vacationEnd || ''; 
    },

    changeMode: function() { window.s.mode = document.getElementById('setMode').value; window.db.saveState(); },
    updateLimits: function() { window.s.history.vacation.limit = parseFloat(document.getElementById('setVacLimit').value) || 49; window.s.history.onboard.limit = parseFloat(document.getElementById('setOnbLimit').value) || 7.25; window.db.saveState(); },
    updateFX: function() { window.s.fx_rate = parseFloat(document.getElementById('setFX').value) || 2.923; window.db.saveState(); },
    
    recalibrateMath: async function() { 
        let s = window.s;
        let ok = await window.ui.openUConfirm("Recalibrate", "Recalibrate database?"); if(!ok) return; 
        let cap_tnd = 0; let cap_usd = 0; 
        ['vacation', 'onboard'].forEach(m => { 
            for (let i = s.history[m].archive.length - 1; i >= 0; i--) { 
                let day = s.history[m].archive[i]; day.date = new Date(day.date).toDateString(); 
                let activeLimit = day.limit || s.history[m].limit;
                let spent = day.logs.reduce((sum, item) => sum + ((item.category === "🏦 Financial & Fees") ? 0 : (item.bypassLimit ? (item.spillover||0) : item.amount)), 0); 
                let surplus = activeLimit - spent; 
                if (m === 'onboard') cap_usd += surplus; else cap_tnd += surplus; 
            } 
        }); 
        s.capital_saved_tnd = cap_tnd; s.capital_saved_usd = cap_usd; window.db.saveState(); await window.ui.openUConfirm("Success", "Recalibrated!"); 
    },
    
    exportData: function() { const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(window.s)); const dlAnchorElem = document.createElement('a'); dlAnchorElem.setAttribute("href", dataStr); dlAnchorElem.setAttribute("download", `CrewWallet_Backup_${new Date().toISOString().split('T')[0]}.json`); dlAnchorElem.click(); },
    importData: async function(event) { const file = event.target.files[0]; if(!file) return; const reader = new FileReader(); reader.onload = async function(e) { try { window.s = JSON.parse(e.target.result); window.db.saveState(); await window.ui.openUConfirm("Success", "Restored!"); } catch(err) { await window.ui.openUConfirm("Error", "Failed to parse file."); } }; reader.readAsText(file); },
    factoryReset: async function() { let ans = await window.ui.openUPrompt("Wipe", "Type RESET to wipe everything:"); if (ans === "RESET") { localStorage.clear(); indexedDB.deleteDatabase('CrewWalletDB'); location.reload(); } },
    
    exportPDFReport: function() { 
        let s = window.s;
        let now = new Date().toLocaleString(); let fx = s.fx_rate; let mode = s.mode.charAt(0).toUpperCase() + s.mode.slice(1); 
        let totUSD = s.vault.ibkr_cash + (s.vault.ibkr_shares * s.vault.ibkr_price) + s.vault.brightwell + s.vault.wise + s.vault.cash_usd; 
        let totalLiquid = (totUSD * fx) + s.vault.cash_tnd + s.vault.savings; 
        let isUSDMode = (s.mode === 'onboard'); let daily = s.history[s.mode].limit;
        let modLiquid = isUSDMode ? (s.vault.cash_usd + s.vault.brightwell + s.vault.wise) : totalLiquid;
        let liquidRunway = daily > 0 ? Math.floor(modLiquid / daily) : 0; 
        
        let misHtml = `<div style="display:flex; gap:10px; margin-bottom:20px; flex-wrap:wrap;">`; Object.keys(s.projects.missions).forEach(k => { let m = s.projects.missions[k]; if(!m.archived) misHtml += `<div style="flex:1; min-width:120px; border:1px solid #cbd5e1; padding:8px; border-radius:4px; text-align:center; background:#f8fafc;"><strong style="font-size:11px; color:#475569;">${m.name}</strong><div style="font-size:14px; font-weight:bold;">${m.spent.toFixed(2)} ${m.currency}</div>${m.hasLogistics?`<div style="font-size:9px; color:#dc2626;">Dead: ${m.dead.toFixed(2)} ${m.currency}</div>`:''}</div>`; }); misHtml += `</div>`; 
        
        let iouHtml = `<div style="display:flex; gap:15px; margin-bottom:20px;">`;
        iouHtml += `<div style="flex:1; background:#fef2f2; padding:10px; border-radius:6px; border:1px solid #fecaca;"><strong style="color:#ef4444; font-size:12px;">Payables (Owe)</strong>`; s.ious.payables.forEach(p => iouHtml += `<div style="font-size:11px; display:flex; justify-content:space-between; margin-top:4px;"><span>${p.name}</span><strong>${p.amount} ${p.currency}</strong></div>`); iouHtml += `</div>`;
        iouHtml += `<div style="flex:1; background:#f0fdf4; padding:10px; border-radius:6px; border:1px solid #bbf7d0;"><strong style="color:#10b981; font-size:12px;">Receivables (Owed To Me)</strong>`; s.ious.receivables.forEach(r => iouHtml += `<div style="font-size:11px; display:flex; justify-content:space-between; margin-top:4px;"><span>${r.name}</span><strong>${r.amount} ${r.currency}</strong></div>`); iouHtml += `</div></div>`;

        let vol = 0; let cats = {}; let cutoff = Date.now() - (30 * 86400000); ['vacation', 'onboard'].forEach(m => { s.history[m].archive.forEach(d => d.logs.forEach(l => { if(l.ts >= cutoff) { let amtTND = m === 'onboard' ? l.amount * l.fxRate : l.amount; vol += amtTND; cats[l.category] = (cats[l.category] || 0) + amtTND; } })); s.history[m].current.forEach(l => { if(l.ts >= cutoff) { let amtTND = m === 'onboard' ? l.amount * l.fxRate : l.amount; vol += amtTND; cats[l.category] = (cats[l.category] || 0) + amtTND; } }); }); 
        let catHtml = `<table style="width:100%; border-collapse:collapse; margin-bottom:20px; font-size:12px;"><tr><th style="border-bottom:2px solid #cbd5e1; text-align:left; padding:8px;">Category</th><th style="border-bottom:2px solid #cbd5e1; text-align:right; padding:8px;">Amount</th><th style="border-bottom:2px solid #cbd5e1; text-align:right; padding:8px;">%</th><th style="border-bottom:2px solid #cbd5e1; text-align:left; padding:8px;">Visual Indicator</th></tr>`; Object.keys(cats).sort((a,b) => cats[b] - cats[a]).forEach(tag => { let pct = vol > 0 ? ((cats[tag] / vol) * 100).toFixed(1) : 0; let filledBlocks = Math.min(20, Math.round(pct / 5)); let emptyBlocks = Math.max(0, 20 - filledBlocks); let bars = "█".repeat(filledBlocks) + "░".repeat(emptyBlocks); catHtml += `<tr><td style="padding:8px; border-bottom:1px solid #e2e8f0; font-weight:bold;">${tag}</td><td style="padding:8px; border-bottom:1px solid #e2e8f0; text-align:right;">${cats[tag].toFixed(2)} TND</td><td style="padding:8px; border-bottom:1px solid #e2e8f0; text-align:right;">${pct}%</td><td style="padding:8px; border-bottom:1px solid #e2e8f0; font-family:monospace; color:#38bdf8; letter-spacing:1px;">${bars}</td></tr>`; }); catHtml += `</table>`; 
        
        let logHtml = `<table style="width:100%; border-collapse:collapse; margin-bottom:20px; font-size:10px;"><tr><th style="background:#f1f5f9; border:1px solid #cbd5e1; padding:6px; text-align:left;">Date</th><th style="background:#f1f5f9; border:1px solid #cbd5e1; padding:6px; text-align:left;">Description</th><th style="background:#f1f5f9; border:1px solid #cbd5e1; padding:6px; text-align:left;">Category</th><th style="background:#f1f5f9; border:1px solid #cbd5e1; padding:6px; text-align:left;">Source</th><th style="background:#f1f5f9; border:1px solid #cbd5e1; padding:6px; text-align:right;">Impact</th><th style="background:#f1f5f9; border:1px solid #cbd5e1; padding:6px; text-align:center;">Status</th></tr>`; let allLogs = []; ['vacation','onboard'].forEach(m => { s.history[m].archive.forEach(a => allLogs.push(...a.logs.map(l => ({...l, d: a.date, m: m})))); allLogs.push(...s.history[m].current.map(l => ({...l, d: 'Today', m: m}))); }); allLogs.sort((a,b) => b.ts - a.ts).slice(0, 35).forEach((log, i) => { let status = (log.bypassLimit || log.category === "🏦 Financial & Fees") ? "Bypassed" : "Logged"; if(log.spillover > 0) status = "Spillover"; let sym = log.m === 'vacation' ? 'TND' : 'USD'; let bg = i % 2 === 0 ? "#ffffff" : "#f8fafc"; logHtml += `<tr style="background:${bg};"><td style="border:1px solid #cbd5e1; padding:4px;">${log.d}</td><td style="border:1px solid #cbd5e1; padding:4px; font-weight:600;">${log.tag}</td><td style="border:1px solid #cbd5e1; padding:4px;">${log.category}</td><td style="border:1px solid #cbd5e1; padding:4px; color:#64748b;">${log.walletSource}</td><td style="border:1px solid #cbd5e1; padding:4px; text-align:right; font-weight:bold;">-${log.amount.toFixed(2)} ${sym}</td><td style="border:1px solid #cbd5e1; padding:4px; text-align:center; color:${status==='Bypassed'?'#f59e0b':(status==='Spillover'?'#ef4444':'#10b981')}; font-weight:bold;">${status}</td></tr>`; }); logHtml += `</table>`; 
        
        let html = `<div style="font-family:'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#0f172a; max-width:800px; margin:0 auto; padding:20px; background:white;"><div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:4px solid #0f172a; padding-bottom:15px; margin-bottom:20px;"><div><h1 style="margin:0; font-size:24px; text-transform:uppercase; letter-spacing:1.5px;">Global Wealth Vault</h1><div style="font-size:11px; font-weight:700; color:#64748b; letter-spacing:2px; margin-top:4px;">FINANCIAL INTELLIGENCE REPORT</div></div><div style="text-align:right; font-size:11px; color:#475569; line-height:1.6;"><div>Generated: <strong>${now}</strong></div><div>Live FX Rate: <strong>${fx} TND</strong></div></div></div><h3 style="color:#0f172a; border-bottom:2px solid #cbd5e1; padding-bottom:5px; margin-top:0; font-size:13px; text-transform:uppercase;">I. Executive Vault Summary</h3><div style="display:flex; gap:15px; margin-bottom:20px;"><div style="flex:1; background:#f8fafc; padding:12px; border-radius:6px; border:1px solid #e2e8f0;"><div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:12px; border-bottom:1px dashed #e2e8f0;"><span>Total USD Assets:</span> <strong>$${totUSD.toFixed(2)}</strong></div><div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:12px; border-bottom:1px dashed #e2e8f0;"><span>Physical TND:</span> <strong>${s.vault.cash_tnd.toFixed(2)} TND</strong></div><div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:12px;"><span>Savings TND:</span> <strong>${s.vault.savings.toFixed(2)} TND</strong></div></div><div style="flex:1; background:#f8fafc; padding:12px; border-radius:6px; border:1px solid #e2e8f0;"><div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:12px; border-bottom:1px dashed #e2e8f0;"><span>STB True Liability:</span> <strong style="color:#ef4444;">${(s.loan.arrears + s.loan.overdraft + s.loan.schedule.filter(x=>!x.paid).reduce((s,i)=>s+i.amount,0)).toFixed(2)} TND</strong></div><div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:13px; margin-top:8px; border-top:2px solid #cbd5e1; padding-top:8px;"><span>Total Liquid Power:</span> <strong style="color:#10b981;">${totalLiquid.toFixed(2)} TND</strong></div><div style="display:flex; justify-content:space-between; font-size:12px;"><span>Mode Liquid Runway:</span> <strong style="color:#38bdf8;">${liquidRunway} Days</strong></div></div></div><h3 style="color:#0f172a; border-bottom:2px solid #cbd5e1; padding-bottom:5px; font-size:13px; text-transform:uppercase;">II. Project Trackers & IOUs</h3>${misHtml}${iouHtml}<h3 style="color:#0f172a; border-bottom:2px solid #cbd5e1; padding-bottom:5px; font-size:13px; text-transform:uppercase;">III. 30-Day Category Flow</h3><div style="margin-bottom:10px; font-size:12px; font-weight:bold;">Total Cap Saved (TND): <span style="color:#10b981;">+${s.capital_saved_tnd.toFixed(2)} TND</span> | Total Cap Saved (USD): <span style="color:#10b981;">+$${s.capital_saved_usd.toFixed(2)}</span></div>${catHtml}<h3 style="color:#0f172a; border-bottom:2px solid #cbd5e1; padding-bottom:5px; font-size:13px; text-transform:uppercase;">IV. Master Ledger</h3>${logHtml}</div>`; 
        
        let printArea = document.getElementById('printArea'); printArea.innerHTML = html; printArea.style.display = 'block';
        let closeBtn = document.createElement('button'); closeBtn.innerHTML = "❌ Close Report View"; closeBtn.style.cssText = "position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:#0f172a; color:white; border:2px solid #38bdf8; padding:15px 30px; border-radius:30px; font-weight:bold; font-size:16px; z-index:10000; box-shadow:0 10px 25px rgba(0,0,0,0.5); cursor:pointer;";
        closeBtn.onclick = function() { printArea.style.display = 'none'; }; printArea.appendChild(closeBtn);
        setTimeout(() => { window.print(); }, 500);
    },

    forceAppUpdate: async function() {
        let ok = await window.ui.openUConfirm("Force Update", "This will clear the offline cache and instantly fetch the latest code from GitHub. Your financial data is 100% safe. Proceed?");
        if(!ok) return;
        
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (let registration of registrations) {
                await registration.unregister();
            }
        }
        
        if ('caches' in window) {
            const keys = await caches.keys();
            for (let key of keys) {
                await caches.delete(key);
            }
        }
        
        window.location.reload(true);
    }
};
