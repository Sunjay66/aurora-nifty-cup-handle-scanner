# AURORA CUP & HANDLE SCANNER — PRODUCTION SCANNER
# Release 2 — NIFTY 200 production wrapper
#
# The seven core functions below are extracted verbatim from the final
# Release-2 function definitions used by the notebook's SAFE FUNCTION RESTORE.
# Wrapper code adds the NIFTY 200 universe, RVOL history, candidate lifecycle,
# and JSON output. It does not modify the frozen Cup & Handle engine.
#
# Base_Start_Date is intentionally not included anywhere in the output.

import json
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo

import pandas as pd
import numpy as np
import requests
from io import StringIO
import yfinance as yf

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

HISTORY_FILE = DATA_DIR / "cup_handle_candidate_history.csv"
SCANNER_JSON = DATA_DIR / "scanner.json"

NIFTY200_CSV_URL = (
    "https://nsearchives.nseindia.com/content/indices/"
    "ind_nifty200list.csv"
)

TIMEZONE = "Asia/Kolkata"


# ============================================================
# FROZEN ENGINE FUNCTION — get_stock_data
# ============================================================

def get_stock_data(symbol, period="2y", interval="1d"):

    ticker = yf.Ticker(symbol + ".NS")

    df = ticker.history(
        period=period,
        interval=interval,
        auto_adjust=False
    )

    if df is None or df.empty:
        return None

    df = df.copy()

    try:
        df.index = df.index.tz_localize(None)
    except:
        pass

    return df


# ============================================================
# FROZEN ENGINE FUNCTION — add_basic_features
# ============================================================

def add_basic_features(df):

    df = df.copy()

    # --------------------------------------------------------
    # Moving averages
    # --------------------------------------------------------

    df["EMA20"] = df["Close"].ewm(
        span=20,
        adjust=False
    ).mean()

    df["EMA50"] = df["Close"].ewm(
        span=50,
        adjust=False
    ).mean()

    df["EMA200"] = df["Close"].ewm(
        span=200,
        adjust=False
    ).mean()

    # --------------------------------------------------------
    # Daily return
    # --------------------------------------------------------

    df["Daily_Return_Pct"] = (
        df["Close"].pct_change() * 100
    )

    # --------------------------------------------------------
    # 20-day average volume
    # --------------------------------------------------------

    df["Volume_SMA20"] = (
        df["Volume"]
        .rolling(20)
        .mean()
    )

    # --------------------------------------------------------
    # Relative volume
    # --------------------------------------------------------

    df["Relative_Volume"] = (
        df["Volume"] / df["Volume_SMA20"]
    )

    return df


# ============================================================
# FROZEN ENGINE FUNCTION — detect_structural_pivots
# ============================================================

def detect_structural_pivots(
    df,
    window=10,
    min_move_pct=3.0
):

    df = df.copy()

    # --------------------------------------------------------
    # Local High / Local Low
    # --------------------------------------------------------

    rolling_high = (
        df["High"]
        .rolling(
            window=window * 2 + 1,
            center=True
        )
        .max()
    )

    rolling_low = (
        df["Low"]
        .rolling(
            window=window * 2 + 1,
            center=True
        )
        .min()
    )

    df["Potential_High"] = (
        df["High"] == rolling_high
    )

    df["Potential_Low"] = (
        df["Low"] == rolling_low
    )

    # --------------------------------------------------------
    # Collect potential pivots
    # --------------------------------------------------------

    candidates = []

    for i in range(len(df)):

        if df["Potential_High"].iloc[i]:

            candidates.append({
                "Date": df.index[i],
                "Price": float(df["High"].iloc[i]),
                "Type": "HIGH",
                "Index": i
            })

        elif df["Potential_Low"].iloc[i]:

            candidates.append({
                "Date": df.index[i],
                "Price": float(df["Low"].iloc[i]),
                "Type": "LOW",
                "Index": i
            })

    # --------------------------------------------------------
    # Filter pivots
    # --------------------------------------------------------

    pivots = []

    for candidate in candidates:

        if not pivots:

            pivots.append(candidate)
            continue

        previous = pivots[-1]

        # ----------------------------------------------------
        # Same type:
        # retain the more extreme pivot
        # ----------------------------------------------------

        if candidate["Type"] == previous["Type"]:

            if candidate["Type"] == "HIGH":

                if candidate["Price"] > previous["Price"]:
                    pivots[-1] = candidate

            else:

                if candidate["Price"] < previous["Price"]:
                    pivots[-1] = candidate

            continue

        # ----------------------------------------------------
        # Opposite type:
        # check minimum price movement
        # ----------------------------------------------------

        move_pct = abs(
            candidate["Price"] - previous["Price"]
        ) / previous["Price"] * 100

        if move_pct >= min_move_pct:

            pivots.append(candidate)

    # --------------------------------------------------------
    # Create result
    # --------------------------------------------------------

    result = pd.DataFrame(pivots)

    if result.empty:

        return pd.DataFrame(
            columns=[
                "Date",
                "Price",
                "Type",
                "Index"
            ]
        )

    result = result[
        [
            "Date",
            "Price",
            "Type",
            "Index"
        ]
    ].reset_index(drop=True)

    return result


