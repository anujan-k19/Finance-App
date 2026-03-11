import os
from datetime import datetime
from itertools import groupby

from functools import wraps
import math
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
    # cards might be empty if the provider doesn't support it or user has none
    cards = truelayer_api.get_cards(access_token)

    for card in cards:
        card['account_type'] = 'CARD'

    all_accounts = accounts + cards

    total_balance = 0.0
    total_assets = 0.0
    total_liabilities = 0.0
    todays_change = 0.0
    today_str = datetime.now().strftime('%Y-%m-%d')

    for account in all_accounts:
        account_id = account["account_id"]
        balance = 0.0
        transactions = []

        if account["account_type"] == "CARD":
            balance_data = truelayer_api.get_card_balance(access_token, account_id)
            account["balance"] = balance_data
            transactions = truelayer_api.get_card_transactions(access_token, account_id)
        else:
            balance_data = truelayer_api.get_account_balance(access_token, account_id)
            account["balance"] = balance_data
            transactions = truelayer_api.get_account_transactions(access_token, account_id)

        current_val = balance_data.get('current', 0.0)
        total_balance += current_val

        if current_val >= 0:
            total_assets += current_val
        else:
            total_liabilities += abs(current_val)

        # Calculate today's change by summing today's transactions
        for tx in transactions:
            if tx['timestamp'].startswith(today_str):
                todays_change += tx['amount']

    credit_cards = [acc for acc in all_accounts if acc['account_type'] == 'CARD']
    savings_accounts = [acc for acc in all_accounts if acc['account_type'] == 'SAVING']
    debit_accounts = [acc for acc in all_accounts if acc['account_type'] == 'TRANSACTION']

    return jsonify({
        "summary": {
            "net_worth": round(total_balance, 2),
            "total_assets": round(total_assets, 2),
            "total_liabilities": round(total_liabilities, 2),
            "todays_change": round(todays_change, 2),
            "currency": "GBP" # Assuming GBP for simplicity, ideally taken from first account
        },
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

    # Check if a specific month is requested (YYYY-MM)
    selected_month = request.args.get('month')
    if selected_month:
        target_month_str = selected_month
        # Parse for display name
        try:
            month_display = datetime.strptime(selected_month, '%Y-%m').strftime('%B %Y')
        except ValueError:
            month_display = selected_month
    else:
        target_month_str = datetime.now().strftime('%Y-%m')
        month_display = datetime.now().strftime('%B %Y')

    spending_by_category = defaultdict(float)

    for tx in all_transactions:
        tx_month = datetime.fromisoformat(tx['timestamp'].replace('Z', '+00:00')).strftime('%Y-%m')
        if tx_month == target_month_str and tx['amount'] < 0:
            spending_by_category[tx['transaction_category']] += abs(tx['amount'])

    sorted_spending = sorted(spending_by_category.items(), key=lambda item: item[1], reverse=True)

    labels = [item[0] for item in sorted_spending]
    data = [round(item[1], 2) for item in sorted_spending]

    return jsonify({
        "labels": labels,
        "data": data,
        "month": month_display
    })

@app.route('/api/account_transactions')
@token_required
def get_single_account_transactions(access_token):
    """Fetches recent transactions for a single account."""
    account_id = request.args.get('account_id')
    account_type = request.args.get('account_type')

    if not account_id:
        return jsonify({"error": "account_id is required"}), 400

    transactions = []
    if account_type == 'CARD':
        transactions = truelayer_api.get_card_transactions(access_token, account_id)
    else:
        transactions = truelayer_api.get_account_transactions(access_token, account_id)

    # Sort by date descending (newest first)
    transactions.sort(key=lambda x: x['timestamp'], reverse=True)
    
    # Return up to 15 recent transactions for the detail view
    return jsonify(transactions[:15])


@app.route('/api/transactions')
@token_required
def get_transactions_data(access_token):
    """
    Fetches all transactions from all accounts and returns them as a sorted list.
    """
    accounts = truelayer_api.get_accounts(access_token)
    cards = truelayer_api.get_cards(access_token)

    all_transactions = []

    # Fetch transactions and append account name for context
    for account in accounts:
        txs = truelayer_api.get_account_transactions(access_token, account["account_id"])
        for tx in txs:
            tx['account_name'] = account['display_name']
            all_transactions.append(tx)

    for card in cards:
        txs = truelayer_api.get_card_transactions(access_token, card["account_id"])
        for tx in txs:
            tx['account_name'] = card['display_name']
            all_transactions.append(tx)

    # Sort by date descending (newest first)
    all_transactions.sort(key=lambda x: x['timestamp'], reverse=True)

    # --- Search Logic ---
    search_query = request.args.get('search', '').lower()
    if search_query:
        filtered_txs = []
        for tx in all_transactions:
            # Check description or amount (converted to string)
            if search_query in tx.get('description', '').lower() or search_query in str(tx.get('amount', '')):
                filtered_txs.append(tx)
        all_transactions = filtered_txs

    # --- Pagination Logic ---
    page = request.args.get('page', 1, type=int)
    per_page = 50  # Number of transactions per page
    total_txs = len(all_transactions)
    total_pages = math.ceil(total_txs / per_page)

    start = (page - 1) * per_page
    end = start + per_page
    paginated_txs = all_transactions[start:end]

    return jsonify({
        "transactions": paginated_txs,
        "pagination": {
            "page": page,
            "per_page": per_page,
            "total_pages": total_pages,
            "total_transactions": total_txs,
            "has_prev": page > 1,
            "has_next": page < total_pages
        }
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
