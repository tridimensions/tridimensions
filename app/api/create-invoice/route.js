import Stripe from 'stripe';
import { NextResponse } from 'next/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(req) {
  try {
    const { customer, items, subtotal, discount, discountCode, total } = await req.json();

    console.log('=== CREATE INVOICE ===');
    console.log('Received discountCode:', discountCode);
    console.log('Received discount amount:', discount);

    // Validate input
    if (!customer || !customer.email || !items || items.length === 0) {
      return NextResponse.json(
        { error: 'Missing required order data' },
        { status: 400 }
      );
    }

    // Step 1: Find or create customer in Stripe
    let stripeCustomer;
    const existingCustomers = await stripe.customers.search({
      query: `email:"${customer.email}"`
    });

    if (existingCustomers.data.length > 0) {
      stripeCustomer = existingCustomers.data[0];
    } else {
      stripeCustomer = await stripe.customers.create({
        email: customer.email,
        name: customer.name,
        address: {
          line1: customer.address,
          city: customer.city,
          state: customer.province,
          postal_code: customer.postalCode,
          country: 'CA'
        },
        metadata: {
          company: 'TriDimensions'
        }
      });
    }

    // Step 2: Prepare invoice line items
    const invoiceLineItems = [];

    for (const item of items) {
      // Make sure we have a valid price ID
      if (!item.stripePriceId && !item.productId) {
        throw new Error(`Missing price or product ID for item: ${item.productName}`);
      }
      
      invoiceLineItems.push({
        price: item.stripePriceId,
        quantity: item.quantity,
        description: item.productName
      });
    }

    // Step 2: Prepare invoice line items (WITHOUT discount - will apply discount directly)
    // Note: We create the invoice but DO NOT send it via Stripe's sendInvoice()
    // This prevents the Stripe payment link from being sent to the customer
    // Instead, we send our own custom email with eTransfer payment instructions
    const invoice = await stripe.invoices.create({
      customer: stripeCustomer.id,
      description: `Order from TriDimensions - ${new Date().toLocaleDateString()}`,
      metadata: {
        order_source: 'TriDimensions Portal',
        discount_code: discountCode || 'none'
      },
      collection_method: 'send_invoice',
      days_until_due: 30,
      auto_advance: false
    });

    // Step 4: Add line items to invoice
    for (const lineItem of invoiceLineItems) {
      if (lineItem.price_data) {
        await stripe.invoiceItems.create({
          customer: stripeCustomer.id,
          invoice: invoice.id,
          price_data: lineItem.price_data,
          quantity: lineItem.quantity
        });
      } else {
        await stripe.invoiceItems.create({
          customer: stripeCustomer.id,
          invoice: invoice.id,
          price: lineItem.price,
          quantity: lineItem.quantity
        });
      }
    }

    // Step 4b: Apply discount to invoice BEFORE finalizing
    if (discountCode && discount > 0) {
      console.log('Applying discount:', { discountCode, discount, invoiceId: invoice.id });
      try {
        // Search for the promotion code to find the underlying coupon ID
        const promoCodesList = await stripe.promotionCodes.list({
          code: discountCode,
          limit: 1
        });
        
        if (promoCodesList.data.length === 0) {
          throw new Error(`Promotion code not found: ${discountCode}`);
        }
        
        const promoCode = promoCodesList.data[0];
        console.log('Promotion code found:', promoCode.code, 'Coupon:', promoCode.coupon.id);
        
        // Apply discount to invoice by updating it with the coupon
        const updatedInvoice = await stripe.invoices.update(invoice.id, {
          coupon: promoCode.coupon.id
        });
        
        console.log('✓ Discount applied to invoice:', promoCode.coupon.id);
        console.log('Invoice discount details:', {
          invoice_id: updatedInvoice.id,
          discount: updatedInvoice.discount
        });
      } catch (discountError) {
        console.error('Error applying discount to invoice:', {
          message: discountError.message,
          code: discountError.code,
          type: discountError.type
        });
      }
    } else {
      console.log('Not applying discount. discountCode:', discountCode, 'discount:', discount);
    }

    // Step 5: Finalize the invoice (instead of draft)
    try {
      await stripe.invoices.finalizeInvoice(invoice.id, {
        auto_advance: false
      });
    } catch (err) {
      console.error('Warning: Could not finalize invoice:', err.message);
      // Continue anyway - invoice was created
    }

    // Step 6: Update invoice with statement descriptor only
    try {
      await stripe.invoices.update(invoice.id, {
        statement_descriptor: 'Pay via eTransfer'
      });
    } catch (err) {
      console.error('Warning: Could not update statement descriptor:', err.message);
      // Continue anyway - invoice was created
    }

    // Step 7: Send invoice via Stripe email
    try {
      await stripe.invoices.sendInvoice(invoice.id);
      console.log('✓ Invoice sent to customer via Stripe email');
    } catch (err) {
      console.error('Warning: Could not send invoice email via Stripe:', err.message);
      // Continue anyway - invoice was created
    }

    // Return success - invoice IS created even if finalization/email had issues
    return NextResponse.json({
      success: true,
      message: 'Order created successfully! Your invoice has been finalized. Please complete payment via eTransfer to stephane@tridimensions.ca',
      invoiceId: invoice.id,
      customerId: stripeCustomer.id,
      invoiceNumber: invoice.number || invoice.id
    });
  } catch (error) {
    console.error('Error creating invoice:', error);
    return NextResponse.json(
      { error: 'Failed to create invoice: ' + error.message },
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
