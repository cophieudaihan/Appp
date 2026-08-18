/* ==================================================
   ĐẦU TƯ CỔ TỨC
   APP.JS
   VERSION 5

   LOGIC:

   CP NGUỒN
       ↓
   CỔ TỨC NGUỒN
       ↓
   TIỀN MẶT
       ↓
   MUA CP ĐÍCH
       ↓
   CÁC LÔ CP RIÊNG
       ↓
   CỔ TỨC CP ĐÍCH

   QUAN TRỌNG:

   - CP nguồn và CP đích tách riêng
   - CP đích mua trong năm KHÔNG nhận cổ tức năm đó
   - CP đích mua theo lô 100
   - Tiền thừa giữ lại
   - Tiền mặt sinh lãi
   - Giá nguồn và giá đích độc lập
================================================== */

"use strict";


const STORAGE_KEY = "dautucotuc_v5";


const DEFAULT_DATA = {

    deposits: [],

    transactions: [],

    dividends: [],

    settings: {

        fee: 0.25,

        custody: 0.009,

        interest: 4,

        custodyEnabled: true

    }

};


let data = loadData();


/* ==================================================
   UTILITY
================================================== */

function clone(obj) {

    return JSON.parse(
        JSON.stringify(obj)
    );

}


function uid(prefix) {

    return (
        prefix +
        "_" +
        Date.now() +
        "_" +
        Math.random()
            .toString(36)
            .slice(2, 9)
    );

}


function today() {

    return new Date()
        .toISOString()
        .slice(0, 10);

}


function money(value) {

    return new Intl.NumberFormat(
        "vi-VN",
        {
            maximumFractionDigits: 2
        }
    ).format(
        Number(value) || 0
    ) + " đ";

}


function number(value, digits = 0) {

    return new Intl.NumberFormat(
        "vi-VN",
        {
            maximumFractionDigits: digits
        }
    ).format(
        Number(value) || 0
    );

}


function projectionMoney(value) {

    return new Intl.NumberFormat(
        "vi-VN",
        {
            maximumFractionDigits: 0
        }
    ).format(
        Math.round(
            Number(value) || 0
        )
    ) + " đ";

}


function projectionNumber(value) {

    return new Intl.NumberFormat(
        "vi-VN",
        {
            maximumFractionDigits: 0
        }
    ).format(
        Math.round(
            Number(value) || 0
        )
    );

}


function escapeHTML(value) {

    return String(value ?? "")
        .replace(
            /[&<>"']/g,
            c => ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            }[c])
        );

}


function daysBetween(start, end) {

    if (!start || !end)
        return 0;

    const a =
        new Date(
            start + "T00:00:00"
        );

    const b =
        new Date(
            end + "T00:00:00"
        );

    return Math.max(
        0,
        Math.floor(
            (b - a) / 86400000
        )
    );

}


function mergeData(base, source) {

    Object.keys(source || {})
        .forEach(key => {

            if (
                source[key] &&
                typeof source[key] === "object" &&
                !Array.isArray(source[key])
            ) {

                base[key] =
                    mergeData(
                        base[key] || {},
                        source[key]
                    );

            } else {

                base[key] =
                    source[key];

            }

        });

    return base;

}


/* ==================================================
   STORAGE
================================================== */

function loadData() {

    try {

        const saved =
            localStorage.getItem(
                STORAGE_KEY
            );

        if (!saved)
            return clone(DEFAULT_DATA);

        return mergeData(
            clone(DEFAULT_DATA),
            JSON.parse(saved)
        );

    } catch (error) {

        console.error(
            "Load error:",
            error
        );

        return clone(DEFAULT_DATA);

    }

}


function saveData() {

    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(data)
    );

    renderAll();

}


/* ==================================================
   TOAST
================================================== */

function toast(message) {

    const el =
        document.getElementById(
            "toast"
        );

    if (!el)
        return;

    el.textContent =
        message;

    el.classList.add("show");

    clearTimeout(
        window.__toastTimer
    );

    window.__toastTimer =
        setTimeout(
            () => {

                el.classList.remove(
                    "show"
                );

            },
            2500
        );

}


/* ==================================================
   FEE
================================================== */

function calculateTradingFee(
    amount
) {

    return (
        Number(amount) || 0
    ) *
    (
        Number(
            data.settings.fee
        ) || 0
    ) /
    100;

}


/* ==================================================
   DEPOSIT
================================================== */

function addDeposit(form) {

    const amount =
        Number(form.amount.value);

    if (amount <= 0) {

        throw new Error(
            "Số tiền nạp phải lớn hơn 0."
        );

    }

    data.deposits.push({

        id:
            uid("deposit"),

        date:
            form.date.value || today(),

        amount,

        note:
            form.note.value.trim()

    });

    saveData();

    form.reset();

    form.date.value =
        today();

    toast(
        "Đã nạp tiền."
    );

}


/* ==================================================
   SYMBOLS
================================================== */

function getSymbols() {

    const symbols =
        new Set();

    data.transactions.forEach(
        t => {

            if (t.symbol)
                symbols.add(
                    t.symbol
                );

        }
    );

    data.dividends.forEach(
        d => {

            if (d.symbol)
                symbols.add(
                    d.symbol
                );

        }
    );

    return Array.from(
        symbols
    ).sort();

}


/* ==================================================
   FIFO
================================================== */

function replaySymbol(symbol) {

    const events = [];


    data.transactions
        .filter(
            t =>
                t.symbol === symbol
        )
        .forEach(
            t => {

                events.push({

                    ...t,

                    eventType:
                        t.type

                });

            }
        );


    data.dividends
        .filter(
            d =>
                d.symbol === symbol &&
                d.type !== "cash" &&
                Number(
                    d.receivedQty
                ) > 0
        )
        .forEach(
            d => {

                events.push({

                    id:
                        d.id,

                    date:
                        d.payDate,

                    symbol,

                    eventType:
                        "stockDividend",

                    qty:
                        Number(
                            d.receivedQty
                        ),

                    price: 0

                });

            }
        );


    events.sort(
        (a, b) => {

            const result =
                String(a.date)
                    .localeCompare(
                        String(b.date)
                    );

            if (result !== 0)
                return result;

            const priority = {

                stockDividend: 0,

                buy: 1,

                sell: 2

            };

            return (
                (priority[a.eventType] ?? 1) -
                (priority[b.eventType] ?? 1)
            );

        }
    );


    const lots = [];


    for (const event of events) {

        if (
            event.eventType === "buy"
        ) {

            lots.push({

                id:
                    event.id,

                date:
                    event.date,

                qty:
                    Number(event.qty) || 0,

                price:
                    Number(event.price) || 0

            });

        }

        else if (
            event.eventType ===
            "stockDividend"
        ) {

            lots.push({

                id:
                    uid("divlot"),

                date:
                    event.date,

                qty:
                    Number(event.qty) || 0,

                price: 0

            });

        }

        else if (
            event.eventType === "sell"
        ) {

            let remaining =
                Number(event.qty) || 0;

            for (const lot of lots) {

                if (
                    remaining <= 0
                )
                    break;

                const take =
                    Math.min(
                        lot.qty,
                        remaining
                    );

                lot.qty -= take;

                remaining -= take;

            }

            if (
                remaining >
                0.000001
            ) {

                throw new Error(
                    `Không đủ ${symbol} để bán.`
                );

            }

        }

    }


    return lots.filter(
        lot =>
            lot.qty >
            0.000001
    );

}


