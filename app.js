/* ==================================================
   ĐẦU TƯ CỔ TỨC
   APP.JS
   VERSION 6

   ==================================================
   LOGIC V6

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

   ==================================================
   PHÍ GIAO DỊCH

   MUA:
       phí = giá trị mua × phí mua %

   BÁN:
       phí = giá trị bán × (phí mua % + 0.1%)

   ==================================================
   PHÍ LƯU KÝ

   Tính riêng từng lot:

       số CP
       ×
       phí lưu ký / CP / ngày
       ×
       số ngày nắm giữ

   Cập nhật theo ngày hiện tại.

   Không làm thay đổi tiền mặt thực tế.
   Chỉ dùng để hiển thị chi phí lưu ký phát sinh.

   ==================================================
   LÃI TIỀN MẶT

   Logic SSI mới:

       4% / năm
       tính trên tiền qua đêm
       trả 1 lần / tháng

   V6 tách:

       Lãi đã nhận
       +
       Lãi đang tích lũy chưa đến ngày trả

   Lãi chưa trả KHÔNG được nhập vào số dư
   để tính lãi kép.

   ==================================================
   DỰ PHÓNG

   CP nguồn và CP đích độc lập.

   CP đích mua trong năm:
       KHÔNG nhận cổ tức năm đó.

   Mua CP đích:
       CHỈ LÔ 100 CP.

   Tiền dư:
       giữ lại.

   Tiền dư:
       tiếp tục sinh lãi.

   Phí lưu ký dự phóng:
       được tính vào chi phí.

================================================== */

"use strict";


/* ==================================================
   STORAGE
================================================== */

const STORAGE_KEY = "dautucotuc_v6";


