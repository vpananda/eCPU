import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { storage } from "@/src/utils/storage";

export type LanguageCode = "en" | "ta" | "ml" | "hi";

export interface LanguageOption {
  code: LanguageCode;
  label: string;
  nativeName: string;
  flag: string;
}

export const LANGUAGES: LanguageOption[] = [
  { code: "en", label: "English", nativeName: "English", flag: "🇬🇧" },
  { code: "ta", label: "Tamil", nativeName: "தமிழ்", flag: "🇮🇳" },
  { code: "ml", label: "Malayalam", nativeName: "മലയാളം", flag: "🇮🇳" },
  { code: "hi", label: "Hindi", nativeName: "हिन्दी", flag: "🇮🇳" },
];

export const translations: Record<LanguageCode, Record<string, string>> = {
  en: {
    // Header & Titles
    "title.dashboard": "Dashboard",
    "title.customers": "Customers",
    "title.machines": "Dryer Machines",
    "title.more": "More Settings",
    "title.arrival_form": "New Arrival",
    "title.arrivals": "Arrivals & Processing",
    "title.audit": "Audit Trail",
    "title.batches": "Batch List",
    "title.batching_form": "Dryer Processing",
    "title.load_dryer": "Load Dryer",
    "title.stop_dryer": "Stop Dryer",
    "title.branches_admin": "Manage Branches",
    "title.customer_form": "New Customer",
    "title.delivery_picker": "Deliver Produce",
    "title.delivery": "Delivery",
    "title.expense_form": "Record Expense",
    "title.expenses": "Expenses",
    "title.machine_form": "New Machine",
    "title.maintenance_form": "Record Maintenance",
    "title.maintenance": "Maintenance Logs",
    "title.payment_form": "Collect Advance",
    "title.payment_picker": "Collect Payment",
    "title.payments": "Cash Book",
    "title.sale_form": "Record Sale",
    "title.sales": "Sales Logs",
    "title.reports": "Business Reports",
    "title.search": "Search System",
    "title.settings": "System Settings",
    "title.users_admin": "Manage Users",

    // Common UI
    "common.all_branches": "All Branches",
    "common.select_branch": "Select Branch",
    "common.select_language": "Choose App Language",
    "common.sync": "Sync & Refresh",
    "common.home": "Home",
    "common.cancel": "Cancel",
    "common.save": "Save",
    "common.close": "Close",
    "common.loading": "Loading...",
    "common.search": "Search...",

    // Processing / Batching
    "processing.start_drying": "Start Drying",
    "processing.running_batches": "Running Batches",
    "processing.no_batches_drying": "No Batches Currently Drying",
    "processing.all_dryers_idle": "All dryers are idle. Select pending arrivals in \"Start Drying\" to launch a new batch run.",
    "processing.start_new_run": "+ Start New Dryer Run",
    "processing.complete_processing": "Complete Processing",
    "processing.in_dryers": "IN DRYERS",
    "processing.arrival_weight": "ARRIVAL WEIGHT",
    "processing.dry_weight": "DRY WEIGHT",
    "processing.padi_weight": "PADI WEIGHT",
    "processing.bags": "BAGS",
    "processing.status": "STATUS",
    "processing.drying": "Drying",
    "processing.loaded": "Loaded",
    "processing.completed": "Completed",

    // Quick Actions
    "quick.arrival": "New Arrival",
    "quick.processing": "Processing",
    "quick.deliver": "Deliver",
    "quick.cash_book": "Cash Book",
    "quick.sale": "Record Sale",
  },

  ta: {
    // Header & Titles
    "title.dashboard": "முகப்பு",
    "title.customers": "வாடிக்கையாளர்கள்",
    "title.machines": "டிரையர் இயந்திரங்கள்",
    "title.more": "கூடுதல் அமைப்புகள்",
    "title.arrival_form": "புதிய வரவு",
    "title.arrivals": "வரவுகள் & உலர்த்தல்",
    "title.audit": "செயல்பாட்டு பதிவு",
    "title.batches": "பேட்ச் பட்டியல்",
    "title.batching_form": "டிரையர் உலர்த்தல்",
    "title.load_dryer": "டிரையரில் ஏற்றுதல்",
    "title.stop_dryer": "டிரையரை நிறுத்து",
    "title.branches_admin": "கிளைகள் மேலாண்மை",
    "title.customer_form": "புதிய வாடிக்கையாளர்",
    "title.delivery_picker": "சரக்கு டெலிவரி",
    "title.delivery": "டெலிவரி",
    "title.expense_form": "செலவு பதிவு",
    "title.expenses": "செலவுகள்",
    "title.machine_form": "புதிய இயந்திரம்",
    "title.maintenance_form": "பராமரிப்பு பதிவு",
    "title.maintenance": "பராமரிப்பு பதிவுகள்",
    "title.payment_form": "முன்பணம் வாங்குதல்",
    "title.payment_picker": "பணம் வசூலித்தல்",
    "title.payments": "பணப் பதிவேடு",
    "title.sale_form": "விற்பனை பதிவு",
    "title.sales": "விற்பனை பதிவுகள்",
    "title.reports": "வணிக அறிக்கைகள்",
    "title.search": "தேடல்",
    "title.settings": "கணினி அமைப்புகள்",
    "title.users_admin": "பயனர்கள் மேலாண்மை",

    // Common UI
    "common.all_branches": "அனைத்து கிளைகள்",
    "common.select_branch": "கிளையைத் தேர்ந்தெடுக்கவும்",
    "common.select_language": "பயன்பாட்டு மொழியைத் தேர்வுசெய்க",
    "common.sync": "ஒத்திசை & புதுப்பி",
    "common.home": "முகப்பு",
    "common.cancel": "ரத்துசெய்",
    "common.save": "சேமிக்கவும்",
    "common.close": "மூடு",
    "common.loading": "ஏற்றுகிறது...",
    "common.search": "தேடுக...",

    // Processing / Batching
    "processing.start_drying": "உலர்த்தலைத் தொடங்கு",
    "processing.running_batches": "இயங்கும் பேட்ச்கள்",
    "processing.no_batches_drying": "தற்போது எந்த பேட்சும் உலரவில்லை",
    "processing.all_dryers_idle": "எல்லா டிரையர்களும் பயன்பாட்டில் இல்லை. புதிய பேட்சைத் தொடங்க \"உலர்த்தலைத் தொடங்கு\" என்பதைத் தேர்ந்தெடுக்கவும்.",
    "processing.start_new_run": "+ புதிய டிரையர் ஓட்டம்",
    "processing.complete_processing": "உலர்த்தலை முடிக்கவும்",
    "processing.in_dryers": "டிரையரில் உள்ளவை",
    "processing.arrival_weight": "வரவு எடை",
    "processing.dry_weight": "உலர் எடை",
    "processing.padi_weight": "படி எடை",
    "processing.bags": "மூட்டைகள்",
    "processing.status": "நிலை",
    "processing.drying": "உலர்த்தல்",
    "processing.loaded": "ஏற்றப்பட்டது",
    "processing.completed": "முடிந்தது",

    // Quick Actions
    "quick.arrival": "புதிய வரவு",
    "quick.processing": "உலர்த்தல்",
    "quick.deliver": "டெலிவரி",
    "quick.cash_book": "பணப் பதிவேடு",
    "quick.sale": "விற்பனை",
  },

  ml: {
    // Header & Titles
    "title.dashboard": "ഡാഷ്‌ബോർഡ്",
    "title.customers": "ഉപഭോക്താക്കൾ",
    "title.machines": "ഡ്രയർ മെഷീനുകൾ",
    "title.more": "കൂടുതൽ ക്രമീകരണങ്ങൾ",
    "title.arrival_form": "പുതിയ വരവ്",
    "title.arrivals": "വരവുകളും സംസ്കരണവും",
    "title.audit": "ഓഡിറ്റ് രേഖ",
    "title.batches": "ബാച്ച് ലിസ്റ്റ്",
    "title.batching_form": "ഡ്രയർ സംസ്കരണം",
    "title.load_dryer": "ഡ്രയറിലേക്ക് കയറ്റുക",
    "title.stop_dryer": "ഡ്രയർ നിർത്തുക",
    "title.branches_admin": "ബ്രാഞ്ചുകൾ നിയന്ത്രിക്കുക",
    "title.customer_form": "പുതിയ ഉപഭോക്താവ്",
    "title.delivery_picker": "ചരക്ക് ഡെലിവറി",
    "title.delivery": "ഡെലിവറി",
    "title.expense_form": "ചെലവ് രേഖപ്പെടുത്തുക",
    "title.expenses": "ചെലവുകൾ",
    "title.machine_form": "പുതിയ മെഷീൻ",
    "title.maintenance_form": "അറ്റകുറ്റപ്പണി രേഖ",
    "title.maintenance": "മെയിന്റനൻസ് ലോഗുകൾ",
    "title.payment_form": "അഡ്വാൻസ് വാങ്ങുക",
    "title.payment_picker": "പണം സ്വീകരിക്കുക",
    "title.payments": "കാഷ് ബുക്ക്",
    "title.sale_form": "വിൽപ്പന രേഖപ്പെടുത്തുക",
    "title.sales": "വിൽപ്പന ലോഗുകൾ",
    "title.reports": "ബിസിനസ്സ് റിപ്പോർട്ടുകൾ",
    "title.search": "തിരയുക",
    "title.settings": "സിസ്റ്റം ക്രമീകരണങ്ങൾ",
    "title.users_admin": "ഉപയോക്താക്കളെ നിയന്ത്രിക്കുക",

    // Common UI
    "common.all_branches": "എല്ലാ ബ്രാഞ്ചുകളും",
    "common.select_branch": "ബ്രാഞ്ച് തിരഞ്ഞെടുക്കുക",
    "common.select_language": "ആപ്പ് ഭാഷ തിരഞ്ഞെടുക്കുക",
    "common.sync": "സമന്വയിപ്പിക്കുക & പുതുക്കുക",
    "common.home": "ഹോം",
    "common.cancel": "റദ്ദാക്കുക",
    "common.save": "സംരക്ഷിക്കുക",
    "common.close": "അടയ്ക്കുക",
    "common.loading": "ലോഡ് ചെയ്യുന്നു...",
    "common.search": "തിരയുക...",

    // Processing / Batching
    "processing.start_drying": "ഡ്രയിംഗ് ആരംഭിക്കുക",
    "processing.running_batches": "പ്രവർത്തിക്കുന്ന ബാച്ചുകൾ",
    "processing.no_batches_drying": "നിലവിൽ ബാച്ചുകൾ ഒന്നും ഡ്രൈ ആകുന്നില്ല",
    "processing.all_dryers_idle": "എല്ലാ ഡ്രയറുകളും ഒഴിവാണ്. പുതിയ ബാച്ച് തുടങ്ങാൻ \"ഡ്രയിംഗ് ആരംഭിക്കുക\" തിരഞ്ഞെടുക്കുക.",
    "processing.start_new_run": "+ പുതിയ ഡ്രയർ റൺ",
    "processing.complete_processing": "ഡ്രയിംഗ് പൂർത്തിയാക്കുക",
    "processing.in_dryers": "ഡ്രയറിലുള്ളവ",
    "processing.arrival_weight": "വരവ് ഭാരം",
    "processing.dry_weight": "ഉണങ്ങിയ ഭാരം",
    "processing.padi_weight": "പടി ഭാരം",
    "processing.bags": "ചാക്കുകൾ",
    "processing.status": "നില",
    "processing.drying": "ഡ്രയിംഗ്",
    "processing.loaded": "കയറ്റി",
    "processing.completed": "പൂർത്തിയായി",

    // Quick Actions
    "quick.arrival": "പുതിയ വരവ്",
    "quick.processing": "സംസ്കരണം",
    "quick.deliver": "ഡെലിവറി",
    "quick.cash_book": "കാഷ് ബുക്ക്",
    "quick.sale": "വിൽപ്പന",
  },

  hi: {
    // Header & Titles
    "title.dashboard": "डैशबोर्ड",
    "title.customers": "ग्राहक",
    "title.machines": "ड्रायर मशीनें",
    "title.more": "अन्य सेटिंग्स",
    "title.arrival_form": "नई आवक (आगमन)",
    "title.arrivals": "आवक और प्रोसेसिंग",
    "title.audit": "ऑडिट ट्रेल",
    "title.batches": "बैच सूची",
    "title.batching_form": "ड्रायर प्रोसेसिंग",
    "title.load_dryer": "ड्रायर में माल लोड करें",
    "title.stop_dryer": "ड्रायर रोकें",
    "title.branches_admin": "शाखा प्रबंधन",
    "title.customer_form": "नया ग्राहक",
    "title.delivery_picker": "माल डिलीवरी",
    "title.delivery": "डिलीवरी",
    "title.expense_form": "खर्चा दर्ज करें",
    "title.expenses": "खर्चे",
    "title.machine_form": "नई मशीन",
    "title.maintenance_form": "रखरखाव दर्ज करें",
    "title.maintenance": "रखरखाव लॉग",
    "title.payment_form": "अग्रिम भुगतान लें",
    "title.payment_picker": "भुगतान संग्रह",
    "title.payments": "रोकड़ बही (कैश बुक)",
    "title.sale_form": "बिक्री दर्ज करें",
    "title.sales": "बिक्री लॉग",
    "title.reports": "व्यापार रिपोर्ट",
    "title.search": "खोजें",
    "title.settings": "सिस्टम सेटिंग्स",
    "title.users_admin": "उपयोगकर्ता प्रबंधन",

    // Common UI
    "common.all_branches": "सभी शाखाएं",
    "common.select_branch": "शाखा चुनें",
    "common.select_language": "ऐप की भाषा चुनें",
    "common.sync": "सिंक और रीफ्रेश",
    "common.home": "होम",
    "common.cancel": "रद्द करें",
    "common.save": "सहेजें",
    "common.close": "बंद करें",
    "common.loading": "लोड हो रहा है...",
    "common.search": "खोजें...",

    // Processing / Batching
    "processing.start_drying": "सुखाना शुरू करें",
    "processing.running_batches": "चालू बैच",
    "processing.no_batches_drying": "वर्तमान में कोई बैच नहीं सूख रहा है",
    "processing.all_dryers_idle": "सभी ड्रायर खाली हैं। नया बैच चलाने के लिए \"सुखाना शुरू करें\" में लंबित आवक चुनें।",
    "processing.start_new_run": "+ नया ड्रायर रन शुरू करें",
    "processing.complete_processing": "प्रोसेसिंग पूर्ण करें",
    "processing.in_dryers": "ड्रायर में",
    "processing.arrival_weight": "आवक वजन",
    "processing.dry_weight": "सूखा वजन",
    "processing.padi_weight": "पाडी वजन",
    "processing.bags": "बोरी (बैग)",
    "processing.status": "स्थिति",
    "processing.drying": "सूख रहा है",
    "processing.loaded": "लोड किया गया",
    "processing.completed": "पूर्ण हुआ",

    // Quick Actions
    "quick.arrival": "नई आवक",
    "quick.processing": "प्रोसेसिंग",
    "quick.deliver": "डिलीवरी",
    "quick.cash_book": "कैश बुक",
    "quick.sale": "बिक्री",
  },
};

const LANGUAGE_STORAGE_KEY = "ethree_app_language";

interface LanguageContextType {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => Promise<void>;
  t: (key: string, fallback?: string) => string;
  languages: LanguageOption[];
}

const LanguageContext = createContext<LanguageContextType>({
  language: "en",
  setLanguage: async () => {},
  t: (k, f) => f || k,
  languages: LANGUAGES,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>("en");

  useEffect(() => {
    (async () => {
      try {
        const saved = await storage.getItem<string>(LANGUAGE_STORAGE_KEY, "en");
        if (saved && (saved === "en" || saved === "ta" || saved === "ml" || saved === "hi")) {
          setLanguageState(saved as LanguageCode);
        }
      } catch {}
    })();
  }, []);

  const setLanguage = useCallback(async (lang: LanguageCode) => {
    setLanguageState(lang);
    try {
      await storage.setItem(LANGUAGE_STORAGE_KEY, lang);
    } catch {}
  }, []);

  const t = useCallback((key: string, fallback?: string): string => {
    const dict = translations[language] || translations.en;
    if (dict && dict[key]) {
      return dict[key];
    }
    // Fallback to English
    if (translations.en[key]) {
      return translations.en[key];
    }
    return fallback || key;
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, languages: LANGUAGES }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