function getHoldingLots(symbol) {

    return replaySymbol(symbol);

}


function getHoldingQuantity(symbol) {

    return getHoldingLots(symbol)
        .reduce(
            (sum, lot) =>
                sum + lot.qty,
            0
        );

}


/* ==================================================
   HOLDING AT RECORD DATE
================================================== */

function getHoldingAtDate(
    symbol,
    date
) {

    const events = [];


    data.transactions
        .filter(
            t =>
                t.symbol === symbol &&
                t.date <= date
        )
        .forEach(
            t => {

                events.push({

                    date:
                        t.date,

                    type:
                        t.type,

                    qty:
                        Number(t.qty) || 0

                });

            }
        );


    data.dividends
        .filter(
            d =>
                d.symbol === symbol &&
                d.type !== "cash" &&
                d.payDate <= date
        )
        .forEach(
            d => {

                events.push({

                    date:
                        d.payDate,

                    type:
                        "stockDividend",

                    qty:
                        Number(
                            d.receivedQty
                        ) || 0

                });

            }
        );


    events.sort(
        (a, b) =>
            String(a.date)
                .localeCompare(
                    String(b.date)
                )
    );


    const lots = [];


    for (const event of events) {

        if (
            event.type === "buy" ||
            event.type === "stockDividend"
        ) {

            lots.push({
                qty: event.qty
            });

        }

        else if (
            event.type === "sell"
        ) {

            let remaining =
                event.qty;

            for (const lot of lots) {

                if (
                    remaining <= 0
                )
                    break;

                const take =
                    Math.min(
                        lot.qty,
                        remaining
                    );

                lot.qty -= take;

                remaining -= take;

            }

        }

    }


    return lots.reduce(
        (sum, lot) =>
            sum + lot.qty,
        0
    );

}


/* ==================================================
   CASH
================================================== */

function calculateCash() {

    let cash = 0;


    data.deposits.forEach(
        d => {

            cash +=
                Number(d.amount) || 0;

        }
    );


    data.transactions.forEach(
        t => {

            if (
                t.type === "buy" &&
                t.source === "cash"
            ) {

                cash -=
                    Number(t.total) || 0;

            }

            if (
                t.type === "sell"
            ) {

                cash +=
                    Number(t.net) || 0;

            }

        }
    );


    return cash;

}


/* ==================================================
   DIVIDEND WALLET
================================================== */

function calculateDividendWallet() {

    let wallet = 0;


    data.dividends
        .filter(
            d =>
                d.type === "cash"
        )
        .forEach(
            d => {

                wallet +=
                    Number(
                        d.cashTotal
                    ) || 0;

            }
        );


    data.transactions
        .filter(
            t =>
                t.type === "buy" &&
                t.source === "dividend"
        )
        .forEach(
            t => {

                wallet -=
                    Number(t.total) || 0;

            }
        );


    return Math.max(
        0,
        wallet
    );

}


/* ==================================================
   CASH INTEREST
================================================== */

function calculateCashInterest() {

    const events = [];


    data.deposits.forEach(
        d => {

            events.push({

                date: d.date,

                delta:
                    Number(d.amount) || 0

            });

        }
    );


    data.transactions.forEach(
        t => {

            if (
                t.type === "buy" &&
                t.source === "cash"
            ) {

                events.push({

                    date: t.date,

                    delta:
                        -Number(t.total)

                });

            }

            if (
                t.type === "sell"
            ) {

                events.push({

                    date: t.date,

                    delta:
                        Number(t.net)

                });

            }

        }
    );


    if (!events.length)
        return 0;


    events.sort(
        (a, b) =>
            String(a.date)
                .localeCompare(
                    String(b.date)
                )
    );


    let balance = 0;

    let interest = 0;

    let previous =
        events[0].date;


    for (const event of events) {

        const days =
            daysBetween(
                previous,
                event.date
            );

        if (days > 0) {

            interest +=
                Math.max(
                    0,
                    balance
                ) *
                (
                    Number(
                        data.settings.interest
                    ) || 0
                ) /
                100 *
                days /
                365;

        }

        balance +=
            event.delta;

        previous =
            event.date;

    }


    const finalDays =
        daysBetween(
            previous,
            today()
        );


    interest +=
        Math.max(
            0,
            balance
        ) *
        (
            Number(
                data.settings.interest
            ) || 0
        ) /
        100 *
        finalDays /
        365;


    return Math.max(
        0,
        interest
    );

}


/* ==================================================
   CUSTODY
================================================== */

function calculateCustodyFee() {

    if (
        !data.settings.custodyEnabled
    )
        return 0;


    let total = 0;


    getSymbols().forEach(
        symbol => {

            getHoldingLots(symbol)
                .forEach(
                    lot => {

                        total +=
                            lot.qty *
                            Number(
                                data.settings.custody
                            ) *
                            daysBetween(
                                lot.date,
                                today()
                            );

                    }
                );

        }
    );


    return total;

}


/* ==================================================
   PORTFOLIO
================================================== */

function getPortfolio() {

    const result = [];


    getSymbols().forEach(
        symbol => {

            const lots =
                getHoldingLots(symbol);


            const quantity =
                lots.reduce(
                    (s, l) =>
                        s + l.qty,
                    0
                );


            const cost =
                lots.reduce(
                    (s, l) =>
                        s +
                        l.qty *
                        l.price,
                    0
                );


            const averageCost =
                quantity
                    ? cost / quantity
                    : 0;


            const cashDividend =
                data.dividends
                    .filter(
                        d =>
                            d.symbol === symbol &&
                            d.type === "cash"
                    )
                    .reduce(
                        (s, d) =>
                            s +
                            Number(
                                d.cashTotal
                            ),
                        0
                    );


            const stockDividend =
                data.dividends
                    .filter(
                        d =>
                            d.symbol === symbol &&
                            d.type !== "cash"
                    )
                    .reduce(
                        (s, d) =>
                            s +
                            Number(
                                d.receivedQty
                            ),
                        0
                    );


            result.push({

                symbol,

                lots,

                quantity,

                cost,

                averageCost,

                cashDividend,

                stockDividend

            });

        }
    );


    return result.filter(
        p =>
            p.quantity > 0 ||
            p.cashDividend > 0 ||
            p.stockDividend > 0
    );

}


/* ==================================================
   TRADE
================================================== */

