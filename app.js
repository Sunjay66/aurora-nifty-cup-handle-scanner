// ============================================================
// AURORA NIFTY 200 CUP & HANDLE SCANNER
// Dashboard Application
// Release 2 — Frozen Core Engine
// ============================================================
//
// This dashboard reads ONLY the production scanner output:
//
//     data/scanner.json
//
// The Cup & Handle engine itself is NOT implemented here.
// This file is presentation logic only.
//
// ============================================================


// ------------------------------------------------------------
// CONSTANTS
// ------------------------------------------------------------

const AURORA_TIMEZONE = "Asia/Kolkata";
const SCANNER_DATA_URL = "data/scanner.json";


// ------------------------------------------------------------
// GLOBAL STATE
// ------------------------------------------------------------

let scannerData = null;


// ------------------------------------------------------------
// BASIC HELPERS
// ------------------------------------------------------------

function escapeHTML(value) {

    if (
        value === null ||
        value === undefined
    ) {
        return "--";
    }

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function formatNumber(value, decimals = 2) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return "--";
    }

    const number = Number(value);

    if (Number.isNaN(number)) {
        return escapeHTML(value);
    }

    return number.toLocaleString(
        "en-IN",
        {
            minimumFractionDigits: 0,
            maximumFractionDigits: decimals
        }
    );
}


function formatPrice(value) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return "--";
    }

    return "₹" + formatNumber(value, 2);
}


function formatPercent(value) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return "--";
    }

    return formatNumber(value, 2) + "%";
}


function formatDate(value) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return "--";
    }

    const text = String(value);

    if (text.length < 10) {
        return escapeHTML(text);
    }

    const parts = text.substring(0, 10).split("-");

    if (parts.length !== 3) {
        return escapeHTML(text);
    }

    return (
        parts[2] +
        "-" +
        parts[1] +
        "-" +
        parts[0]
    );
}


function formatRefreshTime(value) {

    if (!value) {
        return "--";
    }

    try {

        const date = new Date(value);

        return new Intl.DateTimeFormat(
            "en-IN",
            {
                timeZone: AURORA_TIMEZONE,
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: true
            }
        ).format(date);

    } catch (error) {

        return escapeHTML(value);
    }
}


// ------------------------------------------------------------
// LOAD SCANNER DATA
// ------------------------------------------------------------

async function loadScannerData() {

    try {

        const response = await fetch(
            SCANNER_DATA_URL,
            {
                cache: "no-store"
            }
        );

        if (!response.ok) {

            throw new Error(
                "Scanner data could not be loaded."
            );
        }

        scannerData = await response.json();

        renderDashboard(scannerData);

    } catch (error) {

        console.error(
            "Aurora scanner data error:",
            error
        );

        renderDataUnavailable(error);
    }
}


// ------------------------------------------------------------
// BUILD CURRENT PRICE MAP
// ------------------------------------------------------------
//
// Current price is stored in the production scanner's
// "stocks" records as Current_Close.
//
// ------------------------------------------------------------

function buildStockMap(data) {

    const map = {};

    const stocks = Array.isArray(data.stocks)
        ? data.stocks
        : [];

    stocks.forEach(stock => {

        if (!stock || !stock.Symbol) {
            return;
        }

        map[
            String(stock.Symbol)
                .toUpperCase()
                .trim()
        ] = stock;
    });

    return map;
}


// ------------------------------------------------------------
// SORT ACTIVE CANDIDATES
// ------------------------------------------------------------

function sortActiveCandidates(candidates) {

    return [...candidates].sort(
        (a, b) => {

            const dateA =
                String(a.Detection_Date || "");

            const dateB =
                String(b.Detection_Date || "");

            if (dateA !== dateB) {
                return dateB.localeCompare(dateA);
            }

            return String(a.Symbol || "")
                .localeCompare(
                    String(b.Symbol || "")
                );
        }
    );
}


// ------------------------------------------------------------
// MAIN DASHBOARD
// ------------------------------------------------------------

