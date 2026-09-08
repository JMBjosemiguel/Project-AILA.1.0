import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PersonalizedBadge from '../PersonalizedBadge.jsx';

describe('PersonalizedBadge', () => {
  it('renders only for performance-aware generation', () => {
    render(<PersonalizedBadge level="performance_aware" />);
    expect(screen.getByText(/Personalized for you/i)).toBeInTheDocument();
    expect(screen.getByText(/Personalized for you/i).closest('span'))
      .toHaveAttribute('title', expect.stringMatching(/quiz performance/i));
  });

  it('renders nothing for basic personalization or when unknown', () => {
    const { container, rerender } = render(<PersonalizedBadge level="basic" />);
    expect(container).toBeEmptyDOMElement();
    rerender(<PersonalizedBadge level={null} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<PersonalizedBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  it('never exposes the raw context', () => {
    render(<PersonalizedBadge level="performance_aware" />);
    // no numbers / topic names / snapshot fields, just a generic reassurance
    expect(screen.queryByText(/%|weakTopics|recentQuizAverage/)).not.toBeInTheDocument();
  });
});
