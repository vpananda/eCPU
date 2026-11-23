import { Linking, Platform } from "react-native";

export function formatWhatsAppPhone(phone?: string | null): string {
  if (!phone) return "";
  // Strip everything except digits
  let digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  // If user entered 0 at start of 10 digits e.g. 09842100000 -> 9842100000
  if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  // Standard Indian 10-digit number -> add 91 prefix
  if (digits.length === 10) {
    return "91" + digits;
  }
  return digits;
}

export function formatDisplayPhone(phone?: string | null): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  return phone;
}

export const DISCLAIMERS_BY_LANG: Record<string, { wa: string; sms: string }> = {
  en: {
    wa: "⚠️ *Disclaimer:* For any dispute, discrepancy, or missing produce/weight, please contact your store in-charge immediately.",
    sms: "Disclaimer: For any dispute or missing, contact your store in-charge.",
  },
  ta: {
    wa: "⚠️ *Disclaimer / குறிப்பு:* For any dispute or missing produce, contact your store in-charge.\n_(ஏதேனும் முரண்பாடு அல்லது விடுபட்ட விவரங்களுக்கு உடனடியாக உங்கள் ஸ்டோர் இன்சார்ஜை தொடர்பு கொள்ளவும்)_",
    sms: "Disclaimer: ஏதேனும் முரண்பாடு அல்லது விடுபடலுக்கு ஸ்டோர் இன்சார்ஜை தொடர்பு கொள்ளவும்.",
  },
  ml: {
    wa: "⚠️ *Disclaimer / നിരാകരണം:* For any dispute or missing produce, contact your store in-charge.\n_(എന്തെങ്കിലും തർക്കമോ കുറവോ ഉണ്ടെങ്കിൽ ഉടൻ തന്നെ നിങ്ങളുടെ സ്റ്റോർ ഇൻ-ചാർജുമായി ബന്ധപ്പെടുക)_",
    sms: "Disclaimer: തർക്കങ്ങൾക്കോ കുറവുകൾക്കോ നിങ്ങളുടെ സ്റ്റോർ ഇൻ-ചാർജുമായി ബന്ധപ്പെടുക.",
  },
  kn: {
    wa: "⚠️ *Disclaimer / ಹಕ್ಕು ನಿರಾಕರಣೆ:* For any dispute or missing produce, contact your store in-charge.\n_(ಯಾವುದೇ ವಿವಾದ ಅಥವಾ ಕೊರತೆ ಇದ್ದಲ್ಲಿ ತಕ್ಷಣ ನಿಮ್ಮ ಸ್ಟೋರ್ ಇನ್‌ಚಾರ್ಜ್ ಅವರನ್ನು ಸಂಪರ್ಕಿಸಿ)_",
    sms: "Disclaimer: ಯಾವುದೇ ವಿವಾದ ಅಥವಾ ಕೊರತೆಗೆ ನಿಮ್ಮ ಸ್ಟೋರ್ ಇನ್‌ಚಾರ್ಜ್ ಅವರನ್ನು ಸಂಪರ್ಕಿಸಿ.",
  },
  te: {
    wa: "⚠️ *Disclaimer / గమనిక:* For any dispute or missing produce, contact your store in-charge.\n_(ఏదైనా వివాదం లేదా సరుకు/బరువు తేడా ఉంటే, దయచేసి వెంటనే మీ స్టోర్ ఇన్-ఛార్జ్ ను సంప్రదించండి)_",
    sms: "Disclaimer: ఏదైనా వివాదం లేదా కొరతకు మీ స్టోర్ ఇన్-ఛార్జ్ ను సంప్రదించండి.",
  },
  hi: {
    wa: "⚠️ *Disclaimer / अस्वीकरण:* For any dispute or missing produce, contact your store in-charge.\n_(किसी भी विवाद, विसंगति या कमी के लिए कृपया तुरंत अपने स्टोर इन-चार्ज से संपर्क करें)_",
    sms: "Disclaimer: किसी भी विवाद या कमी के लिए अपने स्टोर इन-चार्ज से संपर्क करें।",
  },
};