function renderDashboard(data) {

    const main =
        document.querySelector(
            "main.dashboard-container"
        );

    if (!main) {

        console.error(
            "Aurora dashboard container not found."
        );

        return;
    }

    injectDashboardStyles();

    const activeCandidates =
        Array.isArray(data.active_candidates)
            ? sortActiveCandidates(
                data.active_candidates
            )
            : [];

    const stockMap =
        buildStockMap(data);

    renderHeaderInformation(data);

    main.innerHTML = `

        <section class="aurora-summary-grid">

            <div class="aurora-summary-card">
                <div class="aurora-summary-label">
                    STOCKS SCANNED
                </div>

                <div class="aurora-summary-value">
                    ${formatNumber(data.stocks_scanned, 0)}
                </div>
            </div>


            <div class="aurora-summary-card">
                <div class="aurora-summary-label">
                    ACTIVE CANDIDATES
                </div>

                <div class="aurora-summary-value">
                    ${activeCandidates.length}
                </div>
            </div>


            <div class="aurora-summary-card">
                <div class="aurora-summary-label">
                    BREAKOUT HISTORY
                </div>

                <div class="aurora-summary-value">
                    ${formatNumber(
                        data.history_summary &&
                        data.history_summary.BREAKOUT,
                        0
                    )}
                </div>
            </div>


            <div class="aurora-summary-card">
                <div class="aurora-summary-label">
                    DATA THROUGH
                </div>

                <div class="aurora-summary-date">
                    ${formatDate(data.data_through)}
                </div>
            </div>

        </section>


        <section class="aurora-section">

            <div class="aurora-section-header">

                <div>
                    <h2>
                        ACTIVE CUP &amp; HANDLE CANDIDATES
                    </h2>

                    <p>
                        Candidates remain active for
                        30 calendar days from first detection.
                    </p>
                </div>

                <div class="aurora-live-badge">
                    ACTIVE
                </div>

            </div>


            <div class="aurora-table-wrapper">

                <table class="aurora-table">

                    <thead>

                        <tr>
                            <th>DETECTION DATE</th>
                            <th>SYMBOL</th>
                            <th>DAYS REMAINING</th>
                            <th>CURRENT STAGE</th>
                            <th>CURRENT PRICE</th>
                            <th>RIGHT RIM</th>
                            <th>CUP DEPTH</th>
                            <th>CUP DURATION</th>
                            <th>HANDLE DEPTH</th>
                            <th>CURRENT RVOL</th>
                        </tr>

                    </thead>


                    <tbody id="auroraCandidateTable">

                        ${renderCandidateRows(
                            activeCandidates,
                            stockMap,
                            data
                        )}

                    </tbody>

                </table>

            </div>

        </section>


        <section class="aurora-refresh-section">

            <div>
                <strong>
                    DATA THROUGH
                </strong>

                <span>
                    ${formatDate(data.data_through)}
                </span>
            </div>


            <div>
                <strong>
                    LAST SUCCESSFUL REFRESH
                </strong>

                <span>
                    ${formatRefreshTime(
                        data.last_successful_refresh
                    )}
                    IST
                </span>
            </div>


            <div>
                <strong>
                    UNIVERSE
                </strong>

                <span>
                    NIFTY 200
                </span>
            </div>

        </section>

    `;


    attachSymbolEvents(
        activeCandidates
    );
}


// ------------------------------------------------------------
// RENDER CANDIDATE ROWS
// ------------------------------------------------------------

function renderCandidateRows(
    candidates,
    stockMap,
    data
) {

    if (candidates.length === 0) {

        return `

            <tr>

                <td
                    colspan="10"
                    class="aurora-empty"
                >
                    No active Cup &amp; Handle
                    candidates at present.
                </td>

            </tr>

        `;
    }


    return candidates.map(candidate => {

        const symbol =
            String(candidate.Symbol || "")
                .toUpperCase()
                .trim();

        const stock =
            stockMap[symbol] || {};

        const detail =
            data.details &&
            data.details[symbol]
                ? data.details[symbol]
                : {};

        const cup =
            detail.cup || {};

        const currentRVOL =
            detail.Current_RVOL !== undefined
                ? detail.Current_RVOL
                : null;


        return `

            <tr>

                <td>
                    ${formatDate(
                        candidate.Detection_Date
                    )}
                </td>


                <td>

                    <button
                        class="aurora-symbol-button"
                        data-symbol="${escapeHTML(symbol)}"
                    >
                        ${escapeHTML(symbol)}
                    </button>

                </td>


                <td>

                    <span class="aurora-days">
                        ${formatNumber(
                            candidate.Days_Remaining,
                            0
                        )}
                    </span>

                </td>


                <td>

                    <span class="aurora-stage">
                        ${escapeHTML(
                            candidate.Current_Stage
                        )}
                    </span>

                </td>


                <td>
                    ${formatPrice(
                        stock.Current_Close
                    )}
                </td>


                <td>
                    ${formatPrice(
                        cup.Right_Rim_Price
                    )}
                </td>


                <td>
                    ${formatPercent(
                        cup.Cup_Depth_Pct
                    )}
                </td>


                <td>
                    ${
                        cup.Cup_Duration_Days !==
                        null &&
                        cup.Cup_Duration_Days !==
                        undefined
                            ? formatNumber(
                                cup.Cup_Duration_Days,
                                0
                            ) + " days"
                            : "--"
                    }
                </td>


                <td>
                    ${formatPercent(
                        detail.handle &&
                        detail.handle.Handle_Depth_Pct
                    )}
                </td>


                <td>

                    <span
                        class="aurora-rvol ${rvolClass(
                            currentRVOL
                        )}"
                    >
                        ${
                            currentRVOL !== null
                                ? formatNumber(
                                    currentRVOL,
                                    2
                                ) + "x"
                                : "--"
                        }
                    </span>

                </td>

            </tr>

        `;

    }).join("");
}


