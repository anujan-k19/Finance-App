/**
 * A presentational component for a single account card.
 * @param {{account: object, onClick: function, isSelected: boolean}} props
 * @returns {JSX.Element}
 */
function Account({ account, onClick, isSelected, onDelete }) {
    const cardClass = `account ${isSelected ? 'selected' : ''}`;
    return (
        <div className={cardClass} onClick={onClick}>
            <div className="account-card-header">
                <h3>{account.display_name}</h3>
                <span className="account-provider">{account.provider?.display_name}</span>
            </div>
            <div className="account-card-body">
                <p className="account-balance">
                    {account.balance.current.toLocaleString('en-GB', { style: 'currency', currency: account.balance.currency || 'GBP' })}
                </p>
            </div>
        </div>
    );
}

/**
 * A presentational component for a single bank connection card.
 * @param {{connection: object, onDelete: function}} props
 * @returns {JSX.Element}
 */
function ConnectionCard({ connection, onDelete }) {
    // Use the account card styling for a consistent look
    return (
        <div className="account">
            <div className="account-card-header">
                <h3>{connection.provider?.display_name || 'Bank Connection'}</h3>
                <div className="account-header-actions">
                    <button 
                        className="delete-account-btn"
                        title="Disconnect Bank"
                        onClick={(e) => { e.stopPropagation(); onDelete(connection); }}
                    >
                        &times;
                    </button>
                </div>
            </div>
            <div className="account-card-body">
                {/* You can add more details here if needed, e.g., connection date */}
                <p className="account-balance" style={{fontSize: '1rem', color: '#6c757d'}}>
                    {connection.last_synced ? `Synced ${new Date(connection.last_synced).toLocaleString()}` : 'Ready to sync'}
                </p>
            </div>
        </div>
    );
}

/**
 * A card component that serves as a button to add a new connection.
 * @returns {JSX.Element}
 */
function AddConnectionCard() {
    return (
        <a href="/connect" className="account" style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center', 
            textDecoration: 'none', 
            cursor: 'pointer',
            borderStyle: 'dashed',
            backgroundColor: '#f8f9fa',
            minHeight: '130px'
        }}>
            <div style={{ fontSize: '2.5rem', color: '#6c757d', lineHeight: '1', marginBottom: '0.5rem' }}>+</div>
            <div style={{ fontWeight: 'bold', color: '#495057' }}>Link Bank</div>
        </a>
    );
}

/**
 * A card for displaying a high-level summary statistic.
 * @param {{title: string, value: number, currency: string, isChange: boolean}} props
 * @returns {JSX.Element}
 */
function SummaryCard({ title, value, currency, isChange }) {
    const numericValue = parseFloat(value);
    const formattedValue = numericValue.toLocaleString('en-GB', { style: 'currency', currency: currency || 'GBP' });
    
    let valueClass = "summary-value";
    if (isChange) {
        valueClass += numericValue >= 0 ? " positive" : " negative";
    }

    return (
        <div className="summary-card">
            <div className="summary-title">{title}</div>
            <div className={valueClass}>{formattedValue}</div>
        </div>
    );
}

/**
 * A reusable loading spinner component.
 * @returns {JSX.Element}
 */
function LoadingSpinner() {
    return (
        <div className="spinner-container">
            <div className="loading-spinner"></div>
        </div>
    );
}

/**
 * A container component that displays a grid of account cards under a title.
 * @param {{title: string, accounts: Array<object>, onAccountSelect: function, selectedAccountId: string|null}} props
 * @returns {JSX.Element}
 */
function AccountSection({ title, accounts, onAccountSelect, selectedAccountId, onDelete }) {
    return (
        <div className="account-section">
            <h2>{title}</h2>
            <div className="account-grid">
                {accounts && accounts.length > 0 ? (
                    accounts.map(acc => 
                        <Account 
                            key={acc.account_id} 
                            account={acc} 
                            onClick={() => onAccountSelect(acc)}
                            isSelected={selectedAccountId === acc.account_id}
                        />
                    )
                ) : (
                    <p>No {title.toLowerCase()} found.</p>
                )}
            </div>
        </div>
    );
}

/**
 * A container component that displays a grid of connection cards.
 * @param {{title: string, connections: Array<object>, onDelete: function}} props
 * @returns {JSX.Element}
 */
function ConnectionSection({ title, connections, onDelete }) {
    return (
        <div className="account-section">
            <h2>{title}</h2>
            <div className="account-grid">
                {connections && connections.map(conn => 
                    <ConnectionCard 
                        key={conn.id} 
                        connection={conn} 
                        onDelete={onDelete}
                    />
                )}
                <AddConnectionCard />
            </div>
        </div>
    );
}

