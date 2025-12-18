let rawData = [];
let chartInstance = null;

// 1. Initialization
document.addEventListener('DOMContentLoaded', () => {
    fetchDataFile('data.csv');
    document.getElementById('csvUpload').addEventListener('change', handleFileUpload);
    
    // Add listeners to new Date filters
    document.getElementById('facilityFilter').addEventListener('change', runFilterUpdate);
    document.getElementById('dateFrom').addEventListener('change', runFilterUpdate);
    document.getElementById('dateTo').addEventListener('change', runFilterUpdate);
});

// Wrapper to get values before updating
function runFilterUpdate() {
    const facility = document.getElementById('facilityFilter').value;
    updateDashboard(facility);
}

// Auto-load Logic
function fetchDataFile(filename) {
    fetch(filename)
        .then(r => r.ok ? r.text() : Promise.reject())
        .then(parseCSV)
        .catch(e => console.log("Auto-load blocked or file not found."));
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => parseCSV(e.target.result);
    reader.readAsText(file);
}

// 2. CSV Parser
function parseCSV(text) {
    const rows = text.split('\n').slice(1);
    const parsedData = rows.map(row => {
        const cols = row.split(',');
        if (cols.length < 20) return null;

        const ventO = parseInt(cols[10]) || 0;
        const ventV = parseInt(cols[7]) || 0;
        const isolO = parseInt(cols[12]) || 0;
        const isolV = parseInt(cols[19]) || 0;
        const icuO = (parseInt(cols[9]) || 0) + (parseInt(cols[18]) || 0);
        const icuV = (parseInt(cols[4]) || 0) + (parseInt(cols[11]) || 0);
        const wardO = parseInt(cols[14]) || 0;
        const wardV = parseInt(cols[8]) || 0;

        return {
            reportdate: cols[16] ? cols[16].trim() : '',
            cfname: cols[20] ? cols[20].replace(/"/g, '').trim() : 'Unknown',
            icu_occ: icuO, icu_vac: icuV,
            vent_occ: ventO, vent_vac: ventV,
            isol_occ: isolO, isol_vac: isolV,
            ward_occ: wardO, ward_vac: wardV
        };
    }).filter(d => d !== null && d.reportdate !== '');

    processData(parsedData);
}

// 3. Data Processing & Date Initialization
function processData(data) {
    if (data.length === 0) return;
    
    // Sort data by date just to be safe
    data.sort((a, b) => new Date(a.reportdate) - new Date(b.reportdate));
    rawData = data;

    // A. Populate Facility Filter
    const facilities = [...new Set(data.map(d => d.cfname))];
    const select = document.getElementById('facilityFilter');
    select.innerHTML = '<option value="all">All Facilities</option>';
    facilities.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f;
        opt.textContent = f;
        select.appendChild(opt);
    });

    // B. Initialize Date Pickers (Auto-detect Range)
    const dates = data.map(d => new Date(d.reportdate));
    const minDate = new Date(Math.min.apply(null, dates));
    const maxDate = new Date(Math.max.apply(null, dates));

    const dateFromInput = document.getElementById('dateFrom');
    const dateToInput = document.getElementById('dateTo');

    // Format to YYYY-MM-DD for HTML input
    dateFromInput.value = minDate.toISOString().split('T')[0];
    dateToInput.value = maxDate.toISOString().split('T')[0];

    // Initial Dashboard Load
    updateDashboard('all');
}

// --- CLICK-TO-FILTER LOGIC ---
function selectFacility(name) {
    const select = document.getElementById('facilityFilter');
    select.value = name;
    updateDashboard(name);
    
    // Highlight Selected Item in Watchlist
    document.querySelectorAll('.wl-item').forEach(el => el.classList.remove('active-item'));
    const safeId = `wl-${name.replace(/[^a-zA-Z0-9]/g, '')}`;
    const clickedItem = document.getElementById(safeId);
    if (clickedItem) clickedItem.classList.add('active-item');
}