// ------------------------------------------------------------
// RVOL CLASS
// ------------------------------------------------------------

function rvolClass(value) {

    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }

    const number = Number(value);

    if (Number.isNaN(number)) {
        return "";
    }

    if (number >= 2) {
        return "rvol-high";
    }

    if (number >= 1.2) {
        return "rvol-medium";
    }

    return "rvol-normal";
}


// ------------------------------------------------------------
// HEADER INFORMATION
// ------------------------------------------------------------

function renderHeaderInformation(data) {

    const scanDate =
        document.getElementById("scanDate");

    if (!scanDate) {
        return;
    }

    scanDate.textContent =
        "DATA THROUGH " +
        formatDate(data.data_through) +
        " • REFRESHED " +
        formatRefreshTime(
            data.last_successful_refresh
        ) +
        " IST";
}


// ------------------------------------------------------------
// SYMBOL CLICK EVENTS
// ------------------------------------------------------------

function attachSymbolEvents(
    candidates
) {

    document
        .querySelectorAll(
            ".aurora-symbol-button"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const symbol =
                        button.dataset.symbol;

                    showCandidateDetails(
                        symbol,
                        candidates
                    );
                }
            );

        });
}


// ------------------------------------------------------------
// FIND CANDIDATE
// ------------------------------------------------------------

function findCandidate(
    symbol,
    candidates
) {

    return candidates.find(
        candidate =>
            String(candidate.Symbol)
                .toUpperCase()
                .trim()
            ===
            String(symbol)
                .toUpperCase()
                .trim()
    );
}


// ------------------------------------------------------------
// DETAIL MODAL
// ------------------------------------------------------------

