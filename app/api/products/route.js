import Stripe from 'stripe';
import { NextResponse } from 'next/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function GET(req) {
  try {
    // Fetch products
    const products = await stripe.products.list({
      limit: 100,
      active: true,
    });

    // Fetch all prices at once instead of per product
    const prices = await stripe.prices.list({
      limit: 100,
      active: true,
    });

    // Create a map of product IDs to prices
    const pricesByProduct = {};
    prices.data.forEach(price => {
      if (price.product && !pricesByProduct[price.product]) {
        pricesByProduct[price.product] = price;
      }
    });

    // Build product list
    const productsWithPrices = products.data
      .map(product => {
        const price = pricesByProduct[product.id];
        if (!price) return null;

        return {
          id: product.id,
          name: product.name,
          description: product.description,
          price: price.unit_amount,
          currency: price.currency,
          image: product.images?.[0] || null,
          stripeProductId: product.id,
          stripePriceId: price.id
        };
      })
      .filter(p => p !== null)
      .filter(p => !p.name.toLowerCase().includes('performance test'));

    return NextResponse.json({ products: productsWithPrices });
  } catch (error) {
    console.error('Error fetching products:', error);
    return NextResponse.json(
      { error: 'Failed to fetch products: ' + error.message },
      { status: 500 }
    );
  }
}

export async function OPTIONS(req) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
