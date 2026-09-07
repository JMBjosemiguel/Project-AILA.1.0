import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

function Hello({ name }) {
  return <p>Hello, {name}</p>;
}

describe('frontend test infrastructure', () => {
  it('renders a React component into jsdom', () => {
    render(<Hello name="AILA" />);
    expect(screen.getByText('Hello, AILA')).toBeInTheDocument();
  });

  it('has working jest-dom matchers and a real DOM', () => {
    render(<button type="button" disabled>Send</button>);
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(document.body).toBeTruthy();
  });
});
