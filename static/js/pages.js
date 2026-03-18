/**
 * The main dashboard page component.
 * Fetches and displays the financial overview, summary cards, and account sections.
 */
function Dashboard() {
    const { useState, useRef, useEffect } = React;
    const { hasConnections, checkSession } = useAuth();
    const { data, loading, error, refetch } = useFetch('/api/dashboard');
    const [selectedAccount, setSelectedAccount] = useState(null);
    const accountsContainerRef = useRef(null); // Ref for the top of the accounts sections
    const transactionListRef = useRef(null); // Ref for the transaction list container
    const [showDisconnectModal, setShowDisconnectModal] = useState(false);
    const [connectionToDelete, setConnectionToDelete] = useState(null);

    // Effect to scroll to the transaction list when an account is selected
    useEffect(() => {
        if (selectedAccount && transactionListRef.current) {
            // A small delay ensures the element is fully rendered before scrolling
            setTimeout(() => {
                transactionListRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }
    }, [selectedAccount]);

    // Centralized function to handle closing the detail view and scrolling up.
    const handleCloseDetails = () => {
        setSelectedAccount(null);
        if (accountsContainerRef.current) {
            accountsContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    // Handles the click event on an account card to show/hide the transaction detail view.
    const handleAccountSelect = (account) => {
        // If clicking the same account, deselect it and scroll up. Otherwise, select the new one.
        if (selectedAccount && selectedAccount.account_id === account.account_id) {
            handleCloseDetails();
        } else {
            setSelectedAccount(account);
        }
    };

    const confirmDisconnect = (connection) => {
        setConnectionToDelete(connection);
        setShowDisconnectModal(true);
    };

    const cancelDisconnect = () => {
        setShowDisconnectModal(false);
        setConnectionToDelete(null);
    };

    const handleDisconnect = async () => {
        if (!connectionToDelete) return;

        try {
            const response = await fetch(`/api/connections/${connectionToDelete.id}`, { method: 'DELETE' });
            if (response.ok) {
                refetch(); // Reload the dashboard data
                checkSession(); // Re-check session to update hasConnections state (resets page if last one deleted)
            } else {
                alert("Failed to disconnect the bank. Please try again.");
            }
        } catch (e) {
            console.error("Delete failed", e);
            alert("An error occurred while trying to disconnect the bank.");
        } finally {
            // Close modal whether success or fail
            setShowDisconnectModal(false);
            setConnectionToDelete(null);
        }
    };

    // If the user has no connected accounts, force the "Connect" view immediately.
    if (!hasConnections) {
        return (
            <div>
                <h1>Welcome!</h1>
                <p>Connect your first bank account to see your financial overview.</p>
                <a href="/connect" className="button">Connect a New Bank Account</a>
            </div>
        );
    }

    if (loading) {
        return (
            <div>
                <div className="dashboard-header"><h1>Financial Overview</h1></div>
                <LoadingSpinner />
            </div>
        );
    }

    if (error || !data) {
        // This part is now mostly for API errors other than auth,
        // or if the API returns empty data for a logged-in user.
        // The auth check is handled by ProtectedRoute.
        if (error) {
            return (
                <div>
                    <h1>Error</h1>
                    <p>Could not load dashboard data. Please try refreshing the page.</p>
                    <p style={{ color: 'red', marginTop: '1rem' }}>Error: {error}</p>
                </div>
            );
        }
        return (
            <div>
                <h1>Welcome!</h1>
                <p>Connect your first bank account to see your financial overview.</p>
                <a href="/connect" className="button">Connect a New Bank Account</a>
            </div>
        );
    }

    return (
        <div>
            <div className="dashboard-header">
                <h1>Financial Overview</h1>
                <button onClick={refetch} disabled={loading} className="refresh-button" title="Refresh data">
                    <svg className={`refresh-icon ${loading ? 'spinning' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="23 4 23 10 17 10"></polyline>
                        <polyline points="1 20 1 14 7 14"></polyline>
                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                    </svg>
                </button>
            </div>

            {data.summary && (
                <div className="summary-grid">
                    <SummaryCard title="Net Worth" value={data.summary.net_worth} currency={data.summary.currency} />
                    <SummaryCard title="Total Assets" value={data.summary.total_assets} currency={data.summary.currency} />
                    <SummaryCard title="Total Liabilities" value={data.summary.total_liabilities} currency={data.summary.currency} />
                    <SummaryCard title="Today's Change" value={data.summary.todays_change} currency={data.summary.currency} isChange={true} />
                </div>
            )}

            <ConnectionSection
                title="Bank Connections"
                connections={data.connections}
                onDelete={confirmDisconnect}
            />

            <div ref={accountsContainerRef}>
                <AccountSection 
                    title="Credit Cards" 
                    accounts={data.credit_cards} 
                    onAccountSelect={handleAccountSelect}
                    selectedAccountId={selectedAccount?.account_id}
                />
                <AccountSection 
                    title="Savings Accounts" 
                    accounts={data.savings_accounts} 
                    onAccountSelect={handleAccountSelect}
                    selectedAccountId={selectedAccount?.account_id}
                />
                <AccountSection 
                    title="Current Accounts" 
                    accounts={data.debit_accounts} 
                    onAccountSelect={handleAccountSelect}
                    selectedAccountId={selectedAccount?.account_id}
                />
            </div>

            <div ref={transactionListRef}>
                {selectedAccount && <TransactionList account={selectedAccount} onClose={handleCloseDetails} />}
            </div>

            {showDisconnectModal && connectionToDelete && (
                <div className="modal-overlay" onClick={cancelDisconnect}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Disconnect Bank</h3>
                            <button onClick={cancelDisconnect} className="close-button">&times;</button>
                        </div>
                        <div className="modal-body">
                            <p>Are you sure you want to disconnect <strong>{connectionToDelete.provider?.display_name || 'this bank'}</strong>?</p>
                            <p>This will remove the connection and all associated accounts and transactions from your dashboard. This action cannot be undone.</p>
                        </div>
                        <div className="modal-footer confirm-buttons">
                            <button onClick={handleDisconnect} className="button" style={{backgroundColor: '#dc3545'}}>Disconnect</button>
                            <button onClick={cancelDisconnect} className="button secondary">Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/**
 * The authentication page for login and signup.
 */
function AuthPage() {
    const { useState } = React;
    const { login, signup } = useAuth();
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setMessage('');
        setLoading(true);
        const action = isLogin ? login : signup;
        const result = await action(email, password);
        setLoading(false);
        if (!result.success) {
            setError(result.error || 'An unknown error occurred.');
        } else if (result.message) {
            // Show confirmation message (e.g., "check your email") and switch to login form
            setMessage(result.message);
            setIsLogin(true);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-form">
                <h2>{isLogin ? 'Login' : 'Sign Up'}</h2>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="email">Email</label>
                        <input
                            type="email"
                            id="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="password">Password</label>
                        <input
                            type="password"
                            id="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    {error && <p className="error-message">{error}</p>}
                    {message && <p className="success-message">{message}</p>}
                    <button type="submit" className="button" disabled={loading}>
                        {loading ? 'Processing...' : (isLogin ? 'Login' : 'Sign Up')}
                    </button>
                </form>
                <p className="auth-toggle">
                    {isLogin ? "Don't have an account?" : "Already have an account?"}
                    <button onClick={() => { setIsLogin(!isLogin); setError(''); setMessage(''); }}>
                        {isLogin ? 'Sign Up' : 'Login'}
                    </button>
                </p>
            </div>
        </div>
    );
}

/**
 * The spending breakdown page component.
 * Fetches and displays spending data in a chart, allowing users to filter by month.
 */
function Breakdown() {
    const { useState, useRef, useEffect } = React;
    // Default to current month YYYY-MM
    const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [chartType, setChartType] = useState('category'); // 'category' or 'time'
    const transactionListRef = useRef(null); // Ref for the transaction list
    const chartContainerRef = useRef(null); // Ref for the chart container to scroll back to

    // Conditionally fetch data based on the selected chart type
    const { data: categoryData, loading: categoryLoading, error: categoryError } = useFetch(chartType === 'category' ? `/api/breakdown?month=${month}` : null);
    const { data: timeData, loading: timeLoading, error: timeError } = useFetch(chartType === 'time' ? `/api/spending_over_time?month=${month}` : null);

    const loading = categoryLoading || timeLoading;
    const error = categoryError || timeError;

    // Effect to scroll to the transaction list when a category is selected
    useEffect(() => {
        if (selectedCategory && transactionListRef.current) {
            setTimeout(() => {
                transactionListRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }
    }, [selectedCategory]);

    const handleCloseDetails = () => {
        setSelectedCategory(null);
        if (chartContainerRef.current) {
            chartContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    const handleMonthChange = (e) => {
        setMonth(e.target.value);
        // Reset selected category when month changes
        handleCloseDetails();
    };

    const handleCategoryClick = (category) => {
        // Toggle behavior: if the same category is clicked, hide the list.
        if (selectedCategory === category) {
            handleCloseDetails();
        } else {
            setSelectedCategory(category);
        }
    };

    if (loading) {
        return (
            <div>
                <h1>Monthly Spending Breakdown</h1>
                <LoadingSpinner />
            </div>
        );
    }

    if (error) {
        return (
            <div>
                <h1>My Finance Dashboard</h1>
                <p>Connect your bank accounts to see your financial overview.</p>
                <a href="/connect" className="button">Connect with TrueLayer</a>
                {error && <p style={{ color: 'red', marginTop: '1rem' }}>Error: {error}</p>}
            </div>
        );
    }

    return (
        <div>
            <h1>Monthly Spending Breakdown</h1>
            
            <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
                <label htmlFor="month-select" style={{ marginRight: '10px', fontWeight: 'bold' }}>Select Month:</label>
                <input 
                    type="month" 
                    id="month-select" 
                    value={month} 
                    onChange={handleMonthChange}
                    style={{ padding: '5px', fontSize: '1rem' }}
                />
            </div>

            <div className="chart-type-selector">
                <button onClick={() => setChartType('category')} className={`button-switch ${chartType === 'category' ? 'active' : ''}`}>By Category</button>
                <button onClick={() => setChartType('time')} className={`button-switch ${chartType === 'time' ? 'active' : ''}`}>Over Time</button>
            </div>

            <div ref={chartContainerRef} className="chart-section">
                {/* Use optional chaining (?.) to safely access month from categoryData */}
                <h2>{categoryData?.month || new Date(month).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</h2>
                
                {loading && <LoadingSpinner />}

                {/* Logic for displaying the category doughnut chart */}
                {!loading && chartType === 'category' && (
                    categoryData?.data?.length > 0 ? (
                        <SpendingChart data={categoryData} onCategoryClick={handleCategoryClick} />
                    ) : <p style={{textAlign: 'center', padding: '2rem'}}>No spending data for this month.</p>
                )}

                {/* Logic for displaying the spending over time line chart */}
                {!loading && chartType === 'time' && (
                    timeData?.data?.length > 0 ? (
                        <LineChart data={timeData} />
                    ) : <p style={{textAlign: 'center', padding: '2rem'}}>No spending data for this month.</p>
                )}
            </div>

            <div ref={transactionListRef}>
                {selectedCategory && (
                    <CategoryTransactionList 
                        category={selectedCategory} 
                        month={month} 
                        onClose={handleCloseDetails} 
                    />
                )}
            </div>

            {/* Only show budget breakdown when viewing by category */}
            {chartType === 'category' && categoryData && categoryData.details && categoryData.details.length > 0 && (
                <div className="budget-breakdown-table">
                    <h3>Budget vs. Actual Spending</h3>
                    {categoryData.details.map(item => (
                        <div key={item.category} className="budget-row">
                            <div className="budget-info">
                                <span className="budget-category">{item.category}</span>
                                <span className="budget-values">
                                    {item.spent.toLocaleString('en-GB', {style: 'currency', currency: 'GBP'})} / {item.budget > 0 ? item.budget.toLocaleString('en-GB', {style: 'currency', currency: 'GBP'}) : 'No Budget'}
                                </span>
                            </div>
                            {item.budget > 0 && (
                                <div className="progress-bar-container">
                                    <div 
                                        className={`progress-bar ${item.spent > item.budget ? 'over-budget' : ''}`}
                                        style={{ width: `${Math.min((item.spent / item.budget) * 100, 100)}%` }}
                                    ></div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * The transactions page component.
 * Fetches and displays a paginated and searchable list of all transactions.
 */
function Transactions() {
    const { useState } = React;
    const [page, setPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTransaction, setSelectedTransaction] = useState(null);
    
    // Reset to page 1 when search changes
    const handleSearch = (e) => {
        setSearchTerm(e.target.value);
        setPage(1);
    };

    const { data, loading, error, refetch } = useFetch(`/api/transactions?page=${page}&search=${encodeURIComponent(searchTerm)}`);
    const { data: categories } = useFetch('/api/categories');

    /**
     * Handles saving a category change for a single transaction or for all similar transactions.
     * @param {object} transaction - The transaction object being updated.
     * @param {string} newCategory - The new category to apply.
     * @param {string} scope - The scope of the update ('one' or 'all').
     */
    const handleSaveCategory = async (transaction, newCategory, scope) => {
        let url = '/api/categorize';
        let body = {
            transaction_id: transaction.transaction_id,
            category: newCategory,
        };

        // If the user chose to update all similar transactions, use the rule-based endpoint.
        if (scope === 'all') {
            url = '/api/categorize_rule';
            body = {
                description: transaction.description,
                category: newCategory,
            };
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });
            if (!response.ok) {
                throw new Error('Failed to update category');
            }
            // After a successful save, call refetch() to get the updated list of transactions
            // from the server. This ensures the UI updates instantly with the new categories.
            refetch();
        } catch (err) {
            console.error("Category update failed:", err);
            // Optionally, show an error message to the user
        }
    };

    if (loading) {
        return (
            <div>
                <h1>Transactions</h1>
                <div className="search-container">
                    <input type="text" placeholder="Search transactions..." value={searchTerm} onChange={handleSearch} className="search-input" />
                </div>
                <LoadingSpinner />
            </div>
        );
    }

    if (error || !data || !data.transactions) {
        return <div><h1>Transactions</h1><p>Error loading transactions: {error || 'No data found.'}</p></div>;
    }

    const { transactions, pagination } = data;

    return (
        <div>
            <h1>Transactions</h1>
            <div className="search-container">
                <input type="text" placeholder="Search transactions..." value={searchTerm} onChange={handleSearch} className="search-input" />
            </div>
            <table className="transaction-table">
                <thead>
                    <tr>
                        <th>Description</th>
                        <th>Category</th>
                        <th>Account</th>
                        <th style={{ textAlign: 'right' }}>Amount</th>
                    </tr>
                </thead>
                <tbody>
                    {transactions.reduce((acc, tx, index) => {
                        const date = tx.timestamp.split('T')[0];
                        const prevDate = index > 0 ? transactions[index - 1].timestamp.split('T')[0] : null;
                        if (date !== prevDate) {
                            acc.push(
                                <tr key={`date-${date}`} className="date-header-row">
                                    <td colSpan="4" style={{ fontWeight: 'bold', backgroundColor: '#f8f9fa', color: '#555', padding: '0.5rem 1rem' }}>
                                        {new Date(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                    </td>
                                </tr>
                            );
                        }
                        acc.push(
                            <TransactionRow 
                                key={tx.transaction_id} 
                                transaction={tx} 
                                onClick={() => setSelectedTransaction(tx)}
                                showAccountName={true}
                            />
                        );
                        return acc;
                    }, [])}
                </tbody>
            </table>

            <div className="pagination-controls">
                <button onClick={() => setPage(page - 1)} disabled={!pagination.has_prev}>
                    &larr; Previous
                </button>
                <span>
                    Page {pagination.page} of {pagination.total_pages}
                </span>
                <button onClick={() => setPage(page + 1)} disabled={!pagination.has_next}>
                    Next &rarr;
                </button>
            </div>

            {selectedTransaction && (
                <TransactionDetailModal 
                    transaction={selectedTransaction}
                    categories={categories || []}
                    onClose={() => setSelectedTransaction(null)}
                    onSave={handleSaveCategory}
                />
            )}
        </div>
    );
}

/**
 * The Budgets page component.
 * Allows users to set monthly spending limits for various categories.
 */
function Budgets() {
    const { useState, useEffect } = React;
    const { data: categories, loading: categoriesLoading } = useFetch('/api/categories');
    const { data: initialBudgets, loading: budgetsLoading } = useFetch('/api/budgets');
    const [budgets, setBudgets] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    // Pre-fill the form with previously saved budgets
    useEffect(() => {
        if (initialBudgets) {
            setBudgets(initialBudgets);
        }
    }, [initialBudgets]);

    const handleInputChange = (category, value) => {
        setBudgets(prev => ({
            ...prev,
            [category]: value
        }));
    };

    const handleSave = async () => {
        setIsSaving(true);
        setSaveSuccess(false);
        try {
            const response = await fetch('/api/budgets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(budgets)
            });
            if (!response.ok) throw new Error('Failed to save budgets');
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 2000); // Hide message after 2s
        } catch (err) {
            console.error(err);
            // Optionally, show an error message to the user
        } finally {
            setIsSaving(false);
        }
    };

    if (categoriesLoading || budgetsLoading) {
        return <div><h1>Budgets</h1><LoadingSpinner /></div>;
    }

    return (
        <div>
            <h1>Set Monthly Budgets</h1>
            <p>Set a spending limit for each category. This will apply to every month.</p>
            <div className="budget-list">
                {(categories || []).map(category => (
                    <div key={category} className="budget-item">
                        <label htmlFor={`budget-${category}`}>{category}</label>
                        <input
                            id={`budget-${category}`}
                            type="number"
                            value={budgets[category] || ''}
                            onChange={(e) => handleInputChange(category, e.target.value)}
                            placeholder="0.00"
                            className="budget-input"
                        />
                    </div>
                ))}
            </div>
            <div className="budget-save-container">
                <button onClick={handleSave} disabled={isSaving} className="button">
                    {isSaving ? 'Saving...' : 'Save Budgets'}
                </button>
                {saveSuccess && <span className="save-success-message">Budgets saved!</span>}
            </div>
        </div>
    );
}