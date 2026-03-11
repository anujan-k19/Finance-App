/**
 * A presentational component for a single account card.
 * @param {{account: object, onClick: function, isSelected: boolean}} props
 * @returns {JSX.Element}
 */
function Account({ account, onClick, isSelected }) {
    const cardClass = `account ${isSelected ? 'selected' : ''}`;
    return (
        <div className={cardClass} onClick={onClick}>
            <div className="account-card-header">
                <h3>{account.display_name}</h3>
                <span className="account-provider">{account.provider.display_name}</span>
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
 * A presentational component for a summary card on the dashboard.
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
 * A simple, reusable loading spinner component.
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
 * A container component that displays a grid of account cards for a specific section.
 * @param {{title: string, accounts: Array<object>, onAccountSelect: function, selectedAccountId: string}} props
 * @returns {JSX.Element}
 */
function AccountSection({ title, accounts, onAccountSelect, selectedAccountId }) {
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
 * A component that fetches and displays a list of recent transactions for a selected account.
 * @param {{account: object, onClose: function}} props
 * @returns {JSX.Element}
 */
function TransactionList({ account, onClose }) {
    const { data: transactions, loading, error } = useFetch(`/api/account_transactions?account_id=${account.account_id}&account_type=${account.account_type}`);

    return (
        <div className="transaction-detail-view">
            <div className="transaction-detail-header">
                <h3>Recent Transactions for {account.display_name}</h3>
                <button onClick={onClose} className="close-button">&times;</button>
            </div>
            {loading && <LoadingSpinner />}
            {error && <p>Error loading transactions.</p>}
            {transactions && (
                <table className="transaction-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Description</th>
                            <th style={{ textAlign: 'right' }}>Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {transactions.length > 0 ? transactions.map((tx, index) => (
                            <tr key={tx.transaction_id || index}>
                                <td>{tx.timestamp.split('T')[0]}</td>
                                <td>{tx.description}</td>
                                <td style={{ textAlign: 'right', color: tx.amount > 0 ? '#28a745' : 'inherit' }}>
                                    {tx.amount.toLocaleString('en-GB', { style: 'currency', currency: tx.currency || 'GBP' })}
                                </td>
                            </tr>
                        )) : (
                            <tr><td colSpan="3" style={{textAlign: 'center', padding: '1rem'}}>No recent transactions found.</td></tr>
                        )}
                    </tbody>
                </table>
            )}
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
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
    const closeMenu = () => setIsMenuOpen(false);

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
                        <li><Link to="/breakdown" onClick={closeMenu}>Spending Breakdown</Link></li>
                        <li><a href="/logout" onClick={closeMenu}>Logout</a></li>
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
 * @param {{data: object}} props
 * @returns {JSX.Element}
 */
function SpendingChart({ data }) {
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
                    plugins: {
                        legend: { position: 'top' },
                        title: { display: true, text: 'Spending by Category' }
                    }
                }
            });
        }

        // Cleanup function to destroy chart on component unmount
        return () => {
            if (chartInstance.current) {
                chartInstance.current.destroy();
            }
        };
    }, [data]); // Rerun effect if data changes

    return (
        <div className="chart-container" style={{position: 'relative', height: '60vh', width: '60vw', margin: 'auto'}}>
            <canvas ref={chartRef}></canvas>
        </div>
    );
}

/**
 * A React class component that catches JavaScript errors in its child component tree,
 * logs those errors, and displays a fallback UI.
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