export function getCustomerDisclaimer(lang?: string): string {
  const code = (lang || "").toLowerCase();
  return (DISCLAIMERS_BY_LANG[code] || DISCLAIMERS_BY_LANG["ta"]).wa;
}

export function getSmsDisclaimer(lang?: string): string {
  const code = (lang || "").toLowerCase();
  return (DISCLAIMERS_BY_LANG[code] || DISCLAIMERS_BY_LANG["en"]).sms;
}

export const CUSTOMER_DISCLAIMER_TEXT = getCustomerDisclaimer("ta");
export const SMS_DISCLAIMER_TEXT = getSmsDisclaimer("en");

export async function openWhatsApp(phone: string, text: string): Promise<boolean> {
  const cleanPhone = formatWhatsAppPhone(phone);
  const encoded = encodeURIComponent(text);

  const nativeUrl = cleanPhone
    ? `whatsapp://send?phone=${cleanPhone}&text=${encoded}`
    : `whatsapp://send?text=${encoded}`;

  const webUrl = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;

  try {
    if (Platform.OS === "web") {
      window.open(webUrl, "_blank");
      return true;
    }
    const canOpen = await Linking.canOpenURL(nativeUrl);
    if (canOpen) {
      await Linking.openURL(nativeUrl);
      return true;
    } else {
      await Linking.openURL(webUrl);
      return true;
    }
  } catch (err) {
    console.warn("Failed to open WhatsApp native, trying web URL:", err);
    try {
      await Linking.openURL(webUrl);
      return true;
    } catch (e2) {
      console.error("Failed to open WhatsApp:", e2);
      return false;
    }
  }
}

export async function openSMS(phone: string, text: string, lang?: string): Promise<boolean> {
  const digits = (phone || "").replace(/[^\d+]/g, "");
  let fullText = text;
  const lower = fullText.toLowerCase();
  if (!lower.includes("dispute") && !lower.includes("in-charge") && !lower.includes("in charge")) {
    fullText = `${fullText.trim()}\n\n${getSmsDisclaimer(lang)}`;
  }
  const encoded = encodeURIComponent(fullText);
  const separator = Platform.OS === "ios" ? "&" : "?";
  const url = digits
    ? `sms:${digits}${separator}body=${encoded}`
    : `sms:${separator}body=${encoded}`;

  try {
    await Linking.openURL(url);
    return true;
  } catch (err) {
    console.error("Failed to open SMS:", err);
    return false;
  }
}

export interface ArrivalNotificationParams {
  companyName?: string;
  branchName?: string;
  customerName: string;
  batchNo: string;
  receiptNo?: string;
  date: string;
  productName?: string;
  rawWeight: number | string;
  bags?: number | string;
  ratePerKg?: number | string;
  receivedFrom?: string;
  language?: string;
}

export function buildArrivalMessage(p: ArrivalNotificationParams): string {
  const branch = p.branchName ? `📍 Branch: ${p.branchName}\n` : "";
  const bagsText = p.bags && Number(p.bags) > 0 ? ` (${p.bags} Bags)` : "";
  const rateText = p.ratePerKg ? `\n💰 Drying Rate: ₹${Number(p.ratePerKg).toFixed(2)} / KG` : "";
  const recvText = p.receivedFrom && p.receivedFrom !== p.customerName ? `\n🚚 Received From: ${p.receivedFrom}` : "";

  return (
    `*${p.companyName || "E3 AGRO"}*\n` +
    `${branch}` +
    `🌾 *Produce Arrival Receipt / எடை ரசீது*\n` +
    `--------------------------------\n` +
    `👤 Customer: *${p.customerName}*\n` +
    `📦 Batch No: *${p.batchNo}*${p.receiptNo ? ` (Ref: ${p.receiptNo})` : ""}\n` +
    `📅 Date: ${p.date}\n` +
    `🌱 Produce: ${p.productName || "Cardamom"}\n` +
    `⚖️ Wet Weight: *${Number(p.rawWeight).toFixed(2)} KG*${bagsText}` +
    `${rateText}` +
    `${recvText}\n` +
    `--------------------------------\n` +
    `_Your produce has been received safely at our factory for drying. We will notify you once processing is complete. Thank you!_\n\n` +
    `${getCustomerDisclaimer(p.language)}`
  );
}

