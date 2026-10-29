import { describe, it, expect } from 'vitest';
import { facebookHref } from '../facebookHref';

describe('facebookHref', () => {
  it('links full URLs and bare facebook.com / fb.com addresses', () => {
    expect(facebookHref('https://www.facebook.com/jose')).toBe('https://www.facebook.com/jose');
    expect(facebookHref('http://fb.com/jose')).toBe('http://fb.com/jose');
    expect(facebookHref('facebook.com/jose.belleza')).toBe('https://facebook.com/jose.belleza');
    expect(facebookHref(' www.facebook.com/jose ')).toBe('https://www.facebook.com/jose');
    expect(facebookHref('fb.com/jose')).toBe('https://fb.com/jose');
  });

  it('leaves names and unsafe values as plain text', () => {
    expect(facebookHref('Jose Belleza')).toBeNull();
    expect(facebookHref('jose.belleza')).toBeNull();
    expect(facebookHref('javascript:alert(1)')).toBeNull();
    expect(facebookHref('')).toBeNull();
    expect(facebookHref(null)).toBeNull();
  });
});