function addTrade(form) {

    const type =
        form.type.value;

    const date =
        form.date.value;

    const symbol =
        form.symbol.value
            .trim()
            .toUpperCase();

    const qty =
        Number(form.qty.value);

    const price =
        Number(form.price.value);

    let source =
        form.source.value;


    if (
        !date ||
        !symbol ||
        qty <= 0 ||
        price < 0
    ) {

        throw new Error(
            "Kiểm tra thông tin giao dịch."
        );

    }


    const value =
        qty * price;

    const fee =
        calculateTradingFee(value);


    if (
        type === "buy"
    ) {

        const total =
            value + fee;


        if (
            source === "cash" &&
            calculateCash() < total
        ) {

            throw new Error(
                "Không đủ tiền mặt."
            );

        }


        if (
            source === "dividend" &&
            calculateDividendWallet() < total
        ) {

            throw new Error(
                "Không đủ ví cổ tức."
            );

        }


        data.transactions.push({

            id:
                uid("tx"),

            type: "buy",

            date,

            symbol,

            qty,

            price,

            fee,

            total,

            source,

            note:
                form.note.value.trim()

        });

    }

    else {

        const holding =
            getHoldingQuantity(symbol);


        if (
            holding < qty
        ) {

            throw new Error(
                `Không đủ ${symbol} để bán.`
            );

        }


        const net =
            value - fee;


        data.transactions.push({

            id:
                uid("tx"),

            type: "sell",

            date,

            symbol,

            qty,

            price,

            fee,

            total: value,

            net,

            source: "cash",

            note:
                form.note.value.trim()

        });

    }


    try {

        getSymbols()
            .forEach(
                s =>
                    getHoldingLots(s)
            );

    } catch (error) {

        data.transactions.pop();

        throw error;

    }


    saveData();

    resetTradeForm();

    toast(
        type === "buy"
            ? "Đã mua cổ phiếu."
            : "Đã bán cổ phiếu."
    );

}


/* ==================================================
   DIVIDEND
================================================== */

function addDividend(form) {

    const symbol =
        form.symbol.value
            .trim()
            .toUpperCase();

    const type =
        form.type.value;

    const recordDate =
        form.recordDate.value;

    const payDate =
        form.payDate.value;


    if (
        !symbol ||
        !recordDate ||
        !payDate
    ) {

        throw new Error(
            "Thiếu thông tin cổ tức."
        );

    }


    if (
        payDate < recordDate
    ) {

        throw new Error(
            "Ngày nhận không được trước ngày chốt."
        );

    }


    const eligible =
        Math.floor(
            getHoldingAtDate(
                symbol,
                recordDate
            )
        );


    if (
        eligible <= 0
    ) {

        throw new Error(
            `Không có ${symbol} đủ điều kiện nhận cổ tức.`
        );

    }


    const dividend = {

        id:
            uid("div"),

        symbol,

        type,

        recordDate,

        payDate,

        eligible,

        note:
            form.note.value.trim()

    };


    if (
        type === "cash"
    ) {

        const perShare =
            Number(
                form.cashPerShare.value
            );


        if (
            perShare <= 0
        ) {

            throw new Error(
                "Cổ tức / CP phải lớn hơn 0."
            );

        }


        dividend.cashPerShare =
            perShare;

        dividend.cashTotal =
            eligible *
            perShare;

    }

    else {

        const base =
            Number(
                form.ratioBase.value
            );

        const newShares =
            Number(
                form.ratioNew.value
            );


        if (
            base <= 0 ||
            newShares < 0
        ) {

            throw new Error(
                "Tỷ lệ không hợp lệ."
            );

        }


        dividend.ratioBase =
            base;

        dividend.ratioNew =
            newShares;

        dividend.receivedQty =
            Math.floor(
                eligible *
                newShares /
                base
            );

    }


    data.dividends.push(
        dividend
    );


    saveData();

    form.reset();

    form.recordDate.value =
        today();

    form.payDate.value =
        today();

    form.ratioBase.value =
        10;

    form.ratioNew.value =
        1;

    toggleDividendFields();

    toast(
        "Đã lưu cổ tức."
    );

}


/* ==================================================
   DELETE
================================================== */

function deleteTransaction(id) {

    if (
        !confirm(
            "Xóa giao dịch này?"
        )
    )
        return;


    const backup =
        clone(data);


    data.transactions =
        data.transactions.filter(
            t =>
                t.id !== id
        );


    try {

        getSymbols()
            .forEach(
                s =>
                    getHoldingLots(s)
            );

        saveData();

        toast(
            "Đã xóa giao dịch."
        );

    } catch (error) {

        data =
            backup;

        saveData();

        alert(
            error.message
        );

    }

}


function deleteDividend(id) {

    if (
        !confirm(
            "Xóa cổ tức này?"
        )
    )
        return;


    data.dividends =
        data.dividends.filter(
            d =>
                d.id !== id
        );


    saveData();

    toast(
        "Đã xóa cổ tức."
    );

}


/* ==================================================
   DASHBOARD
================================================== */

function renderDashboard() {

    const portfolio =
        getPortfolio();


    const deposits =
        data.deposits.reduce(
            (s, d) =>
                s +
                Number(d.amount),
            0
        );


    const cash =
        calculateCash();

    const wallet =
        calculateDividendWallet();


    const invested =
        portfolio.reduce(
            (s, p) =>
                s + p.cost,
            0
        );


    const dividend =
        data.dividends
            .filter(
                d =>
                    d.type === "cash"
            )
            .reduce(
                (s, d) =>
                    s +
                    Number(
                        d.cashTotal
                    ),
                0
            );


    const cards = [

        ["Tổng tiền nạp", money(deposits)],

        ["Tiền mặt", money(cash)],

        ["Ví cổ tức", money(wallet)],

        ["Tiền khả dụng",
            money(cash + wallet)
        ],

        ["Vốn cổ phiếu", money(invested)],

        ["Cổ tức tiền mặt",
            money(dividend)
        ],

        ["Lãi tiền mặt",
            money(
                calculateCashInterest()
            )
        ],

        ["Phí lưu ký",
            money(
                calculateCustodyFee()
            )
        ]

    ];


    const element =
        document.getElementById(
            "dashboardCards"
        );


    if (!element)
        return;


    element.innerHTML =
        cards.map(
            c => `

                <div class="stat">

                    <div class="label">
                        ${c[0]}
                    </div>

                    <div class="value">
                        ${c[1]}
                    </div>

                </div>

            `
        ).join("");

}


/* ==================================================
   PORTFOLIO
================================================== */

