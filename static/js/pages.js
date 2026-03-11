/**
 * The main dashboard page component.
 * Fetches and displays the financial overview, summary cards, and account sections.
 */
function Dashboard() {
    const { useState, useRef, useEffect } = React;
    const { data, loading, error, refetch } = useFetch('/api/dashboard');
    const [selectedAccount, setSelectedAccount] = useState(null);
    const accountsContainerRef = useRef(null); // Ref for the top of the accounts sections
    const transactionListRef = useRef(null); // Ref for the transaction list container

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

    if (loading) {
        return (
            <div>
                <div className="dashboard-header"><h1>Financial Overview</h1></div>
                <LoadingSpinner />
            </div>
        );
    }

    if (error || !data) {
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
    const transactionListRef = useRef(null); // Ref for the transaction list
    const chartContainerRef = useRef(null); // Ref for the chart container to scroll back to
    const { data: chartData, loading, error } = useFetch(`/api/breakdown?month=${month}`);

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

    if (error || !chartData) {
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

            <div ref={chartContainerRef}>
                <h2>{chartData.month}</h2>
                <SpendingChart data={chartData} onCategoryClick={handleCategoryClick} />
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
    
    // Reset to page 1 when search changes
    const handleSearch = (e) => {
        setSearchTerm(e.target.value);
        setPage(1);
    };

    const { data, loading, error, refetch } = useFetch(`/api/transactions?page=${page}&search=${encodeURIComponent(searchTerm)}`);
    const { data: categories } = useFetch('/api/categories');

    const handleCategoryChange = async (transactionId, newCategory) => {
        try {
            const response = await fetch('/api/categorize', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    transaction_id: transactionId,
                    category: newCategory,
                }),
            });
            if (!response.ok) {
                throw new Error('Failed to update category');
            }
            refetch(); // Refetch transactions to show the update
        } catch (err) {
            console.error("Category update failed:", err);
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
                                categories={categories || []}
                                onCategoryChange={handleCategoryChange}
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
        </div>
    );
}