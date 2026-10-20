import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ConnectivityBanner from '../ConnectivityBanner';
import { setConnectivityStatus } from '../../../services/api/connectivityStatus';

describe('ConnectivityBanner', () => {
  afterEach(() => {
    setConnectivityStatus('online');
  });

  it('renders nothing while online', () => {
    setConnectivityStatus('online');
    const { container } = render(<ConnectivityBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a non-blocking "Reconnecting" message while retrying', () => {
    setConnectivityStatus('reconnecting');
    render(<ConnectivityBanner />);
    expect(screen.getByText(/reconnecting to aila/i)).toBeInTheDocument();
  });

  it('shows the waking-up message with a Retry button once retries are exhausted', () => {
    setConnectivityStatus('unavailable');
    render(<ConnectivityBanner />);
    expect(screen.getByText(/server is waking up/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