function showCandidateDetails(
    symbol,
    candidates
) {

    if (!scannerData) {
        return;
    }


    const candidate =
        findCandidate(
            symbol,
            candidates
        );


    if (!candidate) {
        return;
    }


    const stockMap =
        buildStockMap(scannerData);


    const stock =
        stockMap[
            String(symbol)
                .toUpperCase()
                .trim()
        ] || {};


    const detail =
        scannerData.details &&
        scannerData.details[
            String(symbol)
                .toUpperCase()
                .trim()
        ]
            ? scannerData.details[
                String(symbol)
                    .toUpperCase()
                    .trim()
            ]
            : {};


    const cup =
        detail.cup || {};

    const handle =
        detail.handle || {};

    const rvol =
        Array.isArray(detail.rvol)
            ? detail.rvol
            : [];


    const modal =
        document.createElement("div");

    modal.id =
        "auroraDetailModal";

    modal.className =
        "aurora-modal";


    modal.innerHTML = `

        <div class="aurora-modal-backdrop"></div>


        <div class="aurora-modal-content">

            <div class="aurora-modal-header">

                <div>

                    <div class="aurora-modal-symbol">
                        ${escapeHTML(symbol)}
                    </div>

                    <div class="aurora-modal-stage">
                        ${escapeHTML(
                            candidate.Current_Stage
                        )}
                    </div>

                </div>


                <button
                    class="aurora-close-button"
                    id="auroraCloseModal"
                >
                    ×
                </button>

            </div>


            <div class="aurora-detail-summary">

                <div>
                    <span>DETECTION DATE</span>
                    <strong>
                        ${formatDate(
                            candidate.Detection_Date
                        )}
                    </strong>
                </div>


                <div>
                    <span>DAYS REMAINING</span>
                    <strong>
                        ${formatNumber(
                            candidate.Days_Remaining,
                            0
                        )}
                    </strong>
                </div>


                <div>
                    <span>CURRENT PRICE</span>
                    <strong>
                        ${formatPrice(
                            stock.Current_Close
                        )}
                    </strong>
                </div>


                <div>
                    <span>CURRENT RVOL</span>
                    <strong>
                        ${
                            detail.Current_RVOL !==
                            null &&
                            detail.Current_RVOL !==
                            undefined
                                ? formatNumber(
                                    detail.Current_RVOL,
                                    2
                                ) + "x"
                                : "--"
                        }
                    </strong>
                </div>

            </div>


            <!-- CUP DETAILS -->

            <section class="aurora-detail-section">

                <h3>
                    CUP STRUCTURE
                </h3>


                <div class="aurora-detail-grid">

                    ${detailItem(
                        "LEFT RIM DATE",
                        formatDate(
                            cup.Left_Rim_Date
                        )
                    )}

                    ${detailItem(
                        "LEFT RIM PRICE",
                        formatPrice(
                            cup.Left_Rim_Price
                        )
                    )}

                    ${detailItem(
                        "BOTTOM DATE",
                        formatDate(
                            cup.Bottom_Date
                        )
                    )}

                    ${detailItem(
                        "BOTTOM PRICE",
                        formatPrice(
                            cup.Bottom_Price
                        )
                    )}

                    ${detailItem(
                        "RIGHT RIM DATE",
                        formatDate(
                            cup.Right_Rim_Date
                        )
                    )}

                    ${detailItem(
                        "RIGHT RIM PRICE",
                        formatPrice(
                            cup.Right_Rim_Price
                        )
                    )}

                    ${detailItem(
                        "CUP DEPTH",
                        formatPercent(
                            cup.Cup_Depth_Pct
                        )
                    )}

                    ${detailItem(
                        "CUP DURATION",
                        cup.Cup_Duration_Days !==
                        null &&
                        cup.Cup_Duration_Days !==
                        undefined
                            ? formatNumber(
                                cup.Cup_Duration_Days,
                                0
                            ) + " days"
                            : "--"
                    )}

                    ${detailItem(
                        "RIM DIFFERENCE",
                        formatPercent(
                            cup.Rim_Difference_Pct
                        )
                    )}

                    ${detailItem(
                        "RIGHT RIM RATIO",
                        formatNumber(
                            cup.Right_Rim_Ratio,
                            2
                        )
                    )}

                    ${detailItem(
                        "CUP MIDPOINT",
                        formatPrice(
                            cup.Cup_Midpoint
                        )
                    )}

                </div>

            </section>


            <!-- HANDLE DETAILS -->

            <section class="aurora-detail-section">

                <h3>
                    HANDLE STRUCTURE
                </h3>


                <div class="aurora-detail-grid">

                    ${detailItem(
                        "HANDLE START DATE",
                        formatDate(
                            handle.Handle_Start_Date
                        )
                    )}

                    ${detailItem(
                        "HANDLE LOW DATE",
                        formatDate(
                            handle.Handle_Low_Date
                        )
                    )}

                    ${detailItem(
                        "HANDLE LOW",
                        formatPrice(
                            handle.Handle_Low
                        )
                    )}

                    ${detailItem(
                        "HANDLE DEPTH",
                        formatPercent(
                            handle.Handle_Depth_Pct
                        )
                    )}

                    ${detailItem(
                        "SESSIONS AFTER RIM",
                        handle.Sessions_After_Rim !==
                        null &&
                        handle.Sessions_After_Rim !==
                        undefined
                            ? formatNumber(
                                handle.Sessions_After_Rim,
                                0
                            )
                            : "--"
                    )}

                    ${detailItem(
                        "HANDLE STAGE",
                        handle.Handle_Stage
                    )}

                    ${detailItem(
                        "BREAKOUT LEVEL",
                        formatPrice(
                            handle.Breakout_Level
                        )
                    )}

                </div>

            </section>


            <!-- RVOL -->

            <section class="aurora-detail-section">

                <h3>
                    RVOL — LAST 14 SESSIONS
                </h3>


                <div class="aurora-rvol-table-wrapper">

                    ${renderRVOLTable(
                        rvol.slice(-14)
                    )}

                </div>

            </section>


            <section class="aurora-detail-section">

                <h3>
                    RVOL — LAST 30 SESSIONS
                </h3>


                <div class="aurora-rvol-table-wrapper">

                    ${renderRVOLTable(
                        rvol
                    )}

                </div>

            </section>

        </div>

    `;


    document.body.appendChild(modal);


    document
        .getElementById(
            "auroraCloseModal"
        )
        .addEventListener(
            "click",
            closeDetailModal
        );


    modal
        .querySelector(
            ".aurora-modal-backdrop"
        )
        .addEventListener(
            "click",
            closeDetailModal
        );


    document.addEventListener(
        "keydown",
        handleModalEscape
    );
}