// 4. Main Dashboard Update (Updated for Dates)
function updateDashboard(facility) {
    
    // --- STEP 1: GET DATE RANGE ---
    const fromVal = document.getElementById('dateFrom').value;
    const toVal = document.getElementById('dateTo').value;
    
    const fromDate = fromVal ? new Date(fromVal) : new Date('2000-01-01');
    const toDate = toVal ? new Date(toVal) : new Date();
    // Set 'To' date time to end of day to include records from that day
    toDate.setHours(23, 59, 59);

    // --- STEP 2: FILTER BY DATE ---
    let timeFilteredData = rawData.filter(d => {
        const dDate = new Date(d.reportdate);
        return dDate >= fromDate && dDate <= toDate;
    });

    // --- STEP 3: FILTER BY FACILITY ---
    let finalData = timeFilteredData;
    if (facility !== 'all') {
        finalData = timeFilteredData.filter(d => d.cfname === facility);
    }

    // --- STEP 4: CALCULATE KPI (Using Latest Snapshots within Range) ---
    // If we select a range, we usually want the status as of the END of that range
    // or the latest available data point within that range.
    let snapshotData = getLatestData(finalData); 

    const kpiTotals = snapshotData.reduce((acc, d) => {
        acc.icu_occ += Number(d.icu_occ) || 0;
        acc.icu_vac += Number(d.icu_vac) || 0;
        acc.vent_occ += Number(d.vent_occ) || 0;
        acc.vent_vac += Number(d.vent_vac) || 0;
        acc.isol_occ += Number(d.isol_occ) || 0;
        acc.isol_vac += Number(d.isol_vac) || 0;
        acc.ward_occ += Number(d.ward_occ) || 0;
        acc.ward_vac += Number(d.ward_vac) || 0;
        return acc;
    }, { icu_occ: 0, icu_vac: 0, vent_occ: 0, vent_vac: 0, isol_occ: 0, isol_vac: 0, ward_occ: 0, ward_vac: 0 });

    // Update KPI Cards
    const totalBeds = kpiTotals.icu_occ + kpiTotals.icu_vac;
    const utilRate = totalBeds > 0 ? ((kpiTotals.icu_occ / totalBeds) * 100).toFixed(1) : 0;

    document.getElementById('kpi-total-beds').innerText = totalBeds;
    document.getElementById('kpi-occupied').innerText = kpiTotals.icu_occ;
    document.getElementById('kpi-available').innerText = kpiTotals.icu_vac;
    document.getElementById('kpi-utilization').innerText = `${utilRate}%`;

    // KPI Badges Logic
    const utilBadge = document.getElementById('badge-util');
    const utilIcon = document.getElementById('icon-util');
    utilIcon.className = 'icon-box purple'; 

    if (utilRate >= 85) {
        utilBadge.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> CRITICAL STATUS';
        utilBadge.className = 'kpi-badge text-crit';
        utilIcon.className = 'icon-box critical-bg';
    } else if (utilRate >= 70) {
        utilBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> HIGH DEMAND';
        utilBadge.className = 'kpi-badge text-warn';
        utilIcon.className = 'icon-box warning-bg';
    } else {
        utilBadge.innerHTML = '<i class="fa-solid fa-check"></i> STABLE';
        utilBadge.className = 'kpi-badge text-safe';
        utilIcon.className = 'icon-box safe-bg';
    }

    const availBadge = document.getElementById('badge-avail');
    const availIcon = document.getElementById('icon-avail');
    if (kpiTotals.icu_vac === 0 && totalBeds > 0) {
        availBadge.innerHTML = 'NO BEDS LEFT';
        availBadge.className = 'kpi-badge text-crit';
        availIcon.className = 'icon-box critical-bg';
    } else if (kpiTotals.icu_vac < 5 && totalBeds > 0) {
        availBadge.innerHTML = 'RUNNING LOW';
        availBadge.className = 'kpi-badge text-warn';
        availIcon.className = 'icon-box green';
    } else {
        availBadge.innerHTML = ''; 
        availIcon.className = 'icon-box green';
    }

    updateResourceCard('vent', kpiTotals.vent_occ, kpiTotals.vent_vac);
    updateResourceCard('isol', kpiTotals.isol_occ, kpiTotals.isol_vac);
    updateResourceCard('ward', kpiTotals.ward_occ, kpiTotals.ward_vac);

    // --- STEP 5: UPDATE CHARTS (Using All History in Range) ---
    const aggregated = {};
    finalData.forEach(d => {
        if (!aggregated[d.reportdate]) {
            aggregated[d.reportdate] = { date: d.reportdate, icu_occ: 0 };
        }
        aggregated[d.reportdate].icu_occ += Number(d.icu_occ);
    });
    const chartData = Object.values(aggregated).sort((a, b) => new Date(a.date) - new Date(b.date));

    renderForecastChart(chartData);
    
    // Update Watchlist & Table
    if (facility === 'all') updateWatchlist(snapshotData); 
    updateTable(finalData.slice(0, 100)); // Limit table to first 100 to prevent lag
}

