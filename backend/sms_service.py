import os
import re
import logging
import httpx
from typing import Dict, Any, Optional

logger = logging.getLogger("ethree.sms")

FAST2SMS_API_URL = "https://www.fast2sms.com/dev/bulkV2"
FAST2SMS_WALLET_URL = "https://www.fast2sms.com/dev/wallet"


def clean_indian_phone_10(phone: str) -> str:
    """Format phone number to standard 10-digit Indian mobile number for Fast2SMS."""
    if not phone:
        return ""
    digits = re.sub(r"\D", "", phone)
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    elif digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]
    return digits if len(digits) == 10 else ""


async def check_sms_wallet() -> Dict[str, Any]:
    """Check Fast2SMS wallet balance."""
    api_key = os.getenv("FAST2SMS_API_KEY", "").strip()
    if not api_key:
        return {"success": False, "error": "FAST2SMS_API_KEY is missing in backend/.env"}

    headers = {"authorization": api_key}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(FAST2SMS_WALLET_URL, headers=headers)
            data = res.json()
            if res.status_code == 200 and data.get("return"):
                return {
                    "success": True,
                    "wallet_balance": data.get("wallet", "0"),
                    "sms_count": data.get("sms_count", 0)
                }
            return {"success": False, "error": data.get("message", "Failed to check wallet balance")}
    except Exception as e:
        return {"success": False, "error": str(e)}


SMS_DISCLAIMERS = {
    "en": "Disclaimer: For any dispute or missing, contact your store in-charge.",
    "ta": "Disclaimer: ஏதேனும் முரண்பாடு அல்லது விடுபடலுக்கு ஸ்டோர் இன்சார்ஜை தொடர்பு கொள்ளவும்.",
    "ml": "Disclaimer: തർക്കങ്ങൾക്കോ കുറവുകൾക്കോ നിങ്ങളുടെ സ്റ്റോർ ഇൻ-ചാർജുമായി ബന്ധപ്പെടുക.",
    "kn": "Disclaimer: ಯಾವುದೇ ವಿವಾದ ಅಥವಾ ಕೊರತೆಗೆ ನಿಮ್ಮ ಸ್ಟೋರ್ ಇನ್‌ಚಾರ್ಜ್ ಅವರನ್ನು ಸಂಪರ್ಕಿಸಿ.",
    "te": "Disclaimer: ఏదైనా వివాదం లేదా కొరతకు మీ స్టోర్ ఇన్-ఛార్జ్ ను సంప్రదించండి.",
    "hi": "Disclaimer: किसी भी विवाद या कमी के लिए स्टोर इन-चार्ज से संपर्क करें।",
}

def get_sms_disclaimer(lang: str = "en") -> str:
    return SMS_DISCLAIMERS.get((lang or "").lower(), SMS_DISCLAIMERS["en"])


async def send_sms(to_phone: str, message: str, language: str = "en") -> Dict[str, Any]:
    """
    Send an SMS via Fast2SMS Quick SMS Route.
    """
    api_key = os.getenv("FAST2SMS_API_KEY", "").strip()
    if not api_key:
        return {"success": False, "error": "FAST2SMS_API_KEY not configured in backend/.env"}

    clean_phone = clean_indian_phone_10(to_phone)
    if not clean_phone:
        return {"success": False, "error": f"Invalid Indian 10-digit mobile number: '{to_phone}'"}

    # Automatically append store in-charge disclaimer to every customer SMS if not already present
    sms_text = message.strip()
    disclaimer = f" {get_sms_disclaimer(language)}"
    if "dispute" not in sms_text.lower() and "in-charge" not in sms_text.lower() and "in charge" not in sms_text.lower():
        sms_text = f"{sms_text}\n{disclaimer}"

    payload = {
        "route": "q",
        "message": sms_text,
        "language": "english",
        "flash": 0,
        "numbers": clean_phone
    }

    headers = {
        "authorization": api_key,
        "Content-Type": "application/json"
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(FAST2SMS_API_URL, json=payload, headers=headers)
            data = res.json()
            if res.status_code == 200 and data.get("return"):
                logger.info(f"SMS sent successfully to {clean_phone}: {data.get('message')}")
                return {
                    "success": True,
                    "recipient": clean_phone,
                    "message_id": data.get("request_id"),
                    "message": data.get("message")
                }
            else:
                err_msg = data.get("message") or f"Fast2SMS error (HTTP {res.status_code})"
                logger.warning(f"Fast2SMS send failed for {clean_phone}: {err_msg}")
                return {
                    "success": False,
                    "recipient": clean_phone,
                    "error": err_msg,
                    "status_code": data.get("status_code", res.status_code)
                }
    except Exception as ex:
        logger.error(f"SMS gateway connection error: {ex}")
        return {"success": False, "recipient": clean_phone, "error": str(ex)}

