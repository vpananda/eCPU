import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  ScrollView,
  Alert,
  Platform,
} from "react-native";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Linking from "expo-linking";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import Calendar from "@/src/components/Calendar";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { openWhatsApp, buildPaymentReceiptMessage } from "@/src/utils/notifications";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/components/Toast";
import { useConfirm } from "@/src/components/ConfirmModal";

const MODE_COLORS: Record<string, string> = {
  Cash: "#43A047",
  UPI: "#7B1FA2",
  Bank: "#1565C0",
  Credit: "#F57C00",
};

const MODES = ["Cash", "UPI", "Bank", "Credit"];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartISO() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso ? iso.slice(0, 10) : "-";
  }
}

function fmtMonth(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", {
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso ? iso.slice(0, 7) : "-";
  }
}

const DATE_PRESETS = [
  { key: "all", label: "All" },
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "month", label: "This Month" },
  { key: "fy_25_26", label: "25-26" },
  { key: "fy_26_27", label: "26-27" },
];

type ViewMode = "cashbook" | "customer";
type CustomerSortOption = "amount_desc" | "amount_asc" | "name_asc" | "name_desc";

export default function PaymentsScreen() {
  const router = useRouter();
  const { user, branches, selectedBranchId, setSelectedBranchId } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const isAdminOrManager = user?.role === "Admin" || user?.role === "Manager";

  const [paymentsList, setPaymentsList] = useState<any[]>([]);
  const [expensesList, setExpensesList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftStart, setDraftStart] = useState<string>("");
  const [draftEnd, setDraftEnd] = useState<string>("");
  const [activePreset, setActivePreset] = useState("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [viewMode, setViewMode] = useState<ViewMode>("cashbook");
  const [customerSort, setCustomerSort] = useState<CustomerSortOption>("amount_desc");
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [sharingAction, setSharingAction] = useState(false);

  // Accordion expansion state
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Edit Payment State
  const [editingPayment, setEditingPayment] = useState<any | null>(null);
  const [editingExpense, setEditingExpense] = useState<any | null>(null);
  const [editExpenseAmount, setEditExpenseAmount] = useState("");
  const [editExpenseCategory, setEditExpenseCategory] = useState("Miscellaneous");
  const [editExpenseMode, setEditExpenseMode] = useState("Cash");
  const [editExpenseDate, setEditExpenseDate] = useState("");
  const [editExpenseVendor, setEditExpenseVendor] = useState("");
  const [editExpenseRemarks, setEditExpenseRemarks] = useState("");
  const [savingExpenseEdit, setSavingExpenseEdit] = useState(false);
  const [expenseCategories, setExpenseCategories] = useState<string[]>([]);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [categorySearchQuery, setCategorySearchQuery] = useState("");

  useEffect(() => {
    api<string[]>("/expense-categories")
      .then(cats => {
        if (Array.isArray(cats) && cats.length) {
          const defaults = [
            "Labor", "Electricity", "Diesel", "Firewood", "Machine Maintenance",
            "Repair", "Transport", "Packing", "Salary", "Tea", "Office Expense",
            "Bank Deposit / Transfer to Company", "Hand Loan Repayment", "Miscellaneous"
          ];
          const merged = Array.from(new Set([...cats, ...defaults])).sort((a, b) => a.localeCompare(b));
          setExpenseCategories(merged);
        }
      })
      .catch(() => {});
  }, []);

  const filteredCategories = useMemo(() => {
    const defaults = [
      "Labor", "Electricity", "Diesel", "Firewood", "Machine Maintenance",
      "Repair", "Transport", "Packing", "Salary", "Tea", "Office Expense",
      "Bank Deposit / Transfer to Company", "Hand Loan Repayment", "Miscellaneous"
    ];
    const base = expenseCategories.length ? expenseCategories : defaults;
    const combined = editExpenseCategory && !base.includes(editExpenseCategory)
      ? [editExpenseCategory, ...base]
      : base;
    if (!categorySearchQuery.trim()) return combined;
    const q = categorySearchQuery.toLowerCase();
    return combined.filter(c => c.toLowerCase().includes(q));
  }, [expenseCategories, editExpenseCategory, categorySearchQuery]);
  const [editAmount, setEditAmount] = useState("");
  const [editMode, setEditMode] = useState("Cash");
  const [editDate, setEditDate] = useState("");
  const [editRemarks, setEditRemarks] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const applyPreset = (key: string) => {
    setActivePreset(key);
    const today = new Date();
    let s = "";
    let e = "";

    if (key === "today") {
      s = todayISO();
      e = todayISO();
    } else if (key === "yesterday") {
      const d = new Date();
      d.setDate(today.getDate() - 1);
      s = d.toISOString().slice(0, 10);
      e = s;
    } else if (key === "month") {
      s = monthStartISO();
      e = todayISO();
    } else if (key === "fy_25_26") {
      s = "2025-04-01";
      e = "2026-03-31";
    } else if (key === "fy_26_27") {
      s = "2026-04-01";
      e = "2027-03-31";
    }

    setStartDate(s);
    setEndDate(e);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = [];
      if (selectedBranchId) params.push(`branch_id=${selectedBranchId}`);
      if (startDate) params.push(`start=${startDate}`);
      if (endDate) params.push(`end=${endDate}`);
      const qs = params.length ? `?${params.join("&")}` : "";

      const [pRes, eRes] = await Promise.all([
        api<any[]>(`/payments${qs}`),
        api<any[]>(`/expenses${qs}`).catch(() => []),
      ]);

      pRes.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      eRes.sort((a, b) => new Date(b.expense_date || b.created_at).getTime() - new Date(a.expense_date || a.created_at).getTime());

      setPaymentsList(pRes);
      setExpensesList(eRes);
    } catch (err: any) {
      toast.show(err.message || "Failed to load ledger data", "error");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, selectedBranchId, toast]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Filtered Payments
  const filteredPayments = useMemo(() => {
    if (!searchQuery) return paymentsList;
    const q = searchQuery.toLowerCase().trim();
    return paymentsList.filter(item => {
      const name = (item.customer_name || "").toLowerCase();
      const code = (item.customer_code || "").toLowerCase();
      const mob = (item.customer_mobile || "").toLowerCase();
      const batch = (item.batch_no || "").toLowerCase();
      const rem = (item.remarks || "").toLowerCase();
      return name.includes(q) || code.includes(q) || mob.includes(q) || batch.includes(q) || rem.includes(q);
    });
  }, [paymentsList, searchQuery]);

  // Filtered Expenses (for Cash Book)
  const filteredExpenses = useMemo(() => {
    if (!searchQuery) return expensesList;
    const q = searchQuery.toLowerCase().trim();
    return expensesList.filter(item => {
      const cat = (item.category || "").toLowerCase();
      const desc = (item.description || item.notes || "").toLowerCase();
      return cat.includes(q) || desc.includes(q);
    });
  }, [expensesList, searchQuery]);

  // Totals for Payments
  const paymentTotals = useMemo(() => {
    let total = 0;
    const byMode: Record<string, number> = { Cash: 0, UPI: 0, Bank: 0, Credit: 0 };
    for (const p of filteredPayments) {
      const amt = Number(p.amount) || 0;
      total += amt;
      const m = p.mode || "Cash";
      byMode[m] = (byMode[m] || 0) + amt;
    }
    return { total, byMode };
  }, [filteredPayments]);

  // Totals for Expenses
  const expenseTotals = useMemo(() => {
    let total = 0;
    for (const e of filteredExpenses) {
      total += Number(e.amount) || 0;
    }
    return { total };
  }, [filteredExpenses]);

  // Cash Book Unified Daybook (Inflows vs Outflows)
  const cashBookDays = useMemo(() => {
    const dayMap = new Map<string, { date: string; displayDate: string; inflows: any[]; outflows: any[]; totalIn: number; totalOut: number }>();

    // Add Inflows (Payments received)
    for (const p of filteredPayments) {
      const dKey = (p.created_at || "").slice(0, 10) || "Unknown";
      if (!dayMap.has(dKey)) {
        dayMap.set(dKey, {
          date: dKey,
          displayDate: fmtDate(p.created_at),
          inflows: [],
          outflows: [],
          totalIn: 0,
          totalOut: 0,
        });
      }
      const entry = dayMap.get(dKey)!;
      entry.inflows.push(p);
      entry.totalIn += Number(p.amount) || 0;
    }

    // Add Outflows (Expenses paid)
    for (const e of filteredExpenses) {
      const dKey = (e.expense_date || e.created_at || "").slice(0, 10) || "Unknown";
      if (!dayMap.has(dKey)) {
        dayMap.set(dKey, {
          date: dKey,
          displayDate: fmtDate(e.expense_date || e.created_at),
          inflows: [],
          outflows: [],
          totalIn: 0,
          totalOut: 0,
        });
      }
      const entry = dayMap.get(dKey)!;
      entry.outflows.push(e);
      entry.totalOut += Number(e.amount) || 0;
    }

    return Array.from(dayMap.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredPayments, filteredExpenses]);

  // Date-wise Payments
  const groupedByDate = useMemo(() => {
    const map = new Map<string, { date: string; displayDate: string; items: any[]; total: number }>();
    for (const item of filteredPayments) {
      const dKey = (item.created_at || "").slice(0, 10) || "Unknown";
      if (!map.has(dKey)) {
        map.set(dKey, {
          date: dKey,
          displayDate: fmtDate(item.created_at),
          items: [],
          total: 0,
        });
      }
      const entry = map.get(dKey)!;
      entry.items.push(item);
      entry.total += Number(item.amount) || 0;
    }
    return Array.from(map.values());
  }, [filteredPayments]);

  // Month-wise Payments
  const groupedByMonth = useMemo(() => {
    const map = new Map<string, { monthKey: string; displayMonth: string; items: any[]; total: number; byMode: Record<string, number> }>();
    for (const item of filteredPayments) {
      const mKey = (item.created_at || "").slice(0, 7) || "Unknown";
      if (!map.has(mKey)) {
        map.set(mKey, {
          monthKey: mKey,
          displayMonth: fmtMonth(item.created_at),
          items: [],
          total: 0,
          byMode: { Cash: 0, UPI: 0, Bank: 0, Credit: 0 },
        });
      }
      const entry = map.get(mKey)!;
      entry.items.push(item);
      const amt = Number(item.amount) || 0;
      entry.total += amt;
      const m = item.mode || "Cash";
      entry.byMode[m] = (entry.byMode[m] || 0) + amt;
    }
    return Array.from(map.values());
  }, [filteredPayments]);

  // Customer-wise Ledger with Multi-criteria Sorting
  const groupedByCustomer = useMemo(() => {
    const map = new Map<string, { customerId: string; name: string; code: string; mobile: string; items: any[]; total: number }>();
    for (const item of filteredPayments) {
      const cId = item.customer_id || item.customer_name || "Unknown";
      if (!map.has(cId)) {
        map.set(cId, {
          customerId: item.customer_id || "",
          name: item.customer_name || "Customer",
          code: item.customer_code || "",
          mobile: item.customer_mobile || "",
          items: [],
          total: 0,
        });
      }
      const entry = map.get(cId)!;
      entry.items.push(item);
      entry.total += Number(item.amount) || 0;
    }
    const list = Array.from(map.values());
    if (customerSort === "amount_desc") {
      return list.sort((a, b) => b.total - a.total);
    } else if (customerSort === "amount_asc") {
      return list.sort((a, b) => a.total - b.total);
    } else if (customerSort === "name_asc") {
      return list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    } else if (customerSort === "name_desc") {
      return list.sort((a, b) => (b.name || "").localeCompare(a.name || ""));
    }
    return list;
  }, [filteredPayments, customerSort]);

  // ==================== SHARE & EXPORT HELPERS ====================
  const generateShareSummaryText = () => {
    const branchName = selectedBranchId
      ? branches.find(b => b.id === selectedBranchId)?.name || "Branch"
      : "All Branches";
    const periodLabel = activePreset === "custom" && startDate && endDate
      ? `${startDate} to ${endDate}`
      : DATE_PRESETS.find(p => p.key === activePreset)?.label || "All Time";

    const totalIn = paymentTotals.total;
    const totalOut = expenseTotals.total;
    const netFlow = totalIn - totalOut;
    const cashInHand = paymentTotals.byMode["Cash"] || 0;

    let msg = `*E3 AGRO - CASH BOOK STATEMENT*\n`;
    msg += `*Branch:* ${branchName}\n`;
    msg += `*Period:* ${periodLabel}\n`;
    msg += `------------------------------------\n`;
    msg += `*CASH IN (Collections):* Rs. ${totalIn.toLocaleString("en-IN", { maximumFractionDigits: 2 })} (${filteredPayments.length} receipts)\n`;
    msg += `*CASH OUT (Expenses):* Rs. ${totalOut.toLocaleString("en-IN", { maximumFractionDigits: 2 })} (${filteredExpenses.length} factory vouchers)\n`;
    msg += `------------------------------------\n`;
    msg += `*NET CASH FLOW:* Rs. ${netFlow.toLocaleString("en-IN", { maximumFractionDigits: 2 })}\n`;
    msg += `*Physical Cash in Drawer:* Rs. ${cashInHand.toLocaleString("en-IN")}\n`;
    msg += `------------------------------------\n`;
    msg += `*Collections by Mode:*\n`;
    msg += `  Cash: Rs. ${(paymentTotals.byMode["Cash"] || 0).toLocaleString("en-IN")}\n`;
    msg += `  UPI: Rs. ${(paymentTotals.byMode["UPI"] || 0).toLocaleString("en-IN")}\n`;
    msg += `  Bank: Rs. ${(paymentTotals.byMode["Bank"] || 0).toLocaleString("en-IN")}\n\n`;

    if (cashBookDays.length > 0) {
      msg += `*Daily Summary (Recent Days):*\n`;
      cashBookDays.slice(0, 7).forEach(day => {
        const net = day.totalIn - day.totalOut;
        msg += `* ${day.displayDate}: In +Rs. ${day.totalIn.toLocaleString("en-IN")} | Out -Rs. ${day.totalOut.toLocaleString("en-IN")} (Net Rs. ${net.toLocaleString("en-IN")})\n`;
      });
    }

    msg += `\n_Generated via EThree CPU System_`;
    return msg;
  };

  const generateCsvContent = () => {
    const branchName = selectedBranchId
      ? branches.find(b => b.id === selectedBranchId)?.name || "Branch"
      : "All Branches";

    const rows: string[][] = [
      ["E3 AGRO - CASH BOOK TRANSACTIONS"],
      [`Branch: ${branchName}`, `Generated: ${new Date().toLocaleString("en-IN")}`],
      [],
      ["Date", "Flow Type", "Party / Category", "Batch / Voucher Ref", "Payment Mode", "Inflow (Rs.)", "Outflow (Rs.)", "Remarks / Notes"]
    ];

    const combined: any[] = [
      ...filteredPayments.map(p => ({
        date: (p.created_at || "").slice(0, 10),
        type: "INFLOW (Receipt)",
        party: p.customer_name || "Customer",
        ref: p.batch_no || p.receipt_no || "-",
        mode: p.mode || "Cash",
        inAmt: Number(p.amount) || 0,
        outAmt: 0,
        remarks: p.remarks || ""
      })),
      ...filteredExpenses.map(e => ({
        date: (e.expense_date || e.created_at || "").slice(0, 10),
        type: "OUTFLOW (Expense)",
        party: e.category || "Expense",
        ref: e.voucher_no || "-",
        mode: e.payment_mode || "Cash",
        inAmt: 0,
        outAmt: Number(e.amount) || 0,
        remarks: e.description || e.notes || e.remarks || e.vendor || ""
      }))
    ];

    combined.sort((a, b) => b.date.localeCompare(a.date));

    combined.forEach(r => {
      rows.push([
        r.date,
        r.type,
        `"${(r.party || "").replace(/"/g, '""')}"`,
        `"${(r.ref || "").replace(/"/g, '""')}"`,
        r.mode,
        r.inAmt ? r.inAmt.toFixed(2) : "0.00",
        r.outAmt ? r.outAmt.toFixed(2) : "0.00",
        `"${(r.remarks || "").replace(/"/g, '""')}"`
      ]);
    });

    rows.push([]);
    rows.push([
      "TOTAL",
      "",
      "",
      "",
      "",
      paymentTotals.total.toFixed(2),
      expenseTotals.total.toFixed(2),
      `NET: ${(paymentTotals.total - expenseTotals.total).toFixed(2)}`
    ]);

    return rows.map(r => r.join(",")).join("\r\n");
  };

  const generatePdfHtml = () => {
    const branchName = selectedBranchId
      ? branches.find(b => b.id === selectedBranchId)?.name || "All Branches"
      : "All Branches";
    const periodLabel = activePreset === "custom" && startDate && endDate
      ? `${startDate} to ${endDate}`
      : DATE_PRESETS.find(p => p.key === activePreset)?.label || "All Time";
    const net = paymentTotals.total - expenseTotals.total;

    const combined: any[] = [
      ...filteredPayments.map(p => ({
        date: (p.created_at || "").slice(0, 10),
        type: "INFLOW",
        party: p.customer_name || "Customer",
        ref: p.batch_no || p.receipt_no || "-",
        mode: p.mode || "Cash",
        inAmt: Number(p.amount) || 0,
        outAmt: 0,
        remarks: p.remarks || ""
      })),
      ...filteredExpenses.map(e => ({
        date: (e.expense_date || e.created_at || "").slice(0, 10),
        type: "OUTFLOW",
        party: e.category || "Expense",
        ref: e.voucher_no || "-",
        mode: e.payment_mode || "Cash",
        inAmt: 0,
        outAmt: Number(e.amount) || 0,
        remarks: e.description || e.notes || e.remarks || e.vendor || ""
      }))
    ];
    combined.sort((a, b) => b.date.localeCompare(a.date));

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Cash Book - ${branchName}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; padding: 28px; color: #1a1a1a; }
          .header { border-bottom: 2px solid #2E7D32; padding-bottom: 12px; margin-bottom: 20px; }
          .title { font-size: 22px; font-weight: bold; color: #2E7D32; margin: 0; }
          .sub { font-size: 13px; color: #555; margin-top: 4px; }
          .summary-box { display: flex; gap: 14px; margin-bottom: 22px; }
          .card { flex: 1; padding: 12px 14px; border-radius: 8px; background: #f8faf8; border: 1px solid #e0e7e0; }
          .card-label { font-size: 11px; color: #666; text-transform: uppercase; font-weight: 700; }
          .card-val { font-size: 19px; font-weight: 800; margin-top: 4px; }
          .inflow { color: #2E7D32; }
          .outflow { color: #D32F2F; }
          .net { color: ${net >= 0 ? "#2E7D32" : "#D32F2F"}; }
          table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 12px; }
          th { background: #f1f5f1; text-align: left; padding: 8px 10px; border-bottom: 1px solid #c8d6c8; font-weight: 700; color: #333; }
          td { padding: 8px 10px; border-bottom: 1px solid #eee; }
          .text-right { text-align: right; }
          .footer { margin-top: 28px; font-size: 11px; color: #888; text-align: center; border-top: 1px solid #eee; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="title">E3 AGRO &bull; CASH BOOK STATEMENT</h1>
          <div class="sub">Branch: <b>${branchName}</b> | Period: <b>${periodLabel}</b> | Date: ${new Date().toLocaleDateString("en-IN")}</div>
        </div>
        <div class="summary-box">
          <div class="card">
            <div class="card-label">Total Inflow (Collections)</div>
            <div class="card-val inflow">+Rs. ${paymentTotals.total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</div>
            <div style="font-size:11px; color:#666;">${filteredPayments.length} Receipts</div>
          </div>
          <div class="card">
            <div class="card-label">Total Outflow (Expenses)</div>
            <div class="card-val outflow">-Rs. ${expenseTotals.total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</div>
            <div style="font-size:11px; color:#666;">${filteredExpenses.length} Vouchers</div>
          </div>
          <div class="card">
            <div class="card-label">Net Cash Flow</div>
            <div class="card-val net">Rs. ${net.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</div>
            <div style="font-size:11px; color:#666;">Drawer Cash: Rs. ${(paymentTotals.byMode["Cash"] || 0).toLocaleString("en-IN")}</div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Party / Category</th>
              <th>Ref / Batch</th>
              <th>Mode</th>
              <th class="text-right">Inflow (Rs.)</th>
              <th class="text-right">Outflow (Rs.)</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            ${combined.map(r => `
              <tr>
                <td>${r.date}</td>
                <td style="font-weight:700; color: ${r.inAmt > 0 ? '#2E7D32' : '#D32F2F'}">${r.type}</td>
                <td><b>${r.party}</b></td>
                <td>${r.ref}</td>
                <td>${r.mode}</td>
                <td class="text-right" style="color:#2E7D32; font-weight:600;">${r.inAmt > 0 ? 'Rs. ' + r.inAmt.toFixed(2) : '-'}</td>
                <td class="text-right" style="color:#D32F2F; font-weight:600;">${r.outAmt > 0 ? 'Rs. ' + r.outAmt.toFixed(2) : '-'}</td>
                <td style="color:#666;">${r.remarks || ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="footer">EThree Processing Unit &bull; Confidential Accounts Ledger</div>
      </body>
      </html>
    `;
  };

  const handleShareWhatsApp = async () => {
    try {
      const msg = generateShareSummaryText();
      const enc = encodeURIComponent(msg);
      const nativeUrl = `whatsapp://send?text=${enc}`;
      const webUrl = `https://api.whatsapp.com/send?text=${enc}`;
      const canOpen = await Linking.canOpenURL(nativeUrl).catch(() => false);
      if (canOpen) {
        await Linking.openURL(nativeUrl);
      } else {
        await Linking.openURL(webUrl);
      }
      setShareModalOpen(false);
    } catch (err: any) {
      toast.show(err.message || "Failed to open WhatsApp", "error");
    }
  };

  const handleShareEmail = async () => {
    try {
      const branchName = selectedBranchId
        ? branches.find(b => b.id === selectedBranchId)?.name || "Branch"
        : "All Branches";
      const subject = `E3 Agro Cash Book Statement - ${branchName} (${todayISO()})`;
      const body = generateShareSummaryText().replace(/\*/g, "");
      const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      await Linking.openURL(mailto);
      setShareModalOpen(false);
    } catch (err: any) {
      toast.show(err.message || "Failed to open Email", "error");
    }
  };

  const handleExportExcel = async () => {
    try {
      setSharingAction(true);
      const csvData = generateCsvContent();
      const branchName = selectedBranchId
        ? (branches.find(b => b.id === selectedBranchId)?.name || "Branch").replace(/\s+/g, "_")
        : "All_Branches";
      const fileName = `E3_CashBook_${branchName}_${todayISO()}.csv`;

      if (Platform.OS === "web") {
        const blob = new Blob(["\uFEFF" + csvData], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.show("Excel CSV downloaded successfully");
      } else {
        const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
        await FileSystem.writeAsStringAsync(fileUri, "\uFEFF" + csvData, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: "text/csv",
            dialogTitle: `Share ${fileName}`,
            UTI: "public.comma-separated-values-text",
          });
        } else {
          toast.show("Sharing is not available on this device", "error");
        }
      }
      setShareModalOpen(false);
    } catch (err: any) {
      toast.show(err.message || "Failed to export Excel", "error");
    } finally {
      setSharingAction(false);
    }
  };

  const handleSharePDF = async () => {
    try {
      setSharingAction(true);
      const branchName = selectedBranchId
        ? (branches.find(b => b.id === selectedBranchId)?.name || "Branch").replace(/\s+/g, "_")
        : "All_Branches";
      const html = generatePdfHtml();

      if (Platform.OS === "web") {
        const printWindow = window.open("", "_blank");
        if (printWindow) {
          printWindow.document.write(html);
          printWindow.document.close();
          printWindow.focus();
          setTimeout(() => {
            printWindow.print();
          }, 300);
        } else {
          window.print();
        }
        toast.show("Print window opened. Select 'Save as PDF' to save and attach to WhatsApp Web or Email.");
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        const pdfName = `E3_CashBook_${branchName}_${todayISO()}.pdf`;
        const targetUri = `${FileSystem.cacheDirectory}${pdfName}`;
        try {
          await FileSystem.copyAsync({ from: uri, to: targetUri });
        } catch {
          // fallback if copy fails
        }
        const fileInfo = await FileSystem.getInfoAsync(targetUri).catch(() => null);
        const finalUri = (fileInfo && fileInfo.exists) ? targetUri : uri;

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(finalUri, {
            mimeType: "application/pdf",
            dialogTitle: `Share ${pdfName} to WhatsApp / Email`,
            UTI: "com.adobe.pdf",
          });
        } else {
          toast.show("Sharing is not available on this device", "error");
        }
      }
      setShareModalOpen(false);
    } catch (err: any) {
      toast.show(err.message || "Failed to generate PDF", "error");
    } finally {
      setSharingAction(false);
    }
  };

  const handlePrintDirect = async () => {
    try {
      setSharingAction(true);
      const html = generatePdfHtml();
      if (Platform.OS === "web") {
        const printWindow = window.open("", "_blank");
        if (printWindow) {
          printWindow.document.write(html);
          printWindow.document.close();
          printWindow.focus();
          setTimeout(() => {
            printWindow.print();
          }, 300);
        } else {
          window.print();
        }
      } else {
        await Print.printAsync({ html });
      }
      setShareModalOpen(false);
    } catch (err: any) {
      toast.show(err.message || "Failed to print", "error");
    } finally {
      setSharingAction(false);
    }
  };

  // Open Edit Modal
  const shareReceiptWhatsApp = async (item: any) => {
    const branchObj = branches.find(b => b.id === (item.branch_id || selectedBranchId));
    const branchName = branchObj ? branchObj.name : "Factory";
    const msg = buildPaymentReceiptMessage({
      companyName: "E3 SPICE PROCESSORS",
      branchName: branchName,
      customerName: item.customer_name || "Customer",
      amount: item.amount,
      mode: item.mode || "Cash",
      date: (item.created_at || "").slice(0, 10) || todayISO(),
      batchNo: item.batch_no || "General Account Credit",
      remarks: item.remarks || "",
    });
    await openWhatsApp(item.customer_mobile || "", msg);
  };

  const openEdit = (payment: any) => {
    setEditingPayment(payment);
    setEditAmount(String(payment.amount));
    setEditMode(payment.mode || "Cash");
    setEditDate((payment.created_at || "").slice(0, 10));
    setEditRemarks(payment.remarks || "");
  };

  // Open Edit Expense Modal
  const openEditExpense = (expense: any) => {
    setEditingExpense(expense);
    setEditExpenseAmount(String(expense.amount || ""));
    setEditExpenseCategory(expense.category || "Miscellaneous");
    setEditExpenseMode(expense.payment_mode || "Cash");
    setEditExpenseDate((expense.expense_date || expense.created_at || "").slice(0, 10));
    setEditExpenseVendor(expense.vendor || "");
    setEditExpenseRemarks(expense.remarks || expense.description || expense.notes || "");
    setCategoryDropdownOpen(false);
    setCategorySearchQuery("");
  };

  const handleSaveExpenseEdit = async () => {
    if (!editingExpense) return;
    const a = parseFloat(editExpenseAmount);
    if (isNaN(a) || a <= 0) {
      toast.show("Please enter a valid amount greater than 0", "error");
      return;
    }
    setSavingExpenseEdit(true);
    try {
      await api(`/expenses/${editingExpense.id}`, {
        method: "PUT",
        body: {
          amount: a,
          category: editExpenseCategory,
          payment_mode: editExpenseMode,
          expense_date: editExpenseDate || undefined,
          vendor: editExpenseVendor || undefined,
          remarks: editExpenseRemarks || undefined,
        },
      });
      toast.show("Expense updated successfully");
      setEditingExpense(null);
      load();
    } catch (e: any) {
      toast.show(e.message || "Failed to update expense", "error");
    } finally {
      setSavingExpenseEdit(false);
    }
  };

  const handleDeleteExpense = async () => {
    if (!editingExpense) return;
    const ok = await confirm({
      title: "Delete Expense Voucher",
      message: `Are you sure you want to permanently delete this expense voucher of Rs. ${editingExpense.amount}?`,
      confirmText: "Delete Voucher",
      destructive: true,
      icon: "trash-can-outline",
    });
    if (!ok) return;

    setSavingExpenseEdit(true);
    try {
      await api(`/expenses/${editingExpense.id}`, { method: "DELETE" });
      toast.show("Expense voucher deleted");
      setEditingExpense(null);
      load();
    } catch (e: any) {
      toast.show(e.message || "Failed to delete expense", "error");
    } finally {
      setSavingExpenseEdit(false);
    }
  };

  // Submit Edit
  const handleSaveEdit = async () => {
    if (!editingPayment) return;
    const a = parseFloat(editAmount);
    if (isNaN(a) || a <= 0) {
      toast.show("Please enter a valid amount greater than 0", "error");
      return;
    }
    setSavingEdit(true);
    try {
      await api(`/payments/${editingPayment.id}`, {
        method: "PUT",
        body: {
          amount: a,
          mode: editMode,
          remarks: editRemarks,
          created_at: editDate ? `${editDate}T12:00:00Z` : undefined,
        },
      });
      toast.show("Payment updated successfully");
      setEditingPayment(null);
      load();
    } catch (e: any) {
      toast.show(e.message || "Failed to update payment", "error");
    } finally {
      setSavingEdit(false);
    }
  };

  // Delete Payment
  const handleDeletePayment = async () => {
    if (!editingPayment) return;
    const ok = await confirm({
      title: "Delete Payment",
      message: `Are you sure you want to delete this payment of ₹${editingPayment.amount}? Batch totals will be automatically recalculated.`,
      confirmText: "Delete Payment",
      destructive: true,
      icon: "trash-can-outline",
    });
    if (!ok) return;

    setSavingEdit(true);
    try {
      await api(`/payments/${editingPayment.id}`, { method: "DELETE" });
      toast.show("Payment deleted");
      setEditingPayment(null);
      load();
    } catch (e: any) {
      toast.show(e.message || "Failed to delete payment", "error");
    } finally {
      setSavingEdit(false);
    }
  };

  // Render Payment Card
  const renderPaymentCard = (item: any) => (
    <View key={item.id} style={styles.item}>
      <View style={[styles.icon, { backgroundColor: `${MODE_COLORS[item.mode] || colors.primary}20` }]}>
        <MaterialCommunityIcons name="cash" size={20} color={MODE_COLORS[item.mode] || colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={styles.amount}>₹{Number(item.amount).toFixed(2)}</Text>
            <View style={[styles.modeChip, { backgroundColor: `${MODE_COLORS[item.mode] || colors.primary}20` }]}>
              <Text style={[styles.modeText, { color: MODE_COLORS[item.mode] || colors.primary }]}>{item.mode}</Text>
            </View>
          </View>
          {item.branch_name ? (
            <View style={styles.branchBadge}>
              <Text style={styles.branchBadgeText}>{item.branch_name}</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.meta}>
          {item.customer_name || "-"} {item.customer_code ? `(${item.customer_code})` : ""} · {item.batch_no}
        </Text>
        {item.remarks ? (
          <Text style={styles.remarksText} numberOfLines={1}>
            📝 {item.remarks}
          </Text>
        ) : null}
        <Text style={styles.date}>
          {new Date(item.created_at).toLocaleString("en-IN", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      </View>

      {isAdminOrManager && (
        <TouchableOpacity
          onPress={() => openEdit(item)}
          style={styles.editActionBtn}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.primary} />
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Cash Book</Text>
          <Text style={styles.subTitle}>
            {selectedBranchId ? (branches.find(b => b.id === selectedBranchId)?.name || "Branch") : "All Branches"} • Cash Flow & Ledgers
          </Text>
        </View>

        <TouchableOpacity
          style={styles.shareHeaderBtn}
          onPress={() => setShareModalOpen(true)}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="share-variant-outline" size={17} color={colors.primary} />
          <Text style={styles.shareHeaderBtnText}>Share / Export</Text>
        </TouchableOpacity>
      </View>

      {/* High-Visibility Large Action Buttons */}
      <View style={styles.mainActionRow}>
        <TouchableOpacity
          style={styles.bigActionBtnIn}
          onPress={() => router.push("/payment-form")}
          activeOpacity={0.85}
        >
          <View style={styles.bigActionIconWrapIn}>
            <MaterialCommunityIcons name="arrow-down-bold" size={20} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bigActionBtnText}>+ INFLOW</Text>
            <Text style={styles.bigActionBtnSub}>Receipt / Collection</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.bigActionBtnOut}
          onPress={() => router.push("/expense-form")}
          activeOpacity={0.85}
        >
          <View style={styles.bigActionIconWrapOut}>
            <MaterialCommunityIcons name="arrow-up-bold" size={20} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bigActionBtnText}>- OUTFLOW</Text>
            <Text style={styles.bigActionBtnSub}>Expense & Voucher</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* 2 Primary View Tabs */}
      <View style={styles.viewModeTabs}>
        <TouchableOpacity
          style={[styles.viewTab, viewMode === "cashbook" && styles.viewTabActive]}
          onPress={() => setViewMode("cashbook")}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="book-open-page-variant"
            size={16}
            color={viewMode === "cashbook" ? "#fff" : colors.textMuted}
          />
          <Text style={[styles.viewTabText, viewMode === "cashbook" && styles.viewTabTextActive]}>
            Cash Book (Date-wise)
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.viewTab, viewMode === "customer" && styles.viewTabActive]}
          onPress={() => setViewMode("customer")}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="account-group"
            size={16}
            color={viewMode === "customer" ? "#fff" : colors.textMuted}
          />
          <Text style={[styles.viewTabText, viewMode === "customer" && styles.viewTabTextActive]}>
            Customer Khata
          </Text>
        </TouchableOpacity>
      </View>

      {/* Date Presets Ribbon */}
      <View style={styles.dateFilterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateScroll}>
          {DATE_PRESETS.map(p => (
            <TouchableOpacity
              key={p.key}
              onPress={() => applyPreset(p.key)}
              style={[styles.datePill, activePreset === p.key && styles.datePillActive]}
              activeOpacity={0.8}
            >
              <Text style={[styles.datePillText, activePreset === p.key && styles.datePillTextActive]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            onPress={() => {
              setActivePreset("custom");
              setDraftStart(startDate);
              setDraftEnd(endDate);
              setPickerOpen(true);
            }}
            style={[styles.datePill, activePreset === "custom" && styles.datePillActive]}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons
              name="calendar-range"
              size={13}
              color={activePreset === "custom" ? "#fff" : colors.textMuted}
              style={{ marginRight: 3 }}
            />
            <Text style={[styles.datePillText, activePreset === "custom" && styles.datePillTextActive]}>
              {startDate && endDate ? `${startDate} to ${endDate}` : "Custom"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Search Bar */}
      <View style={styles.searchWrap}>
        <MaterialCommunityIcons name="magnify" size={20} color={colors.textMuted} />
        <TextInput
          testID="payments-search-input"
          style={styles.searchInput}
          placeholder="Search customer, batch, remarks, expense category..."
          placeholderTextColor={colors.textLight}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <MaterialCommunityIcons name="close-circle" size={18} color={colors.textLight} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Reconciliation / Ledger Hero Card */}
      {viewMode === "cashbook" ? (
        <View style={styles.cashBookSummaryCard}>
          <View style={styles.cashBookRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cashBookLabel}>Cash In (Receipts)</Text>
              <Text style={[styles.cashBookVal, { color: "#4CAF50" }]}>
                +₹{paymentTotals.total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              </Text>
              <Text style={styles.cashBookSub}>{filteredPayments.length} customer collections</Text>
            </View>
            <View style={{ width: 1, backgroundColor: colors.border, marginHorizontal: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cashBookLabel}>Cash Out (Expenses)</Text>
              <Text style={[styles.cashBookVal, { color: "#F44336" }]}>
                -₹{expenseTotals.total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              </Text>
              <Text style={styles.cashBookSub}>{filteredExpenses.length} factory vouchers</Text>
            </View>
          </View>

          {/* Net Flow & Cash Box Reconciliation */}
          <View style={styles.netCashRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.netCashLabel}>Net Cash Flow</Text>
              <Text style={[styles.netCashVal, { color: (paymentTotals.total - expenseTotals.total) >= 0 ? colors.primary : "#D32F2F" }]}>
                ₹{(paymentTotals.total - expenseTotals.total).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              </Text>
            </View>
            <View style={styles.cashInHandBox}>
              <Text style={styles.cashInHandLabel}>💵 Physical Cash In Drawer</Text>
              <Text style={styles.cashInHandVal}>
                ₹{(paymentTotals.byMode["Cash"] || 0).toLocaleString("en-IN")}
              </Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.totalCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.totalLabel}>Total Collections (Customer Payments)</Text>
            <Text style={styles.totalValue}>₹{paymentTotals.total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
              <Text style={styles.totalSub}>{filteredPayments.length} transactions</Text>
              {startDate && endDate ? (
                <Text style={styles.totalDateRange}>({startDate} - {endDate})</Text>
              ) : null}
            </View>

            {/* Reconciliation Breakdown */}
            <View style={styles.reconcileRow}>
              <View style={styles.reconcileChip}>
                <Text style={styles.reconcileChipLabel}>💵 Cash</Text>
                <Text style={styles.reconcileChipVal}>₹{(paymentTotals.byMode["Cash"] || 0).toLocaleString("en-IN")}</Text>
              </View>
              <View style={styles.reconcileChip}>
                <Text style={styles.reconcileChipLabel}>📱 UPI</Text>
                <Text style={styles.reconcileChipVal}>₹{(paymentTotals.byMode["UPI"] || 0).toLocaleString("en-IN")}</Text>
              </View>
              <View style={styles.reconcileChip}>
                <Text style={styles.reconcileChipLabel}>🏦 Bank</Text>
                <Text style={styles.reconcileChipVal}>₹{(paymentTotals.byMode["Bank"] || 0).toLocaleString("en-IN")}</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Main List */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.scrollList} showsVerticalScrollIndicator={false}>
          {/* 1. CASH BOOK (DAYBOOK DUAL FLOW) */}
          {viewMode === "cashbook" && (
            cashBookDays.length === 0 ? (
              <View style={styles.emptyContainer}>
                <MaterialCommunityIcons name="book-open-outline" size={44} color={colors.textLight} />
                <Text style={styles.empty}>No Cash Book transactions for this period</Text>
              </View>
            ) : (
              cashBookDays.map(day => {
                const isCollapsed = expandedSections[day.date] === true;
                const netDay = day.totalIn - day.totalOut;
                return (
                  <View key={day.date} style={styles.groupCard}>
                    <TouchableOpacity
                      style={styles.groupHeader}
                      onPress={() => toggleSection(day.date)}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.groupTitle}>{day.displayDate}</Text>
                        <Text style={styles.groupSub}>
                          {day.inflows.length} Receipts (+₹{day.totalIn.toLocaleString("en-IN")}) · {day.outflows.length} Expenses (-₹{day.totalOut.toLocaleString("en-IN")})
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={[styles.groupTotal, { color: netDay >= 0 ? "#2E7D32" : "#D32F2F" }]}>
                          {netDay >= 0 ? `+₹${netDay.toLocaleString("en-IN")}` : `-₹${Math.abs(netDay).toLocaleString("en-IN")}`}
                        </Text>
                        <Text style={{ fontSize: 10, color: netDay >= 0 ? "#2E7D32" : "#D32F2F", fontWeight: "600" }}>
                          {netDay >= 0 ? "Day Surplus" : "Day Deficit (Exp > In)"}
                        </Text>
                        <MaterialCommunityIcons
                          name={isCollapsed ? "chevron-down" : "chevron-up"}
                          size={18}
                          color={colors.textMuted}
                        />
                      </View>
                    </TouchableOpacity>

                    {!isCollapsed && (
                      <View style={styles.groupItemsContainer}>
                        {/* Receipts */}
                        {day.inflows.map(item => (
                          <View key={`in-${item.id}`} style={[styles.item, { borderLeftWidth: 3, borderLeftColor: "#4CAF50" }]}>
                            <View style={[styles.icon, { backgroundColor: "#E8F5E9" }]}>
                              <MaterialCommunityIcons name="arrow-down-left" size={20} color="#2E7D32" />
                            </View>
                            <View style={{ flex: 1 }}>
                              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                                <Text style={[styles.amount, { color: "#2E7D32" }]}>+₹{Number(item.amount).toFixed(2)}</Text>
                                <View style={[styles.modeChip, { backgroundColor: `${MODE_COLORS[item.mode] || colors.primary}20` }]}>
                                  <Text style={[styles.modeText, { color: MODE_COLORS[item.mode] || colors.primary }]}>{item.mode}</Text>
                                </View>
                              </View>
                              <Text style={styles.customerNameBold} numberOfLines={1}>
                                {item.customer_name || "Customer"}
                              </Text>
                              <Text style={styles.ledgerName}>Drying Income</Text>
                            </View>
                            {isAdminOrManager && (
                              <TouchableOpacity onPress={() => openEdit(item)} style={styles.editActionBtn}>
                                <MaterialCommunityIcons name="pencil-outline" size={16} color={colors.primary} />
                              </TouchableOpacity>
                            )}
                          </View>
                        ))}

                        {/* Expenses */}
                        {day.outflows.map(item => (
                          <View key={`out-${item.id}`} style={[styles.item, { borderLeftWidth: 3, borderLeftColor: "#F44336" }]}>
                            <View style={[styles.icon, { backgroundColor: "#FFEBEE" }]}>
                              <MaterialCommunityIcons name="arrow-up-right" size={20} color="#D32F2F" />
                            </View>
                            <View style={{ flex: 1 }}>
                              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                                <Text style={[styles.amount, { color: "#D32F2F" }]}>-₹{Number(item.amount).toFixed(2)}</Text>
                                <View style={[styles.modeChip, { backgroundColor: "#FFEBEE" }]}>
                                  <Text style={[styles.modeText, { color: "#D32F2F" }]}>{item.category || "Expense"}</Text>
                                </View>
                              </View>
                              <Text style={styles.meta}>
                                {item.vendor ? `${item.vendor} · ` : ""}{item.description || item.remarks || item.notes || "Factory Expense"}
                              </Text>
                              {item.payment_mode ? <Text style={styles.remarksText}>💳 Mode: {item.payment_mode}</Text> : null}
                            </View>
                            {isAdminOrManager && (
                              <TouchableOpacity onPress={() => openEditExpense(item)} style={styles.editActionBtn}>
                                <MaterialCommunityIcons name="pencil-outline" size={16} color={colors.primary} />
                              </TouchableOpacity>
                            )}
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })
            )
          )}

                    {/* Payment Reminders & Schedule Banner */}
          {viewMode === "customer" && (
            <TouchableOpacity
              style={styles.remindersBanner}
              onPress={() => router.push("/payment-reminders" as any)}
              activeOpacity={0.85}
            >
              <View style={styles.remindersBannerIcon}>
                <MaterialCommunityIcons name="clock-check-outline" size={18} color="#00897B" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.remindersBannerTitle}>Payment Reminders & Schedule</Text>
                <Text style={styles.remindersBannerSub}>Send WhatsApp / SMS balance statements (Daily, Weekly, 15 Days, Monthly)</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color="#00796B" />
            </TouchableOpacity>
          )}

          {/* Customer Khata Sort Bar */}
          {viewMode === "customer" && (
            <View style={styles.sortBar}>
              <Text style={styles.sortBarLabel}>Sort:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortScroll}>
                <TouchableOpacity
                  style={[styles.sortChip, customerSort === "amount_desc" && styles.sortChipActive]}
                  onPress={() => setCustomerSort("amount_desc")}
                >
                  <MaterialCommunityIcons name="arrow-down-thick" size={12} color={customerSort === "amount_desc" ? "#fff" : colors.textMuted} />
                  <Text style={[styles.sortChipText, customerSort === "amount_desc" && styles.sortChipTextActive]}>Amount: High → Low</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.sortChip, customerSort === "amount_asc" && styles.sortChipActive]}
                  onPress={() => setCustomerSort("amount_asc")}
                >
                  <MaterialCommunityIcons name="arrow-up-thick" size={12} color={customerSort === "amount_asc" ? "#fff" : colors.textMuted} />
                  <Text style={[styles.sortChipText, customerSort === "amount_asc" && styles.sortChipTextActive]}>Amount: Low → High</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.sortChip, customerSort === "name_asc" && styles.sortChipActive]}
                  onPress={() => setCustomerSort("name_asc")}
                >
                  <MaterialCommunityIcons name="sort-alphabetical-ascending" size={12} color={customerSort === "name_asc" ? "#fff" : colors.textMuted} />
                  <Text style={[styles.sortChipText, customerSort === "name_asc" && styles.sortChipTextActive]}>Name: A → Z</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.sortChip, customerSort === "name_desc" && styles.sortChipActive]}
                  onPress={() => setCustomerSort("name_desc")}
                >
                  <MaterialCommunityIcons name="sort-alphabetical-descending" size={12} color={customerSort === "name_desc" ? "#fff" : colors.textMuted} />
                  <Text style={[styles.sortChipText, customerSort === "name_desc" && styles.sortChipTextActive]}>Name: Z → A</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          )}

          {/* CUSTOMER-WISE KHATA VIEW */}
          {viewMode === "customer" && (
            groupedByCustomer.map(group => {
              const isCollapsed = expandedSections[group.customerId || group.name] === true;
              return (
                <View key={group.customerId || group.name} style={styles.groupCard}>
                  <TouchableOpacity
                    style={styles.groupHeader}
                    onPress={() => toggleSection(group.customerId || group.name)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.groupTitle}>
                        {group.name} {group.code ? `(${group.code})` : ""}
                      </Text>
                      <Text style={styles.groupSub}>
                        {group.mobile ? `📱 ${group.mobile} · ` : ""}
                        {group.items.length} {group.items.length === 1 ? "payment" : "payments"}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={styles.groupTotal}>Total Paid: ₹{group.total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</Text>
                      <MaterialCommunityIcons
                        name={isCollapsed ? "chevron-down" : "chevron-up"}
                        size={20}
                        color={colors.textMuted}
                      />
                    </View>
                  </TouchableOpacity>

                  {!isCollapsed && (
                    <View style={styles.groupItemsContainer}>
                      {group.items.map(item => renderPaymentCard(item))}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Edit Payment Modal */}
      <Modal
        visible={!!editingPayment}
        animationType="slide"
        transparent
        onRequestClose={() => setEditingPayment(null)}
      >
        <View style={styles.dateModalBg}>
          <View style={styles.editSheet}>
            <View style={styles.pickerSheetHandle} />
            <Text style={styles.pickerSheetTitle}>Edit Payment</Text>
            {editingPayment && (
              <Text style={styles.editSubInfo}>
                {editingPayment.customer_name || "Customer"} · Batch: {editingPayment.batch_no}
              </Text>
            )}

            <Text style={styles.editFieldLabel}>Amount (₹) *</Text>
            <TextInput
              style={styles.editInput}
              keyboardType="decimal-pad"
              value={editAmount}
              onChangeText={setEditAmount}
              placeholder="0.00"
              placeholderTextColor={colors.textLight}
            />

            <Text style={styles.editFieldLabel}>Payment Mode *</Text>
            <View style={styles.modeRow}>
              {MODES.map(m => (
                <TouchableOpacity
                  key={m}
                  style={[styles.modeButton, editMode === m && styles.modeButtonActive]}
                  onPress={() => setEditMode(m)}
                >
                  <Text style={[styles.modeButtonText, editMode === m && styles.modeButtonTextActive]}>
                    {m}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.editFieldLabel}>Payment Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.editInput}
              value={editDate}
              onChangeText={setEditDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textLight}
            />

            <Text style={styles.editFieldLabel}>Remarks / Reference No.</Text>
            <TextInput
              style={styles.editInput}
              value={editRemarks}
              onChangeText={setEditRemarks}
              placeholder="e.g. Ledger folio #, UPI ref, Cheque #"
              placeholderTextColor={colors.textLight}
            />

            <View style={styles.editActions}>
              {user?.role === "Admin" && (
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={handleDeletePayment}
                  disabled={savingEdit}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={20} color="#D32F2F" />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setEditingPayment(null)}
                disabled={savingEdit}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSaveEdit}
                disabled={savingEdit}
              >
                {savingEdit ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Expense Modal */}
      <Modal
        visible={!!editingExpense}
        animationType="slide"
        transparent
        onRequestClose={() => setEditingExpense(null)}
      >
        <View style={styles.dateModalBg}>
          <View style={styles.editSheet}>
            <View style={styles.pickerSheetHandle} />
            <Text style={styles.pickerSheetTitle}>Edit Expense Voucher</Text>
            {editingExpense && (
              <Text style={styles.editSubInfo}>
                {editingExpense.voucher_no ? `Voucher: ${editingExpense.voucher_no} · ` : ""}{editingExpense.category || "Expense"}
              </Text>
            )}

            <Text style={styles.editFieldLabel}>Amount (₹) *</Text>
            <TextInput
              style={styles.editInput}
              keyboardType="decimal-pad"
              value={editExpenseAmount}
              onChangeText={setEditExpenseAmount}
              placeholder="0.00"
              placeholderTextColor={colors.textLight}
            />

            <Text style={styles.editFieldLabel}>Expense Category / Ledger *</Text>
            <View style={styles.dropdownWrapper}>
              <TouchableOpacity
                style={[
                  styles.dropdownTrigger,
                  categoryDropdownOpen && styles.dropdownTriggerActive,
                ]}
                onPress={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
                activeOpacity={0.8}
              >
                <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <MaterialCommunityIcons name="book-open-outline" size={17} color={colors.primary} />
                  <Text style={styles.dropdownTriggerText}>
                    {editExpenseCategory || "Select Category / Ledger..."}
                  </Text>
                </View>
                <MaterialCommunityIcons
                  name={categoryDropdownOpen ? "chevron-up" : "chevron-down"}
                  size={20}
                  color={colors.textMuted}
                />
              </TouchableOpacity>

              {categoryDropdownOpen && (
                <View style={styles.dropdownMenu}>
                  {/* Search Filter */}
                  <View style={styles.dropdownSearchRow}>
                    <MaterialCommunityIcons name="magnify" size={16} color={colors.textMuted} />
                    <TextInput
                      style={styles.dropdownSearchInput}
                      placeholder="Type to search ledger category..."
                      placeholderTextColor={colors.textLight}
                      value={categorySearchQuery}
                      onChangeText={setCategorySearchQuery}
                      autoFocus
                    />
                    {categorySearchQuery ? (
                      <TouchableOpacity onPress={() => setCategorySearchQuery("")}>
                        <MaterialCommunityIcons name="close-circle" size={16} color={colors.textMuted} />
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  {/* Scrollable Category Options */}
                  <ScrollView
                    style={{ maxHeight: 180 }}
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={true}
                  >
                    {filteredCategories.map(cat => {
                      const isSelected = editExpenseCategory === cat;
                      return (
                        <TouchableOpacity
                          key={cat}
                          style={[styles.dropdownItem, isSelected && styles.dropdownItemSelected]}
                          onPress={() => {
                            setEditExpenseCategory(cat);
                            setCategoryDropdownOpen(false);
                            setCategorySearchQuery("");
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.dropdownItemText, isSelected && styles.dropdownItemTextSelected]}>
                            {cat}
                          </Text>
                          {isSelected && (
                            <MaterialCommunityIcons name="check-circle" size={16} color={colors.primary} />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                    {filteredCategories.length === 0 && (
                      <View style={{ padding: 12, alignItems: "center" }}>
                        <Text style={{ fontSize: 12, color: colors.textMuted }}>No matching ledger category found</Text>
                      </View>
                    )}
                  </ScrollView>
                </View>
              )}
            </View>

            <Text style={styles.editFieldLabel}>Payment Mode *</Text>
            <View style={styles.modeRow}>
              {["Cash", "UPI", "Bank"].map(m => (
                <TouchableOpacity
                  key={m}
                  style={[styles.modeButton, editExpenseMode === m && styles.modeButtonActive]}
                  onPress={() => setEditExpenseMode(m)}
                >
                  <Text style={[styles.modeButtonText, editExpenseMode === m && styles.modeButtonTextActive]}>
                    {m}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.editFieldLabel}>Expense Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.editInput}
              value={editExpenseDate}
              onChangeText={setEditExpenseDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textLight}
            />

            <Text style={styles.editFieldLabel}>Vendor / Payee</Text>
            <TextInput
              style={styles.editInput}
              value={editExpenseVendor}
              onChangeText={setEditExpenseVendor}
              placeholder="e.g. EB Office, Indian Oil, Contractor Name"
              placeholderTextColor={colors.textLight}
            />

            <Text style={styles.editFieldLabel}>Remarks / Description</Text>
            <TextInput
              style={styles.editInput}
              value={editExpenseRemarks}
              onChangeText={setEditExpenseRemarks}
              placeholder="e.g. 50L diesel for dryer, machine belt repair"
              placeholderTextColor={colors.textLight}
            />

            <View style={styles.editActions}>
              {user?.role === "Admin" && (
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={handleDeleteExpense}
                  disabled={savingExpenseEdit}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={20} color="#D32F2F" />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setEditingExpense(null)}
                disabled={savingExpenseEdit}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSaveExpenseEdit}
                disabled={savingExpenseEdit}
              >
                {savingExpenseEdit ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Date Picker Modal */}
      <Modal
        visible={pickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerOpen(false)}
      >
        <View style={styles.dateModalBg}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerSheetHandle} />
            <Text style={styles.pickerSheetTitle}>Select Date Range</Text>

            <Calendar
              startDate={draftStart}
              endDate={draftEnd}
              onSelectRange={(s, e) => {
                setDraftStart(s);
                setDraftEnd(e);
              }}
            />

            <View style={styles.dateRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.dateLabel}>From</Text>
                <TextInput
                  testID="payments-start-date"
                  style={styles.dateInput}
                  value={draftStart}
                  onChangeText={setDraftStart}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textLight}
                />
              </View>
              <MaterialCommunityIcons name="arrow-right" size={18} color={colors.textMuted} style={{ marginTop: 22 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.dateLabel}>To</Text>
                <TextInput
                  testID="payments-end-date"
                  style={styles.dateInput}
                  value={draftEnd}
                  onChangeText={setDraftEnd}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textLight}
                />
              </View>
            </View>

            <View style={styles.pickerSheetActions}>
              <TouchableOpacity testID="payments-range-cancel" style={styles.pickerSheetCancel} onPress={() => setPickerOpen(false)}>
                <Text style={styles.pickerSheetCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="payments-range-apply"
                style={styles.pickerSheetApply}
                onPress={() => {
                  setStartDate(draftStart);
                  setEndDate(draftEnd);
                  setPickerOpen(false);
                }}
              >
                <Text style={styles.pickerSheetApplyText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* Share / Export Modal */}
      <Modal
        visible={shareModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setShareModalOpen(false)}
      >
        <View style={styles.dateModalBg}>
          <View style={styles.shareSheet}>
            <View style={styles.pickerSheetHandle} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <View>
                <Text style={styles.pickerSheetTitle}>Share & Export Cash Book</Text>
                <Text style={styles.shareSheetSub}>
                  {selectedBranchId ? (branches.find(b => b.id === selectedBranchId)?.name || "Branch") : "All Branches"} • {activePreset === "custom" && startDate && endDate ? `${startDate} to ${endDate}` : DATE_PRESETS.find(p => p.key === activePreset)?.label || "All"}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShareModalOpen(false)} style={{ padding: 4 }}>
                <MaterialCommunityIcons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {sharingAction ? (
              <View style={{ paddingVertical: 40, alignItems: "center" }}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={{ marginTop: 12, color: colors.textMuted, fontSize: 13 }}>Preparing statement export...</Text>
              </View>
            ) : (
              <View style={styles.shareOptionGrid}>
                {/* 1. Primary: Share PDF Document to WhatsApp / Email / Apps */}
                <TouchableOpacity
                  style={[styles.shareCard, { borderColor: "#D32F2F", backgroundColor: "#FFF8F8" }]}
                  onPress={handleSharePDF}
                  activeOpacity={0.8}
                >
                  <View style={[styles.shareIconBox, { backgroundColor: "#FFEBEE" }]}>
                    <MaterialCommunityIcons name="file-pdf-box" size={28} color="#D32F2F" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={[styles.shareCardTitle, { color: "#C62828", fontSize: 14 }]}>Share PDF Document</Text>
                      <View style={{ backgroundColor: "#25D366", paddingHorizontal: 6, paddingVertical: 1, borderRadius: 10 }}>
                        <Text style={{ color: "#fff", fontSize: 9, fontWeight: "800" }}>WhatsApp PDF</Text>
                      </View>
                    </View>
                    <Text style={styles.shareCardDesc}>Generates official PDF file with E3 statement. Select WhatsApp or Email to send PDF.</Text>
                  </View>
                  <MaterialCommunityIcons name="share-variant" size={20} color="#D32F2F" />
                </TouchableOpacity>

                {/* 2. Excel Spreadsheet */}
                <TouchableOpacity
                  style={[styles.shareCard, { borderColor: "#2E7D32" }]}
                  onPress={handleExportExcel}
                  activeOpacity={0.8}
                >
                  <View style={[styles.shareIconBox, { backgroundColor: "#E8F5E9" }]}>
                    <MaterialCommunityIcons name="file-excel" size={26} color="#2E7D32" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.shareCardTitle}>Export to Excel (.CSV)</Text>
                    <Text style={styles.shareCardDesc}>Download or share full spreadsheet with columns & all transactions</Text>
                  </View>
                  <MaterialCommunityIcons name="download" size={20} color={colors.primary} />
                </TouchableOpacity>

                {/* 3. Print Statement */}
                <TouchableOpacity
                  style={[styles.shareCard, { borderColor: "#1565C0" }]}
                  onPress={handlePrintDirect}
                  activeOpacity={0.8}
                >
                  <View style={[styles.shareIconBox, { backgroundColor: "#E3F2FD" }]}>
                    <MaterialCommunityIcons name="printer" size={26} color="#1565C0" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.shareCardTitle}>Print Statement</Text>
                    <Text style={styles.shareCardDesc}>Send directly to connected printer or browser print dialog</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textLight} />
                </TouchableOpacity>

                {/* 4. Quick Text Summary (No PDF attached) */}
                <TouchableOpacity
                  style={[styles.shareCard, { borderColor: colors.border }]}
                  onPress={handleShareWhatsApp}
                  activeOpacity={0.8}
                >
                  <View style={[styles.shareIconBox, { backgroundColor: "#F5F5F5" }]}>
                    <MaterialCommunityIcons name="text-box-outline" size={24} color={colors.textMuted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.shareCardTitle, { color: colors.textMuted }]}>Quick Text Summary Only</Text>
                    <Text style={styles.shareCardDesc}>Send short text figures via WhatsApp without attaching PDF file</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textLight} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  receiptLine: {
    fontSize: 13,
    color: colors.text,
    marginTop: 3,
  },
  customerNameBold: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text,
    marginTop: 3,
  },
  ledgerName: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "600",
    marginTop: 2,
  },
  dropdownWrapper: {
    marginBottom: spacing.xs,
  },
  dropdownTrigger: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: "space-between",
  },
  dropdownTriggerActive: {
    borderColor: colors.primary,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  dropdownTriggerText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  dropdownMenu: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: colors.primary,
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
    ...shadow.card,
  },
  dropdownSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
    gap: 6,
  },
  dropdownSearchInput: {
    flex: 1,
    fontSize: 12,
    color: colors.text,
    paddingVertical: 4,
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dropdownItemSelected: {
    backgroundColor: colors.primary50,
  },
  dropdownItemText: {
    fontSize: 12,
    color: colors.text,
    fontWeight: "500",
  },
  dropdownItemTextSelected: {
    color: colors.primary,
    fontWeight: "800",
  },

  mainActionRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: spacing.xl,
    paddingTop: 2,
    paddingBottom: 8,
  },
  bigActionBtnIn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1B5E20",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    gap: 8,
    ...shadow.sm,
  },
  bigActionBtnOut: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#C62828",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    gap: 8,
    ...shadow.sm,
  },
  bigActionIconWrapIn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  bigActionIconWrapOut: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  bigActionBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  bigActionBtnSub: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 10,
    fontWeight: "500",
    marginTop: 1,
  },
  shareHeaderBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary50,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    gap: 5,
    borderWidth: 1,
    borderColor: colors.primary + "30",
  },
  shareHeaderBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
  },
  sortBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: 6,
    gap: 8,
  },
  sortBarLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
  },
  sortScroll: {
    gap: 6,
    paddingRight: spacing.xl,
  },
  sortChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  sortChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sortChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
  },
  sortChipTextActive: {
    color: "#fff",
    fontWeight: "700",
  },
  shareSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    maxHeight: "85%",
  },
  shareSheetSub: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  shareOptionGrid: {
    gap: 10,
    marginTop: 6,
    marginBottom: spacing.xl,
  },
  shareCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    gap: 12,
    ...shadow.sm,
  },
  shareIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  shareCardTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  shareCardDesc: {
    fontSize: 11,
    color: colors.textLight,
    marginTop: 2,
  },

  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  title: { fontSize: 20, fontWeight: "800", color: colors.text },
  subTitle: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  headerActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actionBtnIn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2E7D32",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    gap: 4,
    ...shadow.sm,
  },
  actionBtnOut: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#D32F2F",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    gap: 4,
    ...shadow.sm,
  },
  actionBtnText: { color: "#fff", fontWeight: "700", fontSize: 11 },

  addPaymentBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: radius.pill,
    gap: 4,
    ...shadow.sm,
  },
  addPaymentBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  viewModeTabs: {
    flexDirection: "row",
    marginHorizontal: spacing.xl,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  viewTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 7,
    borderRadius: radius.pill,
    gap: 4,
  },
  viewTabActive: {
    backgroundColor: colors.primary,
  },
  viewTabText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
  },
  viewTabTextActive: {
    color: "#fff",
    fontWeight: "700",
  },
  cashBookSummaryCard: {
    backgroundColor: colors.card,
    marginHorizontal: spacing.xl,
    padding: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  cashBookRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  cashBookLabel: { fontSize: 11, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase" },
  cashBookVal: { fontSize: 20, fontWeight: "800", marginTop: 2 },
  cashBookSub: { fontSize: 10, color: colors.textLight, marginTop: 1 },
  netCashRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  netCashLabel: { fontSize: 10, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase" },
  netCashVal: { fontSize: 18, fontWeight: "800", marginTop: 1 },
  cashInHandBox: {
    backgroundColor: "#F1F8E9",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
    alignItems: "flex-end",
  },
  cashInHandLabel: { fontSize: 10, color: "#2E7D32", fontWeight: "700" },
  cashInHandVal: { fontSize: 14, fontWeight: "800", color: "#1B5E20", marginTop: 1 },
  totalCard: {
    backgroundColor: colors.primary,
    marginHorizontal: spacing.xl,
    padding: spacing.md,
    borderRadius: radius.xl,
    ...shadow.card,
  },
  totalLabel: {
    color: "#B9F6CA",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  totalValue: { color: "#fff", fontSize: 24, fontWeight: "800", marginTop: 2 },
  totalSub: { color: "#E8F5E9", fontSize: 11, marginTop: 1 },
  totalDateRange: { color: "#E8F5E9", fontSize: 11, fontWeight: "600" },
  reconcileRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.2)",
  },
  reconcileChip: {
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  reconcileChipLabel: { color: "#fff", fontSize: 10, fontWeight: "600" },
  reconcileChipVal: { color: "#fff", fontSize: 11, fontWeight: "800" },
  scrollList: {
    paddingHorizontal: spacing.xl,
    paddingBottom: 100,
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  groupCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadow.sm,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    backgroundColor: "#F9FBF9",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  groupTitle: { fontSize: 13, fontWeight: "800", color: colors.text },
  groupSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  groupTotal: { fontSize: 14, fontWeight: "800", color: colors.primary },
  groupItemsContainer: {
    padding: spacing.sm,
    gap: spacing.xs,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg,
    padding: spacing.sm,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  amount: { fontSize: 14, fontWeight: "800", color: colors.text },
  modeChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  modeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  meta: { fontSize: 12, color: colors.text, marginTop: 1, fontWeight: "500" },
  remarksText: { fontSize: 11, color: colors.textMuted, fontStyle: "italic", marginTop: 1 },
  date: { fontSize: 10, color: colors.textLight, marginTop: 1 },
  branchBadge: { backgroundColor: colors.primary50, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm },
  branchBadgeText: { fontSize: 10, color: colors.primary, fontWeight: "800" },
  editActionBtn: {
    padding: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.primary50,
  },
  emptyContainer: { alignItems: "center", marginTop: 40, gap: 8 },
  empty: { textAlign: "center", color: colors.textMuted, fontSize: 13 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
  },
  searchInput: { flex: 1, paddingVertical: 8, fontSize: 13, color: colors.text },
  dateFilterContainer: {
    paddingVertical: spacing.xs,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.xs,
  },
  dateScroll: {
    paddingHorizontal: spacing.xl,
    gap: spacing.xs,
  },
  datePill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
  },
  datePillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  datePillText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
  },
  datePillTextActive: {
    color: "#ffffff",
    fontWeight: "700",
  },
  dateModalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  pickerSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  pickerSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  pickerSheetTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
    marginBottom: spacing.md,
    textAlign: "center",
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.lg,
    marginTop: spacing.md,
  },
  dateLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.textMuted,
    marginBottom: 6,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  dateInput: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerSheetActions: {
    flexDirection: "row",
    gap: spacing.md,
  },
  pickerSheetCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
  },
  pickerSheetCancelText: {
    color: colors.textMuted,
    fontWeight: "700",
  },
  pickerSheetApply: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  pickerSheetApplyText: {
    color: "#fff",
    fontWeight: "800",
  },
  editSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    padding: spacing.xl,
    paddingBottom: 40,
  },
  editSubInfo: {
    textAlign: "center",
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: spacing.md,
  },
  editFieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    marginTop: spacing.sm,
    marginBottom: 4,
  },
  editInput: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: spacing.xs,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  modeButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  modeButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
  },
  modeButtonTextActive: {
    color: "#fff",
  },
  editActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
    alignItems: "center",
  },
  deleteBtn: {
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: "#FFEBEE",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  cancelBtnText: {
    color: colors.textMuted,
    fontWeight: "700",
    fontSize: 13,
  },
  saveBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  saveBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },

  remindersBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#E0F2F1",
    borderWidth: 1,
    borderColor: "#B2DFDB",
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  remindersBannerIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  remindersBannerTitle: { fontSize: 13, fontWeight: "800", color: "#00695C" },
  remindersBannerSub: { fontSize: 11, color: "#00796B", marginTop: 1 },
});
