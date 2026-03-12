/**
 * The root component of the React application.
 * It sets up the client-side router.
 */
function App() {
    const { BrowserRouter, Routes, Route } = ReactRouterDOM;
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Layout />}>
                    <Route index element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
                    <Route path="transactions" element={<ErrorBoundary><Transactions /></ErrorBoundary>} />
                    <Route path="budgets" element={<ErrorBoundary><Budgets /></ErrorBoundary>} />
                    <Route path="breakdown" element={<ErrorBoundary><Breakdown /></ErrorBoundary>} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}

// Mount the React application to the DOM.
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);