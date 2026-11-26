// Which pages never enter the index.
//
// Two layers:
//   1. Hard exclusions: host patterns the user keeps in settings (seeded with DEFAULT_EXCLUDES). A pattern is
//      a host ("chase.com" also matches "www.chase.com" and "secure.chase.com"), a "*.bank"-style suffix, or a
//      "mychart.*"-style prefix. Checked on the URL before anything is read from the page.
//   2. "Looks sensitive": a score over URL, title and in-page signals (password or payment fields, fields named
//      like SSN / routing / IBAN, card numbers that pass Luhn, SSN-shaped strings, banking and medical
//      phrases). The page script only returns counts; no page text leaves the page for this check.

export const DEFAULT_EXCLUDES = [
  // mail, chat and calendars
  "mail.google.com", "calendar.google.com", "outlook.live.com", "outlook.office.com", "outlook.office365.com",
  "mail.yahoo.com", "mail.proton.me", "app.fastmail.com", "web.whatsapp.com", "messages.google.com",
  "web.telegram.org", "app.slack.com", "teams.microsoft.com", "discord.com/channels",
  // accounts, passwords, payments
  "accounts.google.com", "myaccount.google.com", "pay.google.com", "payments.google.com", "wallet.google.com",
  "appleid.apple.com", "account.microsoft.com", "login.microsoftonline.com",
  "1password.com", "bitwarden.com", "lastpass.com", "dashlane.com",
  "paypal.com", "venmo.com", "cash.app", "wise.com", "stripe.com/dashboard", "zellepay.com",
  // banks, cards, brokerages, crypto
  "chase.com", "bankofamerica.com", "wellsfargo.com", "citi.com", "capitalone.com", "usbank.com", "pnc.com",
  "truist.com", "ally.com", "discover.com", "americanexpress.com", "schwab.com", "fidelity.com",
  "vanguard.com", "etrade.com", "morganstanley.com", "merrilledge.com", "robinhood.com", "sofi.com",
  "marcus.com", "synchrony.com", "navyfederal.org", "usaa.com", "tdbank.com", "citizensbank.com",
  "coinbase.com", "kraken.com", "binance.com", "*.bank",
  // tax, government, health, insurance
  "irs.gov", "ssa.gov", "healthcare.gov", "login.gov", "turbotax.intuit.com", "mint.intuit.com",
  "creditkarma.com", "experian.com", "equifax.com", "transunion.com", "mychart.*",
];

// "bank" and "creditunion" anywhere in a host label (firstcitizensbank.com, mybank.example); the rest as whole
// words between dots or hyphens, so investopedia.com and wealthsimple-blog style names are not caught.
const BANK_HOST = /bank|creditunion|(^|[.-])(fcu|cu|invest(ing|ments)?|brokerage|wealth|securities|insurance|pharmacy|patient|mychart|healthportal)([.-]|$)/i;
const SENSITIVE_PATH = /\/(login|log-in|signin|sign-in|signup|sign-up|auth|oauth2?|sso|checkout|payment|payments|billing|wallet|password|reset-password|2fa|mfa|verify|account\/security|settings\/security)(\/|$|\?|#)/i;
const SENSITIVE_TITLE = /\b(sign in|log ?in|checkout|payment|billing|your account|account summary|statement|balance|patient portal|lab results|tax return)\b/i;

// Normalise a pattern list entry: lowercase, no scheme, no trailing slash.
export function cleanPattern(p) {
  return String(p).trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/\/+$/, "");
}

// True when url matches one of the patterns.
export function matchesExclude(url, patterns) {
  let u;
  try { u = new URL(url); } catch { return false; }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const hostPath = host + u.pathname.toLowerCase();
  for (const raw of patterns) {
    const p = cleanPattern(raw);
    if (!p) continue;
    if (p.includes("/")) {                                   // host + path prefix
      const [h] = p.split("/");
      if ((host === h || host.endsWith("." + h)) && hostPath.startsWith(host + p.slice(h.length))) return true;
    } else if (p.startsWith("*.")) {                          // suffix, e.g. *.bank
      if (host.endsWith(p.slice(1))) return true;
    } else if (p.endsWith(".*")) {                            // prefix label, e.g. mychart.*
      const label = p.slice(0, -2);
      if (host === label || host.startsWith(label + ".") || host.includes("." + label + ".")) return true;
    } else if (host === p || host.endsWith("." + p)) {
      return true;
    }
  }
  return false;
}

