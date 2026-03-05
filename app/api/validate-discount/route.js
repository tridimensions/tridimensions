import Stripe from 'stripe';
import { NextResponse } from 'next/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(req) {
  try {
    const { code } = await req.json();

    if (!code) {
      return NextResponse.json(
        { error: 'Discount code is required' },
        { status: 400 }
      );
    }

    const coupons = await stripe.coupons.list({
      limit: 100
    });

    const coupon = coupons.data.find(c => c.id.toUpperCase() === code.toUpperCase());

    if (!coupon || !coupon.valid) {
      return NextResponse.json(
        { error: 'Discount code not found or expired' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      discount: {
        code: coupon.id,
        type: coupon.percent_off ? 'percentage' : 'fixed',
        value: coupon.percent_off || (coupon.amount_off / 100),
        description: coupon.name
      }
    });
  } catch (error) {
    console.error('Error validating discount:', error);
    return NextResponse.json(
      { error: 'Failed to validate discount code: ' + error.message },
      { status: 500 }
    );
  }
}

export async function OPTIONS(req) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