export interface PaymentNotificationParams {
  companyName?: string;
  branchName?: string;
  customerName: string;
  amount: number | string;
  mode: string;
  date: string;
  batchNo?: string;
  remarks?: string;
  balanceDue?: number | string;
  language?: string;
}

export function buildPaymentReceiptMessage(p: PaymentNotificationParams): string {
  const branch = p.branchName ? `📍 Branch: ${p.branchName}\n` : "";
  const batchText = p.batchNo && p.batchNo !== "Advance" ? `\n📦 Batch Ref: ${p.batchNo}` : "";
  const remText = p.remarks ? `\n📝 Remarks: ${p.remarks}` : "";
  const balText =
    p.balanceDue !== undefined && Number(p.balanceDue) > 0
      ? `\n⚖️ Outstanding Balance: *₹${Number(p.balanceDue).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}*`
      : "";

  return (
    `*${p.companyName || "E3 AGRO"}*\n` +
    `${branch}` +
    `🧾 *Payment Receipt / கட்டண ரசீது*\n` +
    `--------------------------------\n` +
    `👤 Customer: *${p.customerName}*\n` +
    `💵 Amount Received: *₹${Number(p.amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}*\n` +
    `💳 Payment Mode: *${p.mode}*\n` +
    `📅 Date: ${p.date}` +
    `${batchText}` +
    `${remText}` +
    `${balText}\n` +
    `--------------------------------\n` +
    `_Thank you! We have received your payment._\n\n` +
    `${getCustomerDisclaimer(p.language)}`
  );
}


export interface StatementReminderParams {
  companyName?: string;
  branchName?: string;
  customerName: string;
  date?: string;
  totalBilled: number | string;
  totalReceived: number | string;
  balanceDue: number | string;
  frequencyLabel?: string;
  customNote?: string;
  language?: string;
}

export function buildStatementReminderMessage(p: StatementReminderParams): string {
  const branch = p.branchName ? `📍 Branch: ${p.branchName}\n` : "";
  const title = p.frequencyLabel
    ? `📄 *${p.frequencyLabel} / கணக்கு அறிக்கை*`
    : `📄 *Account Statement / கணக்கு அறிக்கை*`;
  const dateStr = p.date || new Date().toISOString().slice(0, 10);
  const note = p.customNote ? `\n📝 Note: ${p.customNote}\n` : "";

  return (
    `*${p.companyName || "E3 AGRO"}*\n` +
    `${branch}` +
    `${title}\n` +
    `--------------------------------\n` +
    `👤 Customer: *${p.customerName}*\n` +
    `📅 As on: ${dateStr}\n` +
    `--------------------------------\n` +
    `📦 Total Incurred / Billed: *₹${Number(p.totalBilled).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}*\n` +
    `💵 Total Received / Paid: *₹${Number(p.totalReceived).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}*\n` +
    `⚖️ *Pending Balance Due: ₹${Number(p.balanceDue).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}*\n` +
    `--------------------------------` +
    `${note}` +
    `\n_Kindly review and clear any pending balance at your earliest convenience._\n\n` +
    `${getCustomerDisclaimer(p.language)}`
  );
}

export interface WeeklyStatementBatchItem {
  sl_no?: number;
  batch_no: string;
  date_str: string; // "DD.MM.YY"
  raw_weight: number;
  actual_dry_weight?: number | null;
  padi_weight?: number | null;
  bill_amount: number;
  status: string;
}

export interface WeeklyStatementParams {
  companyName?: string;
  branchName?: string;
  customerName: string;
  customerCode?: string;
  customerMobile?: string;
  date?: string;
  batches: WeeklyStatementBatchItem[];
  totalPaid?: number;
  customNote?: string;
  language?: string;
}

