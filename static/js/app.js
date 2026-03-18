function AuthProvider({ children }) {
    const [user, setUser] = React.useState(null);
    const [hasConnections, setHasConnections] = React.useState(false);
    const [loading, setLoading] = React.useState(true);
    const navigate = ReactRouterDOM.useNavigate();

    const checkSession = React.useCallback(async () => {
        try {
            const res = await fetch('/api/session');
            const data = await res.json();
            if (data.logged_in) {
                setUser(data.user);
                setHasConnections(data.has_connections);
            }
        } catch (e) {
            console.error("Session check failed", e);
        }
    }, []);

    React.useEffect(() => {
        // Check session on initial load
        checkSession().finally(() => setLoading(false));
    }, [checkSession]);

    const login = async (email, password) => {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        const data = await response.json();
        if (response.ok) {
            setUser(data.user);
            setHasConnections(data.has_connections);
            navigate('/');
            return { success: true };
        } else {
            return { success: false, error: data.error };
        }
    };

    const signup = async (email, password) => {
        const response = await fetch('/api/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        const data = await response.json();
        if (response.ok) {
            if (data.user) { // Auto-login on signup
                setUser(data.user);
                setHasConnections(data.has_connections || false);
                navigate('/');
            }
            return { success: true, message: data.message };
        } else {
            return { success: false, error: data.error };
        }
    };

    const logout = async () => {
        await fetch('/api/logout', { method: 'POST' });
        setUser(null);
        setHasConnections(false);
        navigate('/login');
    };

    const value = { user, isAuthenticated: !!user, hasConnections, login, signup, logout, loading, checkSession };

    if (loading) {
        return <LoadingSpinner />;
    }

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function ProtectedRoute({ children }) {
    const { isAuthenticated } = useAuth();
    const location = ReactRouterDOM.useLocation();

    if (!isAuthenticated) {
        // Redirect to login, saving the current location to redirect back after login.
        return <ReactRouterDOM.Navigate to="/login" state={{ from: location }} replace />;
    }

    return children;
}

/**
 * Wrapper for routes that require a linked bank account.
 * Redirects to the dashboard (which shows the connect prompt) if no account is linked.
 */
function RequireAccount({ children }) {
    const { isAuthenticated, hasConnections } = useAuth();
    const location = ReactRouterDOM.useLocation();

    if (!isAuthenticated) {
        return <ReactRouterDOM.Navigate to="/login" state={{ from: location }} replace />;
    }

    if (!hasConnections) {
        return <ReactRouterDOM.Navigate to="/" replace />;
    }

    return children;
}

/**
 * The root component of the React application.
 * It sets up the client-side router.
 */
function App() {
    const { BrowserRouter, Routes, Route } = ReactRouterDOM;
    return (
        <BrowserRouter>
            <AuthProvider>
                <Routes>
                    <Route path="/login" element={<AuthPage />} />
                    <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                        <Route index element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
                        <Route path="transactions" element={<RequireAccount><ErrorBoundary><Transactions /></ErrorBoundary></RequireAccount>} />
                        <Route path="budgets" element={<RequireAccount><ErrorBoundary><Budgets /></ErrorBoundary></RequireAccount>} />
                        <Route path="breakdown" element={<RequireAccount><ErrorBoundary><Breakdown /></ErrorBoundary></RequireAccount>} />
                    </Route>
                </Routes>
            </AuthProvider>
        </BrowserRouter>
    );
}

// Mount the React application to the DOM.
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);