# ============================================================
# FROZEN ENGINE FUNCTION — detect_cup_candidates
# ============================================================

def detect_cup_candidates(
    pivots,
    min_cup_depth_pct=10.0,
    max_cup_depth_pct=45.0,
    min_cup_days=30,
    max_cup_days=300,
    max_rim_difference_pct=10.0,
    min_right_rim_ratio=0.90
):

    candidates = []

    if pivots is None or pivots.empty:
        return pd.DataFrame()

    # --------------------------------------------------------
    # Look for HIGH -> LOW -> HIGH structures
    # --------------------------------------------------------

    for i in range(len(pivots) - 2):

        left = pivots.iloc[i]
        bottom = pivots.iloc[i + 1]
        right = pivots.iloc[i + 2]

        # ----------------------------------------------------
        # Required structure
        # ----------------------------------------------------

        if not (
            left["Type"] == "HIGH"
            and bottom["Type"] == "LOW"
            and right["Type"] == "HIGH"
        ):
            continue

        left_price = float(left["Price"])
        bottom_price = float(bottom["Price"])
        right_price = float(right["Price"])

        # ----------------------------------------------------
        # Cup duration
        # ----------------------------------------------------

        cup_days = (
            right["Date"] - left["Date"]
        ).days

        if cup_days < min_cup_days:
            continue

        if cup_days > max_cup_days:
            continue

        # ----------------------------------------------------
        # Cup depth
        # ----------------------------------------------------

        depth_pct = (
            (left_price - bottom_price)
            / left_price
            * 100
        )

        if depth_pct < min_cup_depth_pct:
            continue

        if depth_pct > max_cup_depth_pct:
            continue

        # ----------------------------------------------------
        # Rim difference
        # ----------------------------------------------------

        rim_difference_pct = (
            abs(left_price - right_price)
            / left_price
            * 100
        )

        if rim_difference_pct > max_rim_difference_pct:
            continue

        # ----------------------------------------------------
        # Right rim recovery
        # ----------------------------------------------------

        right_rim_ratio = right_price / left_price

        if right_rim_ratio < min_right_rim_ratio:
            continue

        # ----------------------------------------------------
        # Cup midpoint
        # ----------------------------------------------------

        cup_midpoint = (
            left_price + bottom_price
        ) / 2

        # ----------------------------------------------------
        # Store candidate
        # ----------------------------------------------------

        candidates.append({

            "Left_Rim_Date": left["Date"],
            "Left_Rim_Price": left_price,

            "Bottom_Date": bottom["Date"],
            "Bottom_Price": bottom_price,

            "Right_Rim_Date": right["Date"],
            "Right_Rim_Price": right_price,

            "Cup_Duration_Days": cup_days,

            "Cup_Depth_Pct": depth_pct,

            "Rim_Difference_Pct":
                rim_difference_pct,

            "Right_Rim_Ratio":
                right_rim_ratio,

            "Cup_Midpoint":
                cup_midpoint
        })

    # --------------------------------------------------------
    # Result
    # --------------------------------------------------------

    result = pd.DataFrame(candidates)

    if not result.empty:

        result = result.sort_values(
            "Right_Rim_Date"
        ).reset_index(drop=True)

    return result


# ============================================================
# FROZEN ENGINE FUNCTION — analyze_current_handle
# ============================================================

