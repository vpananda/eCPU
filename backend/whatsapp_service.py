import os
import re
import logging
import httpx
from pathlib import Path
from typing import List, Optional, Dict, Any
from dotenv import load_dotenv

ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(ENV_PATH)

logger = logging.getLogger("whatsapp_service")

API_VERSION = "v21.0"

def get_config():
    return {
        "phone_id": os.getenv("META_WHATSAPP_PHONE_ID", "1401641583041163"),
        "account_id": os.getenv("META_WHATSAPP_ACCOUNT_ID", "3654992631346126"),
        "token": os.getenv("META_WHATSAPP_TOKEN", "").strip(),
    }

def clean_phone_number(phone: str) -> str:
    """Format phone number with country code (e.g. 919876543210 for India)"""
    if not phone:
        return ""
    digits = re.sub(r"\D", "", phone)
    if not digits:
        return ""
    # 10-digit number -> default to India 91 prefix
    if len(digits) == 10:
        return f"91{digits}"
    # 11-digit starting with 0
    if len(digits) == 11 and digits.startswith("0"):
        return f"91{digits[1:]}"
    return digits

async def send_whatsapp_template(
    to_phone: str,
    template_name: str,
    parameters: Optional[List[str]] = None,
    language_code: str = "en_US"
) -> Dict[str, Any]:
    """
    Send an approved WhatsApp Utility / Marketing Template.
    If parameters is None/empty, it sends a zero-variable template (like 'hello_world').
    """
    cfg = get_config()
    token = cfg["token"]
    phone_id = cfg["phone_id"]

    if not token:
        return {
            "success": False,
            "error": "META_WHATSAPP_TOKEN is missing in backend/.env. Please paste your Meta Access Token."
        }

    clean_to = clean_phone_number(to_phone)
    if not clean_to:
        return {"success": False, "error": f"Invalid recipient phone number: '{to_phone}'"}

    components = []
    if parameters:
        components.append({
            "type": "body",
            "parameters": [{"type": "text", "text": str(p)} for p in parameters]
        })

    payload: Dict[str, Any] = {
        "messaging_product": "whatsapp",
        "to": clean_to,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": language_code}
        }
    }
    if components:
        payload["template"]["components"] = components

    url = f"https://graph.facebook.com/{API_VERSION}/{phone_id}/messages"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
            data = resp.json()

            if resp.status_code == 200 and "messages" in data:
                msg_id = data["messages"][0]["id"]
                logger.info(f"WhatsApp sent successfully to {clean_to}: msg_id={msg_id}")
                return {
                    "success": True,
                    "message_id": msg_id,
                    "recipient": clean_to,
                    "template": template_name
                }
            else:
                err_msg = data.get("error", {}).get("message", "Unknown Meta error")
                err_code = data.get("error", {}).get("code")
                err_subcode = data.get("error", {}).get("error_subcode")
                logger.error(f"Meta WhatsApp error ({err_code}/{err_subcode}): {err_msg}")
                return {
                    "success": False,
                    "error": err_msg,
                    "details": data.get("error", {})
                }
    except Exception as e:
        logger.error(f"WhatsApp request failed: {e}")
        return {"success": False, "error": str(e)}

async def send_whatsapp_text(to_phone: str, message_text: str) -> Dict[str, Any]:
    """
    Send a direct text message via WhatsApp Cloud API.
    (Note: Meta allows freeform text if recipient has messaged your business number in the past 24 hours).
    """
    cfg = get_config()
    token = cfg["token"]
    phone_id = cfg["phone_id"]

    if not token:
        return {"success": False, "error": "META_WHATSAPP_TOKEN is missing in backend/.env"}

    clean_to = clean_phone_number(to_phone)
    if not clean_to:
        return {"success": False, "error": f"Invalid recipient phone: '{to_phone}'"}

    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": clean_to,
        "type": "text",
        "text": {"preview_url": False, "body": message_text}
    }

    url = f"https://graph.facebook.com/{API_VERSION}/{phone_id}/messages"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
            data = resp.json()
            if resp.status_code == 200 and "messages" in data:
                return {"success": True, "message_id": data["messages"][0]["id"]}
            else:
                return {"success": False, "error": data.get("error", {}).get("message", "Meta API Error"), "details": data.get("error", {})}
    except Exception as e:
        return {"success": False, "error": str(e)}


