export interface PlaintextStarter {
  id: string;
  format: 'plaintext';
  name: string;
  description: string;
  subject: string;
  body: string;
}

export const plaintextStarters: PlaintextStarter[] = [
  {
    id: 'blank-plaintext',
    format: 'plaintext',
    name: 'Start from scratch',
    description: 'Blank plain text',
    subject: '',
    body: '',
  },
  {
    id: 'welcome-plaintext',
    format: 'plaintext',
    name: 'Welcome (plain)',
    description: 'Simple greeting',
    subject: 'Welcome aboard, {{name}}',
    body: 'Hi {{name}},\n\nWelcome aboard! Thanks for signing up. We are excited to have you on board.\n\nIf you have any questions, just reply to this email.\n\n— The team',
  },
  {
    id: 'receipt-plaintext',
    format: 'plaintext',
    name: 'Receipt / confirmation',
    description: 'Order/booking confirm',
    subject: 'Your confirmation',
    body: 'Hi {{name}},\n\nThis is your confirmation for your recent order.\n\nOrder details:\n- Item: Sample product\n- Status: Confirmed\n\nYou will receive another email when your order ships.\n\nThanks for your business!\n\n— The team',
  },
  {
    id: 'notification-plaintext',
    format: 'plaintext',
    name: 'Notification',
    description: 'System alert',
    subject: 'Notification',
    body: 'Hi {{name}},\n\nThis is a notification about your account.\n\nA recent action was completed successfully. No further action is needed from you.\n\nView details: https://example.com/dashboard\n\n— The team',
  },
];