def analyze_current_handle(
    df,
    cup_row,
    min_handle_sessions=5,
    max_handle_sessions=45,
    min_handle_depth_pct=2.0,
    max_handle_depth_pct=15.0,
    near_breakout_pct=3.0
):

    df = df.copy()

    # --------------------------------------------------------
    # Cup information
    # --------------------------------------------------------

    left_rim = float(cup_row["Left_Rim_Price"])
    bottom = float(cup_row["Bottom_Price"])
    right_rim = float(cup_row["Right_Rim_Price"])
    cup_midpoint = float(cup_row["Cup_Midpoint"])

    right_rim_date = cup_row["Right_Rim_Date"]

    # --------------------------------------------------------
    # Data after right rim
    # --------------------------------------------------------

    post_rim = df.loc[
        df.index > right_rim_date
    ].copy()

    if post_rim.empty:

        return {
            "Stage": "CUP COMPLETED",
            "Message": "No price data after right rim.",
            "Right_Rim_Price": right_rim
        }

    # --------------------------------------------------------
    # Number of trading sessions after right rim
    # --------------------------------------------------------

    sessions = len(post_rim)

    # --------------------------------------------------------
    # Breakout level
    # --------------------------------------------------------

    breakout_level = right_rim * 1.01

    near_breakout_level = (
        right_rim *
        (1 - near_breakout_pct / 100)
    )

    # --------------------------------------------------------
    # Lowest low after right rim
    # --------------------------------------------------------

    lowest_low = float(post_rim["Low"].min())

    lowest_low_date = post_rim["Low"].idxmin()

    # --------------------------------------------------------
    # Handle depth
    # --------------------------------------------------------

    handle_depth_pct = (
        (right_rim - lowest_low)
        / right_rim
        * 100
    )

    # --------------------------------------------------------
    # Current price
    # --------------------------------------------------------

    current_close = float(df["Close"].iloc[-1])
    current_date = df.index[-1]

    # --------------------------------------------------------
    # Pattern invalidation
    #
    # Handle should not break below the cup midpoint.
    # --------------------------------------------------------

    if lowest_low < cup_midpoint:

        return {
            "Stage": "PATTERN INVALIDATED",

            "Message":
                "Post-rim decline fell below cup midpoint.",

            "Current_Date": current_date,
            "Current_Close": current_close,

            "Right_Rim_Price": right_rim,
            "Cup_Midpoint": cup_midpoint,

            "Handle_Low": lowest_low,
            "Handle_Low_Date": lowest_low_date,

            "Handle_Depth_Pct":
                handle_depth_pct,

            "Sessions_After_Rim":
                sessions,

            "Breakout_Level":
                breakout_level
        }

    # --------------------------------------------------------
    # Handle too deep
    # --------------------------------------------------------

    if handle_depth_pct > max_handle_depth_pct:

        return {
            "Stage": "HANDLE TOO DEEP",

            "Message":
                "Post-rim decline exceeds maximum handle depth.",

            "Current_Date": current_date,
            "Current_Close": current_close,

            "Right_Rim_Price": right_rim,
            "Cup_Midpoint": cup_midpoint,

            "Handle_Low": lowest_low,
            "Handle_Low_Date": lowest_low_date,

            "Handle_Depth_Pct":
                handle_depth_pct,

            "Sessions_After_Rim":
                sessions,

            "Breakout_Level":
                breakout_level
        }

    # --------------------------------------------------------
    # Breakout
    # --------------------------------------------------------

    breakout_rows = post_rim[
        post_rim["Close"] >= breakout_level
    ]

    if not breakout_rows.empty:

        breakout_date = breakout_rows.index[0]
        breakout_close = float(
            breakout_rows["Close"].iloc[0]
        )

        return {
            "Stage": "BREAKOUT",

            "Message":
                "Close has moved above the Cup rim.",

            "Current_Date": current_date,
            "Current_Close": current_close,

            "Right_Rim_Price": right_rim,
            "Cup_Midpoint": cup_midpoint,

            "Handle_Low": lowest_low,
            "Handle_Low_Date": lowest_low_date,

            "Handle_Depth_Pct":
                handle_depth_pct,

            "Sessions_After_Rim":
                sessions,

            "Breakout_Level":
                breakout_level,

            "Breakout_Date":
                breakout_date,

            "Breakout_Close":
                breakout_close
        }

    # --------------------------------------------------------
    # Near breakout
    # --------------------------------------------------------

    if current_close >= near_breakout_level:

        return {
            "Stage": "NEAR BREAKOUT",

            "Message":
                "Price is within the near-breakout zone.",

            "Current_Date": current_date,
            "Current_Close": current_close,

            "Right_Rim_Price": right_rim,
            "Cup_Midpoint": cup_midpoint,

            "Handle_Low": lowest_low,
            "Handle_Low_Date": lowest_low_date,

            "Handle_Depth_Pct":
                handle_depth_pct,

            "Sessions_After_Rim":
                sessions,

            "Breakout_Level":
                breakout_level
        }

    # --------------------------------------------------------
    # Handle developing
    # --------------------------------------------------------

    if (
        sessions >= min_handle_sessions
        and
        sessions <= max_handle_sessions
        and
        handle_depth_pct >= min_handle_depth_pct
    ):

        return {
            "Stage": "HANDLE DEVELOPING",

            "Message":
                "Post-rim pullback is within acceptable handle parameters.",

            "Current_Date": current_date,
            "Current_Close": current_close,

            "Right_Rim_Price": right_rim,
            "Cup_Midpoint": cup_midpoint,

            "Handle_Low": lowest_low,
            "Handle_Low_Date": lowest_low_date,

            "Handle_Depth_Pct":
                handle_depth_pct,

            "Sessions_After_Rim":
                sessions,

            "Breakout_Level":
                breakout_level
        }

    # --------------------------------------------------------
    # Handle too long
    # --------------------------------------------------------

    if sessions > max_handle_sessions:

        return {
            "Stage": "HANDLE TOO LONG / STALE",

            "Message":
                "Post-rim consolidation has exceeded the maximum handle window.",

            "Current_Date": current_date,
            "Current_Close": current_close,

            "Right_Rim_Price": right_rim,
            "Cup_Midpoint": cup_midpoint,

            "Handle_Low": lowest_low,
            "Handle_Low_Date": lowest_low_date,

            "Handle_Depth_Pct":
                handle_depth_pct,

            "Sessions_After_Rim":
                sessions,

            "Breakout_Level":
                breakout_level
        }

    # --------------------------------------------------------
    # Default
    # --------------------------------------------------------

    return {
        "Stage": "HANDLE DEVELOPING",

        "Message":
            "Post-rim price action is developing.",

        "Current_Date": current_date,
        "Current_Close": current_close,

        "Right_Rim_Price": right_rim,
        "Cup_Midpoint": cup_midpoint,

        "Handle_Low": lowest_low,
        "Handle_Low_Date": lowest_low_date,

        "Handle_Depth_Pct":
            handle_depth_pct,

        "Sessions_After_Rim":
            sessions,

        "Breakout_Level":
            breakout_level
    }


