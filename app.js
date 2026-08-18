/* ==================================================
   ĐẦU TƯ CỔ TỨC
   APP.JS
   VERSION 6

   ==================================================
   LOGIC V6
   ==================================================

   GIAO DỊCH THỰC TẾ:

   TIỀN NẠP
       ↓
   TIỀN MẶT
       ↓
   MUA CP
       ↓
   FIFO LOT
       ↓
   CỔ TỨC
       ↓
   TIỀN MẶT / CP QUYỀN

   PHÍ:
   - Mua = phí cài đặt
   - Bán = phí cài đặt + 0.1%
   - Lưu ký = đ/CP/tháng
   - Lưu ký tính theo thời gian nắm giữ thực tế

   LÃI TIỀN MẶT:
   - 4%/năm mặc định
   - tính theo số dư từng ngày
   - ghi nhận 1 lần/tháng
   - tháng hiện tại hiển thị lãi đang tích lũy

   DỰ PHÓNG:

   CP NGUỒN
       ↓
   CỔ TỨC NGUỒN
       ↓
   TIỀN MẶT
       ↓
   CỔ TỨC CP ĐÍCH
       ↓
   MUA CP ĐÍCH
       ↓
   LÔ 100 CP
       ↓
   PHÍ LƯU KÝ
       ↓
   TIỀN DƯ

   CP ĐÍCH mua trong năm
   KHÔNG nhận cổ tức năm đó.

================================================== */

"use strict";


const STORAGE_KEY = "dautucotuc_v6";


/* ==================================================
   DEFAULT DATA
================================================== */