/**
 * A component for a single row in a transaction table, with an editable category.
 * @param {{transaction: object, categories: Array<string>, onCategoryChange: function, showAccountName: boolean}} props
 * @returns {JSX.Element}
 */
function TransactionRow({ transaction, onClick, showAccountName = false }) {
    return (
        <tr onClick={onClick} className="clickable-row">
            <td>{transaction.merchant_name || transaction.description}</td>
            <td>{transaction.display_category}</td>
            {showAccountName && <td>{transaction.account_name}</td>}
            <td style={{ textAlign: 'right', fontWeight: transaction.amount > 0 ? 'bold' : 'normal', color: transaction.amount > 0 ? '#28a745' : 'inherit' }}>
                {transaction.amount.toLocaleString('en-GB', { style: 'currency', currency: transaction.currency || 'GBP' })}
            </td>
        </tr>
    );
}

/**
 * A component that fetches and displays a list of recent transactions for a selected account.
 * @param {{account: object, onClose: function}} props
 * @returns {JSX.Element}
 */
function TransactionList({ account, onClose }) {
    const { useState } = React;
    const { data: transactions, loading, error, refetch } = useFetch(`/api/account_transactions?account_id=${account.account_id}&account_type=${account.account_type}`);
    const { data: categories } = useFetch('/api/categories');
    const [isClosing, setIsClosing] = useState(false);

    const handleClose = () => {
        setIsClosing(true);
        setTimeout(() => onClose(), 300); // Duration should match CSS transition
    };

    const handleCategoryChange = async (transactionId, newCategory) => {
        try {
            const response = await fetch('/api/categorize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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

    return (
        <div className={`transaction-detail-view ${isClosing ? 'collapsing' : ''}`}>
            <div className="transaction-detail-header">
                <h3>Recent Transactions for {account.display_name}</h3>
                <button onClick={handleClose} className="close-button">&times;</button>
            </div>
            {loading && <LoadingSpinner />}
            {error && <p>Error loading transactions.</p>}
            {transactions && (
                <table className="transaction-table">
                    <thead>
                        <tr>
                            <th>Description</th>
                            <th>Category</th>
                            <th style={{ textAlign: 'right' }}>Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {transactions.length > 0 ? transactions.reduce((acc, tx, index) => {
                            const date = tx.timestamp.split('T')[0];
                            const prevDate = index > 0 ? transactions[index - 1].timestamp.split('T')[0] : null;
                            if (date !== prevDate) {
                                acc.push(
                                    <tr key={`date-${date}`} className="date-header-row">
                                        <td colSpan="3" style={{ fontWeight: 'bold', backgroundColor: '#f8f9fa', color: '#555', padding: '0.5rem 1rem' }}>
                                            {new Date(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                        </td>
                                    </tr>
                                );
                            }
                            acc.push(
                                <tr key={tx.transaction_id || index}>
                                    <td>{tx.merchant_name || tx.description}</td>
                                    <td>{tx.display_category}</td>
                                    <td style={{ textAlign: 'right', color: tx.amount > 0 ? '#28a745' : 'inherit' }}>
                                        {tx.amount.toLocaleString('en-GB', { style: 'currency', currency: tx.currency || 'GBP' })}
                                    </td>
                                </tr>
                            );
                            return acc;
                        }, []) : (
                            <tr><td colSpan="3" style={{textAlign: 'center', padding: '1rem'}}>No recent transactions found.</td></tr>
                        )}
                    </tbody>
                </table>
            )}
        </div>
    );
}

/**
 * A component that fetches and displays a list of transactions for a specific category and month.
 * @param {{category: string, month: string, onClose: function}} props
 * @returns {JSX.Element}
 */
function CategoryTransactionList({ category, month, onClose }) {
    const { useState } = React;
    const url = `/api/transactions?month=${month}&category=${encodeURIComponent(category)}`;
    const { data, loading, error } = useFetch(url);
    const [isClosing, setIsClosing] = useState(false);

    const transactions = data?.transactions || [];

    const handleClose = () => {
        setIsClosing(true);
        setTimeout(() => onClose(), 300); // Duration should match CSS transition
    };

    return (
        <div className={`transaction-detail-view ${isClosing ? 'collapsing' : ''}`}>
            <div className="transaction-detail-header">
                <h3>Transactions for '{category}'</h3>
                <button onClick={handleClose} className="close-button">&times;</button>
            </div>
            {loading && <LoadingSpinner />}
            {error && <p>Error loading transactions for {category}.</p>}
            {data && (
                 <table className="transaction-table">
                    <thead>
                        <tr>
                            <th>Description</th>
                            <th>Account</th>
                            <th style={{ textAlign: 'right' }}>Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {transactions.length > 0 ? transactions.reduce((acc, tx, index) => {
                            const date = tx.timestamp.split('T')[0];
                            const prevDate = index > 0 ? transactions[index - 1].timestamp.split('T')[0] : null;
                            if (date !== prevDate) {
                                acc.push(
                                    <tr key={`date-${date}`} className="date-header-row">
                                        <td colSpan="3" style={{ fontWeight: 'bold', backgroundColor: '#f8f9fa', color: '#555', padding: '0.5rem 1rem' }}>
                                            {new Date(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                        </td>
                                    </tr>
                                );
                            }
                            acc.push(
                                <tr key={tx.transaction_id}>
                                    <td>{tx.merchant_name || tx.description}</td>
                                    <td>{tx.account_name}</td>
                                    <td style={{ textAlign: 'right' }}>
                                        {tx.amount.toLocaleString('en-GB', { style: 'currency', currency: tx.currency || 'GBP' })}
                                    </td>
                                </tr>
                            );
                            return acc;
                        }, []) : (
                            <tr><td colSpan="3" style={{textAlign: 'center', padding: '1rem'}}>No spending transactions found for this category.</td></tr>
                        )}
                    </tbody>
                </table>
            )}
        </div>
    );
}

/**
 * A modal component to display transaction details and allow categorization.
 * @param {{transaction: object, categories: Array<string>, onClose: function, onSave: function}} props
 */
function TransactionDetailModal({ transaction, categories, onClose, onSave }) {
    const { useState, useEffect } = React;
    const [currentCategory, setCurrentCategory] = useState(transaction.display_category);
    const [showConfirm, setShowConfirm] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Reset state if the transaction prop changes
    useEffect(() => {
        setCurrentCategory(transaction.display_category);
        setShowConfirm(false);
        setIsSaving(false);
    }, [transaction]);

    const handleCategorySelect = (e) => {
        const newCategory = e.target.value;
        setCurrentCategory(newCategory);
        // Show confirmation if the category has actually changed
        if (newCategory !== transaction.display_category) {
            setShowConfirm(true);
        } else {
            setShowConfirm(false);
        }
    };

    const handleSave = async (scope) => {
        setIsSaving(true);
        await onSave(transaction, currentCategory, scope);
        setIsSaving(false);
        onClose();
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Transaction Details</h3>
                    <button onClick={onClose} className="close-button">&times;</button>
                </div>
                <div className="modal-body">
                    <p><strong>Description:</strong> {transaction.description}</p>
                    <p><strong>Amount:</strong> {transaction.amount.toLocaleString('en-GB', { style: 'currency', currency: transaction.currency || 'GBP' })}</p>
                    <p><strong>Date:</strong> {new Date(transaction.timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                    <p><strong>Account:</strong> {transaction.account_name}</p>
                    <div className="category-editor">
                        <label htmlFor="category-modal-select">Category:</label>
                        <select 
                            id="category-modal-select"
                            value={currentCategory} 
                            onChange={handleCategorySelect} 
                            disabled={isSaving || !transaction.transaction_id}
                            className="category-select"
                        >
                            { !categories.includes(currentCategory) && <option key={currentCategory} value={currentCategory}>{currentCategory}</option> }
                            {categories.map(cat => (<option key={cat} value={cat}>{cat}</option>))}
                        </select>
                    </div>
                </div>
                {showConfirm && (
                    <div className="modal-footer">
                        <p>Apply this category change to:</p>
                        <div className="confirm-buttons">
                            <button onClick={() => handleSave('one')} disabled={isSaving} className="button">
                                {isSaving ? 'Saving...' : 'Just this one'}
                            </button>
                            <button onClick={() => handleSave('all')} disabled={isSaving} className="button secondary">
                                {isSaving ? 'Saving...' : 'All similar'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * The main layout component for the application. Includes the responsive navbar.
 * @returns {JSX.Element}
 */
function Layout() {
    const { useState } = React;
    const { Link, Outlet } = ReactRouterDOM;    
    const { logout } = useAuth();
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
    const closeMenu = () => setIsMenuOpen(false);

    const handleLogout = (e) => {
        e.preventDefault();
        closeMenu();
        logout();
    };

    return (
        <div>
            <nav className="navbar">
                <div className="container">
                    <Link className="nav-brand" to="/" onClick={closeMenu}>Finance Dashboard</Link>
                    <button className="hamburger-menu" onClick={toggleMenu}>
                        <span></span>
                        <span></span>
                        <span></span>
                    </button>
                    <ul className={`nav-links ${isMenuOpen ? 'active' : ''}`}>
                        <li><Link to="/" onClick={closeMenu}>Dashboard</Link></li>
                        <li><Link to="/transactions" onClick={closeMenu}>Transactions</Link></li>
                        <li><Link to="/budgets" onClick={closeMenu}>Budgets</Link></li>
                        <li><Link to="/breakdown" onClick={closeMenu}>Spending Breakdown</Link></li>
                        <li><a href="#" onClick={handleLogout}>Logout</a></li>
                    </ul>
                </div>
            </nav>
            <div className="container">
                <Outlet /> {/* Child routes will render here */}
            </div>
        </div>
    );
}

/**
 * A wrapper component for Chart.js to render the spending breakdown doughnut chart.
 * @param {{data: object, onCategoryClick: function}} props
 * @returns {JSX.Element}
 */
function SpendingChart({ data, onCategoryClick }) {
    const { useRef, useEffect } = React;
    const chartRef = useRef(null);
    const chartInstance = useRef(null);
    
    useEffect(() => {
        if (data && chartRef.current) {
            // Destroy previous chart instance if it exists
            if (chartInstance.current) {
                chartInstance.current.destroy();
            }
            const ctx = chartRef.current.getContext('2d');
            chartInstance.current = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: data.labels,
                    datasets: [{
                        label: 'Spending in £',
                        data: data.data,
                        borderWidth: 1,
                        backgroundColor: [
                            'rgba(255, 99, 132, 0.8)', 'rgba(54, 162, 235, 0.8)',
                            'rgba(255, 206, 86, 0.8)', 'rgba(75, 192, 192, 0.8)',
                            'rgba(153, 102, 255, 0.8)', 'rgba(255, 159, 64, 0.8)',
                            'rgba(199, 199, 199, 0.8)', 'rgba(83, 102, 255, 0.8)'
                        ],
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false, // This allows the chart to fill the container's dimensions, ensuring it's centered.
                    plugins: {
                        legend: { position: 'top' },
                        title: { display: true, text: 'Spending by Category' }
                    },
                    onClick: (event, elements) => {
                        if (elements.length > 0 && onCategoryClick) {
                            const chartElement = elements[0];
                            const index = chartElement.index;
                            const clickedCategory = data.labels[index];
                            onCategoryClick(clickedCategory);
                        }
                    },
                    // Make segments clickable
                    events: ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove'],
                }
            });
        }

        // Cleanup function to destroy chart on component unmount
        return () => {
            if (chartInstance.current) {
                chartInstance.current.destroy();
            }
        };
    }, [data, onCategoryClick]); // Rerun effect if data or click handler changes

    return (
        // The .chart-container class from style.css will now handle all sizing and centering.
        <div className="chart-container">
            <canvas ref={chartRef}></canvas>
        </div>
    );
}

/**
 * A wrapper component for Chart.js to render a line chart.
 * @param {{data: object}} props
 * @returns {JSX.Element}
 */
function LineChart({ data }) {
    const { useRef, useEffect } = React;
    const chartRef = useRef(null);
    const chartInstance = useRef(null);
    
    useEffect(() => {
        if (data && chartRef.current) {
            if (chartInstance.current) {
                chartInstance.current.destroy();
            }
            const ctx = chartRef.current.getContext('2d');
            chartInstance.current = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: data.labels,
                    datasets: [{
                        label: data.label || 'Data',
                        data: data.data,
                        fill: true,
                        borderColor: 'rgb(75, 192, 192)',
                        backgroundColor: 'rgba(75, 192, 192, 0.2)',
                        tension: 0.1
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            display: false // Hide legend for a cleaner look
                        },
                        title: {
                            display: true,
                            text: 'Spending Over Time'
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true
                        },
                        x: {
                            ticks: {
                                // Label every 3 days
                                callback: function(value, index, values) {
                                    return index % 3 === 0 ? this.getLabelForValue(value) : '';
                                },
                                autoSkip: false // Prevents labels from being skipped if they don't fit
                            }
                        }                        
                    }
                }
            });
        }

        return () => {
            if (chartInstance.current) {
                chartInstance.current.destroy();
            }
        };
    }, [data]);

    return (
        <div className="chart-container">
            <canvas ref={chartRef}></canvas>
        </div>
    );
}

/**
 * A React Error Boundary component to gracefully handle rendering errors in its children.
 */
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        // Update state so the next render will show the fallback UI.
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        // You can also log the error to an error reporting service
        console.error("ErrorBoundary caught an error", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            // You can render any custom fallback UI
            return (
                <div className="error-boundary-container" style={{ padding: '2rem', textAlign: 'center', background: '#fff0f0', border: '1px solid #ffcccc', borderRadius: '8px', margin: '2rem 0' }}>
                    <h2 style={{ color: '#d32f2f' }}>Something went wrong.</h2>
                    <p>We're sorry, but we were unable to load this section.</p>
                    <details style={{ whiteSpace: 'pre-wrap', marginTop: '1rem', color: '#555', textAlign: 'left' }}>
                        {this.state.error && this.state.error.toString()}
                    </details>
                </div>
            );
        }

        return this.props.children; 
    }
}