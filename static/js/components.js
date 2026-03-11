// A component to display a single account
function Account({ account }) {
    return (
        <div className="account">
            <h3>{account.display_name}</h3>
            <p><strong>Provider:</strong> {account.provider.display_name}</p>
            <p><strong>Balance:</strong> {account.balance.current} {account.balance.currency}</p>
            <hr />
        </div>
    );
}

// Component to display a section of accounts
function AccountSection({ title, accounts }) {
    return (
        <div>
            <h2>{title}</h2>
            {accounts && accounts.length > 0 ? (
                accounts.map(acc => <Account key={acc.account_id} account={acc} />)
            ) : (
                <p>No {title.toLowerCase()} found.</p>
            )}
        </div>
    );
}

function Layout() {
    const { Link, Outlet } = ReactRouterDOM;
    return (
        <div>
            <nav className="navbar">
                <div className="container">
                    <Link className="nav-brand" to="/">Finance Dashboard</Link>
                    <ul className="nav-links">
                        <li><Link to="/">Dashboard</Link></li>
                        <li><Link to="/breakdown">Spending Breakdown</Link></li>
                        <li><a href="/logout">Logout</a></li>
                    </ul>
                </div>
            </nav>
            <div className="container">
                <Outlet /> {/* Child routes will render here */}
            </div>
        </div>
    );
}

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