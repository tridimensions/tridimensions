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

    // For each product, fetch its prices separately
    const productsWithPrices = await Promise.all(
      products.data.map(async (product) => {
        // Fetch prices for this specific product
        const prices = await stripe.prices.list({
          product: product.id,
          active: true,
          limit: 1,
        });

        const price = prices.data[0];
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
    );

    // Filter out null values (products without prices)
    const formattedProducts = productsWithPrices.filter(p => p !== null);

    return NextResponse.json({ products: formattedProducts });
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