# ============================================================
# FROZEN ENGINE FUNCTION — evaluate_all_cup_candidates
# ============================================================

def evaluate_all_cup_candidates(
    df,
    cup_candidates
):

    results = []

    if cup_candidates is None or cup_candidates.empty:

        return pd.DataFrame()

    # --------------------------------------------------------
    # Evaluate every Cup candidate
    # --------------------------------------------------------

    for i in range(len(cup_candidates)):

        cup = cup_candidates.iloc[i]

        handle_result = analyze_current_handle(
            df,
            cup
        )

        result = {
            "Cup_Number": i + 1,

            "Left_Rim_Date":
                cup["Left_Rim_Date"],

            "Left_Rim_Price":
                cup["Left_Rim_Price"],

            "Bottom_Date":
                cup["Bottom_Date"],

            "Bottom_Price":
                cup["Bottom_Price"],

            "Right_Rim_Date":
                cup["Right_Rim_Date"],

            "Right_Rim_Price":
                cup["Right_Rim_Price"],

            "Cup_Depth_Pct":
                cup["Cup_Depth_Pct"],

            "Cup_Duration_Days":
                cup["Cup_Duration_Days"],

            "Rim_Difference_Pct":
                cup["Rim_Difference_Pct"],

            "Stage":
                handle_result.get("Stage"),

            "Message":
                handle_result.get("Message"),

            "Handle_Low":
                handle_result.get("Handle_Low"),

            "Handle_Depth_Pct":
                handle_result.get("Handle_Depth_Pct"),

            "Sessions_After_Rim":
                handle_result.get("Sessions_After_Rim"),

            "Current_Close":
                handle_result.get("Current_Close"),

            "Breakout_Level":
                handle_result.get("Breakout_Level")
        }

        results.append(result)

    # --------------------------------------------------------
    # Final table
    # --------------------------------------------------------

    return pd.DataFrame(results)


# ============================================================
# FROZEN ENGINE FUNCTION — select_current_pattern
# ============================================================

