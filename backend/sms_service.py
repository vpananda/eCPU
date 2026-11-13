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


async def send_sms(to_phone: str, message: str) -> Dict[str, Any]:
    """
    Send an SMS via Fast2SMS Quick SMS Route.
    """
    api_key = os.getenv("FAST2SMS_API_KEY", "").strip()
    if not api_key:
        return {"success": False, "error": "FAST2SMS_API_KEY not configured in backend/.env"}

    clean_phone = clean_indian_phone_10(to_phone)
    if not clean_phone:
        return {"success": False, "error": f"Invalid Indian 10-digit mobile number: '{to_phone}'"}

    payload = {
        "route": "q",
        "message": message,
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