function renderPortfolio() {

    const element =
        document.getElementById(
            "portfolio"
        );


    if (!element)
        return;


    const portfolio =
        getPortfolio();


    if (!portfolio.length) {

        element.innerHTML = `

            <div class="card">

                <div class="hint">
                    Chưa có cổ phiếu.
                </div>

            </div>

        `;

        return;

    }


    element.innerHTML =
        portfolio.map(
            p => `

                <div class="card stock-card">

                    <h3>
                        ${escapeHTML(p.symbol)}
                    </h3>

                    <div class="stock-meta">

                        <div class="kv">
                            <span>Số CP</span>
                            <b>
                                ${number(p.quantity)}
                            </b>
                        </div>

                        <div class="kv">
                            <span>Giá vốn BQ</span>
                            <b>
                                ${money(p.averageCost)}
                            </b>
                        </div>

                        <div class="kv">
                            <span>Giá vốn còn lại</span>
                            <b>
                                ${money(p.cost)}
                            </b>
                        </div>

                        <div class="kv">
                            <span>Số lô</span>
                            <b>
                                ${p.lots.length}
                            </b>
                        </div>

                        <div class="kv">
                            <span>Cổ tức tiền</span>
                            <b>
                                ${money(p.cashDividend)}
                            </b>
                        </div>

                        <div class="kv">
                            <span>CP từ quyền</span>
                            <b>
                                ${number(p.stockDividend)}
                            </b>
                        </div>

                    </div>

                </div>

            `
        ).join("");

}


/* ==================================================
   TRANSACTION TABLE
================================================== */

function transactionTable(
    transactions
) {

    if (!transactions.length) {

        return `

            <div class="card">

                <div class="hint">
                    Chưa có dữ liệu.
                </div>

            </div>

        `;

    }


    const sorted =
        transactions
            .slice()
            .sort(
                (a, b) =>
                    String(b.date)
                        .localeCompare(
                            String(a.date)
                        )
            );


    return `

        <div class="table-scroll">

            <table>

                <thead>

                    <tr>
                        <th>Ngày</th>
                        <th>Loại</th>
                        <th>Mã</th>
                        <th>SL</th>
                        <th>Giá</th>
                        <th>Phí</th>
                        <th>Tổng</th>
                        <th>Nguồn</th>
                        <th></th>
                    </tr>

                </thead>

                <tbody>

                    ${sorted.map(
                        t => `

                            <tr>

                                <td>
                                    ${escapeHTML(t.date)}
                                </td>

                                <td class="${
                                    t.type === "sell"
                                        ? "red"
                                        : "green"
                                }">

                                    ${
                                        t.type === "buy"
                                            ? "MUA"
                                            : "BÁN"
                                    }

                                </td>

                                <td>
                                    ${escapeHTML(t.symbol)}
                                </td>

                                <td>
                                    ${number(t.qty)}
                                </td>

                                <td>
                                    ${money(t.price)}
                                </td>

                                <td>
                                    ${money(t.fee)}
                                </td>

                                <td>
                                    ${money(t.total)}
                                </td>

                                <td>

                                    ${
                                        t.type === "buy"
                                            ? (
                                                t.source === "dividend"
                                                    ? "Ví cổ tức"
                                                    : "Tiền mặt"
                                            )
                                            : "Tiền mặt"
                                    }

                                </td>

                                <td>

                                    <button
                                        class="action"
                                        onclick="deleteTransaction('${t.id}')"
                                    >
                                        Xóa
                                    </button>

                                </td>

                            </tr>

                        `
                    ).join("")}

                </tbody>

            </table>

        </div>

    `;

}


/* ==================================================
   TRANSACTIONS
================================================== */

function renderTransactions() {

    const all =
        document.getElementById(
            "transactions"
        );


    const recent =
        document.getElementById(
            "recent"
        );


    if (all) {

        all.innerHTML =
            transactionTable(
                data.transactions
            );

    }


    if (recent) {

        recent.innerHTML =
            transactionTable(
                data.transactions
                    .slice()
                    .sort(
                        (a, b) =>
                            String(b.date)
                                .localeCompare(
                                    String(a.date)
                                )
                    )
                    .slice(0, 8)
            );

    }

}


/* ==================================================
   DIVIDENDS
================================================== */

function renderDividends() {

    const element =
        document.getElementById(
            "dividends"
        );


    if (!element)
        return;


    const dividends =
        data.dividends
            .slice()
            .sort(
                (a, b) =>
                    String(b.payDate)
                        .localeCompare(
                            String(a.payDate)
                        )
            );


    if (!dividends.length) {

        element.innerHTML = `

            <div class="card">

                <div class="hint">
                    Chưa có lịch sử cổ tức.
                </div>

            </div>

        `;

        return;

    }


    element.innerHTML = `

        <div class="table-scroll">

            <table>

                <thead>

                    <tr>
                        <th>Ngày chốt</th>
                        <th>Ngày nhận</th>
                        <th>Mã</th>
                        <th>Loại</th>
                        <th>CP đủ ĐK</th>
                        <th>Kết quả</th>
                        <th></th>
                    </tr>

                </thead>

                <tbody>

                    ${dividends.map(
                        d => {

                            const result =
                                d.type === "cash"

                                    ? money(
                                        d.cashTotal
                                    )

                                    :

                                    `${number(
                                        d.receivedQty
                                    )} CP (${d.ratioBase}:${d.ratioNew})`;


                            return `

                                <tr>

                                    <td>
                                        ${escapeHTML(
                                            d.recordDate
                                        )}
                                    </td>

                                    <td>
                                        ${escapeHTML(
                                            d.payDate
                                        )}
                                    </td>

                                    <td>
                                        ${escapeHTML(
                                            d.symbol
                                        )}
                                    </td>

                                    <td>

                                        ${
                                            d.type === "cash"
                                                ? "Tiền mặt"
                                                : d.type === "stock"
                                                    ? "Cổ tức CP"
                                                    : "CP thưởng"
                                        }

                                    </td>

                                    <td>
                                        ${number(
                                            d.eligible
                                        )}
                                    </td>

                                    <td>
                                        ${result}
                                    </td>

                                    <td>

                                        <button
                                            class="action"
                                            onclick="deleteDividend('${d.id}')"
                                        >
                                            Xóa
                                        </button>

                                    </td>

                                </tr>

                            `;

                        }
                    ).join("")}

                </tbody>

            </table>

        </div>

    `;

}


/* ==================================================
   SETTINGS
================================================== */

function renderSettings() {

    const form =
        document.getElementById(
            "settingsForm"
        );


    if (!form)
        return;


    form.fee.value =
        data.settings.fee;

    form.custody.value =
        data.settings.custody;

    form.interest.value =
        data.settings.interest;

    form.custodyEnabled.checked =
        !!data.settings.custodyEnabled;

}


/* ==================================================
   DIVIDEND UI
================================================== */

function toggleDividendFields() {

    const type =
        document.querySelector(
            '#dividendForm [name="type"]'
        )?.value;


    const cash =
        document.getElementById(
            "cashDividendFields"
        );


    const stock =
        document.getElementById(
            "stockDividendFields"
        );


    if (!cash || !stock)
        return;


    if (type === "cash") {

        cash.style.display =
            "block";

        stock.style.display =
            "none";

    } else {

        cash.style.display =
            "none";

        stock.style.display =
            "block";

    }

}


/* ==================================================
   RESET TRADE
================================================== */