def select_current_pattern(df, cup_analysis, max_current_age_sessions=60, recent_breakout_sessions=20):
    if df is None or df.empty:
        return {'Stage': 'NO PATTERN', 'Message': 'No price data available.'}
    if cup_analysis is None or cup_analysis.empty:
        return {'Stage': 'NO PATTERN', 'Message': 'No Cup candidates available.'}
    current_date = df.index[-1]
    evaluated = []
    for _, row in cup_analysis.iterrows():
        right_rim_date = row['Right_Rim_Date']
        sessions_since_rim = len(df.loc[df.index > right_rim_date])
        stage = row['Stage']
        if stage == 'PATTERN INVALIDATED':
            final_stage = 'PATTERN INVALIDATED'
            message = 'Cup existed, but post-rim price action damaged the pattern.'
        elif stage == 'BREAKOUT':
            if sessions_since_rim <= recent_breakout_sessions:
                final_stage = 'BREAKOUT'
                message = 'Recent breakout above Cup rim.'
            else:
                final_stage = 'HISTORICAL / STALE'
                message = 'Breakout occurred too far in the past to be considered current.'
        elif sessions_since_rim > max_current_age_sessions:
            final_stage = 'HISTORICAL / STALE'
            message = 'Cup is too old to be considered a current setup.'
        else:
            final_stage = stage
            message = row['Message']
        evaluated.append({'Cup_Number': row['Cup_Number'], 'Right_Rim_Date': right_rim_date, 'Right_Rim_Price': row['Right_Rim_Price'], 'Cup_Depth_Pct': row['Cup_Depth_Pct'], 'Cup_Duration_Days': row['Cup_Duration_Days'], 'Rim_Difference_Pct': row['Rim_Difference_Pct'], 'Sessions_Since_Rim': sessions_since_rim, 'Original_Stage': stage, 'Current_Stage': final_stage, 'Current_Message': message, 'Left_Rim_Date': row.get('Left_Rim_Date', None), 'Left_Rim_Price': row.get('Left_Rim_Price', None), 'Bottom_Date': row.get('Bottom_Date', None), 'Bottom_Price': row.get('Bottom_Price', None), 'Right_Rim_Ratio': row.get('Right_Rim_Ratio', None), 'Cup_Midpoint': row.get('Cup_Midpoint', None)})
    result = pd.DataFrame(evaluated)
    actionable_stages = ['CUP COMPLETED', 'HANDLE DEVELOPING', 'NEAR BREAKOUT', 'BREAKOUT']
    actionable = result[result['Current_Stage'].isin(actionable_stages)]
    if actionable.empty:
        overall_stage = 'NO CURRENT VALID PATTERN'
        overall_message = 'No fresh, valid Cup & Handle setup is currently available.'
    else:
        selected = actionable.iloc[-1]
        overall_stage = selected['Current_Stage']
        overall_message = selected['Current_Message']
    return {'Current_Date': current_date, 'Overall_Stage': overall_stage, 'Overall_Message': overall_message, 'Candidates': result}


def load_nifty200_universe():
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/154.0 Safari/537.36"
        ),
        "Accept": "text/csv,text/plain,*/*",
        "Referer": "https://www.nseindia.com/",
    }

    response = requests.get(
        NIFTY200_CSV_URL,
        headers=headers,
        timeout=30
    )
    response.raise_for_status()

    df = pd.read_csv(
        StringIO(response.content.decode("utf-8-sig"))
    )

    symbol_column = next(
        (
            col
            for col in ["Symbol", "SYMBOL", "symbol"]
            if col in df.columns
        ),
        None
    )

    if symbol_column is None:
        raise ValueError(
            "Could not identify the Symbol column in the NSE Nifty 200 file."
        )

    symbols = (
        df[symbol_column]
        .astype(str)
        .str.strip()
        .str.upper()
        .str.replace(".NS", "", regex=False)
        .dropna()
        .tolist()
    )

    symbols = list(dict.fromkeys(symbols))

    if len(symbols) != 200:
        raise ValueError(
            f"NSE Nifty 200 file returned {len(symbols)} unique symbols, "
            "not 200. Universe was not accepted."
        )

    return symbols


def calculate_rvol_history(df):
    """RVOL = current volume / average volume of previous 20 completed sessions."""
    x = df.sort_index().copy()

    prior_20_avg_volume = (
        x["Volume"]
        .shift(1)
        .rolling(20)
        .mean()
    )

    x["RVOL"] = (
        x["Volume"] /
        prior_20_avg_volume
    )

    recent = (
        x[["Volume", "RVOL"]]
        .dropna()
        .tail(30)
    )

    rows = []

    for dt, row in recent.iterrows():
        rows.append({
            "Date": pd.Timestamp(dt).strftime("%Y-%m-%d"),
            "RVOL": round(float(row["RVOL"]), 2),
            "Volume": int(row["Volume"])
        })

    return rows


