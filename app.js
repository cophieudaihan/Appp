/* ==================================================
   ĐẦU TƯ CỔ TỨC
   APP.JS
   VERSION 6

   NÂNG CẤP TỪ V5

   ==================================================

   GIAO DỊCH THỰC TẾ:

   - Phí mua = phí cài đặt
   - Phí bán = phí mua + 0.10%
   - Phí lưu ký tính theo ngày thực tế
   - Phí lưu ký cập nhật trực tiếp đến hôm nay
   - Cổ phiếu bán theo FIFO
   - Bán một phần lot vẫn giữ ngày mua của phần còn lại
   - Cổ phiếu cổ tức bắt đầu tính lưu ký từ ngày nhận

   TIỀN MẶT:

   - Tiền mặt từ nạp tiền
   - Tiền bán cổ phiếu
   - Trừ tiền mua
   - Trừ phí giao dịch
   - Lãi tiền mặt 4%/năm
   - Lãi tính theo số dư thực tế
   - Lãi được ghi nhận theo tháng
   - Lãi tiếp tục cộng vào tiền mặt

   DỰ PHÓNG:

   CP NGUỒN
       ↓
   CỔ TỨC NGUỒN
       ↓
   TIỀN MẶT
       ↓
   LÃI TIỀN
       ↓
   MUA CP ĐÍCH
       ↓
   LÔ 100 CP
       ↓
   CP ĐÍCH CŨ
       ↓
   CỔ TỨC CP ĐÍCH

   - CP mua trong năm không nhận cổ tức năm đó
   - Tiền thừa giữ lại
   - Tiền thừa tiếp tục sinh lãi
   - Có phí lưu ký dự phóng
   - Phí lưu ký được trừ khỏi tiền mặt
================================================== */

"use strict";


/* ==================================================
   STORAGE
================================================== */

const STORAGE_KEY =
    "dautucotuc_v6";


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

        /* Phí bán cộng thêm */
        sellFeeExtra: 0.10,

        /* Phí lưu ký:
           mặc định 0.009 đ/CP/ngày */
        custody: 0.009,

        /* Lãi tiền mặt */
        interest: 4,

        /* Bật / tắt phí lưu ký */
        custodyEnabled: true,

        /* Bật / tắt lãi tiền mặt */
        interestEnabled: true,

        /* Ngày bắt đầu tính lãi */
        interestStartDate: ""

    }

};


let data =
    loadData();


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


function number(
    value,
    digits = 0
) {

    return new Intl.NumberFormat(
        "vi-VN",
        {
            maximumFractionDigits:
                digits
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


function daysBetween(
    start,
    end
) {

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


function addDays(
    dateString,
    days
) {

    const date =
        new Date(
            dateString +
            "T00:00:00"
        );

    date.setDate(
        date.getDate() + days
    );

    return date
        .toISOString()
        .slice(0, 10);

}


function endOfMonth(
    dateString
) {

    const d =
        new Date(
            dateString +
            "T00:00:00"
        );

    return new Date(
        d.getFullYear(),
        d.getMonth() + 1,
        0
    )
        .toISOString()
        .slice(0, 10);

}


function startOfMonth(
    dateString
) {

    const d =
        new Date(
            dateString +
            "T00:00:00"
        );

    return new Date(
        d.getFullYear(),
        d.getMonth(),
        1
    )
        .toISOString()
        .slice(0, 10);

}


function isSameMonth(
    a,
    b
) {

    if (!a || !b)
        return false;

    return (
        a.slice(0, 7) ===
        b.slice(0, 7)
    );

}


function mergeData(
    base,
    source
) {

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
            return clone(
                DEFAULT_DATA
            );

        const parsed =
            JSON.parse(saved);

        return mergeData(
            clone(DEFAULT_DATA),
            parsed
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


function saveData()