function resetTradeForm() {

    const form =
        document.getElementById(
            "tradeForm"
        );


    if (!form)
        return;


    form.reset();

    form.date.value =
        today();

    form.type.value =
        "buy";

    form.source.value =
        "cash";

    form.source.disabled =
        false;

}


/* ==================================================
   BACKUP
================================================== */

function backupJSON() {

    const backup = {

        version: 5,

        exportedAt:
            new Date()
                .toISOString(),

        data

    };


    const blob =
        new Blob(
            [
                JSON.stringify(
                    backup,
                    null,
                    2
                )
            ],
            {
                type:
                    "application/json"
            }
        );


    const url =
        URL.createObjectURL(blob);


    const link =
        document.createElement("a");


    link.href =
        url;

    link.download =
        `dautucotuc_backup_${today()}.json`;


    document.body.appendChild(link);

    link.click();

    link.remove();

    URL.revokeObjectURL(url);

    toast(
        "Đã xuất backup."
    );

}


/* ==================================================
   RESTORE
================================================== */

async function restoreJSON(file) {

    try {

        const text =
            await file.text();

        const backup =
            JSON.parse(text);

        const restored =
            backup.data ||
            backup;


        if (
            !Array.isArray(
                restored.deposits
            ) ||
            !Array.isArray(
                restored.transactions
            ) ||
            !Array.isArray(
                restored.dividends
            )
        ) {

            throw new Error(
                "File backup không hợp lệ."
            );

        }


        data =
            mergeData(
                clone(DEFAULT_DATA),
                restored
            );


        getSymbols()
            .forEach(
                s =>
                    getHoldingLots(s)
            );


        saveData();

        toast(
            "Đã khôi phục backup."
        );

    } catch (error) {

        alert(
            "Không thể khôi phục: " +
            error.message
        );

    }

}


/* ==================================================
   RESET
================================================== */

function resetAll() {

    if (
        !confirm(
            "Xóa TOÀN BỘ dữ liệu?"
        )
    )
        return;


    data =
        clone(DEFAULT_DATA);


    saveData();

    toast(
        "Đã xóa toàn bộ dữ liệu."
    );

}


/* ==================================================
   PROJECTION
================================================== */

function calculateYearInterest(
    openingCash,
    monthlyContribution,
    annualRate
) {

    const rate =
        Math.max(
            0,
            Number(annualRate) || 0
        ) / 100;


    const openingInterest =
        Math.max(
            0,
            openingCash
        ) *
        rate;


    const monthly =
        Math.max(
            0,
            Number(
                monthlyContribution
            ) || 0
        );


    let contributionInterest = 0;


    for (
        let month = 1;
        month <= 12;
        month++
    ) {

        const monthsRemaining =
            12 - month;

        contributionInterest +=
            monthly *
            rate *
            monthsRemaining /
            12;

    }


    return (
        openingInterest +
        contributionInterest
    );

}


/*
====================================================
DỰ PHÓNG

Mỗi lot CP đích:

{
    yearBought,
    shares,
    price
}

Chỉ:

yearBought < currentYear

mới nhận cổ tức.

CP mua trong năm:

KHÔNG nhận cổ tức năm đó.
====================================================
*/

function calculateProjectionScenario(
    options
) {

    const years =
        Math.max(
            1,
            Math.floor(
                Number(options.years) || 1
            )
        );


    const contributionYears =
        Math.max(
            0,
            Math.min(
                years,
                Math.floor(
                    Number(
                        options.contributionYears
                    ) || 0
                )
            )
        );


    const reinvestYears =
        Math.max(
            0,
            Math.min(
                years,
                Math.floor(
                    Number(
                        options.reinvestYears
                    ) || 0
                )
            )
        );


    const sourceShares =
        Math.max(
            0,
            Number(options.sourceShares) || 0
        );


    const sourcePrice =
        Math.max(
            0,
            Number(options.sourcePrice) || 0
        );


    const targetPrice =
        Math.max(
            0,
            Number(options.targetPrice) || 0
        );


    const sourceDividend =
        Math.max(
            0,
            Number(options.sourceDividend) || 0
        );


    const targetDividend =
        Math.max(
            0,
            Number(options.targetDividend) || 0
        );


    const monthlyMoney =
        Math.max(
            0,
            Number(options.monthlyMoney) || 0
        );


    const reinvestPercent =
        Math.max(
            0,
            Math.min(
                100,
                Number(
                    options.reinvestPercent
                ) || 0
            )
        );


    const cashInterest =
        Math.max(
            0,
            Number(options.cashInterest) || 0
        );


    const sourcePriceGrowth =
        Number(
            options.sourcePriceGrowth
        ) || 0;


    const targetPriceGrowth =
        Number(
            options.targetPriceGrowth
        ) || 0;


    const dividendGrowth =
        Number(
            options.dividendGrowth
        ) || 0;


    const targetDividendGrowth =
        Number(
            options.targetDividendGrowth
        ) || 0;


    let cash =
        Math.max(
            0,
            Number(options.initialCash) || 0
        );


    const lots = [];


    let totalSourceDividend = 0;

    let totalTargetDividend = 0;

    let totalDividend = 0;

    let totalContribution = 0;

    let totalReinvestMoney = 0;

    let totalNewShares = 0;

    let totalInterest = 0;


    const rows = [];


    for (
        let year = 1;
        year <= years;
        year++
    ) {

        const sourceCurrentPrice =
            sourcePrice *
            Math.pow(
                1 +
                sourcePriceGrowth / 100,
                year - 1
            );


        const targetCurrentPrice =
            targetPrice *
            Math.pow(
                1 +
                targetPriceGrowth / 100,
                year - 1
            );


        const sourceCurrentDividend =
            sourceDividend *
            Math.pow(
                1 +
                dividendGrowth / 100,
                year - 1
            );


        const targetCurrentDividend =
            targetDividend *
            Math.pow(
                1 +
                targetDividendGrowth / 100,
                year - 1
            );


        /* ------------------------------------------
           CỔ TỨC CP NGUỒN
        ------------------------------------------ */

        const yearlySourceDividend =
            sourceShares *
            sourceCurrentDividend;


        /* ------------------------------------------
           CỔ TỨC CP ĐÍCH

           CHỈ LOT CŨ
        ------------------------------------------ */

        let targetSharesStart = 0;

        let yearlyTargetDividend = 0;


        lots.forEach(
            lot => {

                if (
                    lot.yearBought <
                    year
                ) {

                    targetSharesStart +=
                        lot.shares;

                    yearlyTargetDividend +=
                        lot.shares *
                        targetCurrentDividend;

                }

            }
        );


        const yearlyDividend =
            yearlySourceDividend +
            yearlyTargetDividend;


        /* ------------------------------------------
           NẠP TIỀN
        ------------------------------------------ */

        const contribution =
            year <= contributionYears
                ? monthlyMoney * 12
                : 0;


        /* ------------------------------------------
           LÃI TIỀN MẶT
        ------------------------------------------ */

        const interest =
            calculateYearInterest(
                cash,
                year <= contributionYears
                    ? monthlyMoney
                    : 0,
                cashInterest
            );


        cash += interest;

        totalInterest += interest;


        /* ------------------------------------------
           NẠP TIỀN
        ------------------------------------------ */

        cash += contribution;

        totalContribution +=
            contribution;


        /* ------------------------------------------
           CỔ TỨC VỀ TIỀN MẶT
        ------------------------------------------ */

        cash += yearlyDividend;


        totalSourceDividend +=
            yearlySourceDividend;

        totalTargetDividend +=
            yearlyTargetDividend;

        totalDividend +=
            yearlyDividend;


        /* ------------------------------------------
           MUA CP ĐÍCH

           CHỈ MUA LÔ 100
        ------------------------------------------ */

        let purchaseMoney = 0;

        let buyShares = 0;


        if (
            year <= reinvestYears &&
            targetCurrentPrice > 0
        ) {

            const available =
                Math.max(
                    0,
                    cash *
                    reinvestPercent /
                    100
                );


            const possible =
                Math.floor(
                    available /
                    targetCurrentPrice
                );


            buyShares =
                Math.floor(
                    possible / 100
                ) * 100;


            purchaseMoney =
                buyShares *
                targetCurrentPrice;


            cash -=
                purchaseMoney;


            if (
                buyShares > 0
            ) {

                lots.push({

                    yearBought:
                        year,

                    shares:
                        buyShares,

                    price:
                        targetCurrentPrice

                });

            }


            totalNewShares +=
                buyShares;

            totalReinvestMoney +=
                purchaseMoney;

        }


        /* ------------------------------------------
           CUỐI NĂM
        ------------------------------------------ */

        const targetSharesEnd =
            lots.reduce(
                (sum, lot) =>
                    sum + lot.shares,
                0
            );


        const sourceValue =
            sourceShares *
            sourceCurrentPrice;


        const targetValue =
            targetSharesEnd *
            targetCurrentPrice;


        const stockValue =
            sourceValue +
            targetValue;


        const totalValue =
            stockValue +
            cash;


        rows.push({

            year,

            sourceShares,

            sourceDividend:
                yearlySourceDividend,

            targetSharesStart,

            targetDividend:
                yearlyTargetDividend,

            yearlyDividend,

            contribution,

            interest,

            sourcePrice:
                sourceCurrentPrice,

            targetPrice:
                targetCurrentPrice,

            purchaseMoney,

            buyShares,

            targetSharesEnd,

            totalSharesEnd:
                sourceShares +
                targetSharesEnd,

            cash,

            sourceValue,

            targetValue,

            stockValue,

            totalValue

        });

    }


    const final =
        rows[rows.length - 1];


    return {

        rows,

        finalSourceShares:
            sourceShares,

        finalTargetShares:
            final
                ? final.targetSharesEnd
                : 0,

        finalShares:
            final
                ? final.totalSharesEnd
                : sourceShares,

        totalSourceDividend,

        totalTargetDividend,

        totalDividend,

        totalContribution,

        totalReinvestMoney,

        totalNewShares,

        totalInterest,

        finalCash:
            final
                ? final.cash
                : cash,

        finalSourceValue:
            final
                ? final.sourceValue
                : 0,

        finalTargetValue:
            final
                ? final.targetValue
                : 0,

        finalStockValue:
            final
                ? final.stockValue
                : 0,

        finalTotalValue:
            final
                ? final.totalValue
                : cash

    };

}


