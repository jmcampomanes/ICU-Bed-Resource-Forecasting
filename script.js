let rawData = [];
let chartInstance = null;

// 1. Initialization
document.addEventListener('DOMContentLoaded', () => {
    fetchDataFile('data.csv');
    document.getElementById('csvUpload').addEventListener('change', handleFileUpload);
    document.getElementById('facilityFilter').addEventListener('change', (e) => updateDashboard(e.target.value));
});

// Auto-load Logic
function fetchDataFile(filename) {
    fetch(filename)
        .then(r => r.ok ? r.text() : Promise.reject())
        .then(parseCSV)
        .catch(e => console.log("Auto-load blocked. Please use Upload button."));
}

// File Upload Logic
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

        // --- MAP COLUMNS FROM DATA.CSV ---
        // Vents: 10 (Occupied), 7 (Vacant)
        // Isolation: 12 (Occupied), 19 (Vacant)
        // ICU: 9+18 (Occupied), 4+11 (Vacant)
        // Ward: 14 (Occupied), 8 (Vacant)
        
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

// 3. Data Processing
function processData(data) {
    if (data.length === 0) return;
    rawData = data;

    // Populate Filter
    const facilities = [...new Set(data.map(d => d.cfname))];
    const select = document.getElementById('facilityFilter');
    select.innerHTML = '<option value="all">All Facilities</option>';
    facilities.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f;
        opt.textContent = f;
        select.appendChild(opt);
    });
    updateDashboard('all');
}

// --- CLICK-TO-FILTER LOGIC ---
function selectFacility(name) {
    const select = document.getElementById('facilityFilter');
    select.value = name;
    updateDashboard(name);
    
    // Highlight Selected Item in Watchlist
    document.querySelectorAll('.wl-item').forEach(el => el.classList.remove('active-item'));
    // Sanitize ID selector
    const safeId = `wl-${name.replace(/[^a-zA-Z0-9]/g, '')}`;
    const clickedItem = document.getElementById(safeId);
    if (clickedItem) clickedItem.classList.add('active-item');
}

function getLatestDataPerFacility(data) {
    const latestMap = new Map();

    data.forEach(row => {
        // Use hfhudcode as unique ID (or cfname if ID is missing)
        const id = row.hfhudcode || row.cfname;
        
        // Convert reportdate to Date object for comparison
        const rowDate = new Date(row.reportdate);

        if (!latestMap.has(id)) {
            latestMap.set(id, row);
        } else {
            const existingRow = latestMap.get(id);
            const existingDate = new Date(existingRow.reportdate);
            
            // If current row is newer, replace the stored one
            if (rowDate > existingDate) {
                latestMap.set(id, row);
            }
        }
    });

    return Array.from(latestMap.values());
}



// 4. Main Dashboard Update
function updateDashboard(facility) {
    // --- PART 1: PREPARE DATA ---
    
    // A. Historical Data (For Charts/Trends)
    let historyData = rawData;
    if (facility !== 'all') {
        historyData = rawData.filter(d => d.cfname === facility);
    }

    // B. Latest Snapshot (For KPIs & Watchlist)
    // This ensures we don't sum up historical duplicates for the KPI cards
    let currentSnapshot = getLatestData(rawData); 
    if (facility !== 'all') {
        currentSnapshot = currentSnapshot.filter(d => d.cfname === facility);
    }

    // --- PART 2: CALCULATE KPI TOTALS (From Snapshot) ---
    
    // Sum up the latest numbers from the filtered snapshot
    const kpiTotals = currentSnapshot.reduce((acc, d) => {
        acc.icu_occ += Number(d.icu_occ) || 0;
        acc.icu_vac += Number(d.icu_vac) || 0;
        acc.vent_occ += Number(d.vent_occ) || 0;
        acc.vent_vac += Number(d.vent_vac) || 0;
        acc.isol_occ += Number(d.isol_occ) || 0;
        acc.isol_vac += Number(d.isol_vac) || 0;
        acc.ward_occ += Number(d.ward_occ) || 0;
        acc.ward_vac += Number(d.ward_vac) || 0;
        return acc;
    }, { 
        icu_occ: 0, icu_vac: 0, 
        vent_occ: 0, vent_vac: 0, 
        isol_occ: 0, isol_vac: 0, 
        ward_occ: 0, ward_vac: 0 
    });

    // --- PART 3: UPDATE KPI CARDS ---

    const totalBeds = kpiTotals.icu_occ + kpiTotals.icu_vac;
    const utilRate = totalBeds > 0 ? ((kpiTotals.icu_occ / totalBeds) * 100).toFixed(1) : 0;

    // 1. Set Numbers
    document.getElementById('kpi-total-beds').innerText = totalBeds;
    document.getElementById('kpi-occupied').innerText = kpiTotals.icu_occ;
    document.getElementById('kpi-available').innerText = kpiTotals.icu_vac;
    document.getElementById('kpi-utilization').innerText = `${utilRate}%`;

    // 2. Logic for Utilization Warning
    const utilBadge = document.getElementById('badge-util');
    const utilIcon = document.getElementById('icon-util');
    
    // Reset classes
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

    // 3. Logic for Available Beds Warning
    const availBadge = document.getElementById('badge-avail');
    const availIcon = document.getElementById('icon-avail');
    
    if (kpiTotals.icu_vac === 0 && totalBeds > 0) {
        availBadge.innerHTML = 'NO BEDS LEFT';
        availBadge.className = 'kpi-badge text-crit';
        availIcon.className = 'icon-box critical-bg';
    } else if (kpiTotals.icu_vac < 5 && totalBeds > 0) {
        availBadge.innerHTML = 'RUNNING LOW';
        availBadge.className = 'kpi-badge text-warn';
    } else {
        availBadge.innerHTML = ''; 
        availIcon.className = 'icon-box green';
    }

    // Update Resource Cards (using the calculated totals)
    updateResourceCard('vent', kpiTotals.vent_occ, kpiTotals.vent_vac);
    updateResourceCard('isol', kpiTotals.isol_occ, kpiTotals.isol_vac);
    updateResourceCard('ward', kpiTotals.ward_occ, kpiTotals.ward_vac);

    // --- PART 4: CHART DATA AGGREGATION (Using History Data) ---
    
    const aggregated = {};
    historyData.forEach(d => {
        if (!aggregated[d.reportdate]) {
            aggregated[d.reportdate] = { date: d.reportdate, icu_occ: 0, icu_vac: 0 };
        }
        aggregated[d.reportdate].icu_occ += Number(d.icu_occ);
        aggregated[d.reportdate].icu_vac += Number(d.icu_vac);
    });

    const chartData = Object.values(aggregated).sort((a, b) => new Date(a.date) - new Date(b.date));

    // Render Charts & Tables
    renderForecastChart(chartData);
    
    // Note: We use currentSnapshot for the watchlist so it matches the KPIs
    if (facility === 'all') updateWatchlist(currentSnapshot); 
    
    updateTable(historyData.slice(0, 50)); // Table can still show history logs if desired
}

