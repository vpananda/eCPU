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

export async function openSMS(phone: string, text: string): Promise<boolean> {
  const digits = (phone || "").replace(/[^\d+]/g, "");
  const encoded = encodeURIComponent(text);
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
}

export function buildArrivalMessage(p: ArrivalNotificationParams): string {
  const branch = p.branchName ? `📍 Branch: ${p.branchName}\n` : "";
  const bagsText = p.bags && Number(p.bags) > 0 ? ` (${p.bags} Bags)` : "";
  const rateText = p.ratePerKg ? `\n💰 Drying Rate: ₹${Number(p.ratePerKg).toFixed(2)} / KG` : "";
  const recvText = p.receivedFrom && p.receivedFrom !== p.customerName ? `\n🚚 Received From: ${p.receivedFrom}` : "";

  return (
    `*${p.companyName || "E3 SPICE PROCESSORS"}*\n` +
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
    `_Your produce has been received safely at our factory for drying. We will notify you once processing is complete. Thank you!_`
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
    `*${p.companyName || "E3 SPICE PROCESSORS"}*\n` +
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
    `_Thank you! We have received your payment._`
  );
}