// ------------------------------------------------------------
// DETAIL ITEM
// ------------------------------------------------------------

function detailItem(
    label,
    value
) {

    return `

        <div class="aurora-detail-item">

            <span>
                ${escapeHTML(label)}
            </span>

            <strong>
                ${value}
            </strong>

        </div>

    `;
}


// ------------------------------------------------------------
// RVOL TABLE
// ------------------------------------------------------------

function renderRVOLTable(rows) {

    if (!rows || rows.length === 0) {

        return `

            <div class="aurora-empty">
                No RVOL history available.
            </div>

        `;
    }


    const orderedRows =
        [...rows].reverse();


    return `

        <table class="aurora-rvol-table">

            <thead>

                <tr>
                    <th>DATE</th>
                    <th>RVOL</th>
                    <th>VOLUME</th>
                </tr>

            </thead>


            <tbody>

                ${orderedRows.map(row => `

                    <tr>

                        <td>
                            ${formatDate(
                                row.Date
                            )}
                        </td>

                        <td>

                            <span
                                class="aurora-rvol ${rvolClass(
                                    row.RVOL
                                )}"
                            >
                                ${formatNumber(
                                    row.RVOL,
                                    2
                                )}x
                            </span>

                        </td>

                        <td>
                            ${formatNumber(
                                row.Volume,
                                0
                            )}
                        </td>

                    </tr>

                `).join("")}

            </tbody>

        </table>

    `;
}


// ------------------------------------------------------------
// CLOSE MODAL
// ------------------------------------------------------------

function closeDetailModal() {

    const modal =
        document.getElementById(
            "auroraDetailModal"
        );

    if (modal) {
        modal.remove();
    }

    document.removeEventListener(
        "keydown",
        handleModalEscape
    );
}


function handleModalEscape(event) {

    if (event.key === "Escape") {
        closeDetailModal();
    }
}


// ------------------------------------------------------------
// DATA UNAVAILABLE
// ------------------------------------------------------------

function renderDataUnavailable(
    error
) {

    const main =
        document.querySelector(
            "main.dashboard-container"
        );

    if (!main) {
        return;
    }

    injectDashboardStyles();

    main.innerHTML = `

        <section class="aurora-error">

            <h2>
                Scanner Data Unavailable
            </h2>

            <p>
                Aurora could not load
                <strong>
                    data/scanner.json
                </strong>.
            </p>

            <p class="aurora-error-detail">
                ${escapeHTML(
                    error && error.message
                        ? error.message
                        : "Unknown error"
                )}
            </p>

        </section>

    `;
}


// ------------------------------------------------------------
// DASHBOARD STYLES
// ------------------------------------------------------------
//
// These styles are intentionally contained here so the new
// Release-2 dashboard does not depend on the old Release-1
// presentation structure.
// ------------------------------------------------------------

