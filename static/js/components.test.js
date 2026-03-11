/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// The ErrorBoundary component is copied here for testing purposes.
// In a modular setup, you would export and import this from components.js.
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    componentDidCatch(error, errorInfo) {
        // In a real app, you might log this to a service like Sentry
        console.error("ErrorBoundary caught an error:", error, errorInfo);
    }
    render() {
        if (this.state.hasError) {
            return (
                <div className="error-boundary-container">
                    <h2>Something went wrong.</h2>
                    <p>We're sorry, but we were unable to load this section.</p>
                    <details style={{ whiteSpace: 'pre-wrap' }}>
                        {this.state.error && this.state.error.toString()}
                    </details>
                </div>
            );
        }
        return this.props.children;
    }
}

// Test suite for the ErrorBoundary component.
describe('ErrorBoundary', () => {
    // Test case: Ensures that child components are rendered correctly
    // when no error is thrown.
    it('should render its children when there is no error', () => {
        render(
            <ErrorBoundary>
                <div>Child Component</div>
            </ErrorBoundary>
        );
        expect(screen.getByText('Child Component')).toBeInTheDocument();
    });

    // Test case: Ensures that the fallback UI is displayed
    // when a child component throws an error.
    it('should render the fallback UI when a child component throws an error', () => {
        const ProblemChild = () => { throw new Error('Test Error'); };
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {}); // Suppress console.error for this test
        render(<ErrorBoundary><ProblemChild /></ErrorBoundary>);
        expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
        expect(screen.getByText(/Test Error/)).toBeInTheDocument();
        spy.mockRestore();
    });
});