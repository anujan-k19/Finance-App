import os
from datetime import datetime
from itertools import groupby

from functools import wraps
from collections import defaultdict
from dotenv import load_dotenv
from flask import Flask, redirect, render_template, request, session, url_for, jsonify
import requests 

import truelayer_api

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("APP_SECRET_KEY")


def token_required(f):
    """Decorator to check for access token and handle token refresh."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        access_token = session.get("access_token")
        if not access_token:
            return jsonify({"error": "Not authenticated"}), 401

        try:
            # Try to execute the decorated function (e.g., the API call)
            return f(access_token, *args, **kwargs)
        except requests.exceptions.HTTPError as e:
            # If the external API call fails with 401, try to refresh the token
            if e.response.status_code == 401:
                print("Access token expired or invalid. Attempting to refresh...")
                refresh_token = session.get("refresh_token")
                if not refresh_token:
                    return jsonify({"error": "Authentication expired, no refresh token"}), 401

                try:
                    new_token_data = truelayer_api.refresh_access_token(refresh_token)
                    session["access_token"] = new_token_data["access_token"]
                    session["refresh_token"] = new_token_data.get("refresh_token", refresh_token)
                    print("Token refreshed successfully. Retrying original request.")
                    # Retry the original function with the new token
                    return f(session["access_token"], *args, **kwargs)
                except requests.exceptions.HTTPError as refresh_error:
                    print(f"Failed to refresh token: {refresh_error}. Logging out.")
                    session.clear()
                    return jsonify({"error": "Failed to refresh token"}), 401
            else:
                # For other HTTP errors, return a generic server error
                print(f"An HTTP error occurred: {e}")
                return jsonify({"error": "An external API error occurred"}), 500
    return decorated_function


@app.route('/')
@app.route('/<path:path>')
def index(path=None):
    """
    Renders the shell that will host the React application.
    """
    return render_template("layout.html")

@app.route('/api/dashboard')
@token_required
def get_dashboard_data(access_token):
    """
    Fetches all account and balance data and returns it as JSON.
    """
    accounts = truelayer_api.get_accounts(access_token)
    cards = truelayer_api.get_cards(access_token)

    for card in cards:
        card['account_type'] = 'CARD'

    all_accounts = accounts + cards

    for account in all_accounts:
        account_id = account["account_id"]
        if account["account_type"] == "CARD":
            account["balance"] = truelayer_api.get_card_balance(access_token, account_id)
        else:
            account["balance"] = truelayer_api.get_account_balance(access_token, account_id)

    credit_cards = [acc for acc in all_accounts if acc['account_type'] == 'CARD']
    savings_accounts = [acc for acc in all_accounts if acc['account_type'] == 'SAVING']
    debit_accounts = [acc for acc in all_accounts if acc['account_type'] == 'TRANSACTION']

    return jsonify({
        "credit_cards": credit_cards,
        "savings_accounts": savings_accounts,
        "debit_accounts": debit_accounts
    })

@app.route('/api/breakdown')
@token_required
def get_breakdown_data(access_token):
    """
    Fetches all transactions and returns spending breakdown by category for the current month as JSON.
    """
    accounts = truelayer_api.get_accounts(access_token)
    cards = truelayer_api.get_cards(access_token)

    all_transactions = []
    for account in accounts:
        all_transactions.extend(truelayer_api.get_account_transactions(access_token, account["account_id"]))
    for card in cards:
        all_transactions.extend(truelayer_api.get_card_transactions(access_token, card["account_id"]))

    current_month_str = datetime.now().strftime('%Y-%m')
    spending_by_category = defaultdict(float)

    for tx in all_transactions:
        tx_month = datetime.fromisoformat(tx['timestamp'].replace('Z', '+00:00')).strftime('%Y-%m')
        if tx_month == current_month_str and tx['amount'] < 0:
            spending_by_category[tx['transaction_category']] += abs(tx['amount'])

    sorted_spending = sorted(spending_by_category.items(), key=lambda item: item[1], reverse=True)

    labels = [item[0] for item in sorted_spending]
    data = [round(item[1], 2) for item in sorted_spending]
    month_display = datetime.now().strftime('%B %Y')

    return jsonify({
        "labels": labels,
        "data": data,
        "month": month_display
    })


@app.route('/connect')
def connect():
    """Redirects the user to the TrueLayer authentication URL."""
    auth_url = truelayer_api.get_auth_link()
    return redirect(auth_url)

@app.route('/callback')
def callback():
    """Handles the callback from TrueLayer, exchanges the code for a token."""
    code = request.args.get("code")
    token_data = truelayer_api.exchange_code_for_token(code)
    session["access_token"] = token_data["access_token"]
    # Store the refresh_token as well to handle future token expiry
    session["refresh_token"] = token_data["refresh_token"]
    return redirect(url_for("index"))

@app.route('/logout')
def logout():
    """Clears the session."""
    session.clear()
    return redirect(url_for("index"))

if __name__ == '__main__':
    app.run(debug=True)