def scan_universe(symbols):
    scanner_results = []
    scanner_errors = []
    details = {}
    successful_dates = []

    for symbol in symbols:

        try:
            df = get_stock_data(
                symbol,
                period="2y",
                interval="1d"
            )

            if df is None or df.empty:
                scanner_errors.append({
                    "Symbol": symbol,
                    "Error": "No data"
                })
                continue

            df = df.sort_index()

            successful_dates.append(
                pd.Timestamp(df.index[-1]).normalize()
            )

            df = add_basic_features(df)

            pivots = detect_structural_pivots(
                df,
                window=10,
                min_move_pct=3.0
            )

            cups = detect_cup_candidates(
                pivots
            )

            current_date = pd.Timestamp(
                df.index[-1]
            ).strftime("%Y-%m-%d")

            current_close = round(
                float(df["Close"].iloc[-1]),
                2
            )

            # No Cup = no current valid pattern.
            if cups is None or cups.empty:

                scanner_results.append({
                    "Symbol": symbol,
                    "Current_Date": current_date,
                    "Current_Close": current_close,
                    "Cup_Candidates": 0,
                    "Latest_Right_Rim": None,
                    "Cup_Depth_Pct": None,
                    "Cup_Duration_Days": None,
                    "Rim_Difference_Pct": None,
                    "Current_Stage": "NO CURRENT VALID PATTERN",
                    "Message": (
                        "No fresh, valid Cup & Handle setup is "
                        "currently available."
                    )
                })

                continue

            all_analysis = evaluate_all_cup_candidates(
                df,
                cups
            )

            current = select_current_pattern(
                df,
                all_analysis
            )

            current_stage = current.get(
                "Overall_Stage",
                "NO CURRENT VALID PATTERN"
            )

            latest_cup = cups.iloc[-1]

            scanner_results.append({
                "Symbol": symbol,
                "Current_Date": current_date,
                "Current_Close": current_close,
                "Cup_Candidates": int(len(cups)),
                "Latest_Right_Rim": pd.Timestamp(
                    latest_cup["Right_Rim_Date"]
                ).strftime("%Y-%m-%d"),
                "Cup_Depth_Pct": round(
                    float(latest_cup["Cup_Depth_Pct"]),
                    2
                ),
                "Cup_Duration_Days": int(
                    latest_cup["Cup_Duration_Days"]
                ),
                "Rim_Difference_Pct": round(
                    float(latest_cup["Rim_Difference_Pct"]),
                    2
                ),
                "Current_Stage": current_stage,
                "Message": current.get(
                    "Overall_Message",
                    ""
                )
            })

            # ------------------------------------------------
            # Detailed data for the latest Cup
            # ------------------------------------------------

            handle = analyze_current_handle(
                df,
                latest_cup
            )

            details[symbol] = {
                "cup": {
                    "Left_Rim_Date": pd.Timestamp(
                        latest_cup["Left_Rim_Date"]
                    ).strftime("%Y-%m-%d"),

                    "Left_Rim_Price": float(
                        latest_cup["Left_Rim_Price"]
                    ),

                    "Bottom_Date": pd.Timestamp(
                        latest_cup["Bottom_Date"]
                    ).strftime("%Y-%m-%d"),

                    "Bottom_Price": float(
                        latest_cup["Bottom_Price"]
                    ),

                    "Right_Rim_Date": pd.Timestamp(
                        latest_cup["Right_Rim_Date"]
                    ).strftime("%Y-%m-%d"),

                    "Right_Rim_Price": float(
                        latest_cup["Right_Rim_Price"]
                    ),

                    "Cup_Duration_Days": int(
                        latest_cup["Cup_Duration_Days"]
                    ),

                    "Cup_Depth_Pct": float(
                        latest_cup["Cup_Depth_Pct"]
                    ),

                    "Rim_Difference_Pct": float(
                        latest_cup["Rim_Difference_Pct"]
                    ),

                    "Right_Rim_Ratio": float(
                        latest_cup["Right_Rim_Ratio"]
                    ),

                    "Cup_Midpoint": float(
                        latest_cup["Cup_Midpoint"]
                    )
                },

                "handle": {
                    "Handle_Start_Date": pd.Timestamp(
                        latest_cup["Right_Rim_Date"]
                    ).strftime("%Y-%m-%d"),

                    "Handle_Low_Date": (
                        pd.Timestamp(
                            handle["Handle_Low_Date"]
                        ).strftime("%Y-%m-%d")
                        if handle.get("Handle_Low_Date") is not None
                        else None
                    ),

                    "Handle_Low": handle.get(
                        "Handle_Low"
                    ),

                    "Handle_Depth_Pct": handle.get(
                        "Handle_Depth_Pct"
                    ),

                    "Sessions_After_Rim": handle.get(
                        "Sessions_After_Rim"
                    ),

                    # Frozen engine uses "Stage".
                    "Handle_Stage": handle.get(
                        "Stage"
                    ),

                    "Breakout_Level": handle.get(
                        "Breakout_Level"
                    )
                },

                "rvol": calculate_rvol_history(df)
            }

        except Exception as e:

            scanner_errors.append({
                "Symbol": symbol,
                "Error": (
                    f"{type(e).__name__}: {e}"
                )
            })

    return (
        pd.DataFrame(scanner_results),
        details,
        scanner_errors,
        successful_dates
    )