from datetime import datetime, timezone, timedelta

IST = timezone(timedelta(hours=5, minutes=30))

def format_datetime_str(dt_val: Optional[str] = None) -> str:
    """Format timestamp into DD-MM-YYYY hh:mm AM/PM in IST"""
    now_ist = datetime.now(timezone.utc).astimezone(IST)
    if not dt_val:
        return now_ist.strftime("%d-%m-%Y %I:%M %p")
    try:
        s = str(dt_val).strip()
        if "-" in s and any(m in s for m in ["AM", "PM", "am", "pm"]):
            return s
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        dt_ist = dt.astimezone(IST)
        return dt_ist.strftime("%d-%m-%Y %I:%M %p")
    except Exception:
        return now_ist.strftime("%d-%m-%Y %I:%M %p")

def clean_branch_label(b_name: Optional[str]) -> str:
    if not b_name:
        return "Main"
    s = str(b_name).strip()
    if s.lower().endswith(" branch"):
        s = s[:-7].strip()
    return s or "Main"

# -----------------------------------------------------------------------------
# BUSINESS DOMAIN HELPERS FOR E3 AGRO (BRANCH NAME ONLY SIGN-OFF)
# -----------------------------------------------------------------------------

async def send_arrival_receipt(
    to_phone: str,
    customer_name: str,
    product_name: str,
    branch_name: str,
    batch_no: str,
    raw_weight: float,
    bags: int,
    arrival_time: Optional[str] = None,
    language_code: str = "en"
) -> Dict[str, Any]:
    """Send Stock Arrival Receipt with Wet Product, Arrival Time, and Branch Name only in Thank You"""
    clean_prod = product_name or "Cardamom"
    formatted_time = format_datetime_str(arrival_time)
    branch_label = clean_branch_label(branch_name)
    lang = language_code or "en"

    # 1. Try v5 (Thanks,\n{{7}} only - without Branch and with multi-language: en, ta, ml, kn, te, hi)
    res_v5 = await send_whatsapp_template(
        to_phone=to_phone,
        template_name="e3_arrival_receipt_v5",
        parameters=[
            customer_name,
            clean_prod,
            batch_no,
            formatted_time,
            f"{raw_weight:,.1f}",
            str(bags),
            branch_label
        ],
        language_code=lang
    )
    if res_v5.get("success"):
        return res_v5

    # 2. Try v4 (Thank you,\n{{7}} Branch - without E3 Agro)
    res = await send_whatsapp_template(
        to_phone=to_phone,
        template_name="e3_arrival_receipt_v4",
        parameters=[
            customer_name,
            clean_prod,
            batch_no,
            formatted_time,
            f"{raw_weight:,.1f}",
            str(bags),
            branch_label
        ],
        language_code="en"
    )
    if res.get("success"):
        return res

    # 2. Fallback to approved v3 (Arrival: {{4}} + Thank you, E3 Agro - {{7}} Branch)
    logger.info(f"e3_arrival_receipt_v4 pending ({res.get('error')}), using approved e3_arrival_receipt_v3")
    res_v3 = await send_whatsapp_template(
        to_phone=to_phone,
        template_name="e3_arrival_receipt_v3",
        parameters=[
            customer_name,
            clean_prod,
            batch_no,
            formatted_time,
            f"{raw_weight:,.1f}",
            str(bags),
            branch_label
        ],
        language_code="en"
    )
    if res_v3.get("success"):
        return res_v3

    # 3. Fallback to approved v2
    return await send_whatsapp_template(
        to_phone=to_phone,
        template_name="e3_arrival_receipt_v2",
        parameters=[
            customer_name,
            clean_prod,
            batch_no,
            f"{raw_weight:,.1f}",
            str(bags),
            branch_label
        ],
        language_code="en"
    )

