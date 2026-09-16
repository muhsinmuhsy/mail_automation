import type {
  TemplateContent,
  TemplateSettings,
  Block,
  SectionBlock,
  TitleBlock,
  ParagraphBlock,
  ButtonBlock,
  DividerBlock,
  SpacerBlock,
  SpacingValue,
  ColumnLayout,
  HeadingLevel,
} from '@templatical/types';

export interface VisualStarterSeed {
  id: string;
  format: 'visual';
  name: string;
  description: string;
  subject: string;
  content: TemplateContent;
}

const SETTINGS: TemplateSettings = {
  width: 600,
  backgroundColor: '#ffffff',
  textColor: '#1a1a1a',
  linkUnderline: true,
  fontFamily: 'Arial, sans-serif',
  locale: 'en',
};

function pad(top = 0, right = 0, bottom = 0, left = 0): SpacingValue {
  return { top, right, bottom, left };
}

function section(id: string, children: Block[][], columns: ColumnLayout = '1'): SectionBlock {
  return { id, type: 'section', columns, children, styles: { padding: pad() } };
}

function title(id: string, content: string, level: HeadingLevel = 2): TitleBlock {
  return { id, type: 'title', content, level, textAlign: 'center', styles: { padding: pad(16, 16, 8, 16) } };
}

function paragraph(id: string, content: string): ParagraphBlock {
  return { id, type: 'paragraph', content, styles: { padding: pad(8, 16, 8, 16) } };
}

function button(id: string, text: string, url: string): ButtonBlock {
  return {
    id, type: 'button', text, url,
    backgroundColor: '#0066cc', textColor: '#ffffff',
    borderRadius: 4, fontSize: 16,
    buttonPadding: pad(12, 24, 12, 24),
    align: 'center', width: 'full',
    styles: { padding: pad(16, 16, 16, 16) },
  };
}

function divider(id: string): DividerBlock {
  return { id, type: 'divider', lineStyle: 'solid', color: '#e5e5e5', thickness: 1, width: 'full', styles: { padding: pad(16, 16, 16, 16) } };
}

function spacer(id: string, height: number): SpacerBlock {
  return { id, type: 'spacer', height, styles: { padding: pad() } };
}

function content(blocks: Block[]): TemplateContent {
  return { blocks, settings: SETTINGS };
}

export const visualStarters: VisualStarterSeed[] = [
  {
    id: 'blank-visual',
    format: 'visual',
    name: 'Start from scratch',
    description: 'Blank visual editor',
    subject: '',
    content: content([]),
  },
  {
    id: 'welcome-visual',
    format: 'visual',
    name: 'Welcome email',
    description: 'Greet new subscribers',
    subject: 'Welcome aboard, {{name}}',
    content: content([
      section('welcome-s1', [[
        title('welcome-t1', 'Welcome aboard!'),
        paragraph('welcome-p1', 'Hi {{name}}, thanks for signing up. We are excited to have you on board.'),
        button('welcome-b1', 'Get Started', 'https://example.com/get-started'),
        divider('welcome-d1'),
        paragraph('welcome-p2', 'Questions? Reply to this email anytime.'),
      ]]),
    ]),
  },
  {
    id: 'newsletter-visual',
    format: 'visual',
    name: 'Newsletter',
    description: 'Recurring content round-up',
    subject: 'Your weekly newsletter',
    content: content([
      section('nl-s1', [[
        title('nl-t1', 'This Week'),
        paragraph('nl-p1', 'Here is a round-up of what happened this week.'),
        divider('nl-d1'),
        title('nl-t2', 'Top story'),
        paragraph('nl-p2', 'A summary of the most important update.'),
        title('nl-t3', 'Also worth reading'),
        paragraph('nl-p3', 'A second highlight from the week.'),
        button('nl-b1', 'Read More', 'https://example.com/news'),
      ]]),
    ]),
  },
  {
    id: 'product-visual',
    format: 'visual',
    name: 'Product announcement',
    description: 'Single product highlight',
    subject: 'Check out our new product',
    content: content([
      section('prod-s1', [[
        title('prod-t1', 'New Product'),
        paragraph('prod-p1', 'We just launched something you will love.'),
        paragraph('prod-p2', 'Features: fast, reliable, and easy to use.'),
        button('prod-b1', 'Learn More', 'https://example.com/product'),
        divider('prod-d1'),
        paragraph('prod-p3', 'Available now for all customers.'),
      ]]),
    ]),
  },
  {
    id: 'event-visual',
    format: 'visual',
    name: 'Event invitation',
    description: 'Date/time + RSVP',
    subject: 'You are invited',
    content: content([
      section('evt-s1', [[
        title('evt-t1', 'You are Invited'),
        paragraph('evt-p1', 'Join us for an event you will not want to miss.'),
        paragraph('evt-p2', 'Date: Saturday, March 15 at 2:00 PM'),
        paragraph('evt-p3', 'Location: Online via Zoom'),
        button('evt-b1', 'RSVP Now', 'https://example.com/rsvp'),
      ]]),
    ]),
  },
  {
    id: 'reset-visual',
    format: 'visual',
    name: 'Password reset',
    description: 'Transactional, single link',
    subject: 'Reset your password',
    content: content([
      section('rst-s1', [[
        paragraph('rst-p1', 'Hi {{name}},'),
        paragraph('rst-p2', 'We received a request to reset your password. Click the button below to choose a new one.'),
        button('rst-b1', 'Reset Password', 'https://example.com/reset'),
        spacer('rst-sp1', 16),
        paragraph('rst-p3', 'If you did not request this, you can safely ignore this email.'),
      ]]),
    ]),
  },
];
