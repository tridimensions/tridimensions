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

    try {
      const couponCode = code.toUpperCase().trim();
      console.log('=== DISCOUNT VALIDATION ===');
      console.log('Attempting to validate coupon:', couponCode);
      console.log('STRIPE_SECRET_KEY exists:', !!process.env.STRIPE_SECRET_KEY);
      
      let coupon;
      
      try {
        // Direct lookup is more reliable
        console.log('Trying direct coupon lookup...');
        coupon = await stripe.coupons.retrieve(couponCode);
        console.log('✓ Coupon found via direct lookup:', coupon.id);
      } catch (retrieveError) {
        // If direct lookup fails, try listing all coupons
        console.log('Direct lookup failed, error:', retrieveError.message);
        console.log('Trying list method to find coupon...');
        
        const coupons = await stripe.coupons.list({
          limit: 100
        });
        
        console.log('Total coupons in Stripe:', coupons.data.length);
        console.log('Available coupon IDs:', coupons.data.map(c => c.id).join(', '));
        
        coupon = coupons.data.find(c => c.id.toUpperCase() === couponCode);
        
        if (!coupon) {
          console.log('✗ Coupon not found:', couponCode);
          return NextResponse.json(
            { error: 'Discount code not found' },
            { status: 404 }
          );
        }
        
        console.log('✓ Coupon found via list:', coupon.id);
      }

      if (!coupon.valid) {
        console.log('✗ Coupon found but not valid:', coupon.id);
        return NextResponse.json(
          { error: 'This discount code is no longer valid' },
          { status: 400 }
        );
      }

      console.log('✓ Coupon validated successfully:', coupon.id);
      console.log('Coupon details:', {
        id: coupon.id,
        percent_off: coupon.percent_off,
        amount_off: coupon.amount_off,
        valid: coupon.valid,
        name: coupon.name
      });
      
      return NextResponse.json({
        discount: {
          code: coupon.id,
          type: coupon.percent_off ? 'percentage' : 'fixed',
          value: coupon.percent_off || (coupon.amount_off / 100),
          description: coupon.name
        }
      });
    } catch (stripeError) {
      console.error('✗ Stripe error:', {
        message: stripeError.message,
        type: stripeError.type,
        code: stripeError.code
      });
      return NextResponse.json(
        { error: 'Failed to validate discount code: ' + stripeError.message },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('✗ Error validating discount:', error.message);
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
