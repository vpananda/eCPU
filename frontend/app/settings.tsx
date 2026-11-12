import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, TextInput, Switch, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, Stack } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/components/Toast";
import { useConfirm } from "@/src/components/ConfirmModal";
import { MultiPhoneInput } from "@/src/components/MultiPhoneInput";
import { colors, radius, shadow, spacing } from "@/src/theme";

const TIME_PRESETS = [
  { label: "7:00 PM", val: "19:00" },
  { label: "8:00 PM", val: "20:00" },
  { label: "8:30 PM", val: "20:30" },
  { label: "9:00 PM", val: "21:00" },
  { label: "9:30 PM", val: "21:30" },
  { label: "10:00 PM", val: "22:00" },
];

export default function Settings() {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const [company, setCompany] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Daily WhatsApp Report Settings State
  const [dailyEnabled, setDailyEnabled] = useState(true);
  const [sendTime, setSendTime] = useState("21:00");
  const [adminPhones, setAdminPhones] = useState("");
  const [includeFinancials, setIncludeFinancials] = useState(true);
  const [savingDaily, setSavingDaily] = useState(false);
  const [testingDaily, setTestingDaily] = useState(false);

  // Preview Modal State
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previews, setPreviews] = useState<any[]>([]);
  const [activePreviewIndex, setActivePreviewIndex] = useState(0);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, p, m, b, ds] = await Promise.all([
        api<any>("/settings/company"),
        api<any[]>("/products"),
        api<any[]>("/machines"),
        api<any[]>("/branches"),
        api<any>("/reports/daily-whatsapp/settings").catch(() => ({
          enabled: true,
          send_time: "21:00",
          admin_phones: "",
          include_financials: true,
        })),
      ]);
      setCompany(c);
      setProducts(p);
      setMachines(m);
      setBranches(b);
      if (ds) {
        setDailyEnabled(ds.enabled ?? true);
        setSendTime(ds.send_time || "21:00");
        setAdminPhones(ds.admin_phones || "");
        setIncludeFinancials(ds.include_financials ?? true);
      }
    } catch (e: any) {
      setError(e.message || "Failed to load settings data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSaveDailySettings = async () => {
    setSavingDaily(true);
    try {
      await api("/reports/daily-whatsapp/settings", {
        method: "PUT",
        body: {
          enabled: dailyEnabled,
          send_time: sendTime,
          admin_phones: adminPhones,
          include_financials: includeFinancials,
        },
      });
      toast.show("Daily WhatsApp report settings saved!");
    } catch (e: any) {
      toast.show(e.message || "Failed to save settings", "error");
    } finally {
      setSavingDaily(false);
    }
  };

  const handleOpenPreview = async () => {
    setPreviewLoading(true);
    setPreviewOpen(true);
    try {
      const res = await api<any[]>("/reports/daily-whatsapp/preview");
      setPreviews(Array.isArray(res) ? res : [res]);
      setActivePreviewIndex(0);
    } catch (e: any) {
      toast.show(e.message || "Failed to generate preview", "error");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSendTestNow = async () => {
    const ok = await confirm({
      title: "Send Test WhatsApp Report",
      message: "This will compile today's live operational summary and dispatch it immediately via WhatsApp to all configured recipients. Proceed?",
      confirmText: "Send Test Now",
      icon: "whatsapp",
    });
    if (!ok) return;

    setTestingDaily(true);
    try {
      await api("/reports/daily-whatsapp/send-now", {
        method: "POST",
        body: {},
      });
      toast.show("Daily summary dispatched to WhatsApp!");
    } catch (e: any) {
      toast.show(e.message || "Failed to send report", "error");
    } finally {
      setTestingDaily(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.xl }}>
          <MaterialCommunityIcons name="alert-circle-outline" size={48} color={colors.danger} />
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text, marginTop: spacing.md, textAlign: "center" }}>
            {error}
          </Text>
          <TouchableOpacity
            onPress={load}
            style={{
              marginTop: spacing.lg,
              paddingHorizontal: 24,
              paddingVertical: 12,
              borderRadius: radius.pill,
              backgroundColor: colors.primary,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 }}>
          {/* Automated Daily WhatsApp Status Report Section */}
          <View style={[styles.section, styles.waHighlightSection]}>
            <View style={styles.waSectionHeader}>
              <View style={styles.waIconBox}>
                <MaterialCommunityIcons name="whatsapp" size={24} color="#059669" />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.waSectionTitle}>Daily WhatsApp Status Report</Text>
                <Text style={styles.waSectionSubtitle}>Automated branch-wise summary to selected numbers</Text>
              </View>
              <Switch
                value={dailyEnabled}
                onValueChange={setDailyEnabled}
                trackColor={{ false: "#CBD5E1", true: "#86EFAC" }}
                thumbColor={dailyEnabled ? "#16A34A" : "#F1F5F9"}
              />
            </View>

            {dailyEnabled && (
              <View style={{ marginTop: spacing.md }}>
                {/* Send Time Config */}
                <Text style={styles.fieldLabel}>Scheduled Send Time (IST)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetScroll}>
                  {TIME_PRESETS.map((p) => {
                    const isSelected = sendTime === p.val;
                    return (
                      <TouchableOpacity
                        key={p.val}
                        onPress={() => setSendTime(p.val)}
                        style={[styles.presetPill, isSelected && styles.presetPillActive]}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.presetPillText, isSelected && styles.presetPillTextActive]}>
                          {p.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <View style={styles.customTimeRow}>
                  <Text style={styles.customTimeLabel}>Custom 24-hr Time (HH:MM):</Text>
                  <TextInput
                    style={styles.timeInput}
                    value={sendTime}
                    onChangeText={setSendTime}
                    placeholder="21:00"
                    placeholderTextColor={colors.textLight}
                    maxLength={5}
                  />
                </View>

                {/* Executive / Owner Numbers (Multi-Number Tag Manager) */}
                <MultiPhoneInput
                  label="Owner / Executive Numbers (All Branches)"
                  helper="Add as many owner/director numbers as needed. Every number here receives daily 9:00 PM reports for all branches."
                  value={adminPhones}
                  onChangeText={setAdminPhones}
                  placeholder="Enter 10-digit mobile e.g. 9176653766"
                />

                {/* Include Financials Toggle */}
                <View style={styles.switchRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.switchLabel}>Include Day Billing & Collections</Text>
                    <Text style={styles.switchSub}>Show today's billed value & collections received in WhatsApp text</Text>
                  </View>
                  <Switch
                    value={includeFinancials}
                    onValueChange={setIncludeFinancials}
                    trackColor={{ false: "#CBD5E1", true: "#86EFAC" }}
                    thumbColor={includeFinancials ? "#16A34A" : "#F1F5F9"}
                  />
                </View>

                {/* Actions */}
                <View style={styles.waActionsRow}>
                  <TouchableOpacity
                    style={styles.waPreviewBtn}
                    onPress={handleOpenPreview}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons name="eye-outline" size={16} color={colors.primary} />
                    <Text style={styles.waPreviewBtnText}>Preview Report</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.waTestBtn}
                    onPress={handleSendTestNow}
                    disabled={testingDaily}
                    activeOpacity={0.8}
                  >
                    {testingDaily ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <MaterialCommunityIcons name="send-outline" size={15} color="#fff" />
                        <Text style={styles.waTestBtnText}>Send Test Now</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.waSaveBtn}
                  onPress={handleSaveDailySettings}
                  disabled={savingDaily}
                  activeOpacity={0.85}
                >
                  {savingDaily ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.waSaveBtnText}>Save Report Settings</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>

          <Section title="Company Information">
            <Row label="Name" value={company?.name || "-"} />
            <Row label="Default Rate" value={`₹${company?.default_rate || 0}/kg`} />
            <Row label="GST" value={company?.gst || "Not set"} />
          </Section>

          <Section title={`Branches (${branches.length})`}>
            {branches.map(b => (
              <Row
                key={b.id}
                label={b.name}
                value={b.report_phones ? `WA: ${b.report_phones}` : (b.address || "-")}
              />
            ))}
          </Section>

          <Section title={`Products (${products.length})`}>
            {products.map(p => (
              <Row key={p.id} label={p.name} value={`₹${p.default_rate}/kg`} />
            ))}
          </Section>

          <Section title={`Machines (${machines.length})`}>
            {machines.map(m => (
              <Row key={m.id} label={m.name} value={`${m.capacity}kg · ${m.status}`} />
            ))}
          </Section>

          <Section title="Account">
            <Row label="Name" value={user?.name || "-"} />
            <Row label="Mobile" value={user?.mobile || "-"} />
            <Row label="Role" value={user?.role || "-"} />
          </Section>

          <Text style={styles.footer}>E3 · Post Harvest Processing Unit · v1.0.0</Text>
        </ScrollView>
      )}

      {/* Preview WhatsApp Modal */}
      <Modal
        visible={previewOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewOpen(false)}
      >
        <View style={styles.modalBg}>
          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <View style={styles.waIconSmall}>
                <MaterialCommunityIcons name="whatsapp" size={20} color="#059669" />
              </View>
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.previewTitle}>Live WhatsApp Preview</Text>
                <Text style={styles.previewSubtitle}>Branch-wise summary compiled for today</Text>
              </View>
              <TouchableOpacity onPress={() => setPreviewOpen(false)} style={styles.closeBtn}>
                <MaterialCommunityIcons name="close" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {previewLoading ? (
              <View style={{ padding: 40, alignItems: "center" }}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={{ marginTop: 12, color: colors.textMuted, fontSize: 13 }}>Compiling branch metrics...</Text>
              </View>
            ) : previews.length === 0 ? (
              <View style={{ padding: 30, alignItems: "center" }}>
                <Text style={{ color: colors.textMuted }}>No branch data available</Text>
              </View>
            ) : (
              <View style={{ flex: 1 }}>
                {previews.length > 1 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll}>
                    {previews.map((item, idx) => (
                      <TouchableOpacity
                        key={item.branch_id || idx}
                        style={[styles.branchTab, activePreviewIndex === idx && styles.branchTabActive]}
                        onPress={() => setActivePreviewIndex(idx)}
                      >
                        <Text style={[styles.branchTabText, activePreviewIndex === idx && styles.branchTabTextActive]}>
                          {item.branch_name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}

                <ScrollView style={styles.msgScrollView}>
                  <View style={styles.chatBubble}>
                    <Text style={styles.chatText}>{previews[activePreviewIndex]?.message}</Text>
                  </View>
                </ScrollView>
              </View>
            )}

            <TouchableOpacity style={styles.previewCloseBtn} onPress={() => setPreviewOpen(false)}>
              <Text style={styles.previewCloseBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  section: { backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.md, ...shadow.card },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: colors.textMuted, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: spacing.sm },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  rowLabel: { fontSize: 13, color: colors.textMuted, fontWeight: "500" },
  rowValue: { fontSize: 13, color: colors.text, fontWeight: "700", flexShrink: 1, textAlign: "right", marginLeft: 12 },
  footer: { textAlign: "center", fontSize: 11, color: colors.textLight, marginTop: spacing.lg },

  // WhatsApp Section Styles
  waHighlightSection: {
    borderWidth: 1.5,
    borderColor: "#A7F3D0",
    backgroundColor: "#F0FDF4",
  },
  waSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  waIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
  },
  waSectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#065F46",
  },
  waSectionSubtitle: {
    fontSize: 11.5,
    color: "#047857",
    marginTop: 1,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 6,
  },
  fieldHint: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4,
    lineHeight: 15,
  },
  presetScroll: {
    flexDirection: "row",
    gap: 6,
    paddingVertical: 4,
  },
  presetPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  presetPillActive: {
    backgroundColor: "#059669",
    borderColor: "#059669",
  },
  presetPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
  },
  presetPillTextActive: {
    color: "#fff",
  },
  customTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  customTimeLabel: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "600",
  },
  timeInput: {
    backgroundColor: "#fff",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 13,
    fontWeight: "700",
    width: 70,
    textAlign: "center",
  },
  textInput: {
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: colors.text,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "#DCFCE7",
  },
  switchLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  switchSub: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  waActionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: spacing.md,
  },
  waPreviewBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  waPreviewBtnText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: colors.primary,
  },
  waTestBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: "#059669",
  },
  waTestBtnText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#fff",
  },
  waSaveBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  waSaveBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },

  // Modal Preview Styles
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.md,
  },
  previewCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: spacing.lg,
    width: "100%",
    maxWidth: 440,
    maxHeight: "85%",
    ...shadow.card,
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  waIconSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
  },
  previewTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
  },
  previewSubtitle: {
    fontSize: 11,
    color: colors.textMuted,
  },
  closeBtn: {
    padding: 6,
    borderRadius: radius.pill,
    backgroundColor: "#F1F5F9",
  },
  tabScroll: {
    flexDirection: "row",
    marginVertical: spacing.xs,
    maxHeight: 36,
  },
  branchTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: "#F1F5F9",
    marginRight: 6,
  },
  branchTabActive: {
    backgroundColor: "#059669",
  },
  branchTabText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: colors.textMuted,
  },
  branchTabTextActive: {
    color: "#fff",
  },
  msgScrollView: {
    marginVertical: spacing.sm,
    backgroundColor: "#ECE5DD",
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  chatBubble: {
    backgroundColor: "#E7FFDB",
    borderRadius: 10,
    padding: 12,
    alignSelf: "flex-start",
    maxWidth: "100%",
    borderTopLeftRadius: 0,
  },
  chatText: {
    fontSize: 12.5,
    lineHeight: 18,
    color: "#111827",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  previewCloseBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: 10,
    borderRadius: radius.pill,
    alignItems: "center",
  },
  previewCloseBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
});