// Checks that need only the URL. Returns null when the page may be read, else a reason string.
export function urlVerdict(url, { excludes = DEFAULT_EXCLUDES, auto = true } = {}) {
  let u;
  try { u = new URL(url); } catch { return "unparseable URL"; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "not a web page";
  if (matchesExclude(url, excludes)) return "excluded site";
  if (auto && BANK_HOST.test(u.hostname)) return "looks like a bank, health or insurance site";
  return null;
}

// Combine URL, title and page signals into a verdict. Returns null when the page may be indexed,
// else a short reason.
export function pageVerdict(url, title, s, { auto = true } = {}) {
  if (!auto) return null;
  const reasons = [];
  let score = 0;
  const add = (n, why) => { score += n; reasons.push(why); };
  if (s.payment) add(3, "payment fields");
  if (s.sensitiveFields) add(3, "fields for account, tax or ID numbers");
  if (s.cards) add(3, "card numbers");
  if (s.ssn) add(3, "SSN-like numbers");
  if (s.password) add(2, "password field");
  if (s.phrases >= 3) add(2, "banking or medical wording");
  else if (s.phrases >= 1) add(1, "banking or medical wording");
  try { if (SENSITIVE_PATH.test(new URL(url).pathname)) add(1, "login/checkout URL"); } catch {}
  if (SENSITIVE_TITLE.test(title || "")) add(1, "title");
  return score >= 3 ? reasons.join(", ") : null;
}

// Runs inside the page (chrome.scripting.executeScript, isolated world). Returns counts only.
export function pageSignals() {
  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const password = [...document.querySelectorAll('input[type="password"]')].some(visible);
  const payment = !!document.querySelector(
    'input[autocomplete^="cc-"], input[name*="cardnumber" i], input[name*="card_number" i], input[id*="cardnumber" i],' +
    ' input[name*="cvv" i], input[name*="cvc" i], iframe[src*="js.stripe.com"], iframe[name^="__privateStripe"],' +
    ' iframe[src*="braintree"], iframe[src*="adyen"]');
  const FIELD = /\b(ssn|social.?sec|routing|iban|swift|account.?(number|no|num)|acct.?(no|num)|tax.?id|tin\b|ein\b|date.?of.?birth|dob\b|passport|driver.?licen[sc]e|member.?id)/i;
  const sensitiveFields = [...document.querySelectorAll("input, select")].filter((e) => FIELD.test(
    [e.name, e.id, e.getAttribute("autocomplete"), e.getAttribute("aria-label"), e.getAttribute("placeholder")].join(" "))).length;
  const text = (document.body?.innerText || "").slice(0, 30000);
  const luhn = (d) => { let s = 0, alt = false; for (let i = d.length - 1; i >= 0; i--) { let n = +d[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } s += n; alt = !alt; } return s % 10 === 0; };
  let cards = 0;
  for (const m of text.matchAll(/\b(?:\d[ -]?){13,19}\b/g)) {
    const d = m[0].replace(/\D/g, "");
    if (d.length >= 13 && d.length <= 19 && !/^(\d)\1+$/.test(d) && luhn(d)) cards++;
  }
  const ssn = (text.match(/\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g) || []).length;
  const PHRASES = /available balance|current balance|account balance|statement balance|routing number|account number|pending transactions|recent transactions|minimum payment|credit limit|wire transfer|direct deposit|policy number|claim number|explanation of benefits|lab results|test results|diagnosis|prescription|medication list|patient portal|date of birth|social security/gi;
  const phrases = new Set((text.match(PHRASES) || []).map((x) => x.toLowerCase())).size;
  return { password, payment, sensitiveFields, cards, ssn, phrases };
}
