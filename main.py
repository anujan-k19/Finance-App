import os
from datetime import datetime, timedelta
from itertools import groupby
import threading
import re

from functools import wraps
import math
from collections import defaultdict
import calendar
from dotenv import load_dotenv
from flask import Flask, redirect, render_template, request, session, url_for, jsonify
import requests 
from supabase import create_client, Client

import truelayer_api

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("APP_SECRET_KEY")

# --- Supabase Setup ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# --- Transaction Categorization Logic ---

# A simple rule-based categorizer. In a real-world app, this could be more complex,
# stored in a database, or use a machine learning model.
MERCHANT_TO_CATEGORY = {
    # Groceries
    "tesco": "Groceries", "sainsbury's": "Groceries", "asda": "Groceries",
    "morrisons": "Groceries", "lidl": "Groceries", "aldi": "Groceries",
    "waitrose": "Groceries", "co-op": "Groceries", "iceland": "Groceries",
    "ocado": "Groceries",
    # Transport
    "tfl": "Transport", "uber": "Transport", "bolt": "Transport",
    "trainline": "Transport", "national express": "Transport",
    "shell": "Petrol", "bp": "Petrol", "esso": "Petrol",
    # Food & Drink
    "starbucks": "Coffee", "costa": "Coffee", "pret a manger": "Eating Out",
    "mcdonald's": "Eating Out", "kfc": "Eating Out", "nando's": "Eating Out",
    "deliveroo": "Takeaway", "just eat": "Takeaway", "uber eats": "Takeaway",
    # Shopping
    "amazon": "Shopping", "ebay": "Shopping", "asos": "Shopping", "zara": "Shopping",
    # Utilities & Bills
    "thames water": "Utilities", "british gas": "Utilities", "edf": "Utilities",
    "bt": "Bills", "sky": "Bills", "virgin media": "Bills",
    "netflix": "Bills", "spotify": "Bills",
}

# Add some common categories that might not be in the rules.
ADDITIONAL_CATEGORIES = ["General", "Income", "Transfers", "Entertainment", "Health"]

def user_has_connections(user_id):
    """Checks if the user has any linked bank connections."""
    try:
        # Using count='exact' to efficiently check for existence
        res = supabase.table('bank_connections').select("id", count='exact').eq('user_id', user_id).execute()
        return res.count > 0
    except Exception:
        return False

def categorize_transaction(description, rule_overrides):
    """
    Categorizes a transaction based on keywords in its description,
    respecting user-defined rule overrides.
    """
    if not description:
        return "General"
    description_lower = description.lower()

    # 1. Check for user-defined rule overrides first
    for merchant, category in rule_overrides.items():
        if merchant in description_lower:
            return category

    # 2. Check hardcoded rules next
    for merchant, category in MERCHANT_TO_CATEGORY.items():
        if merchant in description_lower:
            return category
    return "General"  # 3. Default category if no match is found

