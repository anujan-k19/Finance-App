import os
from datetime import datetime
from itertools import groupby

from dotenv import load_dotenv
from flask import Flask, redirect, render_template, request, session, url_for
import requests

import truelayer_api

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("APP_SECRET_KEY")


@app.route('/')
def index():
    """
    Renders the main dashboard. If the user is authenticated, it fetches
    and displays their financial data. Otherwise, it shows a connect button.
    """
    access_token = session.get("access_token")
    if not access_token:
        return render_template("index.html", has_data=False)

    try:
        # Fetch accounts and cards
        accounts = truelayer_api.get_accounts(access_token)
        cards = truelayer_api.get_cards(access_token)

        # Add 'account_type' to card objects for consistent processing, resolving the KeyError.
        for card in cards:
            card['account_type'] = 'CARD'

        all_accounts = accounts + cards

        # Fetch balance and transactions for each account
        for account in all_accounts:
            account_id = account["account_id"]
            if account["account_type"] == "CARD":
                account["balance"] = truelayer_api.get_card_balance(access_token, account_id)
                transactions = truelayer_api.get_card_transactions(access_token, account_id)
            else:
                account["balance"] = truelayer_api.get_account_balance(access_token, account_id)
                transactions = truelayer_api.get_account_transactions(access_token, account_id)

            # Group transactions by month
            transactions.sort(key=lambda x: x['timestamp'], reverse=True)
            account['transactions_by_month'] = {
                month: list(txs)
                for month, txs in groupby(transactions, key=lambda x: datetime.fromisoformat(x['timestamp'].replace('Z', '+00:00')).strftime('%Y-%m'))
            }

        # Filter accounts into categories for the tabbed view
        credit_cards = [acc for acc in all_accounts if acc['account_type'] == 'CARD']
        savings_accounts = [acc for acc in all_accounts if acc['account_type'] == 'SAVING']
        debit_accounts = [acc for acc in all_accounts if acc['account_type'] == 'TRANSACTION']

        return render_template(
            "index.html",
            has_data=bool(all_accounts),
            credit_cards=credit_cards,
            savings_accounts=savings_accounts,
            debit_accounts=debit_accounts
        )

    except requests.exceptions.HTTPError as e:
        # A 401 Unauthorized error from the API likely means the access_token has expired.
        if e.response.status_code == 401:
            print("Access token expired or invalid. Logging out.")
            print("Access token expired or invalid. Attempting to refresh...")
            refresh_token = session.get("refresh_token")
            if not refresh_token:
                print("No refresh token available. Logging out.")
                return redirect(url_for("logout"))

            try:
                new_token_data = truelayer_api.refresh_access_token(refresh_token)
                session["access_token"] = new_token_data["access_token"]
                session["refresh_token"] = new_token_data.get("refresh_token", refresh_token)
                print("Token refreshed successfully. Reloading page.")
                return redirect(url_for("index"))
            except requests.exceptions.HTTPError as refresh_error:
                print(f"Failed to refresh token: {refresh_error}. Logging out.")
                return redirect(url_for("logout"))
        else:
            # For other HTTP errors, we can log them.
            print(f"An HTTP error occurred: {e}")
        # Potentially a token expiry, clear session and ask to reconnect
        return redirect(url_for("logout"))
            return redirect(url_for("logout"))

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
