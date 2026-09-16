/**
 * Pre-generated thumbnail HTML for visual starter cards, keyed by starter ID.
 *
 * Pre-generated during development using a manually run script
 * (`scripts/render-starter-thumbnails.ts`, `npm run render:thumbnails`) and
 * committed to the repository. Not wired into the Next.js build.
 *
 * Blank starters are omitted (they have no thumbnail). See
 * docs/TEMPLATE_STARTERS.md §7.4.
 */

function doc(body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:12px;font-family:Arial,sans-serif;font-size:11px;line-height:1.4;color:#1a1a1a;background:#fff;}h2{margin:0 0 6px;font-size:14px;}p{margin:0 0 6px;color:#555;}.btn{display:inline-block;background:#0066cc;color:#fff;padding:6px 14px;border-radius:3px;font-size:11px;margin:4px 0;}.muted{color:#999;font-size:10px;}hr{border:0;border-top:1px solid #e5e5e5;margin:8px 0;}</style></head><body>${body}</body></html>`;
}

export const starterThumbnails: Record<string, string> = {
  'welcome-visual': doc(
    '<h2>Welcome aboard!</h2><p>Hi {{name}}, thanks for signing up. We are excited to have you on board.</p><span class="btn">Get Started</span><hr><p class="muted">Questions? Reply to this email anytime.</p>',
  ),
  'newsletter-visual': doc(
    '<h2>This Week</h2><p>Here is a round-up of what happened this week.</p><hr><h2>Top story</h2><p>A summary of the most important update.</p><h2>Also worth reading</h2><p>A second highlight from the week.</p><span class="btn">Read More</span>',
  ),
  'product-visual': doc(
    '<h2>New Product</h2><p>We just launched something you will love.</p><p>Features: fast, reliable, and easy to use.</p><span class="btn">Learn More</span><hr><p class="muted">Available now for all customers.</p>',
  ),
  'event-visual': doc(
    '<h2>You are Invited</h2><p>Join us for an event you will not want to miss.</p><p>Date: Saturday, March 15 at 2:00 PM</p><p>Location: Online via Zoom</p><span class="btn">RSVP Now</span>',
  ),
  'reset-visual': doc(
    '<p>Hi {{name}},</p><p>We received a request to reset your password. Click the button below to choose a new one.</p><span class="btn">Reset Password</span><p class="muted">If you did not request this, you can safely ignore this email.</p>',
  ),
};
