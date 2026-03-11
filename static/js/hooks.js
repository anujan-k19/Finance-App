/**
 * A custom React hook for fetching data from a URL.
 * It handles loading, error, and data states, and provides a refetch function.
 * @param {string} url - The URL to fetch data from.
 * @returns {{data: any, loading: boolean, error: Error|null, refetch: function}}
 */
function useFetch(url) {
    const { useState, useEffect } = React;
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [trigger, setTrigger] = useState(0);

    // Function to manually trigger a refetch of the data.
    const refetch = () => {
        setTrigger(t => t + 1);
    };

    useEffect(() => {
        // This effect runs whenever the URL or the refetch trigger changes.
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
    }, [url, trigger]); // Dependency array includes trigger to allow refetching.

    return { data, loading, error, refetch };
}