def update_candidate_history(
    active_stage_map,
    scan_date
):
    columns = [
        "Candidate_ID",
        "Symbol",
        "Detection_Date",
        "Last_Seen_Date",
        "Expiry_Date",
        "Status",
        "Current_Stage",
        "Breakout_Date",
        "Days_Since_Detection",
        "Days_Remaining"
    ]

    if HISTORY_FILE.exists():
        history_df = pd.read_csv(
            HISTORY_FILE
        )
    else:
        history_df = pd.DataFrame(
            columns=columns
        )

    if history_df.empty:
        history_df = pd.DataFrame(
            columns=columns
        )

    for col in [
        "Detection_Date",
        "Last_Seen_Date",
        "Expiry_Date",
        "Breakout_Date"
    ]:
        if col in history_df.columns:
            history_df[col] = pd.to_datetime(
                history_df[col],
                errors="coerce"
            ).dt.normalize()

    current_scan_date = pd.Timestamp(
        scan_date
    ).normalize()

    # --------------------------------------------------------
    # Update / create today's active episodes
    # --------------------------------------------------------

    for symbol, stage_value in active_stage_map.items():

        current_stage = str(
            stage_value
        ).strip().upper()

        active_existing = history_df[
            (history_df["Symbol"] == symbol) &
            (history_df["Status"] == "ACTIVE")
        ]

        if not active_existing.empty:

            idx = active_existing.index[-1]

            history_df.loc[
                idx,
                "Last_Seen_Date"
            ] = current_scan_date

            history_df.loc[
                idx,
                "Current_Stage"
            ] = current_stage

            # IMPORTANT:
            # Only exact BREAKOUT is a breakout.
            if current_stage == "BREAKOUT":

                history_df.loc[
                    idx,
                    "Status"
                ] = "BREAKOUT"

                history_df.loc[
                    idx,
                    "Breakout_Date"
                ] = current_scan_date

        else:

            detection_date = current_scan_date

            candidate_id = (
                f"{symbol}_"
                f"{detection_date.strftime('%Y-%m-%d')}"
            )

            expiry_date = (
                detection_date +
                pd.Timedelta(days=29)
            )

            initial_status = (
                "BREAKOUT"
                if current_stage == "BREAKOUT"
                else "ACTIVE"
            )

            history_df = pd.concat(
                [
                    history_df,
                    pd.DataFrame([{
                        "Candidate_ID":
                            candidate_id,

                        "Symbol":
                            symbol,

                        "Detection_Date":
                            detection_date,

                        "Last_Seen_Date":
                            current_scan_date,

                        "Expiry_Date":
                            expiry_date,

                        "Status":
                            initial_status,

                        "Current_Stage":
                            current_stage,

                        "Breakout_Date":
                            (
                                current_scan_date
                                if initial_status == "BREAKOUT"
                                else pd.NaT
                            ),

                        "Days_Since_Detection":
                            0,

                        "Days_Remaining":
                            (
                                0
                                if initial_status == "BREAKOUT"
                                else 30
                            )
                    }])
                ],
                ignore_index=True
            )

    # --------------------------------------------------------
    # Recalculate lifecycle
    # --------------------------------------------------------

    for idx in history_df.index:

        detection_date = pd.to_datetime(
            history_df.loc[
                idx,
                "Detection_Date"
            ]
        ).normalize()

        days_since = (
            current_scan_date -
            detection_date
        ).days

        history_df.loc[
            idx,
            "Days_Since_Detection"
        ] = days_since

        status = history_df.loc[
            idx,
            "Status"
        ]

        # BREAKOUT remains permanent.
        if status == "BREAKOUT":

            history_df.loc[
                idx,
                "Days_Remaining"
            ] = 0

            continue

        # ACTIVE for first 30 calendar days.
        if days_since < 30:

            history_df.loc[
                idx,
                "Status"
            ] = "ACTIVE"

            history_df.loc[
                idx,
                "Days_Remaining"
            ] = 30 - days_since

        # After 30 days -> EXPIRED.
        else:

            history_df.loc[
                idx,
                "Status"
            ] = "EXPIRED"

            history_df.loc[
                idx,
                "Days_Remaining"
            ] = 0

    history_df = (
        history_df
        .sort_values(
            [
                "Detection_Date",
                "Symbol"
            ],
            ascending=[
                False,
                True
            ]
        )
        .reset_index(drop=True)
    )

    history_df.to_csv(
        HISTORY_FILE,
        index=False,
        date_format="%Y-%m-%d"
    )

    return history_df