/* ==================================================
   PROJECTION INPUTS
================================================== */

function getProjectionInputs() {

    const value = id =>
        document.getElementById(id);


    return {

        source:
            value(
                "projectionSource"
            ).value
                .trim()
                .toUpperCase(),

        target:
            value(
                "projectionTarget"
            ).value
                .trim()
                .toUpperCase(),

        shares:
            Number(
                value(
                    "projectionShares"
                ).value
            ) || 0,

        sourcePrice:
            Number(
                value(
                    "projectionSourcePrice"
                ).value
            ) || 0,

        targetPrice:
            Number(
                value(
                    "projectionTargetPrice"
                ).value
            ) || 0,

        monthlyMoney:
            Number(
                value(
                    "projectionMonthlyMoney"
                ).value
            ) || 0,

        reinvestPercent:
            Number(
                value(
                    "projectionReinvest"
                ).value
            ) || 0,

        cashInterest:
            Number(
                value(
                    "projectionCashInterest"
                ).value
            ) || 0,

        years:
            Number(
                value(
                    "projectionYears"
                ).value
            ) || 1,

        contributionYears:
            Number(
                value(
                    "projectionContributionYears"
                ).value
            ) || 0,

        reinvestYears:
            Number(
                value(
                    "projectionReinvestYears"
                ).value
            ) || 0,

        sourcePriceGrowth:
            Number(
                value(
                    "projectionSourcePriceGrowth"
                ).value
            ) || 0,

        targetPriceGrowth:
            Number(
                value(
                    "projectionTargetPriceGrowth"
                ).value
            ) || 0,

        sourceWeak:
            Number(
                value(
                    "sourceScenarioWeak"
                ).value
            ) || 0,

        sourceMedium:
            Number(
                value(
                    "sourceScenarioMedium"
                ).value
            ) || 0,

        sourceHigh:
            Number(
                value(
                    "sourceScenarioHigh"
                ).value
            ) || 0,

        targetWeak:
            Number(
                value(
                    "targetScenarioWeak"
                ).value
            ) || 0,

        targetMedium:
            Number(
                value(
                    "targetScenarioMedium"
                ).value
            ) || 0,

        targetHigh:
            Number(
                value(
                    "targetScenarioHigh"
                ).value
            ) || 0

    };

}


/* ==================================================
   RUN PROJECTION
================================================== */

function runDividendProjection() {

    const input =
        getProjectionInputs();


    if (!input.source) {

        alert(
            "Hãy nhập CP nguồn."
        );

        return;

    }


    if (!input.target) {

        alert(
            "Hãy nhập CP tái đầu tư."
        );

        return;

    }


    if (
        input.shares <= 0
    ) {

        alert(
            "CP nguồn ban đầu phải > 0."
        );

        return;

    }


    if (
        input.sourcePrice <= 0 ||
        input.targetPrice <= 0
    ) {

        alert(
            "Giá cổ phiếu phải > 0."
        );

        return;

    }


    const base = {

        sourceShares:
            input.shares,

        sourcePrice:
            input.sourcePrice,

        targetPrice:
            input.targetPrice,

        sourcePriceGrowth:
            input.sourcePriceGrowth,

        targetPriceGrowth:
            input.targetPriceGrowth,

        monthlyMoney:
            input.monthlyMoney,

        reinvestPercent:
            input.reinvestPercent,

        cashInterest:
            input.cashInterest,

        years:
            input.years,

        contributionYears:
            input.contributionYears,

        reinvestYears:
            input.reinvestYears,

        dividendGrowth:
            3,

        targetDividendGrowth:
            3,

        initialCash:
            0

    };


    const weak =
        calculateProjectionScenario({

            ...base,

            sourceDividend:
                input.sourceWeak,

            targetDividend:
                input.targetWeak

        });


    const medium =
        calculateProjectionScenario({

            ...base,

            sourceDividend:
                input.sourceMedium,

            targetDividend:
                input.targetMedium

        });


    const high =
        calculateProjectionScenario({

            ...base,

            sourceDividend:
                input.sourceHigh,

            targetDividend:
                input.targetHigh

        });


    renderProjectionSummary(
        medium,
        input
    );


    renderScenarioSummary(
        weak,
        medium,
        high,
        input
    );


    renderProjectionTable(
        medium,
        input
    );

}


