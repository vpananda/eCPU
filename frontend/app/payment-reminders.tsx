import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Switch,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/components/Toast";
import { useConfirm } from "@/src/components/ConfirmModal";
import { colors, radius, shadow, spacing } from "@/src/theme";
import {
  openWhatsApp,
  openSMS,
  buildStatementReminderMessage,
} from "@/src/utils/notifications";

const FREQUENCIES = [
  { key: "daily", label: "Daily", sub: "Every Day" },
  { key: "weekly", label: "Weekly", sub: "Specific Day" },
  { key: "fifteen_days", label: "15 Days", sub: "1st & 15th" },
  { key: "monthly", label: "Monthly", sub: "Day of Month" },
];

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAYS_OF_MONTH = [1, 5, 10, 15, 20, 25];

const TIME_OPTIONS = ["08:00 AM", "09:00 AM", "12:00 PM", "06:00 PM", "08:00 PM"];

interface ReminderConfig {
  enabled: boolean;
  frequency: "daily" | "weekly" | "fifteen_days" | "monthly";
  time: string;
  day_of_week: string;
  day_of_month: number;
  min_balance: number;
  only_pending: boolean;
  branch_id?: string | null;
  custom_message?: string;
}

interface BranchConfigItem extends ReminderConfig {
  branch_name?: string;
}

interface CustomerStatement {
  customer_id: string;
  name: string;
  code: string;
  mobile: string;
  village?: string;
  branch_id?: string;
  branch_name: string;
  total_billed: number;
  total_received: number;
  balance_due: number;
}