// Helper: Get Latest Data (Matches Logic)
function getLatestData(data) {
    const groups = {};
    data.forEach(d => {
        if (!groups[d.cfname]) groups[d.cfname] = [];
        groups[d.cfname].push(d);
    });
    return Object.values(groups).map(facilityRecords => {
        // Find newest date in this specific filtered subset
        return facilityRecords.reduce((latest, current) => {
            return new Date(latest.reportdate) > new Date(current.reportdate) ? latest : current;
        });
    });
}

// ... (Keep updateResourceCard, updateWatchlist, renderForecastChart, updateTable exactly as they were) ...
// Ensure you copy those helper functions from the previous version or keep them if you are editing the file.

/* --- PASTE THE REST OF THE HELPER FUNCTIONS HERE (updateResourceCard, etc.) --- */
// (I am omitting them here for brevity, but they MUST exist in the file)

function updateResourceCard(prefix, occupied, vacant) {
    const total = occupied + vacant;
    const util = total > 0 ? ((occupied / total) * 100).toFixed(0) : 0;
    document.getElementById(`${prefix}-used`).innerText = occupied;
    document.getElementById(`${prefix}-total`).innerText = total;
    const bar = document.getElementById(`${prefix}-bar`);
    const badge = document.getElementById(`${prefix}-badge`);
    bar.style.width = `${util}%`;
    badge.className = 'status-badge';
    if (total === 0) {
        bar.style.backgroundColor = '#555';
        badge.classList.add('inactive');
        badge.innerHTML = '<i class="fa-solid fa-ban"></i> NO CAPACITY';
        return;
    }
    if (util >= 85) {
        bar.style.backgroundColor = '#ff4b4b'; 
        badge.classList.add('critical');
        badge.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> CRITICAL'; 
    } else if (util >= 70) {
        bar.style.backgroundColor = '#ffeb3b';
        badge.classList.add('warning');
        badge.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> WARNING'; 
    } else {
        bar.style.backgroundColor = '#00ff88';
        badge.classList.add('safe');
        badge.innerHTML = '<i class="fa-solid fa-circle-check"></i> SAFE'; 
    }
}