// --- HELPER FUNCTION ---
function getLatestData(data) {
    const groups = {};
    // Group by Facility Name (cfname)
    data.forEach(d => {
        if (!groups[d.cfname]) groups[d.cfname] = [];
        groups[d.cfname].push(d);
    });

    // Return the single latest record for each facility
    return Object.values(groups).map(facilityRecords => {
        return facilityRecords.reduce((latest, current) => {
            return new Date(latest.reportdate) > new Date(current.reportdate) ? latest : current;
        });
    });
}

// Helper: Update Resource Cards
// 1. UPDATED RESOURCE CARD FUNCTION (With Icons)
function updateResourceCard(prefix, occupied, vacant) {
    const total = occupied + vacant;
    const util = total > 0 ? ((occupied / total) * 100).toFixed(0) : 0;

    document.getElementById(`${prefix}-used`).innerText = occupied;
    document.getElementById(`${prefix}-total`).innerText = total;

    const bar = document.getElementById(`${prefix}-bar`);
    const badge = document.getElementById(`${prefix}-badge`);
    
    bar.style.width = `${util}%`;

    // Reset Classes
    badge.className = 'status-badge';

    // --- NEW LOGIC FOR 0 BEDS ---
    if (total === 0) {
        bar.style.backgroundColor = '#555'; // Gray Bar
        badge.classList.add('inactive');
        badge.innerHTML = '<i class="fa-solid fa-ban"></i> NO CAPACITY'; // 🚫 Icon
        return; // Stop here, don't run the other checks
    }

    // Standard Logic
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
// 2. UPDATED WATCHLIST FUNCTION (With Icons)
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

    // Filter to show valid data
    riskList = riskList.filter(d => d.total > 0);
    riskList.sort((a, b) => b.util - a.util);

    if (riskList.length === 0) {
        feed.innerHTML = '<div style="text-align:center; padding:20px; color:#aaa;">No data available.</div>';
        return;
    }

    riskList.forEach(item => {
        let statusClass, badgeClass, badgeContent;

        // Logic for Icons based on Utilization
        if (item.util >= 85) {
            statusClass = 'critical';
            badgeClass = 'bg-crit';
            badgeContent = '<i class="fa-solid fa-circle-exclamation"></i> CRITICAL'; // 🚫
        } else if (item.util >= 70) {
            statusClass = 'warning';
            badgeClass = 'bg-warn';
            badgeContent = '<i class="fa-solid fa-triangle-exclamation"></i> WARNING'; // ⚠️
        } else {
            statusClass = 'safe';
            badgeClass = 'bg-safe';
            badgeContent = '<i class="fa-solid fa-circle-check"></i> SAFE'; // ✅
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
            </div>
        `;
        feed.appendChild(div);
    });
}

// 6. Forecast Logic
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

        // Forecast next 7 days (No negatives)
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