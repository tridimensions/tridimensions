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
      console.log('Attempting to validate:', couponCode);
      
      let discount = null;
      
      // Method 1: Try Promotion Codes (most common in modern Stripe)
      try {
        console.log('Trying Promotion Code lookup...');
        const promoCode = await stripe.promotionCodes.retrieve(couponCode);
        console.log('✓ Promotion code found:', promoCode.code);
        
        // Get the coupon details from the promotion code
        const coupon = await stripe.coupons.retrieve(promoCode.coupon.id);
        
        discount = {
          code: promoCode.code,
          type: coupon.percent_off ? 'percentage' : 'fixed',
          value: coupon.percent_off || (coupon.amount_off / 100),
          description: coupon.name || promoCode.code
        };
      } catch (promoError) {
        console.log('Promotion code not found, trying Coupon...');
        
        // Method 2: Try direct Coupon lookup (legacy)
        try {
          const coupon = await stripe.coupons.retrieve(couponCode);
          console.log('✓ Coupon found:', coupon.id);
          
          discount = {
            code: coupon.id,
            type: coupon.percent_off ? 'percentage' : 'fixed',
            value: coupon.percent_off || (coupon.amount_off / 100),
            description: coupon.name
          };
        } catch (couponError) {
          console.log('Coupon not found, trying Coupon list...');
          
          // Method 3: List all coupons and promotion codes
          const coupons = await stripe.coupons.list({ limit: 100 });
          const promoCodes = await stripe.promotionCodes.list({ limit: 100 });
          
          console.log('Available coupons:', coupons.data.map(c => c.id).join(', '));
          console.log('Available promotion codes:', promoCodes.data.map(p => p.code).join(', '));
          
          // Try to find in coupons
          const foundCoupon = coupons.data.find(c => c.id.toUpperCase() === couponCode);
          if (foundCoupon) {
            console.log('✓ Coupon found in list:', foundCoupon.id);
            discount = {
              code: foundCoupon.id,
              type: foundCoupon.percent_off ? 'percentage' : 'fixed',
              value: foundCoupon.percent_off || (foundCoupon.amount_off / 100),
              description: foundCoupon.name
            };
          } else {
            // Try to find in promotion codes
            const foundPromo = promoCodes.data.find(p => p.code.toUpperCase() === couponCode);
            if (foundPromo) {
              console.log('✓ Promotion code found in list:', foundPromo.code);
              const coupon = await stripe.coupons.retrieve(foundPromo.coupon.id);
              discount = {
                code: foundPromo.code,
                type: coupon.percent_off ? 'percentage' : 'fixed',
                value: coupon.percent_off || (coupon.amount_off / 100),
                description: coupon.name || foundPromo.code
              };
            }
          }
        }
      }

      if (!discount) {
        console.log('✗ Discount code not found:', couponCode);
        return NextResponse.json(
          { error: 'Discount code not found' },
          { status: 404 }
        );
      }

      console.log('✓ Discount validated successfully:', discount.code);
      return NextResponse.json({ discount });
      
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
