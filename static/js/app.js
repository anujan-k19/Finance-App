// The main App component
function App() {
    const { BrowserRouter, Routes, Route } = ReactRouterDOM;
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Layout />}>
                    <Route index element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
                    <Route path="transactions" element={<ErrorBoundary><Transactions /></ErrorBoundary>} />
                    <Route path="breakdown" element={<ErrorBoundary><Breakdown /></ErrorBoundary>} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);