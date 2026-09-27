// Provisional v0.1 economy values.
// Keep tunable numbers here so gameplay code never hardcodes balance values.
export const BALANCE = Object.freeze({
  guestArrival: Object.freeze({
    firstDelayMs: 1200,
    repeatDelayMs: 4500,
  }),
  session: Object.freeze({
    durationMs: 10000,
    revenuePerGuest: 120,
  }),
});
