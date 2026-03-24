import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ErrorBoundary } from '../../components/ErrorBoundary.tsx';

// ── Helpers ────────────────────────────────────────────────────────────

/** Component that throws on render */
function Thrower({ error }: { error: Error }) {
  throw error;
}

/** Component that renders normally */
function Safe() {
  return <div>All good</div>;
}

// Suppress console.error from React's error boundary logging
const originalError = console.error;

beforeEach(() => {
  console.error = vi.fn();
});

afterEach(() => {
  console.error = originalError;
});

// ── Tests ──────────────────────────────────────────────────────────────

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <Safe />
      </ErrorBoundary>
    );
    expect(screen.getByText('All good')).toBeTruthy();
  });

  it('catches runtime errors and shows crash screen', () => {
    render(
      <ErrorBoundary level="app">
        <Thrower error={new TypeError('Cannot read property x of undefined')} />
      </ErrorBoundary>
    );
    expect(screen.getByText('SYSTEM ERROR')).toBeTruthy();
    expect(screen.getByText('RUNTIME ERROR')).toBeTruthy();
    expect(screen.getByText(/Cannot read property/)).toBeTruthy();
  });

  it('shows route-level UI for route boundaries', () => {
    render(
      <ErrorBoundary level="route">
        <Thrower error={new Error('Something broke')} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Component Error')).toBeTruthy();
    expect(screen.getByText('UNEXPECTED')).toBeTruthy();
  });

  it('classifies chunk load errors correctly', () => {
    const chunkError = new Error('Loading chunk vendors-react failed');
    render(
      <ErrorBoundary level="app">
        <Thrower error={chunkError} />
      </ErrorBoundary>
    );
    expect(screen.getByText('NETWORK / CACHE')).toBeTruthy();
    expect(screen.getByText(/Reloading should fix it/)).toBeTruthy();
  });

  it('classifies dynamically imported module errors', () => {
    const moduleError = new Error('Failed to fetch dynamically imported module');
    render(
      <ErrorBoundary level="app">
        <Thrower error={moduleError} />
      </ErrorBoundary>
    );
    expect(screen.getByText('NETWORK / CACHE')).toBeTruthy();
  });

  it('shows retry button for runtime errors', () => {
    render(
      <ErrorBoundary level="route">
        <Thrower error={new TypeError('test')} />
      </ErrorBoundary>
    );
    expect(screen.getByText('↻ RETRY')).toBeTruthy();
  });

  it('shows reload button for chunk errors', () => {
    render(
      <ErrorBoundary level="app">
        <Thrower error={new Error('Loading chunk failed')} />
      </ErrorBoundary>
    );
    expect(screen.getByText('↻ RELOAD APP')).toBeTruthy();
  });

  it('shows factory reset button', () => {
    render(
      <ErrorBoundary level="app">
        <Thrower error={new Error('bad')} />
      </ErrorBoundary>
    );
    expect(screen.getByText('⚠ FACTORY RESET')).toBeTruthy();
  });

  it('calls onError callback when provided', () => {
    const onError = vi.fn();
    const error = new Error('test error');
    render(
      <ErrorBoundary onError={onError}>
        <Thrower error={error} />
      </ErrorBoundary>
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error, expect.objectContaining({ componentStack: expect.any(String) }));
  });

  it('renders custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <Thrower error={new Error('bad')} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Custom fallback')).toBeTruthy();
    expect(screen.queryByText('SYSTEM ERROR')).toBeNull();
  });

  it('retry button recovers if error is resolved', () => {
    let shouldThrow = true;

    function MaybeThrow() {
      if (shouldThrow) throw new TypeError('temp error');
      return <div>Recovered!</div>;
    }

    render(
      <ErrorBoundary level="route">
        <MaybeThrow />
      </ErrorBoundary>
    );

    expect(screen.getByText('Component Error')).toBeTruthy();

    // Fix the error condition
    shouldThrow = false;

    // Click retry
    fireEvent.click(screen.getByText('↻ RETRY'));

    expect(screen.getByText('Recovered!')).toBeTruthy();
  });
});