def build_scanner_json(
    scanner_df,
    details,
    errors,
    history_df,
    symbols,
    successful_dates
):
    refresh_time = datetime.now(
        ZoneInfo(TIMEZONE)
    )

    data_through = (
        max(successful_dates).strftime("%Y-%m-%d")
        if successful_dates
        else None
    )

    # Main dashboard visibility is driven by the permanent
    # 30-day ACTIVE lifecycle, not by today's stage alone.
    active_history = history_df[
        (history_df["Status"] == "ACTIVE") &
        (history_df["Days_Since_Detection"] < 30)
    ].copy()

    active_records = []

    for _, row in active_history.iterrows():

        active_records.append({
            "Candidate_ID":
                row["Candidate_ID"],

            "Symbol":
                row["Symbol"],

            "Detection_Date":
                pd.Timestamp(
                    row["Detection_Date"]
                ).strftime("%Y-%m-%d"),

            "Last_Seen_Date":
                pd.Timestamp(
                    row["Last_Seen_Date"]
                ).strftime("%Y-%m-%d"),

            "Expiry_Date":
                pd.Timestamp(
                    row["Expiry_Date"]
                ).strftime("%Y-%m-%d"),

            "Status":
                row["Status"],

            "Current_Stage":
                row["Current_Stage"],

            "Days_Since_Detection":
                int(row["Days_Since_Detection"]),

            "Days_Remaining":
                int(row["Days_Remaining"])
        })

    active_symbols = {
        str(x["Symbol"]).upper().strip()
        for x in active_records
    }

    active_details = {}

    for symbol in active_symbols:

        detail = details.get(
            symbol,
            {}
        )

        detail = dict(detail)

        rvol_rows = detail.get(
            "rvol",
            []
        )

        detail["Current_RVOL"] = (
            rvol_rows[-1]["RVOL"]
            if rvol_rows
            else None
        )

        active_details[symbol] = detail

    return {
        "scanner":
            "Aurora NIFTY 200 Cup & Handle Scanner",

        "release":
            "Release 2 — Frozen Core Engine",

        "timezone":
            TIMEZONE,

        "market":
            "NSE",

        "universe":
            "NIFTY 200",

        "stocks_scanned":
            len(symbols),

        "successful_stocks":
            len(scanner_df),

        "scan_date":
            data_through,

        "data_through":
            data_through,

        "last_successful_refresh":
            refresh_time.isoformat(),

        "active_candidates":
            active_records,

        "details":
            active_details,

        "history_summary": {
            "ACTIVE":
                int(
                    (
                        history_df["Status"]
                        == "ACTIVE"
                    ).sum()
                ),

            "BREAKOUT":
                int(
                    (
                        history_df["Status"]
                        == "BREAKOUT"
                    ).sum()
                ),

            "EXPIRED":
                int(
                    (
                        history_df["Status"]
                        == "EXPIRED"
                    ).sum()
                )
        },

        "errors":
            errors,

        "stocks":
            scanner_df.to_dict(
                orient="records"
            )
    }


def main():

    symbols = load_nifty200_universe()

    (
        scanner_df,
        details,
        errors,
        successful_dates
    ) = scan_universe(
        symbols
    )

    if scanner_df.empty:
        raise RuntimeError(
            "No scanner results were generated. "
            "scanner.json will not be overwritten."
        )

    # Candidate lifecycle is based only on current actionable stages.
    actionable_stages = {
        "CUP COMPLETED",
        "HANDLE DEVELOPING",
        "NEAR BREAKOUT",
        "BREAKOUT"
    }

    actionable = scanner_df[
        scanner_df["Current_Stage"].isin(
            actionable_stages
        )
    ].copy()

    stage_map = dict(
        zip(
            actionable["Symbol"],
            actionable["Current_Stage"]
        )
    )

    if successful_dates:
        scan_date = max(
            successful_dates
        ).normalize()
    else:
        scan_date = pd.Timestamp(
            datetime.now(
                ZoneInfo(TIMEZONE)
            ).date()
        )

    history_df = update_candidate_history(
        stage_map,
        scan_date
    )

    output = build_scanner_json(
        scanner_df,
        details,
        errors,
        history_df,
        symbols,
        successful_dates
    )

    temp_file = SCANNER_JSON.with_suffix(
        ".json.tmp"
    )

    temp_file.write_text(
        json.dumps(
            output,
            indent=2,
            default=str
        ),
        encoding="utf-8"
    )

    temp_file.replace(
        SCANNER_JSON
    )

    print("=" * 70)
    print("AURORA CUP & HANDLE — PRODUCTION SCAN COMPLETE")
    print("=" * 70)
    print(f"Stocks scanned: {len(symbols)}")
    print(f"Successful:     {len(scanner_df)}")
    print(f"Errors:         {len(errors)}")
    print(
        "Active:         "
        f"{len(output['active_candidates'])}"
    )
    print(
        f"Data through:   {output['data_through']}"
    )
    print(
        "Refresh:        "
        f"{output['last_successful_refresh']}"
    )
    print(
        f"JSON:           {SCANNER_JSON}"
    )
    print(
        f"History:        {HISTORY_FILE}"
    )


if __name__ == "__main__":
    main()
