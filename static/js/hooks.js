// Custom hook for fetching data
function useFetch(url) {
    const { useState, useEffect } = React;
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [trigger, setTrigger] = useState(0);

    const refetch = () => {
        setTrigger(t => t + 1);
    };

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    if (response.status === 401) {
                         // Not authenticated - return null data but stop loading
                        setData(null);
                        return;
                    }
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const result = await response.json();
                setData(result);
            } catch (e) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [url, trigger]);

    return { data, loading, error, refetch };
}