import os
import requests
from urllib.parse import urlencode

TRUELAYER_AUTH_URL = "https://auth.truelayer.com/"
TRUELAYER_API_URL = "https://api.truelayer.com/"

CLIENT_ID = os.getenv("TRUELAYER_CLIENT_ID")
CLIENT_SECRET = os.getenv("TRUELAYER_CLIENT_SECRET")
REDIRECT_URI = "http://127.0.0.1:5000/callback"


def get_auth_link():
    """Generates the TrueLayer authentication URL."""
    params = {
        "response_type": "code",
        "client_id": CLIENT_ID,
        "scope": "info accounts balance transactions cards offline_access",
        "redirect_uri": REDIRECT_URI,
        "providers": "uk-ob-hsbc uk-ob-amex uk-cs-revolut uk-ins-hargreaves-lansdown",
    }
    return f"{TRUELAYER_AUTH_URL}?{urlencode(params)}"


def exchange_code_for_token(code):
    """Exchanges an authorization code for an access token."""
    params = {
        "grant_type": "authorization_code",
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "redirect_uri": REDIRECT_URI,
        "code": code,
    }
    response = requests.post(f"{TRUELAYER_AUTH_URL}connect/token", data=params)
    response.raise_for_status()
    return response.json()


def get_api_data(endpoint, access_token):
    """Generic function to make authenticated requests to the TrueLayer Data API."""
    headers = {"Authorization": f"Bearer {access_token}"}
    response = requests.get(f"{TRUELAYER_API_URL}data/v1/{endpoint}", headers=headers)
    response.raise_for_status()
    return response.json()["results"]


def get_accounts(access_token):
    """Fetches all accounts."""
    return get_api_data("accounts", access_token)


def get_account_balance(access_token, account_id):
    """Fetches balance for a single account."""
    return get_api_data(f"accounts/{account_id}/balance", access_token)[0]


def get_account_transactions(access_token, account_id):
    """Fetches all transactions for a single account."""
    return get_api_data(f"accounts/{account_id}/transactions", access_token)


def get_cards(access_token):
    """Fetches all cards."""
    return get_api_data("cards", access_token)


def get_card_balance(access_token, card_id):
    """Fetches balance for a single card."""
    return get_api_data(f"cards/{card_id}/balance", access_token)[0]


def get_card_transactions(access_token, card_id):
    """Fetches all transactions for a single card."""
    return get_api_data(f"cards/{card_id}/transactions", access_token)