export const colors = {
  primary: "#2E7D32",
  primaryDark: "#1B5E20",
  primaryLight: "#81C784",
  primary50: "#E8F5E9",
  accent: "#F57C00",
  accentLight: "#FFE0B2",
  bg: "#F4F7F5",
  card: "#FFFFFF",
  border: "#E4E9E6",
  text: "#0F1B14",
  textMuted: "#5F6E67",
  textLight: "#9AA5A0",
  danger: "#C62828",
  warning: "#F57C00",
  success: "#2E7D32",
  info: "#1565C0",
  purple: "#7B1FA2",
  status: {
    Available: "#1565C0",
    Running: "#2E7D32",
    Maintenance: "#F57C00",
    Cleaning: "#7B1FA2",
    Received: "#5D4037",
    Loaded: "#1565C0",
    Drying: "#F57C00",
    Completed: "#2E7D32",
    Delivered: "#43A047",
  } as Record<string, string>,
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, pill: 999 };

export const shadow = {
  card: {
    shadowColor: "#0F1B14",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  fab: {
    shadowColor: "#2E7D32",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
};