def login_required(f):
    """Decorator to check if a user is logged in via Supabase."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = session.get("user")
        if not user:
            return jsonify({"error": "Not authenticated"}), 403
        return f(user, *args, **kwargs)
    return decorated_function

def sync_truelayer_data(user_id):
    """
    Fetches data from all linked TrueLayer connections, persists to Supabase,
    and handles token refreshing.
    """
    # Fetch user-specific categorization rules from the database
    rules_response = supabase.table('user_category_rules').select('merchant_keyword, category').eq('user_id', user_id).execute()
    rule_overrides = {rule['merchant_keyword']: rule['category'] for rule in rules_response.data}

    # 1. Get all bank connections for this user
    response = supabase.table('bank_connections').select("*").eq('user_id', user_id).execute()
    connections = response.data

    for conn in connections:
        access_token = conn['access_token']
        refresh_token = conn['refresh_token']
        
        # 2. Attempt to fetch accounts, refresh token if expired
        accounts = []
        cards = []
        try:
            accounts = truelayer_api.get_accounts(access_token)
            cards = truelayer_api.get_cards(access_token)
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 401:
                # Token expired, refresh it
                try:
                    new_data = truelayer_api.refresh_access_token(refresh_token)
                    access_token = new_data['access_token']
                    refresh_token = new_data.get('refresh_token', refresh_token)
                    
                    # Update DB
                    supabase.table('bank_connections').update({
                        'access_token': access_token, 
                        'refresh_token': refresh_token
                    }).eq('id', conn['id']).execute()
                    
                    # Retry fetch
                    accounts = truelayer_api.get_accounts(access_token)
                    cards = truelayer_api.get_cards(access_token)
                except Exception as refresh_err:
                    print(f"Failed to refresh token for conn {conn['id']}: {refresh_err}")
                    # If the refresh token is invalid (400) or unauthorized (401), remove the dead connection
                    if isinstance(refresh_err, requests.exceptions.HTTPError) and refresh_err.response.status_code in (400, 401):
                        print(f"Removing invalid connection {conn['id']} from database.")
                        # Assuming ON DELETE CASCADE is enabled for linked accounts/transactions
                        supabase.table('bank_connections').delete().eq('id', conn['id']).execute()
                    continue
            else:
                print(f"API Error for conn {conn['id']}: {e}")
                continue

        # 3. Process Accounts & Cards
        # Tag source to ensure correct API endpoint usage
        for a in accounts: a['__source'] = 'account'
        for c in cards: c['__source'] = 'card'

        all_fetched_accounts = accounts + cards
        for acc in all_fetched_accounts:
            # Determine account type
            acc_type = 'CARD' if acc.get('__source') == 'card' else 'TRANSACTION'
            if 'account_type' in acc: acc_type = acc['account_type'] # Respect API if present
            
            # Fetch Balance
            current_balance = 0.0
            try:
                if acc.get('__source') == 'card':
                    bal_data = truelayer_api.get_card_balance(access_token, acc['account_id'])
                else:
                    bal_data = truelayer_api.get_account_balance(access_token, acc['account_id'])
                
                current_balance = bal_data.get('current', 0.0)
            except requests.exceptions.HTTPError as e:
                if e.response.status_code == 404:
                    print(f"Balance not found for account {acc['account_id']}, defaulting to 0.0")
                else:
                    print(f"Error syncing account {acc['account_id']}: {e}")
                    continue

            try:
                # Upsert Account to Supabase
                supabase.table('accounts').upsert({
                    'account_id': acc['account_id'],
                    'connection_id': conn['id'],
                    'user_id': user_id,
                    'display_name': acc['display_name'],
                    'currency': acc['currency'],
                    'account_type': acc_type,
                    'provider': acc.get('provider'),
                    'current_balance': current_balance,
                    'updated_at': 'now()'
                }).execute()

                # Fetch & Sync Transactions
                if acc.get('__source') == 'card':
                    txs = truelayer_api.get_card_transactions(access_token, acc['account_id'])
                else:
                    txs = truelayer_api.get_account_transactions(access_token, acc['account_id'])
                
                # Prepare batch insert/upsert for transactions
                tx_rows = []
                for tx in txs:
                    # Apply categorization rules before saving
                    cat = categorize_transaction(tx.get('description'), rule_overrides)
                    
                    tx_rows.append({
                        'transaction_id': tx['transaction_id'],
                        'account_id': acc['account_id'],
                        'user_id': user_id,
                        'description': tx['description'],
                        'amount': tx['amount'],
                        'currency': tx.get('currency'),
                        'category': cat,
                        'timestamp': tx['timestamp']
                    })
                
                if tx_rows:
                    # Upsert to avoid duplicates
                    supabase.table('transactions').upsert(tx_rows).execute()
                    
            except Exception as e:
                print(f"Error syncing account {acc['account_id']}: {e}")

@app.route('/')
@app.route('/<path:path>')
def index(path=None):
    return render_template("layout.html")

@app.route('/api/dashboard')
@login_required
def get_dashboard_data(user):
    """Fetches dashboard data from Supabase (unified view)."""
    user_id = user['id']
    
    # Optional: Trigger sync on load, or move this to a background worker / webhook
    threading.Thread(target=sync_truelayer_data, args=(user_id,)).start()

    # Query Database
    db_accounts = supabase.table('accounts').select("*").eq('user_id', user_id).execute().data
    # You can also fetch transactions from DB to calc todays_change if needed
    # For simplicity, we calculate totals from the accounts table

    total_balance = 0.0
    total_assets = 0.0
    total_liabilities = 0.0
    todays_change = 0.0
    now = datetime.now()
    today_str = now.strftime('%Y-%m-%d')
    tomorrow_str = (now + timedelta(days=1)).strftime('%Y-%m-%d')

    # Create a map of connections to display
    connections_map = {}
    for account in db_accounts:
        conn_id = account.get('connection_id')
        if conn_id:
            updated_at = account.get('updated_at')
            existing = connections_map.get(conn_id)
            if not existing or (updated_at and (not existing['last_synced'] or updated_at > existing['last_synced'])):
                connections_map[conn_id] = {
                    'id': conn_id,
                    'provider': account.get('provider'),
                    'last_synced': updated_at
                }

    # Calculate today's change efficiently with a single query
    today_txs = supabase.table('transactions').select("amount") \
        .eq('user_id', user_id) \
        .gte('timestamp', today_str) \
        .lt('timestamp', tomorrow_str).execute().data

    for tx in today_txs:
        todays_change += float(tx['amount'])

    # Iterate DB data
    for account in db_accounts:
        current_val = float(account['current_balance'])
        total_balance += current_val

        if current_val >= 0:
            total_assets += current_val
        else:
            total_liabilities += abs(current_val)

        # Add balance object structure for frontend compatibility
        account['balance'] = {'current': current_val}

    credit_cards = [acc for acc in db_accounts if acc['account_type'] == 'CARD']
    savings_accounts = [acc for acc in db_accounts if acc['account_type'] == 'SAVING']
    debit_accounts = [acc for acc in db_accounts if acc['account_type'] in ['TRANSACTION', 'BANK']]

    # Return all data structured for the frontend.
    return jsonify({
        "summary": {
            "net_worth": round(total_balance, 2),
            "total_assets": round(total_assets, 2),
            "total_liabilities": round(total_liabilities, 2),
            "todays_change": round(todays_change, 2),
            "currency": "GBP" # Assuming GBP for simplicity, ideally taken from first account
        },
        "connections": list(connections_map.values()),
        "credit_cards": credit_cards,
        "savings_accounts": savings_accounts,
        "debit_accounts": debit_accounts
    })

@app.route('/api/breakdown')
@login_required
def get_breakdown_data(user):
    """
    Fetches all transactions and returns spending breakdown by category for the current month as JSON.
    """
    selected_month = request.args.get('month')
    now = datetime.now()

    if selected_month:
        try:
            date_obj = datetime.strptime(selected_month, '%Y-%m')
        except ValueError:
            date_obj = now
    else:
        date_obj = now

    month_display = date_obj.strftime('%B %Y')

    # Calculate filtered date range
    start_date = date_obj.replace(day=1).strftime('%Y-%m-%d')
    next_month = (date_obj.replace(day=28) + timedelta(days=4)).replace(day=1)
    end_date = next_month.strftime('%Y-%m-%d')

    # Query Supabase
    response = supabase.table('transactions').select("*") \
        .eq('user_id', user['id']) \
        .gte('timestamp', start_date) \
        .lt('timestamp', end_date) \
        .execute()
    transactions = response.data

    spending_by_category = defaultdict(float)
    # Fetch overrides and rules from DB instead of session
    overrides_response = supabase.table('transaction_category_overrides').select('transaction_id, category').eq('user_id', user['id']).execute()
    overrides = {item['transaction_id']: item['category'] for item in overrides_response.data}
    
    rules_response = supabase.table('user_category_rules').select('merchant_keyword, category').eq('user_id', user['id']).execute()
    rule_overrides = {item['merchant_keyword']: item['category'] for item in rules_response.data}

    for tx in transactions:
        amount = float(tx['amount'])
        if amount < 0:
            tx_id = tx['transaction_id']
            # Determine category with correct precedence:
            # 1. Manual override for this specific transaction ("Just this one")
            # 2. Rule-based override for the merchant ("All similar")
            # 3. Default rule-based categorization
            category = overrides.get(tx_id, categorize_transaction(tx.get('description'), rule_overrides))
            spending_by_category[category] += abs(amount)

    # Get budget data from session
    budgets = session.get('budgets', {})

    breakdown_details = []
    all_categories = set(spending_by_category.keys()) | set(budgets.keys())

    for category in sorted(list(all_categories)):
        spent = spending_by_category.get(category, 0)
        budget = float(budgets.get(category, 0))
        if spent > 0 or budget > 0:
            remaining = budget - spent
            breakdown_details.append({
                "category": category,
                "spent": round(spent, 2),
                "budget": round(budget, 2),
                "remaining": round(remaining, 2)
            })

    # Chart data should only include categories with actual spending
    sorted_spending = sorted(spending_by_category.items(), key=lambda item: item[1], reverse=True)
    chart_labels = [item[0] for item in sorted_spending]
    chart_data = [round(item[1], 2) for item in sorted_spending]

    return jsonify({
        "labels": chart_labels,
        "data": chart_data,
        "month": month_display,
        "details": breakdown_details
        })

@app.route('/api/connections/<connection_id>', methods=['DELETE'])
@login_required
def delete_connection(user, connection_id):
    """
    Deletes a bank_connection and all associated data (accounts, transactions)
    by leveraging database cascade deletes.
    """
    user_id = user['id']
    try:
        # The ON DELETE CASCADE on 'accounts' and 'transactions' tables will handle
        # deleting all associated data.
        supabase.table('bank_connections').delete().eq('id', connection_id).eq('user_id', user_id).execute()
        return jsonify({"success": True}), 200
    except Exception as e:
        return jsonify({"error": "Failed to delete connection", "details": str(e)}), 500

@app.route('/api/spending_over_time')
@login_required
def get_spending_over_time(user):
    """
    Provides daily spending totals for a given month to power line charts.
    """
    selected_month = request.args.get('month')
    now = datetime.now()
    if selected_month:
        try:
            date_obj = datetime.strptime(selected_month, '%Y-%m')
        except ValueError:
            date_obj = now
    else:
        date_obj = now

    start_date = date_obj.replace(day=1).strftime('%Y-%m-%d')
    next_month = (date_obj.replace(day=28) + timedelta(days=4)).replace(day=1)
    end_date = next_month.strftime('%Y-%m-%d')

    response = supabase.table('transactions').select("*") \
        .eq('user_id', user['id']) \
        .gte('timestamp', start_date) \
        .lt('timestamp', end_date) \
        .execute()
    transactions = response.data

    daily_spending = defaultdict(float)
    for tx in transactions:
        if float(tx['amount']) < 0:
            day = datetime.fromisoformat(tx['timestamp'].replace('Z', '+00:00')).day
            daily_spending[day] += abs(float(tx['amount']))

    # Days in the selected month
    num_days = calendar.monthrange(date_obj.year, date_obj.month)[1]
    
    labels = [f"Day {day}" for day in range(1, num_days + 1)]
    # Cumulative spending logic
    data = [round(sum(daily_spending.get(d, 0) for d in range(1, day + 1)), 2) for day in range(1, num_days + 1)]

    return jsonify({
        "labels": labels,
        "data": data,
        "label": "Daily Spending"
    })

@app.route('/api/account_transactions')
@login_required
def get_single_account_transactions(user):
    """Fetches recent transactions for a single account from the database."""
    account_id = request.args.get('account_id')
    user_id = user['id']

    if not account_id:
        return jsonify({"error": "account_id is required"}), 400

    # Query DB for transactions for this account and user
    response = supabase.table('transactions').select("*") \
        .eq('user_id', user_id) \
        .eq('account_id', account_id) \
        .order('timestamp', desc=True) \
        .limit(15) \
        .execute()
    
    transactions = response.data
    
    # Fetch overrides and rules from DB
    overrides_response = supabase.table('transaction_category_overrides').select('transaction_id, category').eq('user_id', user['id']).execute()
    overrides = {item['transaction_id']: item['category'] for item in overrides_response.data}
    
    rules_response = supabase.table('user_category_rules').select('merchant_keyword, category').eq('user_id', user['id']).execute()
    rule_overrides = {item['merchant_keyword']: item['category'] for item in rules_response.data}

    for tx in transactions:
        tx_id = tx.get('transaction_id')
        tx['display_category'] = overrides.get(tx_id, categorize_transaction(tx.get('description'), rule_overrides))

    return jsonify(transactions)


@app.route('/api/transactions')
@login_required
def get_transactions_data(user):
    """
    Fetches all transactions from all accounts and returns them as a sorted list.
    """
    # Fetch all transactions from DB sorted by date
    response = supabase.table('transactions').select("*").eq('user_id', user['id']).order('timestamp', desc=True).execute()
    all_transactions = response.data

    # Get account names for display
    acc_response = supabase.table('accounts').select("account_id, display_name").eq('user_id', user['id']).execute()
    acc_map = {acc['account_id']: acc['display_name'] for acc in acc_response.data}
    
    # Fetch overrides and rules from DB
    overrides_response = supabase.table('transaction_category_overrides').select('transaction_id, category').eq('user_id', user['id']).execute()
    overrides = {item['transaction_id']: item['category'] for item in overrides_response.data}
    
    rules_response = supabase.table('user_category_rules').select('merchant_keyword, category').eq('user_id', user['id']).execute()
    rule_overrides = {item['merchant_keyword']: item['category'] for item in rules_response.data}

    for tx in all_transactions:
        tx['account_name'] = acc_map.get(tx['account_id'], 'Unknown Account')
        tx_id = tx['transaction_id']
        # Determine display category with correct precedence:
        # 1. Manual override for this specific transaction ("Just this one")
        # 2. Rule-based override for the merchant ("All similar")
        # 3. Default rule-based categorization
        tx['display_category'] = overrides.get(tx_id, categorize_transaction(tx.get('description'), rule_overrides))

    # --- Month Filter ---
    month_filter = request.args.get('month')
    if month_filter:
        all_transactions = [tx for tx in all_transactions if tx['timestamp'].startswith(month_filter)]

    # --- Category Filter ---
    category_filter = request.args.get('category')
    if category_filter:
        all_transactions = [tx for tx in all_transactions if tx.get('display_category') == category_filter and float(tx['amount']) < 0]

    # If a search query is provided, filter transactions by description or amount.
    # --- Search Logic ---
    search_query = request.args.get('search', '').lower()
    if search_query:
        filtered_txs = []
        for tx in all_transactions:
            # Check description or amount (converted to string)
            if search_query in tx.get('description', '').lower() or search_query in str(tx['amount']):
                filtered_txs.append(tx)
        all_transactions = filtered_txs

    # Paginate the final list of transactions.
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


@app.route('/api/categories')
@login_required
def get_categories(user):
    """Returns a list of available transaction categories."""
    # Get all unique categories from the rules
    categories = set(MERCHANT_TO_CATEGORY.values())
    # Add any other predefined categories
    categories.update(ADDITIONAL_CATEGORIES)
    return jsonify(sorted(list(categories)))


@app.route('/api/categorize', methods=['POST'])
@login_required
def set_transaction_category(user):
    """Sets a manual category override for a given transaction."""
    data = request.get_json()
    transaction_id = data.get('transaction_id')
    category = data.get('category')

    if not transaction_id or not category:
        return jsonify({"error": "transaction_id and category are required"}), 400

    # Upsert the override into the database
    try:
        supabase.table('transaction_category_overrides').upsert({
            'user_id': user['id'],
            'transaction_id': transaction_id,
            'category': category
        }, on_conflict='user_id,transaction_id').execute()
        
        return jsonify({"success": True, "transaction_id": transaction_id, "category": category})
    except Exception as e:
        return jsonify({"error": "Failed to save override", "details": str(e)}), 500

@app.route('/api/categorize_rule', methods=['POST'])
@login_required
def set_categorization_rule(user):
    """Creates a new rule to categorize all transactions from a vendor."""
    data = request.get_json()
    description = data.get('description')
    category = data.get('category')

    if not description or not category:
        return jsonify({"error": "description and category are required"}), 400

    description_lower = description.lower()
    found_merchant = None

    # 1. First, try to match against existing hardcoded rules to find a canonical key
    for merchant in MERCHANT_TO_CATEGORY.keys():
        if merchant in description_lower:
            found_merchant = merchant
            break
    
    # 2. If no canonical merchant is found, create a new rule key from the description
    if not found_merchant:
        # Heuristic: Use the first "word" of the description as the new rule key.
        words = re.findall(r'\b[a-z0-9-]+\b', description_lower)
        if words:
            found_merchant = words[0]

    if found_merchant:
        try:
            supabase.table('user_category_rules').upsert({
                'user_id': user['id'],
                'merchant_keyword': found_merchant,
                'category': category
            }, on_conflict='user_id,merchant_keyword').execute()
            return jsonify({"success": True, "rule": {found_merchant: category}})
        except Exception as e:
            return jsonify({"error": "Failed to save rule", "details": str(e)}), 500
    else:
        return jsonify({"error": f"Could not determine a merchant rule for '{description}'"}), 400

@app.route('/api/budgets', methods=['GET', 'POST'])
@login_required
def handle_budgets(user):
    """Handles getting and setting monthly budgets per category."""
    if request.method == 'POST':
        # Sanitize and save the budgets posted by the user
        raw_budgets = request.get_json()
        budgets = {k: float(v) for k, v in raw_budgets.items() if v}
        
        session['budgets'] = budgets
        session.modified = True
        return jsonify({"success": True, "budgets": budgets})

    # For a GET request, simply return the currently stored budgets
    budgets = session.get('budgets', {})
    return jsonify(budgets)

@app.route('/api/session')
def get_session_status():
    """Checks if a user is logged in and returns user data if available."""
    user = session.get('user')
    if user:
        has_conn = user_has_connections(user['id'])
        return jsonify({"logged_in": True, "user": user, "has_connections": has_conn})
    else:
        return jsonify({"logged_in": False})

# --- Auth Routes ---

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    try:
        res = supabase.auth.sign_in_with_password({"email": email, "password": password})
        session['user'] = res.user.model_dump(mode='json') # store user info in session
        has_conn = user_has_connections(res.user.id)
        return jsonify({"success": True, "user": session['user'], "has_connections": has_conn})
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route('/api/signup', methods=['POST'])
def signup():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    try:
        res = supabase.auth.sign_up({"email": email, "password": password})
        # If email confirmation is disabled, Supabase returns a session.
        # We can use this to log the user in immediately.
        if res.session:
            session['user'] = res.user.model_dump(mode='json')
            return jsonify({"success": True, "user": session['user'], "has_connections": False})
        else:
            # If email confirmation is enabled, no session is returned.
            return jsonify({"success": True, "message": "Check your email to confirm signup."})
    except Exception as e:
        return jsonify({"error": str(e)}), 400

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
    
    user = session.get('user')
    if user:
        # Persist tokens to Supabase linked to the user
        supabase.table('bank_connections').insert({
            'user_id': user['id'],
            'access_token': token_data['access_token'],
            'refresh_token': token_data['refresh_token']
        }).execute()
        
        # Trigger immediate sync
        threading.Thread(target=sync_truelayer_data, args=(user['id'],)).start()

    return redirect(url_for("index"))

@app.route('/api/logout', methods=['POST'])
def logout():
    """Clears the session and logs the user out."""
    session.clear()
    return jsonify({"success": True, "message": "Logged out successfully."})

if __name__ == '__main__':
    app.run(debug=True)