function updateWatchlist(allData) {
    const feed = document.getElementById('riskFeed');
    feed.innerHTML = '';
    const facilityMap = {};
    allData.forEach(d => facilityMap[d.cfname] = d);
    let riskList = Object.values(facilityMap).map(d => {
        const total = d.icu_occ + d.icu_vac;
        const util = total > 0 ? (d.icu_occ / total) * 100 : 0;
        return { ...d, util: util, total: total };
    });
    riskList = riskList.filter(d => d.total > 0);
    riskList.sort((a, b) => b.util - a.util);
    if (riskList.length === 0) {
        feed.innerHTML = '<div style="text-align:center; padding:20px; color:#aaa;">No data available.</div>';
        return;
    }
    riskList.forEach(item => {
        let statusClass, badgeClass, badgeContent;
        if (item.util >= 85) {
            statusClass = 'critical'; badgeClass = 'bg-crit'; badgeContent = '<i class="fa-solid fa-circle-exclamation"></i> CRITICAL';
        } else if (item.util >= 70) {
            statusClass = 'warning'; badgeClass = 'bg-warn'; badgeContent = '<i class="fa-solid fa-triangle-exclamation"></i> WARNING';
        } else {
            statusClass = 'safe'; badgeClass = 'bg-safe'; badgeContent = '<i class="fa-solid fa-circle-check"></i> SAFE';
        }
        const safeId = `wl-${item.cfname.replace(/[^a-zA-Z0-9]/g, '')}`;
        const div = document.createElement('div');
        div.className = `wl-item ${statusClass}`;
        div.id = safeId;
        div.onclick = () => selectFacility(item.cfname);
        div.innerHTML = `
            <div class="wl-top">
                <div class="wl-name">${item.cfname}</div>
                <div class="wl-badge ${badgeClass}">${badgeContent}</div>
            </div>
            <div class="wl-stats">
                <span>Occupancy: ${item.icu_occ} / ${item.total}</span>
                <span class="wl-util-val">${item.util.toFixed(1)}%</span>
            </div>`;
        feed.appendChild(div);
    });
}

function renderForecastChart(data) {
    const ctx = document.getElementById('forecastChart').getContext('2d');
    const labels = data.map(d => d.date);
    const values = data.map(d => d.icu_occ);
    let predictions = [];
    if(data.length > 2) {
        const x = data.map((_, i) => i);
        const y = values;
        const n = x.length;
        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = y.reduce((a, b) => a + b, 0);
        const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
        const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;
        for(let i=1; i<=7; i++) {
           let val = slope * (n-1+i) + intercept;
           predictions.push(Math.max(0, Math.round(val))); 
        }
    }
    const lastDate = new Date(data[data.length-1].date);
    const futureLabels = [];
    for(let i=1; i<=7; i++) {
        const d = new Date(lastDate);
        d.setDate(d.getDate() + i);
        futureLabels.push(d.toLocaleDateString());
    }
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [...labels, ...futureLabels],
            datasets: [
                {
                    label: 'Actual Occupancy',
                    data: [...values, ...new Array(7).fill(null)],
                    borderColor: '#00d4ff',
                    backgroundColor: 'rgba(0, 212, 255, 0.1)',
                    fill: true,
                    tension: 0.3
                },
                {
                    label: '7-Day Forecast',
                    data: [...new Array(values.length-1).fill(null), values[values.length-1], ...predictions],
                    borderColor: '#ff4b4b',
                    borderDash: [5,5],
                    backgroundColor: 'rgba(255, 75, 75, 0.05)',
                    fill: true,
                    tension: 0.3
                }
            ]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            scales: { y: { grid: { color: '#333' } }, x: { grid: { color: '#333' } } } 
        }
    });
}

function updateTable(data) {
    const tbody = document.querySelector('#dataTable tbody');
    tbody.innerHTML = '';
    data.forEach(d => {
        const total = d.icu_occ + d.icu_vac;
        const util = total > 0 ? ((d.icu_occ / total) * 100).toFixed(0) : 0;
        const badgeColor = util > 85 ? 'red' : (util > 70 ? 'orange' : 'green');
        const row = `<tr>
            <td>${d.reportdate}</td>
            <td>${d.cfname}</td>
            <td>${d.icu_occ}</td>
            <td>${d.vent_occ}</td>
            <td>${d.ward_occ}</td>
            <td><span class="badge" style="background:${badgeColor}">${util}% Util</span></td>
        </tr>`;
        tbody.innerHTML += row;
    });
}