const DEFAULT_DATA = {

    deposits: [],

    transactions: [],

    dividends: [],

    settings: {

        /* Phí mua */
        fee: 0.25,

        /* Phí bán = fee + 0.10% */
        sellFeeExtra: 0.10,

        /*
         * Phí lưu ký:
         * mặc định 0.27 đ / CP / tháng
         */
        custody: 0.27,

        /*
         * Lãi tiền mặt:
         * 4% / năm
         */
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


function currentYear() {

    return new Date()
        .getFullYear();

}


function currentMonth() {

    return new Date()
        .getMonth() + 1;

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


function addDays(dateString, days) {

    const date =
        new Date(
            dateString + "T00:00:00"
        );

    date.setDate(
        date.getDate() + days
    );

    return date
        .toISOString()
        .slice(0, 10);

}


function lastDayOfMonth(year, month) {

    return new Date(
        year,
        month,
        0
    )
        .toISOString()
        .slice(0, 10);

}


function firstDayOfMonth(year, month) {

    return (
        `${year}-${String(month).padStart(2, "0")}-01`
    );

}


function monthKey(dateString) {

    if (!dateString)
        return "";

    return String(dateString)
        .slice(0, 7);

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

        const loaded =
            mergeData(
                clone(DEFAULT_DATA),
                JSON.parse(saved)
            );

        /*
         * Migration từ V5
         */
        if (
            loaded.settings.sellFeeExtra ===
            undefined
        ) {

            loaded.settings.sellFeeExtra =
                0.10;

        }

        if (
            loaded.settings.custody ===
            undefined
        ) {

            loaded.settings.custody =
                0.27;

        }

        if (
            loaded.settings.interest ===
            undefined
        ) {

            loaded.settings.interest =
                4;

        }

        return loaded;

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

/*
 * Phí mua
 */
function calculateBuyFee(amount) {

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


/*
 * Phí bán
 *
 * Phí bán = phí mua + 0.1%
 */
function calculateSellFee(amount) {

    const sellRate =
        (
            Number(
                data.settings.fee
            ) || 0
        ) +
        (
            Number(
                data.settings.sellFeeExtra
            ) || 0.10
        );

    return (
        Number(amount) || 0
    ) *
    sellRate /
    100;

}


/*
 * Phần trăm phí bán
 */
function getSellFeeRate() {

    return (
        Number(
            data.settings.fee
        ) || 0
    ) +
    (
        Number(
            data.settings.sellFeeExtra
        ) || 0.10
    );

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


    /*
     * Giao dịch
     */
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


    /*
     * Cổ tức bằng cổ phiếu
     */
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
                        ) || 0,

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
        (a, b) => {

            const result =
                String(a.date)
                    .localeCompare(
                        String(b.date)
                    );

            if (result !== 0)
                return result;

            if (
                a.type === "stockDividend" &&
                b.type !== "stockDividend"
            )
                return -1;

            return 0;

        }
    );


    const lots = [];


    for (const event of events) {

        if (
            event.type === "buy" ||
            event.type === "stockDividend"
        ) {

            lots.push({
                qty:
                    event.qty
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
   CASH TRANSACTIONS
================================================== */

/*
 * Chỉ tính tiền mặt giao dịch.
 *
 * Lãi chưa ghi nhận KHÔNG được
 * cộng vào đây.
 *
 * Phí lưu ký cũng không trừ trực tiếp
 * khỏi cash giao dịch để tránh
 * tính trùng.
 */
function calculateCashBeforeInterest() {

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
   CASH EVENTS
================================================== */

function getCashEventsUntil(endDate = today()) {

    const events = [];


    data.deposits
        .filter(
            d =>
                d.date <= endDate
        )
        .forEach(
            d => {

                events.push({

                    date:
                        d.date,

                    delta:
                        Number(d.amount) || 0,

                    type:
                        "deposit"

                });

            }
        );


    data.transactions
        .filter(
            t =>
                t.date <= endDate
        )
        .forEach(
            t => {

                if (
                    t.type === "buy" &&
                    t.source === "cash"
                ) {

                    events.push({

                        date:
                            t.date,

                        delta:
                            -(
                                Number(t.total) || 0
                            ),

                        type:
                            "buy"

                    });

                }


                if (
                    t.type === "sell"
                ) {

                    events.push({

                        date:
                            t.date,

                        delta:
                            Number(t.net) || 0,

                        type:
                            "sell"

                    });

                }

            }
        );


    /*
     * Tiền lãi đã ghi nhận
     *
     * Các khoản interest được tính từ
     * lịch sử tiền mặt, không tạo event
     * mới để tránh vòng lặp.
     *
     * Vì vậy cash balance thực tế
     * được xử lý riêng.
     */


    events.sort(
        (a, b) =>
            String(a.date)
                .localeCompare(
                    String(b.date)
                )
    );


    return events;

}


/* ==================================================
   CASH BALANCE AT DATE
================================================== */

function getCashBalanceAtDate(
    date
) {

    let balance = 0;


    data.deposits
        .filter(
            d =>
                d.date <= date
        )
        .forEach(
            d => {

                balance +=
                    Number(d.amount) || 0;

            }
        );


    data.transactions
        .filter(
            t =>
                t.date <= date
        )
        .forEach(
            t => {

                if (
                    t.type === "buy" &&
                    t.source === "cash"
                ) {

                    balance -=
                        Number(t.total) || 0;

                }


                if (
                    t.type === "sell"
                ) {

                    balance +=
                        Number(t.net) || 0;

                }

            }
        );


    return balance;

}


/* ==================================================
   MONTHLY CASH INTEREST
================================================== */

/*
 * SSI-style approximation:
 *
 * - 4% / năm
 * - tính theo số dư thực tế từng ngày
 * - lãi suất năm / 365
 * - lãi của tháng được ghi nhận 1 lần
 *
 * Lưu ý:
 * Đây là mô phỏng theo thông số người dùng
 * nhập vào app, không phải API trực tiếp
 * từ SSI.
 */


/*
 * Tính lãi của một khoảng ngày
 */
function calculateInterestForPeriod(
    startDate,
    endDate,
    openingBalance
) {

    if (
        !startDate ||
        !endDate ||
        endDate <= startDate
    )
        return 0;


    const events =
        getCashEventsUntil(
            endDate
        )
        .filter(
            e =>
                e.date >= startDate &&
                e.date <= endDate
        );


    let balance =
        Number(openingBalance) || 0;

    let interest = 0;

    let previous =
        startDate;


    for (const event of events) {

        const eventDate =
            event.date;


        const days =
            daysBetween(
                previous,
                eventDate
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
            Number(event.delta) || 0;


        previous =
            eventDate;

    }


    const finalDays =
        daysBetween(
            previous,
            endDate
        );


    if (finalDays > 0) {

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

    }


    return Math.max(
        0,
        interest
    );

}


/*
 * Tính lãi từng tháng từ lúc bắt đầu
 * có dữ liệu đến hiện tại.
 */
function calculateInterestLedger() {

    const events =
        getCashEventsUntil(
            today()
        );


    if (!events.length) {

        return {

            credited: 0,

            accrued: 0,

            total: 0,

            months: []

        };

    }


    const firstDate =
        events[0].date;


    const first =
        new Date(
            firstDate + "T00:00:00"
        );


    const startYear =
        first.getFullYear();

    const startMonth =
        first.getMonth() + 1;


    const now =
        new Date();

    const endYear =
        now.getFullYear();

    const endMonth =
        now.getMonth() + 1;


    const months = [];


    let credited = 0;

    let accrued = 0;


    let y =
        startYear;

    let m =
        startMonth;


    while (
        y < endYear ||
        (
            y === endYear &&
            m <= endMonth
        )
    ) {

        const monthStart =
            firstDayOfMonth(
                y,
                m
            );


        const nextMonthDate =
            new Date(
                y,
                m,
                1
            );


        const nextMonth =
            nextMonthDate
                .toISOString()
                .slice(0, 10);


        const monthEnd =
            lastDayOfMonth(
                y,
                m
            );


        const effectiveStart =
            monthStart < firstDate
                ? firstDate
                : monthStart;


        const effectiveEnd =
            (
                y === endYear &&
                m === endMonth
            )
                ? today()
                : monthEnd;


        if (
            effectiveStart <=
            effectiveEnd
        ) {

            const openingDate =
                effectiveStart;


            const openingBalance =
                getCashBalanceAtDate(
                    addDays(
                        openingDate,
                        -1
                    )
                );


            const interest =
                calculateInterestForPeriod(
                    openingDate,
                    addDays(
                        effectiveEnd,
                        1
                    ),
                    openingBalance
                );


            const isCurrentMonth =
                y === endYear &&
                m === endMonth;


            months.push({

                key:
                    `${y}-${String(m).padStart(2, "0")}`,

                year:
                    y,

                month:
                    m,

                start:
                    effectiveStart,

                end:
                    effectiveEnd,

                interest,

                credited:
                    !isCurrentMonth,

                accrued:
                    isCurrentMonth

            });


            if (isCurrentMonth) {

                accrued +=
                    interest;

            } else {

                credited +=
                    interest;

            }

        }


        m++;

        if (m > 12) {

            m = 1;

            y++;

        }

    }


    return {

        credited,

        accrued,

        total:
            credited + accrued,

        months

    };

}


/*
 * Lãi đã ghi nhận vào tiền mặt.
 *
 * Chỉ các tháng đã kết thúc được tính
 * vào tiền khả dụng.
 */
function calculateCreditedInterest() {

    return calculateInterestLedger()
        .credited;

}


/*
 * Lãi đang tích lũy trong tháng.
 */
function calculateAccruedInterest() {

    return calculateInterestLedger()
        .accrued;

}


/*
 * Tổng lãi hiển thị.
 */
function calculateCashInterest() {

    return calculateInterestLedger()
        .total;

}


/*
 * Tiền mặt thực tế:
 *
 * cash giao dịch
 * + lãi đã ghi nhận
 *
 * Không cộng lãi tháng hiện tại.
 */
function calculateCash() {

    return (
        calculateCashBeforeInterest() +
        calculateCreditedInterest()
    );

}


/* ==================================================
   CUSTODY FEE
================================================== */

/*
 * Phí lưu ký theo ngày.
 *
 * settings.custody:
 * đ / CP / tháng
 *
 * Tính theo ngày:
 *
 * phí tháng / số ngày trong tháng
 *
 * Như vậy:
 *
 * lot mua 01/08
 * → tính từ 01/08
 *
 * lot bán 15/08
 * → chỉ tính tới 15/08
 *
 * lot còn giữ
 * → tính tới hôm nay.
 */


/*
 * Tính phí lưu ký của một lot
 * trong khoảng thời gian.
 */
function calculateLotCustodyFee(
    lot,
    endDate = today()
) {

    if (
        !lot ||
        !lot.date ||
        Number(lot.qty) <= 0
    )
        return 0;


    const start =
        lot.date;


    const end =
        endDate;


    if (
        end <= start
    )
        return 0;


    let fee = 0;

    let cursor =
        new Date(
            start + "T00:00:00"
        );


    const final =
        new Date(
            end + "T00:00:00"
        );


    while (
        cursor < final
    ) {

        const year =
            cursor.getFullYear();

        const month =
            cursor.getMonth();


        const daysInMonth =
            new Date(
                year,
                month + 1,
                0
            ).getDate();


        const monthEnd =
            new Date(
                year,
                month + 1,
                0
            );


        const periodEnd =
            monthEnd < final
                ? monthEnd
                : final;


        const days =
            Math.max(
                1,
                Math.floor(
                    (
                        periodEnd -
                        cursor
                    ) /
                    86400000
                )
            );


        /*
         * custody là đ/CP/tháng
         */
        fee +=
            Number(lot.qty) *
            (
                Number(
                    data.settings.custody
                ) || 0
            ) *
            days /
            daysInMonth;


        /*
         * chuyển sang ngày tiếp theo
         */
        cursor =
            new Date(
                periodEnd
            );

        cursor.setDate(
            cursor.getDate() + 1
        );

    }


    return Math.max(
        0,
        fee
    );

}


/*
 * Tổng phí lưu ký hiện tại.
 */
function calculateCustodyFee() {

    if (
        !data.settings.custodyEnabled
    )
        return 0;


    let total = 0;


    getSymbols()
        .forEach(
            symbol => {

                getHoldingLots(symbol)
                    .forEach(
                        lot => {

                            total +=
                                calculateLotCustodyFee(
                                    lot,
                                    today()
                                );

                        }
                    );

            }
        );


    return Math.max(
        0,
        total
    );

}


/*
 * Tính phí lưu ký của toàn bộ danh mục
 * trong một khoảng thời gian.
 *
 * Dùng cho dự phóng.
 */
function calculateProjectedCustody(
    lots,
    startDate,
    endDate,
    monthlyRate
) {

    if (
        !Array.isArray(lots) ||
        !lots.length
    )
        return 0;


    if (
        !data.settings.custodyEnabled
    )
        return 0;


    const rate =
        Math.max(
            0,
            Number(monthlyRate) || 0
        );


    if (
        rate <= 0
    )
        return 0;


    let total = 0;


    for (
        const lot of lots
    ) {

        const lotStart =
            lot.startDate ||
            lot.date;


        if (!lotStart)
            continue;


        const effectiveStart =
            lotStart > startDate
                ? lotStart
                : startDate;


        if (
            effectiveStart >= endDate
        )
            continue;


        let cursor =
            new Date(
                effectiveStart +
                "T00:00:00"
            );


        const finish =
            new Date(
                endDate +
                "T00:00:00"
            );


        while (
            cursor < finish
        ) {

            const y =
                cursor.getFullYear();

            const m =
                cursor.getMonth();


            const daysInMonth =
                new Date(
                    y,
                    m + 1,
                    0
                ).getDate();


            const monthEnd =
                new Date(
                    y,
                    m + 1,
                    0
                );


            const periodEnd =
                monthEnd < finish
                    ? monthEnd
                    : finish;


            const days =
                Math.max(
                    1,
                    Math.floor(
                        (
                            periodEnd -
                            cursor
                        ) /
                        86400000
                    )
                );


            total +=
                (
                    Number(lot.shares) ||
                    Number(lot.qty) ||
                    0
                ) *
                rate *
                days /
                daysInMonth;


            cursor =
                new Date(
                    periodEnd
                );

            cursor.setDate(
                cursor.getDate() + 1
            );

        }

    }


    return Math.max(
        0,
        total
    );

}


/* ==================================================
   PORTFOLIO
================================================== */

function getPortfolio() {

    const result = [];


    getSymbols()
        .forEach(
            symbol => {

                const lots =
                    getHoldingLots(
                        symbol
                    );


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


                const custodyFee =
                    calculateLotCustodyFeePortfolio(
                        lots
                    );


                result.push({

                    symbol,

                    lots,

                    quantity,

                    cost,

                    averageCost,

                    cashDividend,

                    stockDividend,

                    custodyFee

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


function calculateLotCustodyFeePortfolio(
    lots
) {

    return lots.reduce(
        (sum, lot) =>
            sum +
            calculateLotCustodyFee(
                lot,
                today()
            ),
        0
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


    /* ------------------------------------------
       MUA
    ------------------------------------------ */

    if (
        type === "buy"
    ) {

        const fee =
            calculateBuyFee(
                value
            );


        const total =
            value + fee;


        if (
            source === "cash"
        ) {

            if (
                calculateCash() <
                total
            ) {

                throw new Error(
                    "Không đủ tiền mặt."
                );

            }

        }


        if (
            source === "dividend"
        ) {

            if (
                calculateDividendWallet() <
                total
            ) {

                throw new Error(
                    "Không đủ ví cổ tức."
                );

            }

        }


        data.transactions.push({

            id:
                uid("tx"),

            type:
                "buy",

            date,

            symbol,

            qty,

            price,

            fee,

            feeRate:
                Number(
                    data.settings.fee
                ) || 0,

            total,

            source,

            note:
                form.note.value.trim()

        });

    }


    /* ------------------------------------------
       BÁN
    ------------------------------------------ */

    else {

        const holding =
            getHoldingQuantity(
                symbol
            );


        if (
            holding <
            qty
        ) {

            throw new Error(
                `Không đủ ${symbol} để bán.`
            );

        }


        const fee =
            calculateSellFee(
                value
            );


        const net =
            value - fee;


        data.transactions.push({

            id:
                uid("tx"),

            type:
                "sell",

            date,

            symbol,

            qty,

            price,

            fee,

            feeRate:
                getSellFeeRate(),

            total:
                value,

            net,

            source:
                "cash",

            note:
                form.note.value.trim()

        });

    }


    /*
     * Kiểm tra FIFO sau giao dịch.
     */
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


    /* ------------------------------------------
       CỔ TỨC TIỀN
    ------------------------------------------ */

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


    /* ------------------------------------------
       CỔ TỨC CP / THƯỞNG
    ------------------------------------------ */

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
   DELETE TRANSACTION
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


/* ==================================================
   DELETE DIVIDEND
================================================== */

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
                Number(d.amount || 0),
            0
        );


    const cash =
        calculateCash();


    const wallet =
        calculateDividendWallet();


    const invested =
        portfolio.reduce(
            (s, p) =>
                s +
                p.cost,
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
                        d.cashTotal || 0
                    ),
                0
            );


    const interestCredited =
        calculateCreditedInterest();


    const interestAccrued =
        calculateAccruedInterest();


    const custody =
        calculateCustodyFee();


    const cards = [

        [
            "Tổng tiền nạp",
            money(deposits)
        ],

        [
            "Tiền mặt",
            money(cash)
        ],

        [
            "Ví cổ tức",
            money(wallet)
        ],

        [
            "Tiền khả dụng",
            money(
                cash + wallet
            )
        ],

        [
            "Vốn cổ phiếu",
            money(invested)
        ],

        [
            "Cổ tức tiền mặt",
            money(dividend)
        ],

        [
            "Lãi tiền mặt",
            money(interestCredited)
        ],

        [
            "Lãi tháng này",
            money(interestAccrued)
        ],

        [
            "Phí lưu ký",
            money(custody)
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
                        ${escapeHTML(
                            p.symbol
                        )}
                    </h3>

                    <div class="stock-meta">

                        <div class="kv">

                            <span>
                                Số CP
                            </span>

                            <b>
                                ${number(
                                    p.quantity
                                )}
                            </b>

                        </div>


                        <div class="kv">

                            <span>
                                Giá vốn BQ
                            </span>

                            <b>
                                ${money(
                                    p.averageCost
                                )}
                            </b>

                        </div>


                        <div class="kv">

                            <span>
                                Giá vốn còn lại
                            </span>

                            <b>
                                ${money(
                                    p.cost
                                )}
                            </b>

                        </div>


                        <div class="kv">

                            <span>
                                Số lô
                            </span>

                            <b>
                                ${p.lots.length}
                            </b>

                        </div>


                        <div class="kv">

                            <span>
                                Cổ tức tiền
                            </span>

                            <b>
                                ${money(
                                    p.cashDividend
                                )}
                            </b>

                        </div>


                        <div class="kv">

                            <span>
                                CP từ quyền
                            </span>

                            <b>
                                ${number(
                                    p.stockDividend
                                )}
                            </b>

                        </div>


                        <div class="kv">

                            <span>
                                Phí lưu ký
                            </span>

                            <b>
                                ${money(
                                    p.custodyFee
                                )}
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

                        <th>
                            Ngày
                        </th>

                        <th>
                            Loại
                        </th>

                        <th>
                            Mã
                        </th>

                        <th>
                            SL
                        </th>

                        <th>
                            Giá
                        </th>

                        <th>
                            Phí
                        </th>

                        <th>
                            Tổng
                        </th>

                        <th>
                            Nguồn
                        </th>

                        <th></th>

                    </tr>

                </thead>


                <tbody>

                    ${sorted.map(
                        t => `

                            <tr>

                                <td>
                                    ${escapeHTML(
                                        t.date
                                    )}
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
                                    ${escapeHTML(
                                        t.symbol
                                    )}
                                </td>


                                <td>
                                    ${number(
                                        t.qty
                                    )}
                                </td>


                                <td>
                                    ${money(
                                        t.price
                                    )}
                                </td>


                                <td>

                                    ${money(
                                        t.fee
                                    )}

                                    <br>

                                    <small>
                                        ${
                                            t.type === "sell"
                                                ? `${number(
                                                    t.feeRate,
                                                    2
                                                )}%`
                                                : `${number(
                                                    t.feeRate ??
                                                    data.settings.fee,
                                                    2
                                                )}%`
                                        }
                                    </small>

                                </td>


                                <td>
                                    ${money(
                                        t.total
                                    )}
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
                    .slice(
                        0,
                        8
                    )
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

                        <th>
                            Ngày chốt
                        </th>

                        <th>
                            Ngày nhận
                        </th>

                        <th>
                            Mã
                        </th>

                        <th>
                            Loại
                        </th>

                        <th>
                            CP đủ ĐK
                        </th>

                        <th>
                            Kết quả
                        </th>

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


    if (form.fee)
        form.fee.value =
            data.settings.fee;


    if (form.custody)
        form.custody.value =
            data.settings.custody;


    if (form.interest)
        form.interest.value =
            data.settings.interest;


    if (form.custodyEnabled)
        form.custodyEnabled.checked =
            !!data.settings.custodyEnabled;


    /*
     * Nếu HTML V6 có field mới
     * cho phí bán thì tự điền.
     */
    if (
        form.sellFeeExtra
    ) {

        form.sellFeeExtra.value =
            data.settings.sellFeeExtra;

    }

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


    if (
        type === "cash"
    ) {

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


    if (form.date)
        form.date.value =
            today();


    if (form.type)
        form.type.value =
            "buy";


    if (form.source)
        form.source.value =
            "cash";


    if (form.source)
        form.source.disabled =
            false;

}


/* ==================================================
   BACKUP
================================================== */

function backupJSON() {

    const backup = {

        version:
            6,

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
        URL.createObjectURL(
            blob
        );


    const link =
        document.createElement(
            "a"
        );


    link.href =
        url;


    link.download =
        `dautucotuc_backup_v6_${today()}.json`;


    document.body.appendChild(
        link
    );


    link.click();


    link.remove();


    URL.revokeObjectURL(
        url
    );


    toast(
        "Đã xuất backup V6."
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
            JSON.parse(
                text
            );


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

/*
 * Lãi tiền mặt dự phóng.
 *
 * Tính theo số dư:
 * - tiền đầu năm
 * - tiền góp hàng tháng
 *
 * Lãi được xem là ghi nhận cuối tháng.
 */
function calculateYearInterest(
    openingCash,
    monthlyContribution,
    annualRate
) {

    const rate =
        Math.max(
            0,
            Number(
                annualRate
            ) || 0
        ) / 100;


    const monthly =
        Math.max(
            0,
            Number(
                monthlyContribution
            ) || 0
        );


    let interest = 0;


    /*
     * Mô phỏng từng tháng.
     */
    let balance =
        Math.max(
            0,
            Number(openingCash) || 0
        );


    for (
        let month = 1;
        month <= 12;
        month++
    ) {

        /*
         * Tiền góp đầu tháng.
         */
        balance +=
            monthly;


        /*
         * Lãi tháng.
         */
        const monthlyInterest =
            Math.max(
                0,
                balance
            ) *
            rate /
            12;


        interest +=
            monthlyInterest;

    }


    return Math.max(
        0,
        interest
    );

}


/* ==================================================
   PROJECTION
================================================== */

function calculateProjectionScenario(
    options
) {

    const years =
        Math.max(
            1,
            Math.floor(
                Number(
                    options.years
                ) || 1
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
            Number(
                options.sourceShares
            ) || 0
        );


    const sourcePrice =
        Math.max(
            0,
            Number(
                options.sourcePrice
            ) || 0
        );


    const targetPrice =
        Math.max(
            0,
            Number(
                options.targetPrice
            ) || 0
        );


    const sourceDividend =
        Math.max(
            0,
            Number(
                options.sourceDividend
            ) || 0
        );


    const targetDividend =
        Math.max(
            0,
            Number(
                options.targetDividend
            ) || 0
        );


    const monthlyMoney =
        Math.max(
            0,
            Number(
                options.monthlyMoney
            ) || 0
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
            Number(
                options.cashInterest
            ) || 0
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


    /*
     * Phí lưu ký dự phóng.
     */
    const custodyRate =
        Math.max(
            0,
            Number(
                options.custody
            ) || 0
        );


    let cash =
        Math.max(
            0,
            Number(
                options.initialCash
            ) || 0
        );


    /*
     * Lot CP đích.
     *
     * yearBought:
     * năm mua.
     *
     * CP mua năm hiện tại
     * không nhận cổ tức năm đó.
     */
    const lots = [];


    /*
     * CP nguồn không phải lot tái đầu tư.
     */
    const sourceLot = {

        shares:
            sourceShares,

        price:
            sourcePrice,

        startYear:
            0

    };


    let totalSourceDividend = 0;

    let totalTargetDividend = 0;

    let totalDividend = 0;

    let totalContribution = 0;

    let totalReinvestMoney = 0;

    let totalNewShares = 0;

    let totalInterest = 0;

    let totalCustody = 0;


    const rows = [];


    for (
        let year = 1;
        year <= years;
        year++
    ) {

        /* ------------------------------------------
           GIÁ
        ------------------------------------------ */

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


        /* ------------------------------------------
           CỔ TỨC
        ------------------------------------------ */

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


        const yearlySourceDividend =
            sourceShares *
            sourceCurrentDividend;


        /*
         * Chỉ lot cũ:
         *
         * lot.yearBought < year
         */
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


        /*
         * Lãi tiền mặt:
         *
         * Lãi 4%/năm
         * nhưng mô phỏng ghi nhận theo tháng.
         */
        const interest =
            calculateYearInterest(
                cash,
                year <= contributionYears
                    ? monthlyMoney
                    : 0,
                cashInterest
            );


        cash +=
            contribution;


        totalContribution +=
            contribution;


        /*
         * Lãi được cộng vào tiền mặt
         * sau khi kỳ lãi hoàn tất.
         */
        cash +=
            interest;


        totalInterest +=
            interest;


        /* ------------------------------------------
           CỔ TỨC VỀ TIỀN
        ------------------------------------------ */

        cash +=
            yearlyDividend;


        totalSourceDividend +=
            yearlySourceDividend;


        totalTargetDividend +=
            yearlyTargetDividend;


        totalDividend +=
            yearlyDividend;


        /* ------------------------------------------
           LOT NGUỒN + LOT ĐÍCH
        ------------------------------------------ */

        /*
         * Tính phí lưu ký trong năm.
         *
         * CP nguồn:
         * có từ đầu kỳ.
         */
        let yearCustody = 0;


        /*
         * CP nguồn:
         * 12 tháng.
         */
        if (
            sourceShares > 0 &&
            custodyRate > 0
        ) {

            yearCustody +=
                sourceShares *
                custodyRate;

        }


        /*
         * Các lot đích:
         *
         * lot cũ chịu đủ phí.
         * lot mới mua trong năm:
         * tính từ tháng mua.
         */
        lots.forEach(
            lot => {

                if (
                    lot.yearBought <
                    year
                ) {

                    yearCustody +=
                        lot.shares *
                        custodyRate;

                }

                else if (
                    lot.yearBought ===
                    year
                ) {

                    /*
                     * Mô phỏng mua trong năm.
                     *
                     * Lấy số tháng còn lại
                     * theo tỷ lệ.
                     *
                     * Vì giao dịch dự phóng
                     * theo năm nên dùng 6 tháng
                     * làm điểm giữa mặc định.
                     */
                    yearCustody +=
                        lot.shares *
                        custodyRate *
                        0.5;

                }

            }
        );


        /*
         * Trừ phí lưu ký khỏi tiền.
         */
        cash -=
            yearCustody;


        cash =
            Math.max(
                0,
                cash
            );


        totalCustody +=
            yearCustody;


        /* ------------------------------------------
           MUA CP ĐÍCH
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


            /*
             * BẮT BUỘC LÔ 100.
             */
            buyShares =
                Math.floor(
                    possible / 100
                ) *
                100;


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
                    sum +
                    lot.shares,
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

            custody:
                yearCustody,

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
        rows[
            rows.length - 1
        ];


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

        totalCustody,

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


    const getValue = id => {

        const el =
            value(id);

        return el
            ? el.value
            : "";

    };


    return {

        source:
            getValue(
                "projectionSource"
            )
            .trim()
            .toUpperCase(),


        target:
            getValue(
                "projectionTarget"
            )
            .trim()
            .toUpperCase(),


        shares:
            Number(
                getValue(
                    "projectionShares"
                )
            ) || 0,


        sourcePrice:
            Number(
                getValue(
                    "projectionSourcePrice"
                )
            ) || 0,


        targetPrice:
            Number(
                getValue(
                    "projectionTargetPrice"
                )
            ) || 0,


        monthlyMoney:
            Number(
                getValue(
                    "projectionMonthlyMoney"
                )
            ) || 0,


        reinvestPercent:
            Number(
                getValue(
                    "projectionReinvest"
                )
            ) || 0,


        cashInterest:
            Number(
                getValue(
                    "projectionCashInterest"
                )
            ) || 4,


        years:
            Number(
                getValue(
                    "projectionYears"
                )
            ) || 1,


        contributionYears:
            Number(
                getValue(
                    "projectionContributionYears"
                )
            ) || 0,


        reinvestYears:
            Number(
                getValue(
                    "projectionReinvestYears"
                )
            ) || 0,


        sourcePriceGrowth:
            Number(
                getValue(
                    "projectionSourcePriceGrowth"
                )
            ) || 0,


        targetPriceGrowth:
            Number(
                getValue(
                    "projectionTargetPriceGrowth"
                )
            ) || 0,


        sourceWeak:
            Number(
                getValue(
                    "sourceScenarioWeak"
                )
            ) || 0,


        sourceMedium:
            Number(
                getValue(
                    "sourceScenarioMedium"
                )
            ) || 0,


        sourceHigh:
            Number(
                getValue(
                    "sourceScenarioHigh"
                )
            ) || 0,


        targetWeak:
            Number(
                getValue(
                    "targetScenarioWeak"
                )
            ) || 0,


        targetMedium:
            Number(
                getValue(
                    "targetScenarioMedium"
                )
            ) || 0,


        targetHigh:
            Number(
                getValue(
                    "targetScenarioHigh"
                )
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

        custody:
            data.settings.custody,

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
            "Phí lưu ký",
            projectionMoney(
                result.totalCustody
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
                        ${escapeHTML(
                            c[0]
                        )}
                    </span>

                    <strong>
                        ${c[1]}
                    </strong>

                </div>

            `
        ).join("");

}


/* ==================================================
   SCENARIO CARD
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
                ${escapeHTML(
                    input.target
                )}:
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
                Lãi tiền mặt:
                <b>
                    ${projectionMoney(
                        result.totalInterest
                    )}
                </b>
            </p>


            <p>
                Phí lưu ký:
                <b>
                    ${projectionMoney(
                        result.totalCustody
                    )}
                </b>
            </p>


            <p>
                Tiền mua
                ${escapeHTML(
                    input.target
                )}:
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


/* ==================================================
   SCENARIO SUMMARY
================================================== */

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

                    <th>
                        Năm
                    </th>

                    <th>
                        CP ${escapeHTML(
                            input.source
                        )}
                    </th>

                    <th>
                        Cổ tức nguồn
                    </th>

                    <th>
                        ${escapeHTML(
                            input.target
                        )}
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
                        Phí lưu ký
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
                                    row.custody
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
                Logic dự phóng V6
            </strong>


            <br><br>


            <b>
                ${escapeHTML(
                    input.source
                )}
            </b>

            là CP nguồn.


            <br><br>


            <b>
                Cổ tức nguồn
            </b>

            = CP nguồn × cổ tức/CP.


            <br><br>


            <b>
                Cổ tức ${escapeHTML(
                    input.target
                )}
            </b>

            chỉ tính trên các lot
            ${escapeHTML(
                input.target
            )}
            đã mua từ năm trước.


            <br>

            CP ${escapeHTML(
                input.target
            )}
            vừa mua trong năm
            không nhận cổ tức năm đó.


            <br><br>


            <b>
                Mua theo lô 100 CP.
            </b>

            Phần tiền không đủ một lô
            được giữ lại.


            <br><br>


            <b>
                Lãi tiền mặt:
            </b>

            ${number(
                input.cashInterest,
                2
            )}%/năm,

            tính theo cơ chế lãi tháng.


            <br><br>


            <b>
                Phí lưu ký:
            </b>

            ${number(
                data.settings.custody,
                4
            )}

            đ/CP/tháng.


            <br><br>


            <b>
                Tiền dư cuối kỳ
            </b>

            đã trừ phí lưu ký.


            <br><br>


            Giá ${escapeHTML(
                input.source
            )}

            và giá ${escapeHTML(
                input.target
            )}

            tăng trưởng độc lập.

        </div>

    `;

}


/* ==================================================
   TABS
================================================== */

function initTabs() {

    document
        .querySelectorAll(
            ".tab"
        )
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

    /* ------------------------------------------
       DEPOSIT
    ------------------------------------------ */

    const depositForm =
        document.getElementById(
            "depositForm"
        );


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


    /* ------------------------------------------
       TRADE
    ------------------------------------------ */

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


        if (type && source) {

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

    }


    /* ------------------------------------------
       DIVIDEND
    ------------------------------------------ */

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


        const type =
            dividendForm.querySelector(
                '[name="type"]'
            );


        if (type) {

            type.addEventListener(
                "change",
                toggleDividendFields
            );

        }

    }


    /* ------------------------------------------
       SETTINGS
    ------------------------------------------ */

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


                if (form.fee) {

                    data.settings.fee =
                        Number(
                            form.fee.value
                        ) || 0;

                }


                if (
                    form.sellFeeExtra
                ) {

                    data.settings.sellFeeExtra =
                        Number(
                            form.sellFeeExtra.value
                        ) || 0.10;

                }


                if (form.custody) {

                    data.settings.custody =
                        Number(
                            form.custody.value
                        ) || 0;

                }


                if (form.interest) {

                    data.settings.interest =
                        Number(
                            form.interest.value
                        ) || 0;

                }


                if (
                    form.custodyEnabled
                ) {

                    data.settings.custodyEnabled =
                        form.custodyEnabled.checked;

                }


                saveData();


                toast(
                    "Đã lưu cài đặt."
                );

            }
        );

    }


    /* ------------------------------------------
       RESTORE
    ------------------------------------------ */

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


    /* ------------------------------------------
       PROJECTION
    ------------------------------------------ */

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
   REAL-TIME REFRESH
================================================== */

/*
 * Cập nhật lãi tiền mặt và phí lưu ký
 * theo thời gian.
 *
 * Không cần reload app.
 */
function startRealtimeRefresh() {

    /*
     * Mỗi 60 giây cập nhật lại.
     */
    setInterval(
        () => {

            renderDashboard();

            renderPortfolio();

        },
        60000
    );


    /*
     * Khi mở lại app / tab
     * cập nhật ngay.
     */
    document.addEventListener(
        "visibilitychange",
        () => {

            if (
                !document.hidden
            ) {

                renderDashboard();

                renderPortfolio();

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

        startRealtimeRefresh();

    }
);