/* ==================================================
   PROJECTION SUMMARY
================================================== */

function renderProjectionSummary(
    result,
    input
) {

    const element =
        document.getElementById(
            "projectionSummary"
        );


    if (!element)
        return;


    const cards = [

        [
            `CP nguồn ${input.source}`,
            projectionNumber(
                result.finalSourceShares
            )
        ],

        [
            `CP ${input.target}`,
            projectionNumber(
                result.finalTargetShares
            )
        ],

        [
            "Tổng CP",
            projectionNumber(
                result.finalShares
            )
        ],

        [
            `Cổ tức ${input.source}`,
            projectionMoney(
                result.totalSourceDividend
            )
        ],

        [
            `Cổ tức ${input.target}`,
            projectionMoney(
                result.totalTargetDividend
            )
        ],

        [
            "Tổng cổ tức",
            projectionMoney(
                result.totalDividend
            )
        ],

        [
            "Tiền nạp",
            projectionMoney(
                result.totalContribution
            )
        ],

        [
            `Tiền mua ${input.target}`,
            projectionMoney(
                result.totalReinvestMoney
            )
        ],

        [
            `${input.target} mua thêm`,
            projectionNumber(
                result.totalNewShares
            )
        ],

        [
            "Lãi tiền mặt",
            projectionMoney(
                result.totalInterest
            )
        ],

        [
            "Tiền dư cuối kỳ",
            projectionMoney(
                result.finalCash
            )
        ],

        [
            `Giá trị ${input.source}`,
            projectionMoney(
                result.finalSourceValue
            )
        ],

        [
            `Giá trị ${input.target}`,
            projectionMoney(
                result.finalTargetValue
            )
        ],

        [
            "Tổng tài sản",
            projectionMoney(
                result.finalTotalValue
            )
        ]

    ];


    element.innerHTML =
        cards.map(
            c => `

                <div class="projection-stat">

                    <span>
                        ${escapeHTML(c[0])}
                    </span>

                    <strong>
                        ${c[1]}
                    </strong>

                </div>

            `
        ).join("");

}


/* ==================================================
   SCENARIO
================================================== */

function scenarioCard(
    title,
    result,
    input
) {

    return `

        <div class="scenario-result">

            <h3>
                ${title}
            </h3>

            <p>
                CP nguồn:
                <b>
                    ${projectionNumber(
                        result.finalSourceShares
                    )}
                </b>
            </p>

            <p>
                ${escapeHTML(input.target)}:
                <b>
                    ${projectionNumber(
                        result.finalTargetShares
                    )}
                </b>
            </p>

            <p>
                Cổ tức nguồn:
                <b>
                    ${projectionMoney(
                        result.totalSourceDividend
                    )}
                </b>
            </p>

            <p>
                Cổ tức đích:
                <b>
                    ${projectionMoney(
                        result.totalTargetDividend
                    )}
                </b>
            </p>

            <p>
                Tổng cổ tức:
                <b>
                    ${projectionMoney(
                        result.totalDividend
                    )}
                </b>
            </p>

            <p>
                Tiền mua ${escapeHTML(input.target)}:
                <b>
                    ${projectionMoney(
                        result.totalReinvestMoney
                    )}
                </b>
            </p>

            <p>
                CP mua thêm:
                <b>
                    ${projectionNumber(
                        result.totalNewShares
                    )}
                </b>
            </p>

            <p>
                Tiền dư:
                <b>
                    ${projectionMoney(
                        result.finalCash
                    )}
                </b>
            </p>

            <p>
                Giá trị cổ phiếu:
                <b>
                    ${projectionMoney(
                        result.finalStockValue
                    )}
                </b>
            </p>

            <p>
                <strong>
                    Tổng tài sản:
                    ${projectionMoney(
                        result.finalTotalValue
                    )}
                </strong>
            </p>

        </div>

    `;

}


function renderScenarioSummary(
    weak,
    medium,
    high,
    input
) {

    const element =
        document.getElementById(
            "projectionScenarioSummary"
        );


    if (!element)
        return;


    element.innerHTML =

        scenarioCard(
            "🔴 Cổ tức yếu",
            weak,
            input
        )

        +

        scenarioCard(
            "🟡 Cổ tức trung bình",
            medium,
            input
        )

        +

        scenarioCard(
            "🟢 Cổ tức cao",
            high,
            input
        );

}


/* ==================================================
   PROJECTION TABLE
================================================== */

