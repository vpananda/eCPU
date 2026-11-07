import os
import json
import httpx
from dotenv import load_dotenv

load_dotenv("backend/.env")

TOKEN = os.getenv("META_WHATSAPP_TOKEN")
WABA_ID = os.getenv("META_WHATSAPP_ACCOUNT_ID")
API_VERSION = "v21.0"

templates = [
    {
        "name": "e3_arrival_receipt_v2",
        "category": "UTILITY",
        "language": "en",
        "components": [
            {
                "type": "BODY",
                "text": "Hello {{1}},\n\nYour Wet {{2}} arrival has been recorded.\n* Batch No: {{3}}\n* Wet Weight: {{4}} KG\n* Bags: {{5}}\n\nThank you,\nE3 Agro - {{6}} Branch",
                "example": {
                    "body_text": [
                        ["SP Kajanaparai", "Cardamom", "B01004", "450.5", "9", "Moolathurai"]
                    ]
                }
            }
        ]
    },
    {
        "name": "e3_drying_completed_v2",
        "category": "UTILITY",
        "language": "en",
        "components": [
            {
                "type": "BODY",
                "text": "Hello {{1}},\n\nDrying processing is complete for your {{2}} batch.\n* Batch No: {{3}}\n* Dry Weight: {{4}} KG\n* Status: Ready for Delivery\n\nThank you,\nE3 Agro - {{5}} Branch",
                "example": {
                    "body_text": [
                        ["SP Kajanaparai", "Cardamom", "B01004", "95.50", "Moolathurai"]
                    ]
                }
            }
        ]
    },
    {
        "name": "e3_delivery_statement_v2",
        "category": "UTILITY",
        "language": "en",
        "components": [
            {
                "type": "BODY",
                "text": "Hello {{1}},\n\nYour Dry {{2}} batch {{3}} has been delivered.\n* Dry Weight: {{4}} KG\n* Delivered To: {{5}}\n* Total Bill: Rs. {{6}}\n* Amount Received: Rs. {{7}}\n* Batch Balance: Rs. {{8}}\n* Overall Pending: Rs. {{9}}\n\nThank you for choosing E3 Agro - {{10}} Branch!",
                "example": {
                    "body_text": [
                        ["SP Kajanaparai", "Cardamom", "B01004", "95.50", "Ramesh (9444449766)", "2,865.00", "2,000.00", "865.00", "14,250.00", "Moolathurai"]
                    ]
                }
            }
        ]
    },
    {
        "name": "e3_payment_receipt_v2",
        "category": "UTILITY",
        "language": "en",
        "components": [
            {
                "type": "BODY",
                "text": "Hello {{1}},\n\nPayment of Rs. {{2}} has been received on {{3}}.\n* Receipt Ref: {{4}}\n* Current Balance: Rs. {{5}}\n\nThank you,\nE3 Agro - {{6}} Branch",
                "example": {
                    "body_text": [
                        ["SP Kajanaparai", "5,000.00", "2026-11-07", "PAY-001", "0.00", "Moolathurai"]
                    ]
                }
            }
        ]
    }
]

url = f"https://graph.facebook.com/{API_VERSION}/{WABA_ID}/message_templates"
headers = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json"
}

with httpx.Client(timeout=30.0) as client:
    for t in templates:
        print(f"Submitting template '{t['name']}'...")
        res = client.post(url, json=t, headers=headers)
        print(f"Status: {res.status_code}")
        print(json.dumps(res.json(), indent=2))
        print("-" * 50)