function injectDashboardStyles() {

    if (
        document.getElementById(
            "auroraRelease2Styles"
        )
    ) {
        return;
    }


    const style =
        document.createElement("style");

    style.id =
        "auroraRelease2Styles";


    style.textContent = `

        .aurora-summary-grid {

            display: grid;

            grid-template-columns:
                repeat(
                    4,
                    minmax(0, 1fr)
                );

            gap: 16px;

            margin-bottom: 28px;
        }


        .aurora-summary-card {

            background: #ffffff;

            border:
                1px solid #e2e8f0;

            border-radius: 10px;

            padding: 20px;

            box-shadow:
                0 2px 8px
                rgba(0,0,0,0.04);
        }


        .aurora-summary-label {

            font-size: 11px;

            font-weight: 700;

            letter-spacing:
                0.08em;

            color: #64748b;

            margin-bottom: 9px;
        }


        .aurora-summary-value {

            font-size: 28px;

            font-weight: 700;

            color: #0f172a;
        }


        .aurora-summary-date {

            font-size: 18px;

            font-weight: 700;

            color: #0f172a;

            margin-top: 5px;
        }


        .aurora-section {

            background: #ffffff;

            border:
                1px solid #e2e8f0;

            border-radius: 10px;

            padding: 20px;

            box-shadow:
                0 2px 8px
                rgba(0,0,0,0.04);

            margin-bottom: 20px;
        }


        .aurora-section-header {

            display: flex;

            justify-content:
                space-between;

            align-items:
                flex-start;

            gap: 20px;

            margin-bottom: 18px;
        }


        .aurora-section-header h2 {

            margin: 0 0 6px 0;

            font-size: 18px;

            color: #0f172a;
        }


        .aurora-section-header p {

            margin: 0;

            color: #64748b;

            font-size: 13px;
        }


        .aurora-live-badge {

            padding:
                6px 11px;

            border-radius: 20px;

            font-size: 11px;

            font-weight: 700;

            letter-spacing:
                0.06em;

            background: #ecfdf5;

            color: #047857;

            border:
                1px solid #a7f3d0;
        }


        .aurora-table-wrapper {

            overflow-x: auto;
        }


        .aurora-table {

            width: 100%;

            border-collapse:
                collapse;

            min-width:
                1050px;
        }


        .aurora-table th {

            text-align: left;

            padding:
                12px 10px;

            font-size: 10px;

            letter-spacing:
                0.06em;

            color: #64748b;

            border-bottom:
                2px solid #e2e8f0;

            white-space:
                nowrap;
        }


        .aurora-table td {

            padding:
                13px 10px;

            font-size: 13px;

            color: #334155;

            border-bottom:
                1px solid #edf2f7;

            white-space:
                nowrap;
        }


        .aurora-table tbody tr:hover {

            background:
                #f8fafc;
        }


        .aurora-symbol-button {

            border: none;

            background: none;

            padding: 0;

            font-size: 14px;

            font-weight: 800;

            cursor: pointer;

            color: #2563eb;
        }


        .aurora-symbol-button:hover {

            text-decoration:
                underline;
        }


        .aurora-stage {

            display: inline-block;

            padding:
                5px 8px;

            border-radius: 5px;

            background: #f1f5f9;

            color: #334155;

            font-size: 10px;

            font-weight: 700;
        }


        .aurora-days {

            font-weight: 700;

            color: #0f172a;
        }


        .aurora-rvol {

            font-weight: 700;
        }


        .rvol-high {

            color: #047857;
        }


        .rvol-medium {

            color: #b45309;
        }


        .rvol-normal {

            color: #475569;
        }


        .aurora-empty {

            text-align: center !important;

            padding: 40px !important;

            color: #64748b !important;
        }


        .aurora-refresh-section {

            display: flex;

            flex-wrap: wrap;

            gap: 28px;

            padding:
                16px 18px;

            background:
                #f8fafc;

            border:
                1px solid #e2e8f0;

            border-radius: 8px;

            margin-bottom: 20px;
        }


        .aurora-refresh-section div {

            display: flex;

            flex-direction:
                column;

            gap: 4px;
        }


        .aurora-refresh-section strong {

            font-size: 10px;

            letter-spacing:
                0.06em;

            color: #64748b;
        }


        .aurora-refresh-section span {

            font-size: 13px;

            font-weight: 600;

            color: #334155;
        }


        /* ----------------------------------------------------
           MODAL
           ---------------------------------------------------- */

        .aurora-modal {

            position: fixed;

            inset: 0;

            z-index: 9999;

            display: flex;

            align-items:
                center;

            justify-content:
                center;

            padding: 20px;
        }


        .aurora-modal-backdrop {

            position: absolute;

            inset: 0;

            background:
                rgba(15,23,42,0.60);
        }


        .aurora-modal-content {

            position: relative;

            width: min(
                1050px,
                100%
            );

            max-height:
                92vh;

            overflow-y:
                auto;

            background:
                #ffffff;

            border-radius:
                12px;

            box-shadow:
                0 20px 60px
                rgba(0,0,0,0.25);

            padding: 24px;
        }


        .aurora-modal-header {

            display: flex;

            justify-content:
                space-between;

            align-items:
                flex-start;

            margin-bottom: 20px;

            padding-bottom:
                16px;

            border-bottom:
                1px solid #e2e8f0;
        }


        .aurora-modal-symbol {

            font-size: 26px;

            font-weight: 800;

            color: #0f172a;
        }


        .aurora-modal-stage {

            display: inline-block;

            margin-top: 7px;

            padding:
                5px 9px;

            border-radius: 5px;

            background:
                #f1f5f9;

            font-size: 11px;

            font-weight: 700;

            color: #334155;
        }


        .aurora-close-button {

            width: 36px;

            height: 36px;

            border: none;

            border-radius: 50%;

            background:
                #f1f5f9;

            color: #334155;

            font-size: 25px;

            line-height: 1;

            cursor: pointer;
        }


        .aurora-close-button:hover {

            background:
                #e2e8f0;
        }


        .aurora-detail-summary {

            display: grid;

            grid-template-columns:
                repeat(
                    4,
                    minmax(0, 1fr)
                );

            gap: 12px;

            margin-bottom: 25px;
        }


        .aurora-detail-summary > div {

            padding: 13px;

            background:
                #f8fafc;

            border:
                1px solid #e2e8f0;

            border-radius: 7px;
        }


        .aurora-detail-summary span {

            display: block;

            font-size: 9px;

            font-weight: 700;

            letter-spacing:
                0.06em;

            color: #64748b;

            margin-bottom: 5px;
        }


        .aurora-detail-summary strong {

            color: #0f172a;

            font-size: 15px;
        }


        .aurora-detail-section {

            margin-top: 25px;
        }


        .aurora-detail-section h3 {

            margin:
                0 0 12px 0;

            font-size: 14px;

            color: #0f172a;

            letter-spacing:
                0.04em;
        }


        .aurora-detail-grid {

            display: grid;

            grid-template-columns:
                repeat(
                    4,
                    minmax(0, 1fr)
                );

            gap: 10px;
        }


        .aurora-detail-item {

            padding: 12px;

            background:
                #f8fafc;

            border:
                1px solid #e2e8f0;

            border-radius: 6px;
        }


        .aurora-detail-item span {

            display: block;

            font-size: 9px;

            font-weight: 700;

            color: #64748b;

            margin-bottom: 5px;

            letter-spacing:
                0.04em;
        }


        .aurora-detail-item strong {

            display: block;

            font-size: 13px;

            color: #0f172a;
        }


        .aurora-rvol-table-wrapper {

            overflow-x: auto;

            border:
                1px solid #e2e8f0;

            border-radius: 7px;
        }


        .aurora-rvol-table {

            width: 100%;

            border-collapse:
                collapse;
        }


        .aurora-rvol-table th {

            text-align: left;

            padding:
                10px;

            font-size: 10px;

            color: #64748b;

            background:
                #f8fafc;

            border-bottom:
                1px solid #e2e8f0;
        }


        .aurora-rvol-table td {

            padding:
                9px 10px;

            font-size: 12px;

            color: #334155;

            border-bottom:
                1px solid #edf2f7;
        }


        .aurora-error {

            padding: 50px;

            text-align: center;

            background:
                #ffffff;

            border:
                1px solid #fecaca;

            border-radius: 10px;
        }


        .aurora-error h2 {

            color: #991b1b;

            margin-bottom: 10px;
        }


        .aurora-error p {

            color: #475569;
        }


        .aurora-error-detail {

            font-family:
                monospace;

            font-size: 12px;

            color: #991b1b !important;
        }


        @media (max-width: 900px) {

            .aurora-summary-grid {

                grid-template-columns:
                    repeat(2, 1fr);
            }


            .aurora-detail-summary {

                grid-template-columns:
                    repeat(2, 1fr);
            }


            .aurora-detail-grid {

                grid-template-columns:
                    repeat(2, 1fr);
            }
        }


        @media (max-width: 600px) {

            .aurora-summary-grid {

                grid-template-columns:
                    1fr;
            }


            .aurora-detail-summary {

                grid-template-columns:
                    1fr;
            }


            .aurora-detail-grid {

                grid-template-columns:
                    1fr;
            }


            .aurora-modal {

                padding: 8px;
            }


            .aurora-modal-content {

                padding: 16px;

                max-height:
                    96vh;
            }
        }

    `;


    document.head.appendChild(style);
}


// ------------------------------------------------------------
// INITIALIZE
// ------------------------------------------------------------

document.addEventListener(
    "DOMContentLoaded",
    () => {

        loadScannerData();

    }
);