export default function PaymentRemindersScreen() {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const { user, selectedBranchId, branches } = useAuth();
  const isAdmin = user?.role === "Admin";

  const [activeBranchId, setActiveBranchId] = useState<string>(
    (user?.role !== "Admin" && user?.branch_id)
      ? user.branch_id
      : (selectedBranchId || "")
  );

  const [branchConfigs, setBranchConfigs] = useState<BranchConfigItem[]>([]);

  const [config, setConfig] = useState<ReminderConfig>({
    enabled: true,
    frequency: "weekly",
    time: "09:00 AM",
    day_of_week: "Monday",
    day_of_month: 1,
    min_balance: 1.0,
    only_pending: true,
    branch_id: activeBranchId || null,
    custom_message: "",
  });

  const [minBalanceText, setMinBalanceText] = useState("1");
  const [statements, setStatements] = useState<CustomerStatement[]>([]);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [loadingStatements, setLoadingStatements] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [search, setSearch] = useState("");
  const [configExpanded, setConfigExpanded] = useState(true);

  // Initialize active branch if unset
  useEffect(() => {
    if (!activeBranchId && branches.length > 0) {
      setActiveBranchId(selectedBranchId || branches[0].id);
    }
  }, [branches, activeBranchId, selectedBranchId]);

  // Load branch overview configs
  const loadBranchConfigs = useCallback(async () => {
    try {
      const data = await api<BranchConfigItem[]>("/reminders/branch-configs");
      setBranchConfigs(data);
    } catch (e) {
      console.warn("Could not load branch configs overview:", e);
    }
  }, []);

  useEffect(() => {
    loadBranchConfigs();
  }, [loadBranchConfigs]);

  // Load config for active branch
  const loadConfig = useCallback(async (bId?: string) => {
    const targetBranch = bId || activeBranchId;
    if (!targetBranch) return;
    try {
      setLoadingConfig(true);
      const c = await api<ReminderConfig>(`/reminders/config?branch_id=${targetBranch}`);
      setConfig({
        ...c,
        branch_id: targetBranch,
        frequency: c.frequency || "weekly",
        time: c.time || "09:00 AM",
        day_of_week: c.day_of_week || "Monday",
        day_of_month: c.day_of_month || 1,
        min_balance: c.min_balance ?? 1.0,
        only_pending: c.only_pending ?? true,
        custom_message: c.custom_message || "",
      });
      setMinBalanceText(String(c.min_balance ?? 1));
    } catch (e: any) {
      console.warn("Could not load reminder config:", e);
    } finally {
      setLoadingConfig(false);
    }
  }, [activeBranchId]);

  // Load statements for active branch
  const loadStatements = useCallback(async (bId?: string) => {
    const targetBranch = bId || activeBranchId;
    if (!targetBranch) return;
    try {
      setLoadingStatements(true);
      const minVal = parseFloat(minBalanceText) || 0;
      const qs = new URLSearchParams();
      qs.set("branch_id", targetBranch);
      qs.set("only_pending", config.only_pending ? "true" : "false");
      qs.set("min_balance", String(minVal));

      const data = await api<CustomerStatement[]>(`/reminders/statements?${qs.toString()}`);
      setStatements(data);
    } catch (e: any) {
      toast.show(e.message || "Failed to load customer statements", "error");
    } finally {
      setLoadingStatements(false);
    }
  }, [activeBranchId, config.only_pending, minBalanceText, toast]);

  useEffect(() => {
    if (activeBranchId) {
      loadConfig(activeBranchId);
      loadStatements(activeBranchId);
    }
  }, [activeBranchId, loadConfig, loadStatements]);

  const saveConfig = async () => {
    if (!activeBranchId) {
      return toast.show("Please select a branch first", "error");
    }
    try {
      setSavingConfig(true);
      const parsedMin = parseFloat(minBalanceText) || 0;
      const payload: ReminderConfig = {
        ...config,
        min_balance: parsedMin,
        branch_id: activeBranchId,
      };

      await api(`/reminders/config?branch_id=${activeBranchId}`, {
        method: "PUT",
        body: payload,
      });

      const branchName = branches.find(b => b.id === activeBranchId)?.name || "Branch";
      toast.show(`Reminder configuration saved for ${branchName}!`);
      loadBranchConfigs();
    } catch (e: any) {
      toast.show(e.message || "Failed to save configuration", "error");
    } finally {
      setSavingConfig(false);
    }
  };

  const copyToAllBranches = async () => {
    const branchName = branches.find(b => b.id === activeBranchId)?.name || "Branch";
    const ok = await confirm({
      title: "Apply to All Branches",
      message: `Do you want to copy ${branchName}'s reminder schedule (${config.frequency.toUpperCase()}, ${config.time}) to all branches? This will update other branches' schedule settings.`,
      confirmText: "Copy to All Branches",
      icon: "content-copy",
    });
    if (!ok) return;

    try {
      setSavingConfig(true);
      const parsedMin = parseFloat(minBalanceText) || 0;
      const payload = {
        config: {
          ...config,
          min_balance: parsedMin,
        },
      };

      await api("/reminders/copy-to-all", {
        method: "POST",
        body: payload,
      });

      toast.show(`Schedule successfully copied to all branches!`);
      loadBranchConfigs();
    } catch (e: any) {
      toast.show(e.message || "Failed to copy schedule", "error");
    } finally {
      setSavingConfig(false);
    }
  };

  const currentBranchName = useMemo(() => {
    return branches.find(b => b.id === activeBranchId)?.name || "Branch";
  }, [activeBranchId, branches]);

  const filteredStatements = useMemo(() => {
    if (!search.trim()) return statements;
    const q = search.toLowerCase().trim();
    return statements.filter(
      s =>
        s.name.toLowerCase().includes(q) ||
        (s.mobile && s.mobile.includes(q)) ||
        (s.code && s.code.toLowerCase().includes(q)) ||
        (s.village && s.village.toLowerCase().includes(q))
    );
  }, [statements, search]);

  const totals = useMemo(() => {
    const totalBilled = statements.reduce((acc, s) => acc + (s.total_billed || 0), 0);
    const totalRecv = statements.reduce((acc, s) => acc + (s.total_received || 0), 0);
    const totalBal = statements.reduce((acc, s) => acc + (s.balance_due || 0), 0);
    const pendingCount = statements.filter(s => s.balance_due > 0).length;
    return { totalBilled, totalRecv, totalBal, pendingCount };
  }, [statements]);

  const handleSendWhatsApp = async (s: CustomerStatement) => {
    const freqObj = FREQUENCIES.find(f => f.key === config.frequency);
    const msg = buildStatementReminderMessage({
      companyName: "E3 SPICE PROCESSORS",
      branchName: s.branch_name || currentBranchName,
      customerName: s.name,
      totalBilled: s.total_billed,
      totalReceived: s.total_received,
      balanceDue: s.balance_due,
      frequencyLabel: `${freqObj?.label || "Khata"} Statement`,
      customNote: config.custom_message || undefined,
    });
    await openWhatsApp(s.mobile, msg);
  };

  const handleSendSMS = async (s: CustomerStatement) => {
    const freqObj = FREQUENCIES.find(f => f.key === config.frequency);
    const msg = buildStatementReminderMessage({
      companyName: "E3 SPICE PROCESSORS",
      branchName: s.branch_name || currentBranchName,
      customerName: s.name,
      totalBilled: s.total_billed,
      totalReceived: s.total_received,
      balanceDue: s.balance_due,
      frequencyLabel: `${freqObj?.label || "Khata"} Statement`,
      customNote: config.custom_message || undefined,
    });
    await openSMS(s.mobile, msg);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="reminders-back" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.headerTitle}>Payment Reminders</Text>
          <Text style={styles.headerSubtitle}>
            {currentBranchName} · Branch-Wise Payment Schedule
          </Text>
        </View>
        <TouchableOpacity onPress={() => { if (activeBranchId) { loadConfig(activeBranchId); loadStatements(activeBranchId); } }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialCommunityIcons name="refresh" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Branch Selector Bar (for Multi-branch / Admin users) */}
        {branches.length > 0 && (
          <View style={styles.branchSelectCard}>
            <View style={styles.branchSelectHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <MaterialCommunityIcons name="office-building" size={16} color={colors.primary} />
                <Text style={styles.branchSelectTitle}>Select Branch to Configure</Text>
              </View>
              <View style={styles.badgeBranchWise}>
                <Text style={styles.badgeBranchWiseText}>Branch-Wise</Text>
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.branchChipsScroll}>
              {branches.map(b => {
                const isSelected = b.id === activeBranchId;
                const bCfg = branchConfigs.find(c => c.branch_id === b.id);
                const isEnabled = bCfg?.enabled ?? true;
                return (
                  <TouchableOpacity
                    key={b.id}
                    style={[styles.branchChip, isSelected && styles.branchChipActive]}
                    onPress={() => setActiveBranchId(b.id)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.branchDot, { backgroundColor: isEnabled ? "#10B981" : "#9CA3AF" }]} />
                    <Text style={[styles.branchChipText, isSelected && styles.branchChipTextActive]}>
                      {b.name}
                    </Text>
                    {isSelected && (
                      <View style={styles.activeCheckIcon}>
                        <MaterialCommunityIcons name="check" size={12} color="#fff" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Schedule Configuration Card */}
        <View style={styles.configCard}>
          <TouchableOpacity
            style={styles.configHeader}
            onPress={() => setConfigExpanded(!configExpanded)}
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
              <View
                style={[
                  styles.configStatusDot,
                  { backgroundColor: config.enabled ? "#10B981" : "#9CA3AF" },
                ]}
              />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Text style={styles.configTitle}>Schedule for {currentBranchName}</Text>
                  <View style={[styles.statusPill, { backgroundColor: config.enabled ? "#ECFDF5" : "#F3F4F6" }]}>
                    <Text style={[styles.statusPillText, { color: config.enabled ? "#065F46" : "#6B7280" }]}>
                      {config.enabled ? "Active" : "Paused"}
                    </Text>
                  </View>
                </View>
                <Text style={styles.configSub}>
                  {config.enabled
                    ? `${FREQUENCIES.find(f => f.key === config.frequency)?.label} at ${config.time}${config.frequency === "weekly" ? ` (${config.day_of_week})` : config.frequency === "monthly" ? ` (Day ${config.day_of_month})` : ""}`
                    : `Reminders paused for ${currentBranchName}`}
                </Text>
              </View>
            </View>
            <MaterialCommunityIcons
              name={configExpanded ? "chevron-up" : "chevron-down"}
              size={22}
              color={colors.textMuted}
            />
          </TouchableOpacity>

          {configExpanded && (
            <View style={styles.configBody}>
              {loadingConfig ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 20 }} />
              ) : (
                <>
                  {/* Enable Toggle for This Branch */}
                  <View style={styles.toggleRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>Automated Reminders ({currentBranchName})</Text>
                      <Text style={styles.fieldSub}>
                        Enable scheduled statement reminders specifically for this branch
                      </Text>
                    </View>
                    <Switch
                      value={config.enabled}
                      onValueChange={val => setConfig(prev => ({ ...prev, enabled: val }))}
                      trackColor={{ false: "#ccc", true: colors.primary + "60" }}
                      thumbColor={config.enabled ? colors.primary : "#f4f3f4"}
                    />
                  </View>

                  {/* Frequency Selector */}
                  <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>Frequency</Text>
                  <View style={styles.freqRow}>
                    {FREQUENCIES.map(f => {
                      const active = config.frequency === f.key;
                      return (
                        <TouchableOpacity
                          key={f.key}
                          style={[styles.freqChip, active && styles.freqChipActive]}
                          onPress={() => setConfig(prev => ({ ...prev, frequency: f.key as any }))}
                        >
                          <Text style={[styles.freqChipText, active && styles.freqChipTextActive]}>
                            {f.label}
                          </Text>
                          <Text style={[styles.freqChipSub, active && styles.freqChipSubActive]}>
                            {f.sub}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Day of Week Selector (when Weekly) */}
                  {config.frequency === "weekly" && (
                    <View style={{ marginTop: spacing.md }}>
                      <Text style={styles.fieldLabel}>Day of Week</Text>
                      <View style={styles.daysRow}>
                        {DAYS_OF_WEEK.map(day => {
                          const active = config.day_of_week === day;
                          return (
                            <TouchableOpacity
                              key={day}
                              style={[styles.dayChip, active && styles.dayChipActive]}
                              onPress={() => setConfig(prev => ({ ...prev, day_of_week: day }))}
                            >
                              <Text style={[styles.dayChipText, active && styles.dayChipTextActive]}>
                                {day.slice(0, 3)}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {/* Day of Month Selector (when Monthly) */}
                  {config.frequency === "monthly" && (
                    <View style={{ marginTop: spacing.md }}>
                      <Text style={styles.fieldLabel}>Day of Month</Text>
                      <View style={styles.daysRow}>
                        {DAYS_OF_MONTH.map(dom => {
                          const active = config.day_of_month === dom;
                          return (
                            <TouchableOpacity
                              key={dom}
                              style={[styles.dayChip, active && styles.dayChipActive]}
                              onPress={() => setConfig(prev => ({ ...prev, day_of_month: dom }))}
                            >
                              <Text style={[styles.dayChipText, active && styles.dayChipTextActive]}>
                                {dom}th
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {/* Dispatch Time */}
                  <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>Dispatch Time</Text>
                  <View style={styles.timeRow}>
                    {TIME_OPTIONS.map(t => {
                      const active = config.time === t;
                      return (
                        <TouchableOpacity
                          key={t}
                          style={[styles.timeChip, active && styles.timeChipActive]}
                          onPress={() => setConfig(prev => ({ ...prev, time: t }))}
                        >
                          <Text style={[styles.timeChipText, active && styles.timeChipTextActive]}>
                            {t}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Min Balance Threshold */}
                  <View style={{ marginTop: spacing.md }}>
                    <Text style={styles.fieldLabel}>Minimum Balance Threshold (₹)</Text>
                    <Text style={styles.fieldSub}>Reminders will only be sent if balance due is at or above this amount</Text>
                    <TextInput
                      style={styles.minBalInput}
                      value={minBalanceText}
                      onChangeText={setMinBalanceText}
                      keyboardType="numeric"
                      placeholder="1"
                    />
                  </View>

                  {/* Custom Message / Note for this branch */}
                  <View style={{ marginTop: spacing.md }}>
                    <Text style={styles.fieldLabel}>Custom Note for {currentBranchName}</Text>
                    <Text style={styles.fieldSub}>Included in WhatsApp & SMS statements for this branch (e.g. Bank details, GPay, Branch Manager contact)</Text>
                    <TextInput
                      style={styles.customMessageInput}
                      value={config.custom_message || ""}
                      onChangeText={val => setConfig(prev => ({ ...prev, custom_message: val }))}
                      placeholder="e.g. For UPI/GPay transfers use 9842100000. Branch Manager: 9842100000"
                      multiline
                      numberOfLines={3}
                    />
                  </View>

                  {/* Filtering Controls */}
                  <View style={styles.filterOptions}>
                    <TouchableOpacity
                      style={styles.checkboxRow}
                      onPress={() => setConfig(prev => ({ ...prev, only_pending: !prev.only_pending }))}
                      activeOpacity={0.8}
                    >
                      <MaterialCommunityIcons
                        name={config.only_pending ? "checkbox-marked" : "checkbox-blank-outline"}
                        size={20}
                        color={config.only_pending ? colors.primary : colors.textMuted}
                      />
                      <Text style={styles.checkboxLabel}>
                        Send only to customers with pending balance (&gt; ₹0)
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Save Buttons */}
                  <View style={styles.saveActionsWrap}>
                    <TouchableOpacity
                      style={styles.saveBtn}
                      onPress={saveConfig}
                      disabled={savingConfig}
                      activeOpacity={0.85}
                    >
                      {savingConfig ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <>
                          <MaterialCommunityIcons name="content-save-outline" size={18} color="#fff" />
                          <Text style={styles.saveBtnText}>Save Schedule for {currentBranchName}</Text>
                        </>
                      )}
                    </TouchableOpacity>

                    {isAdmin && branches.length > 1 && (
                      <TouchableOpacity
                        style={styles.copyBtn}
                        onPress={copyToAllBranches}
                        disabled={savingConfig}
                        activeOpacity={0.8}
                      >
                        <MaterialCommunityIcons name="content-copy" size={16} color={colors.primary} />
                        <Text style={styles.copyBtnText}>Apply Schedule to All Branches</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              )}
            </View>
          )}
        </View>

        {/* Financial KPI Summary Cards for Selected Branch */}
        <View style={styles.kpiContainer}>
          <View style={[styles.kpiCard, { borderLeftColor: colors.danger, borderLeftWidth: 4 }]}>
            <Text style={styles.kpiLabel}>Total Outstanding ({currentBranchName})</Text>
            <Text style={[styles.kpiVal, { color: colors.danger }]}>
              ₹{totals.totalBal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </Text>
            <Text style={styles.kpiSub}>{totals.pendingCount} customers pending</Text>
          </View>

          <View style={[styles.kpiCard, { borderLeftColor: colors.primary, borderLeftWidth: 4 }]}>
            <Text style={styles.kpiLabel}>Total Collections</Text>
            <Text style={[styles.kpiVal, { color: colors.primary }]}>
              ₹{totals.totalRecv.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </Text>
            <Text style={styles.kpiSub}>From ₹{totals.totalBilled.toLocaleString("en-IN", { maximumFractionDigits: 0 })} billed</Text>
          </View>
        </View>

        {/* Customer Search */}
        <View style={styles.searchBox}>
          <MaterialCommunityIcons name="magnify" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder={`Search ${currentBranchName} customers...`}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <MaterialCommunityIcons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Customer Statements List */}
        <View style={styles.listHeaderRow}>
          <Text style={styles.sectionTitle}>
            {currentBranchName} Customer Statements ({filteredStatements.length})
          </Text>
          <Text style={styles.sectionSubtitle}>
            Sorted by highest outstanding balance · 1-Tap Statement Dispatch
          </Text>
        </View>

        {loadingStatements ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 30 }} />
        ) : filteredStatements.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="check-all" size={48} color={colors.primaryLight} />
            <Text style={styles.emptyTitle}>No Pending Reminders</Text>
            <Text style={styles.emptySub}>
              All customers in {currentBranchName} are fully settled or no records matched the search.
            </Text>
          </View>
        ) : (
          filteredStatements.map(item => {
            const hasPending = item.balance_due > 0;
            return (
              <View key={item.customer_id} style={styles.customerCard}>
                <View style={styles.customerTopRow}>
                  <View
                    style={[
                      styles.avatar,
                      { backgroundColor: hasPending ? "#FFEBEE" : "#E8F5E9" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.avatarText,
                        { color: hasPending ? colors.danger : colors.primary },
                      ]}
                    >
                      {item.name.slice(0, 1).toUpperCase()}
                    </Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.custName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View style={styles.custMetaRow}>
                      <MaterialCommunityIcons name="phone" size={12} color={colors.textMuted} />
                      <Text style={styles.custMeta}>{item.mobile || "No Mobile"}</Text>
                      {item.village ? (
                        <>
                          <Text style={styles.metaDot}>·</Text>
                          <MaterialCommunityIcons name="map-marker-outline" size={12} color={colors.textMuted} />
                          <Text style={styles.custMeta}>{item.village}</Text>
                        </>
                      ) : null}
                    </View>
                  </View>

                  <View style={{ alignItems: "flex-end" }}>
                    <Text
                      style={[
                        styles.balAmount,
                        { color: hasPending ? colors.danger : colors.primary },
                      ]}
                    >
                      ₹{item.balance_due.toLocaleString("en-IN", { minimumFractionDigits: 0 })}
                    </Text>
                    <Text style={styles.balLabel}>
                      {hasPending ? "Balance Due" : "Settled ✓"}
                    </Text>
                  </View>
                </View>

                {/* Financials Strip */}
                <View style={styles.financialsStrip}>
                  <Text style={styles.stripText}>
                    Billed: <Text style={styles.stripBold}>₹{item.total_billed.toLocaleString()}</Text>
                  </Text>
                  <Text style={styles.stripText}>
                    Received: <Text style={styles.stripBold}>₹{item.total_received.toLocaleString()}</Text>
                  </Text>
                </View>

                {/* 1-Tap Action Buttons */}
                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={styles.whatsAppBtn}
                    onPress={() => handleSendWhatsApp(item)}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons name="whatsapp" size={16} color="#fff" />
                    <Text style={styles.whatsAppBtnText}>Send WhatsApp</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.smsBtn}
                    onPress={() => handleSendSMS(item)}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons name="message-text-outline" size={15} color="#1565C0" />
                    <Text style={styles.smsBtnText}>SMS</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: "#fff",
  },
  headerTitle: { fontSize: 17, fontWeight: "800", color: colors.text },
  headerSubtitle: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  scrollContent: { padding: spacing.xl, paddingBottom: 100 },

  branchSelectCard: {
    backgroundColor: "#fff",
    borderRadius: radius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  branchSelectHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  branchSelectTitle: { fontSize: 13, fontWeight: "800", color: colors.text },
  badgeBranchWise: {
    backgroundColor: colors.primary50,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  badgeBranchWiseText: { fontSize: 10, fontWeight: "800", color: colors.primaryDark },
  branchChipsScroll: { flexDirection: "row", gap: spacing.sm, paddingVertical: 4 },
  branchChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  branchChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  branchDot: { width: 8, height: 8, borderRadius: 4 },
  branchChipText: { fontSize: 12, fontWeight: "700", color: colors.text },
  branchChipTextActive: { color: "#fff" },
  activeCheckIcon: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },

  configCard: {
    backgroundColor: "#fff",
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    overflow: "hidden",
    ...shadow.sm,
  },
  configHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    backgroundColor: "#fbfcfb",
  },
  configStatusDot: { width: 12, height: 12, borderRadius: 6 },
  configTitle: { fontSize: 15, fontWeight: "800", color: colors.text },
  configSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  statusPillText: { fontSize: 11, fontWeight: "800" },
  configBody: { padding: spacing.lg, paddingTop: 0 },

  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  fieldLabel: { fontSize: 13, fontWeight: "700", color: colors.text },
  fieldSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },

  freqRow: { flexDirection: "row", gap: spacing.sm, marginTop: 8 },
  freqChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
  },
  freqChipActive: {
    backgroundColor: colors.primary50,
    borderColor: colors.primary,
  },
  freqChipText: { fontSize: 12, fontWeight: "800", color: colors.text },
  freqChipTextActive: { color: colors.primaryDark },
  freqChipSub: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  freqChipSubActive: { color: colors.primaryDark },

  daysRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  dayChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dayChipText: { fontSize: 11, fontWeight: "700", color: colors.textMuted },
  dayChipTextActive: { color: "#fff" },

  timeRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: 8 },
  timeChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timeChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  timeChipText: { fontSize: 11, fontWeight: "700", color: colors.textMuted },
  timeChipTextActive: { color: "#fff" },

  minBalInput: {
    marginTop: 6,
    height: 42,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 14,
    color: colors.text,
    backgroundColor: "#FAFAFA",
  },
  customMessageInput: {
    marginTop: 6,
    minHeight: 70,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 13,
    color: colors.text,
    backgroundColor: "#FAFAFA",
    textAlignVertical: "top",
  },

  filterOptions: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  checkboxRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  checkboxLabel: { fontSize: 12, color: colors.text, fontWeight: "600" },

  saveActionsWrap: { marginTop: spacing.lg, gap: spacing.sm },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: radius.lg,
    ...shadow.sm,
  },
  saveBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.primary50,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    paddingVertical: 10,
    borderRadius: radius.lg,
  },
  copyBtnText: { color: colors.primaryDark, fontSize: 13, fontWeight: "700" },

  kpiContainer: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg },
  kpiCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  kpiLabel: { fontSize: 11, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase" },
  kpiVal: { fontSize: 18, fontWeight: "800", marginTop: 4 },
  kpiSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },

  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    height: 44,
    marginBottom: spacing.md,
  },
  searchInput: { flex: 1, fontSize: 13, color: colors.text },

  listHeaderRow: { marginBottom: spacing.sm },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: colors.text },
  sectionSubtitle: { fontSize: 11, color: colors.textMuted, marginTop: 2 },

  customerCard: {
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  customerTopRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 16, fontWeight: "800" },
  custName: { fontSize: 14, fontWeight: "800", color: colors.text },
  custMetaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  custMeta: { fontSize: 11, color: colors.textMuted },
  metaDot: { fontSize: 11, color: colors.textMuted },

  balAmount: { fontSize: 15, fontWeight: "800" },
  balLabel: { fontSize: 10, color: colors.textMuted, textTransform: "uppercase", fontWeight: "700" },

  financialsStrip: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#f9fbf9",
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.md,
    marginTop: 8,
    marginBottom: 8,
  },
  stripText: { fontSize: 11, color: colors.textMuted },
  stripBold: { fontWeight: "700", color: colors.text },

  actionsRow: { flexDirection: "row", gap: spacing.sm },
  whatsAppBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#25D366",
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  whatsAppBtnText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  smsBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "#E3F2FD",
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  smsBtnText: { color: "#1565C0", fontSize: 12, fontWeight: "700" },

  emptyContainer: { alignItems: "center", justifyContent: "center", paddingVertical: 40 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: colors.text, marginTop: spacing.md },
  emptySub: { fontSize: 12, color: colors.textMuted, textAlign: "center", marginTop: 4, maxWidth: 280 },
});