const DEFAULT_DATA = {

    deposits: [],

    transactions: [],

    dividends: [],

    settings: {

        /*
         * Phí mua mặc định:
         * 0.25%
         */
        fee: 0.25,

        /*
         * Phí bán = phí mua + 0.1%
         *
         * Không lưu cứng vào settings để tránh
         * làm hỏng dữ liệu cũ.
         */
        sellFeeExtra: 0.1,

        /*
         * Phí lưu ký:
         * 0.009 đ / CP / ngày
         */
        custody: 0.009,

        /*
         * Lãi tiền mặt qua đêm:
         * 4% / năm
         */
        interest: 4,

        /*
         * Lãi trả mỗi tháng
         */
        interestPayment: "monthly",

        /*
         * Bật / tắt phí lưu ký
         */
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


/*
 * Lấy ngày hiện tại theo local time.
 *
 * Không dùng toISOString() vì có thể lệch ngày
 * khi điện thoại ở múi giờ khác.
 */
function today() {

    const d = new Date();

    const year =
        d.getFullYear();

    const month =
        String(
            d.getMonth() + 1
        ).padStart(2, "0");

    const day =
        String(
            d.getDate()
        ).padStart(2, "0");

    return (
        year +
        "-" +
        month +
        "-" +
        day
    );

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


/* ==================================================
   DATE HELPERS
================================================== */

function parseLocalDate(dateString) {

    if (!dateString)
        return null;

    return new Date(
        dateString +
        "T00:00:00"
    );

}


function daysBetween(start, end) {

    if (!start || !end)
        return 0;

    const a =
        parseLocalDate(start);

    const b =
        parseLocalDate(end);

    if (!a || !b)
        return 0;

    return Math.max(
        0,
        Math.floor(
            (b - a) /
            86400000
        )
    );

}


/*
 * Số ngày từ ngày mua đến hôm nay.
 *
 * Nếu mua hôm nay:
 * 0 ngày.
 *
 * Ngày mai:
 * 1 ngày.
 */
function holdingDaysFrom(
    date
) {

    return daysBetween(
        date,
        today()
    );

}


/* ==================================================
   MONTH HELPERS
================================================== */

function monthKey(date) {

    if (!date)
        return "";

    return String(date)
        .slice(0, 7);

}


function firstDayOfMonth(
    year,
    month
) {

    return (
        year +
        "-" +
        String(month).padStart(2, "0") +
        "-01"
    );

}


function lastDayOfMonth(
    year,
    month
) {

    const d =
        new Date(
            year,
            month,
            0
        );

    return (
        d.getFullYear() +
        "-" +
        String(
            d.getMonth() + 1
        ).padStart(2, "0") +
        "-" +
        String(
            d.getDate()
        ).padStart(2, "0")
    );

}


/* ==================================================
   DATA MERGE
================================================== */

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

        /*
         * Ưu tiên V6.
         */

        let saved =
            localStorage.getItem(
                STORAGE_KEY
            );


        /*
         * Nếu chưa có V6 thì đọc V5.
         *
         * Điều này giúp nâng cấp mà không mất
         * dữ liệu cũ.
         */

        if (!saved) {

            saved =
                localStorage.getItem(
                    "dautucotuc_v5"
                );

        }


        if (!saved) {

            return clone(
                DEFAULT_DATA
            );

        }


        const parsed =
            JSON.parse(saved);


        /*
         * Backup có thể có dạng:
         *
         * {
         *   version: 5,
         *   data: {...}
         * }
         */

        const source =
            parsed.data ||
            parsed;


        return mergeData(
            clone(DEFAULT_DATA),
            source
        );

    } catch (error) {

        console.error(
            "Load error:",
            error
        );

        return clone(
            DEFAULT_DATA
        );

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

    el.classList.add(
        "show"
    );

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
 * Phí mua.
 */
function getBuyFeeRate() {

    return Math.max(
        0,
        Number(
            data.settings.fee
        ) || 0
    );

}


/*
 * Phí bán:
 *
 * phí mua + 0.1%
 */
function getSellFeeRate() {

    return (
        getBuyFeeRate() +
        (
            Number(
                data.settings.sellFeeExtra
            ) || 0.1
        )
    );

}


function calculateTradingFee(
    amount,
    type = "buy"
) {

    const rate =
        type === "sell"
            ? getSellFeeRate()
            : getBuyFeeRate();

    return (
        Number(amount) || 0
    ) *
    rate /
    100;

}


/* ==================================================
   DEPOSIT
================================================== */

function addDeposit(form) {

    const amount =
        Number(
            form.amount.value
        );


    if (
        amount <= 0
    ) {

        throw new Error(
            "Số tiền nạp phải lớn hơn 0."
        );

    }


    data.deposits.push({

        id:
            uid("deposit"),

        date:
            form.date.value ||
            today(),

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
     * Cổ tức CP / CP thưởng
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
                        ),

                    price: 0

                });

            }
        );


    /*
     * Sắp xếp theo ngày.
     *
     * Nếu cùng ngày:
     *
     * cổ tức CP trước
     * mua sau
     * bán cuối
     */

    events.sort(
        (a, b) => {

            const result =
                String(a.date)
                    .localeCompare(
                        String(b.date)
                    );


            if (
                result !== 0
            )
                return result;


            const priority = {

                stockDividend: 0,

                buy: 1,

                sell: 2

            };


            return (
                (
                    priority[
                        a.eventType
                    ] ?? 1
                )
                -
                (
                    priority[
                        b.eventType
                    ] ?? 1
                )
            );

        }
    );


    const lots = [];


    for (
        const event of events
    ) {

        /*
         * MUA
         */

        if (
            event.eventType ===
            "buy"
        ) {

            lots.push({

                id:
                    event.id,

                date:
                    event.date,

                qty:
                    Number(
                        event.qty
                    ) || 0,

                price:
                    Number(
                        event.price
                    ) || 0

            });

        }


        /*
         * CỔ TỨC CP
         */

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
                    Number(
                        event.qty
                    ) || 0,

                /*
                 * Cổ tức CP không có giá vốn
                 */
                price: 0

            });

        }


        /*
         * BÁN FIFO
         */

        else if (
            event.eventType ===
            "sell"
        ) {

            let remaining =
                Number(
                    event.qty
                ) || 0;


            for (
                const lot of lots
            ) {

                if (
                    remaining <= 0
                )
                    break;


                const take =
                    Math.min(
                        lot.qty,
                        remaining
                    );


                lot.qty -=
                    take;


                remaining -=
                    take;

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


function getHoldingLots(
    symbol
) {

    return replaySymbol(
        symbol
    );

}


function getHoldingQuantity(
    symbol
) {

    return getHoldingLots(
        symbol
    )
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
                        Number(
                            t.qty
                        ) || 0

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


    for (
        const event of events
    ) {

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


            for (
                const lot of lots
            ) {

                if (
                    remaining <= 0
                )
                    break;


                const take =
                    Math.min(
                        lot.qty,
                        remaining
                    );


                lot.qty -=
                    take;


                remaining -=
                    take;

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


    /*
     * Tiền nạp
     */

    data.deposits.forEach(
        d => {

            cash +=
                Number(
                    d.amount
                ) || 0;

        }
    );


    /*
     * Mua bằng tiền mặt
     */

    data.transactions.forEach(
        t => {

            if (
                t.type === "buy" &&
                t.source === "cash"
            ) {

                cash -=
                    Number(
                        t.total
                    ) || 0;

            }


            /*
             * Bán:
             * tiền ròng sau phí
             */

            if (
                t.type === "sell"
            ) {

                cash +=
                    Number(
                        t.net
                    ) || 0;

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
                    Number(
                        t.total
                    ) || 0;

            }
        );


    return Math.max(
        0,
        wallet
    );

}


/* ==================================================
   CASH INTEREST - SSI STYLE
==================================================

   SSI mới:

   - Lãi qua đêm
   - 4%/năm
   - Trả 1 lần/tháng

   V6:

   1. Tính số dư tiền mặt theo từng ngày.
   2. Chỉ số dư dương mới được tính.
   3. Lãi được tích lũy theo ngày.
   4. Cuối tháng mới "được trả".
   5. Lãi chưa đến kỳ trả không nhập vào tiền gốc.

================================================== */


/*
 * Tạo các biến động tiền mặt.
 */
function getCashEvents() {

    const events = [];


    data.deposits.forEach(
        d => {

            events.push({

                date:
                    d.date,

                delta:
                    Number(
                        d.amount
                    ) || 0,

                type:
                    "deposit"

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

                    date:
                        t.date,

                    delta:
                        -(
                            Number(
                                t.total
                            ) || 0
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
                        Number(
                            t.net
                        ) || 0,

                    type:
                        "sell"

                });

            }

        }
    );


    events.sort(
        (a, b) => {

            const dateResult =
                String(a.date)
                    .localeCompare(
                        String(b.date)
                    );


            if (
                dateResult !== 0
            )
                return dateResult;


            /*
             * Cùng ngày:
             *
             * Nạp trước
             * mua/bán sau
             *
             * Không ảnh hưởng lớn tới số ngày,
             * nhưng giúp logic ổn định.
             */

            const priority = {

                deposit: 0,

                sell: 1,

                buy: 2

            };


            return (
                (
                    priority[a.type] ?? 1
                )
                -
                (
                    priority[b.type] ?? 1
                )
            );

        }
    );


    return events;

}


/*
 * Tính lãi của một khoảng ngày.
 */
function calculateInterestForPeriod(
    balance,
    startDate,
    endDate,
    annualRate
) {

    const days =
        daysBetween(
            startDate,
            endDate
        );


    if (
        days <= 0 ||
        balance <= 0
    )
        return 0;


    return (
        balance *
        (
            Number(
                annualRate
            ) || 0
        ) /
        100 *
        days /
        365
    );

}


/*
 * Tính lãi đã phát sinh từ lịch sử.
 *
 * Trả về:
 *
 * {
 *    paid,
 *    pending,
 *    total
 * }
 */
function calculateCashInterestDetails() {

    const events =
        getCashEvents();


    if (
        !events.length
    ) {

        return {

            paid: 0,

            pending: 0,

            total: 0

        };

    }


    const now =
        today();


    /*
     * Chỉ tính từ event đầu tiên.
     */

    let balance = 0;

    let paidInterest = 0;

    let pendingInterest = 0;

    let previousDate =
        events[0].date;


    /*
     * Các event được xử lý theo ngày.
     */

    let index = 0;


    while (
        index < events.length
    ) {

        const eventDate =
            events[index].date;


        /*
         * Tính lãi từ previousDate
         * đến eventDate.
         */

        if (
            eventDate >
            previousDate
        ) {

            const interest =
                calculateInterestForPeriod(
                    Math.max(
                        0,
                        balance
                    ),
                    previousDate,
                    eventDate,
                    data.settings.interest
                );


            /*
             * Khoảng này thuộc tháng nào?
             *
             * Nếu kết thúc tại ngày đầu tháng,
             * phần tháng trước đã kết thúc.
             *
             * Để tính chính xác theo tháng,
             * xử lý theo từng đoạn nhỏ bên dưới.
             */

            const periodStart =
                parseLocalDate(
                    previousDate
                );

            const periodEnd =
                parseLocalDate(
                    eventDate
                );


            /*
             * Tách theo tháng.
             */

            let cursor =
                new Date(
                    periodStart
                );


            while (
                cursor <
                periodEnd
            ) {

                const y =
                    cursor.getFullYear();

                const m =
                    cursor.getMonth() + 1;


                const monthEnd =
                    parseLocalDate(
                        lastDayOfMonth(
                            y,
                            m
                        )
                    );


                /*
                 * Hết tháng vào ngày cuối.
                 *
                 * Ngày cuối vẫn thuộc tháng đó.
                 * Sang ngày đầu tháng mới mới kết thúc.
                 */

                const segmentEnd =
                    monthEnd <
                    periodEnd
                        ? new Date(
                            monthEnd.getTime()
                            + 86400000
                        )
                        : periodEnd;


                const segmentStartString =
                    cursor
                        .toISOString()
                        .slice(0, 10);

                const segmentEndString =
                    segmentEnd
                        .toISOString()
                        .slice(0, 10);


                const segmentInterest =
                    calculateInterestForPeriod(
                        Math.max(
                            0,
                            balance
                        ),
                        segmentStartString,
                        segmentEndString,
                        data.settings.interest
                    );


                /*
                 * Nếu segmentEnd là ngày đầu tháng:
                 * tháng cũ đã hoàn thành.
                 *
                 * Nếu segmentEnd là hôm nay:
                 * phần tháng hiện tại chưa trả.
                 */

                const endIsMonthStart =
                    segmentEnd.getDate() === 1;


                const isToday =
                    segmentEndString === now;


                if (
                    endIsMonthStart &&
                    !isToday
                ) {

                    paidInterest +=
                        segmentInterest;

                } else {

                    pendingInterest +=
                        segmentInterest;

                }


                cursor =
                    new Date(
                        segmentEnd
                    );

            }

        }


        /*
         * Tất cả event cùng ngày
         * được áp dụng.
         */

        while (
            index < events.length &&
            events[index].date === eventDate
        ) {

            balance +=
                events[index].delta;

            index++;

        }


        previousDate =
            eventDate;

    }


    /*
     * Tính từ event cuối đến hôm nay.
     */

    if (
        previousDate <
        now
    ) {

        let cursor =
            parseLocalDate(
                previousDate
            );

        const end =
            parseLocalDate(
                now
            );


        while (
            cursor < end
        ) {

            const y =
                cursor.getFullYear();

            const m =
                cursor.getMonth() + 1;


            const monthEnd =
                parseLocalDate(
                    lastDayOfMonth(
                        y,
                        m
                    )
                );


            const segmentEnd =
                monthEnd <
                end
                    ? new Date(
                        monthEnd.getTime()
                        + 86400000
                    )
                    : end;


            const startString =
                cursor
                    .toISOString()
                    .slice(0, 10);

            const endString =
                segmentEnd
                    .toISOString()
                    .slice(0, 10);


            const interest =
                calculateInterestForPeriod(
                    Math.max(
                        0,
                        balance
                    ),
                    startString,
                    endString,
                    data.settings.interest
                );


            /*
             * Vì hôm nay chưa kết thúc tháng
             * nên phần này chưa trả.
             */

            pendingInterest +=
                interest;


            cursor =
                new Date(
                    segmentEnd
                );

        }

    }


    const total =
        paidInterest +
        pendingInterest;


    return {

        paid:
            Math.max(
                0,
                paidInterest
            ),

        pending:
            Math.max(
                0,
                pendingInterest
            ),

        total:
            Math.max(
                0,
                total
            )

    };

}


/*
 * Hàm cũ được giữ lại để tương thích
 * với phần còn lại của app.
 */
function calculateCashInterest() {

    return calculateCashInterestDetails()
        .total;

}


/* ==================================================
   CUSTODY
================================================== */


/*
 * Phí lưu ký thực tế.
 *
 * Mỗi lot tính riêng:
 *
 * qty × 0.009 × số ngày.
 *
 * Lot cổ tức CP cũng có ngày riêng.
 */
function calculateCustodyFee() {

    if (
        !data.settings.custodyEnabled
    )
        return 0;


    let total = 0;


    getSymbols().forEach(
        symbol => {

            const lots =
                getHoldingLots(
                    symbol
                );


            lots.forEach(
                lot => {

                    const qty =
                        Number(
                            lot.qty
                        ) || 0;


                    const days =
                        holdingDaysFrom(
                            lot.date
                        );


                    total +=
                        qty *
                        (
                            Number(
                                data.settings.custody
                            ) || 0
                        ) *
                        days;

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
 * Chi tiết phí lưu ký theo mã.
 */
function calculateCustodyBySymbol(
    symbol
) {

    if (
        !data.settings.custodyEnabled
    )
        return 0;


    return getHoldingLots(
        symbol
    )
        .reduce(
            (sum, lot) => {

                const qty =
                    Number(
                        lot.qty
                    ) || 0;


                const days =
                    holdingDaysFrom(
                        lot.date
                    );


                return (
                    sum +
                    qty *
                    (
                        Number(
                            data.settings.custody
                        ) || 0
                    ) *
                    days
                );

            },
            0
        );

}


/* ==================================================
   PORTFOLIO
================================================== */

function getPortfolio() {

    const result = [];


    getSymbols().forEach(
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
                calculateCustodyBySymbol(
                    symbol
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
        Number(
            form.qty.value
        );


    const price =
        Number(
            form.price.value
        );


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


    /* ==============================================
       MUA
    ============================================== */

    if (
        type === "buy"
    ) {

        const fee =
            calculateTradingFee(
                value,
                "buy"
            );


        const total =
            value +
            fee;


        /*
         * Mua bằng tiền mặt.
         */

        if (
            source === "cash" &&
            calculateCash() < total
        ) {

            throw new Error(
                "Không đủ tiền mặt."
            );

        }


        /*
         * Mua bằng ví cổ tức.
         */

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

            type:
                "buy",

            date,

            symbol,

            qty,

            price,

            fee,

            feeRate:
                getBuyFeeRate(),

            total,

            source,

            note:
                form.note.value.trim()

        });

    }


    /* ==============================================
       BÁN
    ============================================== */

    else {

        const holding =
            getHoldingQuantity(
                symbol
            );


        if (
            holding < qty
        ) {

            throw new Error(
                `Không đủ ${symbol} để bán.`
            );

        }


        /*
         * PHÍ BÁN:
         *
         * phí mua + 0.1%
         */

        const fee =
            calculateTradingFee(
                value,
                "sell"
            );


        const net =
            value -
            fee;


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
     * Kiểm tra FIFO.
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
        payDate <
        recordDate
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


    /*
     * CỔ TỨC TIỀN
     */

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


    /*
     * CỔ TỨC CP / CP THƯỞNG
     */

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

function deleteTransaction(
    id
) {

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


function deleteDividend(
    id
) {

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
                (
                    Number(
                        d.amount
                    ) || 0
                ),
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
                    (
                        Number(
                            d.cashTotal
                        ) || 0
                    ),
                0
            );


    const interestDetails =
        calculateCashInterestDetails();


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
                cash +
                wallet
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
            "Lãi tiền mặt đã nhận",
            money(
                interestDetails.paid
            )
        ],

        [
            "Lãi đang tích lũy",
            money(
                interestDetails.pending
            )
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
                        ${escapeHTML(
                            c[0]
                        )}
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


    if (
        !portfolio.length
    ) {

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

    if (
        !transactions.length
    ) {

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
                            Tiền ròng
                        </th>

                        <th>
                            Phí suất
                        </th>

                        <th>
                            Nguồn
                        </th>

                        <th></th>

                    </tr>

                </thead>


                <tbody>

                    ${sorted.map(
                        t => {

                            const feeRate =
                                Number(
                                    t.feeRate
                                ) ||
                                (
                                    t.type === "sell"
                                        ? getSellFeeRate()
                                        : getBuyFeeRate()
                                );


                            return `

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
                                    </td>


                                    <td>
                                        ${money(
                                            t.total
                                        )}
                                    </td>


                                    <td>

                                        ${
                                            t.type === "sell"
                                                ? money(
                                                    t.net
                                                )
                                                : money(
                                                    t.total
                                                )
                                        }

                                    </td>


                                    <td>
                                        ${number(
                                            feeRate,
                                            3
                                        )}%
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

                            `;

                        }
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


    if (
        !dividends.length
    ) {

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


    if (
        form.fee
    ) {

        form.fee.value =
            data.settings.fee;

    }


    if (
        form.custody
    ) {

        form.custody.value =
            data.settings.custody;

    }


    if (
        form.interest
    ) {

        form.interest.value =
            data.settings.interest;

    }


    if (
        form.custodyEnabled
    ) {

        form.custodyEnabled.checked =
            !!data.settings.custodyEnabled;

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


    if (
        !cash ||
        !stock
    )
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


    if (
        form.date
    ) {

        form.date.value =
            today();

    }


    if (
        form.type
    ) {

        form.type.value =
            "buy";

    }


    if (
        form.source
    ) {

        form.source.value =
            "cash";

        form.source.disabled =
            false;

    }

}


/* ==================================================
   BACKUP
================================================== */

function backupJSON() {

    const backup = {

        version: 6,

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
        `dautucotuc_backup_${today()}.json`;


    document.body.appendChild(
        link
    );


    link.click();


    link.remove();


    URL.revokeObjectURL(
        url
    );


    toast(
        "Đã xuất backup."
    );

}


/* ==================================================
   RESTORE
================================================== */

async function restoreJSON(
    file
) {

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
                clone(
                    DEFAULT_DATA
                ),
                restored
            );


        /*
         * Đảm bảo V6 có các settings mới.
         */

        if (
            typeof data.settings.sellFeeExtra !==
            "number"
        ) {

            data.settings.sellFeeExtra =
                0.1;

        }


        if (
            !data.settings.interestPayment
        ) {

            data.settings.interestPayment =
                "monthly";

        }


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
        clone(
            DEFAULT_DATA
        );


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
 * Tính theo số dư tiền mặt.
 *
 * Không cộng lãi vào gốc trong cùng năm.
 *
 * Tiền lãi cuối năm được cộng vào cash.
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


    const opening =
        Math.max(
            0,
            Number(
                openingCash
            ) || 0
        );


    const monthly =
        Math.max(
            0,
            Number(
                monthlyContribution
            ) || 0
        );


    /*
     * Tiền có sẵn đầu năm:
     * hưởng đủ năm.
     */

    const openingInterest =
        opening *
        rate;


    let contributionInterest = 0;


    /*
     * Giả định tiền nạp vào cuối mỗi tháng.
     *
     * Tháng 1:
     * còn 11 tháng.
     *
     * Tháng 12:
     * còn 0 tháng.
     */

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
    price,
    custody
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
     *
     * Mặc định lấy settings hiện tại.
     */

    const custodyRate =
        Math.max(
            0,
            Number(
                options.custodyRate ??
                data.settings.custody
            ) || 0
        );


    const custodyEnabled =
        options.custodyEnabled !== undefined
            ? !!options.custodyEnabled
            : !!data.settings.custodyEnabled;


    let cash =
        Math.max(
            0,
            Number(
                options.initialCash
            ) || 0
        );


    const lots = [];


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

        /*
         * Giá hiện tại.
         */

        const sourceCurrentPrice =
            sourcePrice *
            Math.pow(
                1 +
                sourcePriceGrowth /
                100,
                year - 1
            );


        const targetCurrentPrice =
            targetPrice *
            Math.pow(
                1 +
                targetPriceGrowth /
                100,
                year - 1
            );


        /*
         * Cổ tức hiện tại.
         */

        const sourceCurrentDividend =
            sourceDividend *
            Math.pow(
                1 +
                dividendGrowth /
                100,
                year - 1
            );


        const targetCurrentDividend =
            targetDividend *
            Math.pow(
                1 +
                targetDividendGrowth /
                100,
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

        let targetSharesStart =
            0;


        let yearlyTargetDividend =
            0;


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
            year <=
            contributionYears
                ? monthlyMoney *
                  12
                : 0;


        /* ------------------------------------------
           LÃI TIỀN MẶT
        ------------------------------------------ */

        const interest =
            calculateYearInterest(
                cash,
                year <=
                    contributionYears
                    ? monthlyMoney
                    : 0,
                cashInterest
            );


        /*
         * Lãi được ghi nhận cuối năm.
         */

        cash +=
            interest;


        totalInterest +=
            interest;


        /* ------------------------------------------
           NẠP TIỀN
        ------------------------------------------ */

        cash +=
            contribution;


        totalContribution +=
            contribution;


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
           MUA CP ĐÍCH
           
           CHỈ MUA LÔ 100
        ------------------------------------------ */

        let purchaseMoney =
            0;


        let buyShares =
            0;


        if (
            year <=
            reinvestYears &&
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
                    possible /
                    100
                ) *
                100;


            purchaseMoney =
                buyShares *
                targetCurrentPrice;


            /*
             * Trừ tiền mua.
             *
             * Phí mua dự phóng được tính luôn.
             */

            const buyFee =
                calculateTradingFee(
                    purchaseMoney,
                    "buy"
                );


            const totalPurchase =
                purchaseMoney +
                buyFee;


            /*
             * Nếu lô 100 + phí không đủ:
             * giảm xuống một lô.
             */

            if (
                totalPurchase >
                cash
            ) {

                buyShares =
                    Math.max(
                        0,
                        buyShares -
                        100
                    );


                purchaseMoney =
                    buyShares *
                    targetCurrentPrice;

            }


            const finalBuyFee =
                calculateTradingFee(
                    purchaseMoney,
                    "buy"
                );


            const finalPurchase =
                purchaseMoney +
                finalBuyFee;


            cash -=
                finalPurchase;


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
                finalPurchase;

        }


        /* ------------------------------------------
           PHÍ LƯU KÝ
           
           Tính theo thời gian nắm giữ
           trong từng năm.
        ------------------------------------------ */

        let yearlyCustody =
            0;


        if (
            custodyEnabled
        ) {

            lots.forEach(
                lot => {

                    /*
                     * Lot mua trong năm:
                     * tính số ngày còn lại của năm.
                     *
                     * Lot cũ:
                     * tính đủ 365/366 ngày.
                     */

                    let holdingDays = 0;


                    if (
                        lot.yearBought <
                        year
                    ) {

                        holdingDays =
                            (
                                new Date(
                                    year,
                                    0,
                                    1
                                )
                                -
                                new Date(
                                    year - 1,
                                    0,
                                    1
                                )
                            ) /
                            86400000;

                    } else {

                        /*
                         * Giả định mua giữa năm:
                         * lô mua trong năm được xem là
                         * mua tại đầu năm của mô hình.
                         *
                         * Tuy nhiên để tránh tính phí
                         * cho cả năm như một lot cũ,
                         * dùng 50% năm cho lot mới.
                         *
                         * Phần này giúp dự phóng không
                         * bỏ qua hoàn toàn phí lưu ký.
                         */

                        holdingDays =
                            365 / 2;

                    }


                    yearlyCustody +=
                        lot.shares *
                        custodyRate *
                        holdingDays;

                }
            );

        }


        /*
         * Phí lưu ký là chi phí:
         * trừ trực tiếp khỏi tiền mặt.
         */

        cash -=
            yearlyCustody;


        /*
         * Không cho âm do phí nhỏ.
         */

        if (
            cash < 0 &&
            cash > -0.000001
        ) {

            cash = 0;

        }


        totalCustody +=
            yearlyCustody;


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
                yearlyCustody,

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


    if (
        !input.source
    ) {

        alert(
            "Hãy nhập CP nguồn."
        );

        return;

    }


    if (
        !input.target
    ) {

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
            0,

        /*
         * Phí lưu ký V6
         */

        custodyRate:
            data.settings.custody,

        custodyEnabled:
            data.settings.custodyEnabled

    };


    /*
     * YẾU
     */

    const weak =
        calculateProjectionScenario({

            ...base,

            sourceDividend:
                input.sourceWeak,

            targetDividend:
                input.targetWeak

        });


    /*
     * TRUNG BÌNH
     */

    const medium =
        calculateProjectionScenario({

            ...base,

            sourceDividend:
                input.sourceMedium,

            targetDividend:
                input.targetMedium

        });


    /*
     * CAO
     */

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
                        result
