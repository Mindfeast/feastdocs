const CSI = String.fromCharCode(27) + '[';
const wrap = (code) => (value) => `${CSI}${code}m${value}${CSI}0m`;

export const dim = wrap(2);
export const bold = wrap(1);
export const red = wrap(31);
export const green = wrap(32);
export const yellow = wrap(33);
export const cyan = wrap(36);
