import { describe, it, expect } from 'vitest';
import { sanitizePreviewHtml } from '@/lib/email/sanitize-html';

describe('sanitizePreviewHtml', () => {
  it('returns clean HTML unchanged', () => {
    const html = '<p>Hello world</p>';
    expect(sanitizePreviewHtml(html)).toBe('<p>Hello world</p>');
  });

  it('strips <script> tags and their content', () => {
    const html = '<p>Hi</p><script>alert(1)</script><p>Bye</p>';
    expect(sanitizePreviewHtml(html)).toBe('<p>Hi</p><p>Bye</p>');
  });

  it('strips <script> tags with attributes', () => {
    const html = '<script type="text/javascript" src="evil.js">alert(1)</script><p>OK</p>';
    expect(sanitizePreviewHtml(html)).toBe('<p>OK</p>');
  });

  it('strips <noscript> tags', () => {
    const html = '<noscript>fallback</noscript><p>OK</p>';
    expect(sanitizePreviewHtml(html)).toBe('<p>OK</p>');
  });

  it('strips <iframe> tags', () => {
    const html = '<iframe src="evil.html"></iframe><p>OK</p>';
    expect(sanitizePreviewHtml(html)).toBe('<p>OK</p>');
  });

  it('strips <object> tags', () => {
    const html = '<object data="evil.swf"></object><p>OK</p>';
    expect(sanitizePreviewHtml(html)).toBe('<p>OK</p>');
  });

  it('strips <embed> tags', () => {
    const html = '<embed src="evil.swf"><p>OK</p>';
    expect(sanitizePreviewHtml(html)).toBe('<p>OK</p>');
  });

  it('strips on* event-handler attributes with double quotes', () => {
    const html = '<p onclick="alert(1)">Hi</p>';
    expect(sanitizePreviewHtml(html)).toBe('<p>Hi</p>');
  });

  it('strips on* event-handler attributes with single quotes', () => {
    const html = '<p onclick=\'alert(1)\'>Hi</p>';
    expect(sanitizePreviewHtml(html)).toBe('<p>Hi</p>');
  });

  it('strips on* event-handler attributes with unquoted values', () => {
    const html = '<p onclick=alert(1)>Hi</p>';
    expect(sanitizePreviewHtml(html)).toBe('<p>Hi</p>');
  });

  it('strips javascript: URLs in href', () => {
    const html = '<a href="javascript:alert(1)">Click</a>';
    expect(sanitizePreviewHtml(html)).toBe('<a >Click</a>');
  });

  it('strips javascript: URLs in src', () => {
    const html = '<img src="javascript:alert(1)" alt="x">';
    expect(sanitizePreviewHtml(html)).toBe('<img  alt="x">');
  });

  it('strips data:text/html URLs', () => {
    const html = '<a href="data:text/html,<script>alert(1)</script>">Click</a>';
    expect(sanitizePreviewHtml(html)).toBe('<a >Click</a>');
  });

  it('preserves <style> tags', () => {
    const html = '<style>.cls { color: red; }</style><p>OK</p>';
    expect(sanitizePreviewHtml(html)).toBe('<style>.cls { color: red; }</style><p>OK</p>');
  });

  it('preserves <img> tags with safe src', () => {
    const html = '<img src="https://example.com/photo.png" alt="Photo">';
    expect(sanitizePreviewHtml(html)).toBe('<img src="https://example.com/photo.png" alt="Photo">');
  });

  it('preserves <a> tags with safe href', () => {
    const html = '<a href="https://example.com">Link</a>';
    expect(sanitizePreviewHtml(html)).toBe('<a href="https://example.com">Link</a>');
  });

  it('preserves style attributes', () => {
    const html = '<p style="color: red;">Hi</p>';
    expect(sanitizePreviewHtml(html)).toBe('<p style="color: red;">Hi</p>');
  });

  it('preserves merge tag tokens', () => {
    const html = '<p>Hello {{first_name}}</p>';
    expect(sanitizePreviewHtml(html)).toBe('<p>Hello {{first_name}}</p>');
  });

  it('handles multiple dangerous patterns at once', () => {
    const html = '<script>alert(1)</script><p onclick="x()" style="color:red">Hi</p><a href="javascript:alert(1)">Bad</a>';
    const result = sanitizePreviewHtml(html);
    expect(result).not.toContain('<script');
    expect(result).not.toContain('onclick');
    expect(result).not.toContain('javascript:');
    expect(result).toContain('style="color:red"');
    expect(result).toContain('Hi');
  });

  it('handles empty string', () => {
    expect(sanitizePreviewHtml('')).toBe('');
  });
});