async def send_drying_completed(
    to_phone: str,
    customer_name: str,
    product_name: str,
    batch_no: str,
    dry_weight: float,
    branch_name: str,
    language_code: str = "en"
) -> Dict[str, Any]:
    """Send Processing Complete with Branch Name only in Thank You"""
    clean_prod = product_name or "Cardamom"
    branch_label = clean_branch_label(branch_name)
    lang = language_code or "en"

    # 1. Try v3 (Thank you,\n{{5}} Branch - without E3 Agro)
    res = await send_whatsapp_template(
        to_phone=to_phone,
        template_name="e3_drying_completed_v3",
        parameters=[
            customer_name,
            clean_prod,
            batch_no,
            f"{dry_weight:,.2f}",
            branch_label
        ],
        language_code=lang
    )
    if res.get("success"):
        return res

    # 2. Fallback to approved v2
    logger.info(f"e3_drying_completed_v3 pending ({res.get('error')}), using approved e3_drying_completed_v2")
    return await send_whatsapp_template(
        to_phone=to_phone,
        template_name="e3_drying_completed_v2",
        parameters=[
            customer_name,
            clean_prod,
            batch_no,
            f"{dry_weight:,.2f}",
            branch_label
        ],
        language_code="en"
    )

async def send_delivery_statement(
    to_phone: str,
    customer_name: str,
    product_name: str,
    batch_no: str,
    delivered_weight: float,
    delivered_to: str,
    bill_amount: float,
    amount_received: float,
    batch_pending: float,
    overall_pending: float,
    branch_name: str,
    language_code: str = "en"
) -> Dict[str, Any]:
    """Send Delivery Confirmation with Receiver & Branch Name only in Thank You"""
    clean_prod = product_name or "Cardamom"
    branch_label = clean_branch_label(branch_name)
    lang = language_code or "en"

    # 1. Try v3 (Thank you for choosing {{10}} Branch! - without E3 Agro)
    res = await send_whatsapp_template(
        to_phone=to_phone,
        template_name="e3_delivery_statement_v3",
        parameters=[
            customer_name,
            clean_prod,
            batch_no,
            f"{delivered_weight:,.2f}",
            delivered_to or "Customer",
            f"{bill_amount:,.2f}",
            f"{amount_received:,.2f}",
            f"{batch_pending:,.2f}",
            f"{overall_pending:,.2f}",
            branch_label
        ],
        language_code=lang
    )
    if res.get("success"):
        return res

    # 2. Fallback to approved v2
    logger.info(f"e3_delivery_statement_v3 pending ({res.get('error')}), using approved e3_delivery_statement_v2")
    return await send_whatsapp_template(
        to_phone=to_phone,
        template_name="e3_delivery_statement_v2",
        parameters=[
            customer_name,
            clean_prod,
            batch_no,
            f"{delivered_weight:,.2f}",
            delivered_to or "Customer",
            f"{bill_amount:,.2f}",
            f"{amount_received:,.2f}",
            f"{batch_pending:,.2f}",
            f"{overall_pending:,.2f}",
            branch_label
        ],
        language_code="en"
    )

async def send_payment_receipt(
    to_phone: str,
    customer_name: str,
    amount: float,
    date: str,
    receipt_no: str,
    balance: float,
    branch_name: str = "Main",
    language_code: str = "en"
) -> Dict[str, Any]:
    """Send Payment Collection Confirmation with Branch Name only in Thank You"""
    branch_label = clean_branch_label(branch_name)
    lang = language_code or "en"

    # 1. Try v3 (Thank you,\n{{6}} Branch - without E3 Agro)
    res = await send_whatsapp_template(
        to_phone=to_phone,
        template_name="e3_payment_receipt_v3",
        parameters=[
            customer_name,
            f"{amount:,.2f}",
            date,
            receipt_no,
            f"{balance:,.2f}",
            branch_label
        ],
        language_code=lang
    )
    if res.get("success"):
        return res

    # 2. Fallback to approved v2
    logger.info(f"e3_payment_receipt_v3 pending ({res.get('error')}), using approved e3_payment_receipt_v2")
    return await send_whatsapp_template(
        to_phone=to_phone,
        template_name="e3_payment_receipt_v2",
        parameters=[
            customer_name,
            f"{amount:,.2f}",
            date,
            receipt_no,
            f"{balance:,.2f}",
            branch_label
        ],
        language_code="en"
    )