export function buildWeeklyStatementTableMessage(p: WeeklyStatementParams): string {
  const branch = p.branchName ? `📍 Branch: ${p.branchName}\n` : "";
  const codeText = p.customerCode ? ` (${p.customerCode})` : "";
  const dateStr = p.date || new Date().toISOString().slice(0, 10);
  const note = p.customNote ? `\n📝 Note: ${p.customNote}\n` : "";

  const lines: string[] = [
    `*${p.companyName || "E3 AGRO"} - WEEKLY STATEMENT*`,
  ];
  if (branch) lines.push(branch.trim());
  lines.push(`👤 Customer: *${p.customerName}*${codeText}`);
  if (p.customerMobile) lines.push(`📱 Phone: ${p.customerMobile}`);
  lines.push(`📅 Date: ${dateStr}`);
  lines.push("");
  lines.push("```");
  lines.push("Sl|Date    |Arrival|Proc  |Padi|Amount ");
  lines.push("--+--------+-------+------+----+-------");

  let totWet = 0;
  let totDry = 0;
  let totBilled = 0;
  let padiSum = 0;
  let padiCount = 0;
  let dryingCount = 0;
  let readyCount = 0;
  let deliveredCount = 0;

  (p.batches || []).forEach((b, idx) => {
    const sl = String(b.sl_no || idx + 1).padStart(2, "0");
    const dStr = (b.date_str || " - ").slice(0, 8).padEnd(8, " ");
    const raw = Number(b.raw_weight || 0);
    totWet += raw;
    const rawStr = (raw < 1000 ? `${Math.round(raw)}k` : `${Math.round(raw)}`).padStart(5, " ") + " ";

    let procStr = "  -   ";
    if (b.status === "In Queue" || b.status === "Drying") {
      procStr = "Drying";
      dryingCount += 1;
    } else if (b.actual_dry_weight && Number(b.actual_dry_weight) > 0) {
      const dryVal = Number(b.actual_dry_weight);
      totDry += dryVal;
      procStr = dryVal.toFixed(1).padStart(6, " ");
      if (b.status === "Delivered") {
        deliveredCount += 1;
      } else {
        readyCount += 1;
      }
    }

    let padiStr = "  - ";
    const padi = Number(b.padi_weight || 0);
    if (padi > 0) {
      padiStr = String(Math.round(padi)).padStart(4, " ");
      padiSum += padi;
      padiCount += 1;
    }

    const amt = Number(b.bill_amount || 0);
    totBilled += amt;
    const amtStr = amt > 0 ? `₹${Math.round(amt).toLocaleString("en-IN")}`.padStart(7, " ") : "   -   ";

    lines.push(`${sl}|${dStr}|${rawStr}|${procStr}|${padiStr}|${amtStr}`);
  });

  lines.push("```");

  const totalPaid = Number(p.totalPaid || 0);
  const balDue = Math.max(0, totBilled - totalPaid);
  const avgPadi = padiCount > 0 ? (padiSum / padiCount).toFixed(0) : null;

  lines.push("--------------------------------");
  lines.push("📊 *SUMMARY TOTALS*");
  lines.push(`• Total Arrival Wet : *${totWet.toLocaleString("en-IN", { maximumFractionDigits: 1 })} kg*`);
  lines.push(`• Processed Dry     : *${totDry.toLocaleString("en-IN", { maximumFractionDigits: 1 })} kg*`);
  if (avgPadi) {
    lines.push(`• Average Padi Wt   : *${avgPadi} g/L*`);
  }
  if (readyCount > 0) {
    lines.push(`• Ready for Delivery: *${readyCount} Lots*`);
  }
  if (dryingCount > 0) {
    lines.push(`• In Drying Process : *${dryingCount} Lots*`);
  }
  if (deliveredCount > 0) {
    lines.push(`• Delivered Lots    : *${deliveredCount} Lots*`);
  }
  lines.push(`• Total Bill Amount : *₹${totBilled.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}*`);
  lines.push(`• Total Paid        : *₹${totalPaid.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}*`);
  if (balDue > 0) {
    lines.push(`• 🔴 *Pending Balance: ₹${balDue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}*`);
  } else {
    lines.push(`• 🟢 *Balance Due: Fully Settled*`);
  }
  lines.push("--------------------------------");
  if (note) lines.push(note.trim());
  lines.push("_Kindly verify your lot weights and settle pending balance._");
  lines.push("");
  lines.push(getCustomerDisclaimer(p.language));

  return lines.join("\n");
}

