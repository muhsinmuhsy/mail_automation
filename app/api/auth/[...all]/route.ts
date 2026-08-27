import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/neon-auth';

const handler = auth.handler();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function GET(request: NextRequest, context: { params: Promise<any> }) {
  return handler.GET(request, context);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function POST(request: NextRequest, context: { params: Promise<any> }) {
  return handler.POST(request, context);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function DELETE(request: NextRequest, context: { params: Promise<any> }) {
  return handler.DELETE(request, context);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function PUT(request: NextRequest, context: { params: Promise<any> }) {
  return handler.PUT(request, context);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function PATCH(request: NextRequest, context: { params: Promise<any> }) {
  return handler.PATCH(request, context);
}
