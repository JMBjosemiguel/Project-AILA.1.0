import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ChatInput from '../ChatInput.jsx';
import { MAX_CHAT_MESSAGE_LENGTH } from '../../../constants/ui';

const renderInput = (value) => render(<ChatInput value={value} onChange={vi.fn()} onSend={vi.fn()} disabled={false} />);

describe('ChatInput: message length limit', () => {
  it('limits the box to 4,000 characters, matching the server', () => {
    expect(MAX_CHAT_MESSAGE_LENGTH).toBe(4000);
    renderInput('');
    expect(screen.getByPlaceholderText(/Ask AILA/i)).toHaveAttribute('maxlength', '4000');
  });

  it('shows no counter for an ordinary message', () => {
    renderInput('What is the loop of Henle?');
    expect(screen.queryByText(/characters/)).not.toBeInTheDocument();
  });

  it('shows a counter when the message is close to the limit', () => {
    renderInput('a'.repeat(3900));
    expect(screen.getByRole('status')).toHaveTextContent('3,900 / 4,000 characters');
    expect(screen.getByRole('status')).not.toHaveTextContent('limit for one message');
  });

  it('says so at the limit', () => {
    renderInput('a'.repeat(4000));
    expect(screen.getByRole('status')).toHaveTextContent('4,000 / 4,000 characters — the limit for one message');
  });

  it('keeps the administrator notice', () => {
    renderInput('');
    expect(screen.getByText(/Conversations may be reviewed by AILA administrators/)).toBeInTheDocument();
  });
});