function renderProjectionTable(
    result,
    input
) {

    const element =
        document.getElementById(
            "projectionTable"
        );


    if (!element)
        return;


    element.innerHTML = `

        <table>

            <thead>

                <tr>

                    <th>Năm</th>

                    <th>
                        CP ${escapeHTML(input.source)}
                    </th>

                    <th>
                        Cổ tức nguồn
                    </th>

                    <th>
                        ${escapeHTML(input.target)}
                        đầu năm
                    </th>

                    <th>
                        Cổ tức đích
                    </th>

                    <th>
                        Tổng cổ tức
                    </th>

                    <th>
                        Tiền nạp
                    </th>

                    <th>
                        Lãi tiền
                    </th>

                    <th>
                        Giá nguồn
                    </th>

                    <th>
                        Giá đích
                    </th>

                    <th>
                        Tiền mua đích
                    </th>

                    <th>
                        CP mua
                    </th>

                    <th>
                        CP đích cuối năm
                    </th>

                    <th>
                        Tổng CP
                    </th>

                    <th>
                        Tiền dư
                    </th>

                    <th>
                        Giá trị nguồn
                    </th>

                    <th>
                        Giá trị đích
                    </th>

                    <th>
                        Tổng tài sản
                    </th>

                </tr>

            </thead>


            <tbody>

                ${result.rows.map(
                    row => `

                        <tr>

                            <td>
                                ${row.year}
                            </td>

                            <td>
                                ${projectionNumber(
                                    row.sourceShares
                                )}
                            </td>

                            <td>
                                ${projectionMoney(
                                    row.sourceDividend
                                )}
                            </td>

                            <td>
                                ${projectionNumber(
                                    row.targetSharesStart
                                )}
                            </td>

                            <td>
                                ${projectionMoney(
                                    row.targetDividend
                                )}
                            </td>

                            <td>
                                ${projectionMoney(
                                    row.yearlyDividend
                                )}
                            </td>

                            <td>
                                ${projectionMoney(
                                    row.contribution
                                )}
                            </td>

                            <td>
                                ${projectionMoney(
                                    row.interest
                                )}
                            </td>

                            <td>
                                ${projectionMoney(
                                    row.sourcePrice
                                )}
                            </td>

                            <td>
                                ${projectionMoney(
                                    row.targetPrice
                                )}
                            </td>

                            <td>
                                ${projectionMoney(
                                    row.purchaseMoney
                                )}
                            </td>

                            <td class="projection-buy">

                                ${
                                    row.buyShares
                                        ? "+" +
                                          projectionNumber(
                                              row.buyShares
                                          )
                                        : "0"
                                }

                            </td>

                            <td>
                                ${projectionNumber(
                                    row.targetSharesEnd
                                )}
                            </td>

                            <td>
                                ${projectionNumber(
                                    row.totalSharesEnd
                                )}
                            </td>

                            <td class="projection-cash">
                                ${projectionMoney(
                                    row.cash
                                )}
                            </td>

                            <td>
                                ${projectionMoney(
                                    row.sourceValue
                                )}
                            </td>

                            <td>
                                ${projectionMoney(
                                    row.targetValue
                                )}
                            </td>

                            <td>
                                ${projectionMoney(
                                    row.totalValue
                                )}
                            </td>

                        </tr>

                    `
                ).join("")}

            </tbody>

        </table>


        <div class="projection-note">

            <strong>
                Logic dự phóng
            </strong>

            <br><br>

            <b>
                ${escapeHTML(input.source)}
            </b>
            là CP nguồn.

            CP nguồn luôn được giữ riêng,
            không cộng vào số CP ${escapeHTML(input.target)}.

            <br><br>

            <b>
                Cổ tức nguồn
            </b>

            =
            CP nguồn × cổ tức/CP nguồn.

            <br><br>

            <b>
                Cổ tức ${escapeHTML(input.target)}
            </b>

            chỉ tính trên các lô
            ${escapeHTML(input.target)}
            đã mua từ năm trước.

            <br>

            CP ${escapeHTML(input.target)}
            vừa mua trong năm
            không nhận cổ tức của năm đó.

            <br><br>

            <b>
                Mua theo lô 100 CP.
            </b>

            Tiền không đủ một lô
            được giữ lại làm tiền mặt.

            <br><br>

            Tiền mặt tiếp tục sinh lãi
            theo mức đã nhập.

            <br><br>

            Giá ${escapeHTML(input.source)}
            và giá ${escapeHTML(input.target)}
            được tăng trưởng độc lập.

        </div>

    `;

}


/* ==================================================
   TABS
================================================== */

function initTabs() {

    document
        .querySelectorAll(".tab")
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        document
                            .querySelectorAll(
                                ".tab"
                            )
                            .forEach(
                                b =>
                                    b.classList
                                        .remove(
                                            "active"
                                        )
                            );


                        document
                            .querySelectorAll(
                                ".tab-panel"
                            )
                            .forEach(
                                p =>
                                    p.classList
                                        .remove(
                                            "active"
                                        )
                            );


                        button.classList.add(
                            "active"
                        );


                        const panel =
                            document.getElementById(
                                button.dataset.tab
                            );


                        if (panel) {

                            panel.classList.add(
                                "active"
                            );

                        }

                    }
                );

            }
        );

}


/* ==================================================
   EVENTS
================================================== */

function initEvents() {

    const depositForm =
        document.getElementById(
            "depositForm"
        );


    /*
       Nếu sau này thêm form nạp tiền
       vào HTML thì JS vẫn hoạt động.
    */

    if (depositForm) {

        depositForm.addEventListener(
            "submit",
            e => {

                e.preventDefault();

                try {

                    addDeposit(
                        e.target
                    );

                } catch (error) {

                    alert(
                        error.message
                    );

                }

            }
        );

    }


    const tradeForm =
        document.getElementById(
            "tradeForm"
        );


    if (tradeForm) {

        tradeForm.addEventListener(
            "submit",
            e => {

                e.preventDefault();

                try {

                    addTrade(
                        e.target
                    );

                } catch (error) {

                    alert(
                        error.message
                    );

                }

            }
        );


        const type =
            tradeForm.querySelector(
                '[name="type"]'
            );


        const source =
            tradeForm.querySelector(
                '[name="source"]'
            );


        type.addEventListener(
            "change",
            () => {

                if (
                    type.value === "sell"
                ) {

                    source.value =
                        "cash";

                    source.disabled =
                        true;

                } else {

                    source.disabled =
                        false;

                }

            }
        );

    }


    const dividendForm =
        document.getElementById(
            "dividendForm"
        );


    if (dividendForm) {

        dividendForm.addEventListener(
            "submit",
            e => {

                e.preventDefault();

                try {

                    addDividend(
                        e.target
                    );

                } catch (error) {

                    alert(
                        error.message
                    );

                }

            }
        );


        dividendForm
            .querySelector(
                '[name="type"]'
            )
            .addEventListener(
                "change",
                toggleDividendFields
            );

    }


    const settingsForm =
        document.getElementById(
            "settingsForm"
        );


    if (settingsForm) {

        settingsForm.addEventListener(
            "submit",
            e => {

                e.preventDefault();

                const form =
                    e.target;


                data.settings.fee =
                    Number(
                        form.fee.value
                    ) || 0;


                data.settings.custody =
                    Number(
                        form.custody.value
                    ) || 0;


                data.settings.interest =
                    Number(
                        form.interest.value
                    ) || 0;


                data.settings.custodyEnabled =
                    form.custodyEnabled.checked;


                saveData();

                toast(
                    "Đã lưu cài đặt."
                );

            }
        );

    }


    const restore =
        document.getElementById(
            "restoreInput"
        );


    if (restore) {

        restore.addEventListener(
            "change",
            async e => {

                const file =
                    e.target.files[0];


                if (file) {

                    await restoreJSON(
                        file
                    );

                }


                e.target.value =
                    "";

            }
        );

    }


    const projectionForm =
        document.getElementById(
            "projectionForm"
        );


    if (projectionForm) {

        projectionForm.addEventListener(
            "submit",
            e => {

                e.preventDefault();

                runDividendProjection();

            }
        );

    }

}


/* ==================================================
   DATES
================================================== */

function initDates() {

    document
        .querySelectorAll(
            'input[type="date"]'
        )
        .forEach(
            input => {

                if (!input.value) {

                    input.value =
                        today();

                }

            }
        );

}


/* ==================================================
   RENDER ALL
================================================== */

function renderAll() {

    renderDashboard();

    renderPortfolio();

    renderTransactions();

    renderDividends();

    renderSettings();

}


/* ==================================================
   START
================================================== */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        initTabs();

        initEvents();

        initDates();

        toggleDividendFields();

        renderAll();

    }
);
