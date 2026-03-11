function Dashboard() {
    const { data, loading, error } = useFetch('/api/dashboard');

    if (loading) {
        return <div><h1>Dashboard</h1><p>Loading...</p></div>;
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
            <h1>Accounts Dashboard</h1>
            <AccountSection title="Credit Cards" accounts={data.credit_cards} />
            <AccountSection title="Savings Accounts" accounts={data.savings_accounts} />
            <AccountSection title="Current Accounts" accounts={data.debit_accounts} />
        </div>
    );
}

function Breakdown() {
    const { data: chartData, loading, error } = useFetch('/api/breakdown');

    if (loading) {
        return <div><h1>Spending Breakdown</h1><p>Loading...</p></div>;
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
            <h2>{chartData.month}</h2>
            <SpendingChart data={chartData} />
        </div>
    );
}