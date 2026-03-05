import { NextResponse } from 'next/server';

export async function GET(req) {
  return NextResponse.json({ message: 'API is working' });
}

export async function OPTIONS(req) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS, POST, PUT, DELETE',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
