// ============================================================
// AURORA NIFTY 50 CUP & HANDLE SCANNER
// Dashboard Application
// Release 1 — Frozen Core Engine
// ============================================================

// ------------------------------------------------------------
// TIMEZONE
// ------------------------------------------------------------

// Aurora dashboard time is always India Standard Time.
// Do NOT use the browser's local timezone.

const AURORA_TIMEZONE = "Asia/Kolkata";


// ------------------------------------------------------------
// FORMAT CURRENT SCAN TIME
// ------------------------------------------------------------

function getIndiaDateTime() {

    const now = new Date();

    return new Intl.DateTimeFormat("en-IN", {
        timeZone: AURORA_TIMEZONE,
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
    }).format(now);
}


// ------------------------------------------------------------
// UPDATE DASHBOARD DATE
// ------------------------------------------------------------

function updateScanDate() {

    const scanDateElement = document.getElementById("scanDate");

    if (scanDateElement) {
        scanDateElement.textContent =
            "IST • " + getIndiaDateTime();
    }
}


// ------------------------------------------------------------
// LOAD SCANNER DATA
// ------------------------------------------------------------

async function loadScannerData() {

    try {

        const response = await fetch("data/scanner.json", {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(
                "Scanner data file could not be loaded."
            );
        }

        const data = await response.json();

        renderDashboard(data);

    } catch (error) {

        console.error(
            "Aurora scanner data error:",
            error
        );

        showDataUnavailable();

    }
}


// ------------------------------------------------------------
// RENDER DASHBOARD
// ------------------------------------------------------------

function renderDashboard(data) {

    // This function will receive the scanner results
    // from scanner.json.

    const stocks = data.stocks || [];

    updateSummary(data, stocks);

    renderCandidateCards(stocks);

    renderScannerTable(stocks);
}


// ------------------------------------------------------------
// UPDATE SUMMARY CARDS
// ------------------------------------------------------------

function updateSummary(data, stocks) {

    const stocksScanned =
        data.stocks_scanned !== undefined
            ? data.stocks_scanned
            : stocks.length;

    const currentCandidates =
        stocks.filter(
            stock =>
                stock.status === "CURRENT / ACTIONABLE"
        ).length;

    const strongPatterns =
        stocks.filter(
            stock =>
                stock.pattern_quality >= 80
        ).length;

    const breakouts =
        stocks.filter(
            stock =>
                stock.breakout_status === "CONFIRMED BREAKOUT"
        ).length;


    document.getElementById("stocksScanned").textContent =
        stocksScanned;

    document.getElementById("currentCandidates").textContent =
        currentCandidates;

    document.getElementById("strongPatterns").textContent =
        strongPatterns;

    document.getElementById("breakouts").textContent =
        breakouts;
}


// ------------------------------------------------------------
// CURRENT CANDIDATE CARDS
// ------------------------------------------------------------

function renderCandidateCards(stocks) {

    const container =
        document.getElementById("candidateCards");

    const candidates =
        stocks.filter(
            stock =>
                stock.status === "CURRENT / ACTIONABLE"
        );


    if (candidates.length === 0) {

        container.innerHTML = `
            <div class="candidate-card">
                <h3>No Current Candidates</h3>
                <p>
                    No actionable Cup & Handle pattern
                    is currently identified.
                </p>
            </div>
        `;

        return;
    }


    container.innerHTML =
        candidates.map(stock => `

            <div class="candidate-card">

                <h3>${stock.symbol}</h3>

                <div class="candidate-status">
                    ${stock.pattern_status || "CURRENT / ACTIONABLE"}
                </div>

                <div class="score">
                    ${formatNumber(stock.pattern_quality)}
                </div>

                <div class="metrics">

                    <div class="metric">
                        <span class="metric-label">
                            CUP
                        </span>

                        <span class="metric-value">
                            ${formatNumber(stock.cup_quality)}
                        </span>
                    </div>

                    <div class="metric">
                        <span class="metric-label">
                            HANDLE
                        </span>

                        <span class="metric-value">
                            ${formatNumber(stock.handle_quality)}
                        </span>
                    </div>

                    <div class="metric">
                        <span class="metric-label">
                            VOLUME
                        </span>

                        <span class="metric-value">
                            ${formatNumber(stock.volume_quality)}
                        </span>
                    </div>

                </div>


                <div class="price-info">

                    <div class="price-item">

                        <span>
                            CURRENT PRICE
                        </span>

                        <strong>
                            ₹${formatNumber(stock.current_price)}
                        </strong>

                    </div>


                    <div class="price-item">

                        <span>
                            RIGHT RIM
                        </span>

                        <strong>
                            ₹${formatNumber(stock.right_rim)}
                        </strong>

                    </div>

                </div>

            </div>

        `).join("");
}


// ------------------------------------------------------------
// COMPLETE SCANNER TABLE
// ------------------------------------------------------------

function renderScannerTable(stocks) {

    const table =
        document.getElementById("scannerTable");


    table.innerHTML =
        stocks.map(stock => `

            <tr>

                <td>
                    ${stock.symbol}
                </td>

                <td>
                    ₹${formatNumber(stock.current_price)}
                </td>

                <td>
                    ${formatNumber(stock.cup_quality)}
                </td>

                <td>
                    ${formatNumber(stock.handle_quality)}
                </td>

                <td>
                    ${formatNumber(stock.volume_quality)}
                </td>

                <td>
                    ${formatNumber(stock.pattern_quality)}
                </td>

                <td>
                    ${stock.status || "--"}
                </td>

                <td>
                    ${stock.breakout_status || "NO BREAKOUT"}
                </td>

            </tr>

        `).join("");
}


// ------------------------------------------------------------
// DATA UNAVAILABLE MESSAGE
// ------------------------------------------------------------

function showDataUnavailable() {

    document.getElementById("stocksScanned").textContent = "--";
    document.getElementById("currentCandidates").textContent = "--";
    document.getElementById("strongPatterns").textContent = "--";
    document.getElementById("breakouts").textContent = "--";


    document.getElementById("candidateCards").innerHTML = `

        <div class="candidate-card">

            <h3>Scanner Data Not Loaded</h3>

            <p>
                Aurora is waiting for the scanner data file.
            </p>

        </div>

    `;


    document.getElementById("scannerTable").innerHTML = `

        <tr>

            <td colspan="8">
                Scanner data will appear here when
                data/scanner.json is connected.
            </td>

        </tr>

    `;
}


// ------------------------------------------------------------
// NUMBER FORMATTER
// ------------------------------------------------------------

function formatNumber(value) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return "--";
    }

    const number = Number(value);

    if (Number.isNaN(number)) {
        return value;
    }

    return number.toLocaleString("en-IN", {
        maximumFractionDigits: 2
    });
}


// ------------------------------------------------------------
// INITIALIZE DASHBOARD
// ------------------------------------------------------------

document.addEventListener(
    "DOMContentLoaded",
    () => {

        updateScanDate();

        loadScannerData();

    }
);
