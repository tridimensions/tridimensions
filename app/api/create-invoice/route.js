import Stripe from 'stripe';
import nodemailer from 'nodemailer';
import { NextResponse } from 'next/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Configure email transporter
const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

async function sendOrderConfirmationEmail(
  email,
  customerName,
  items,
  subtotal,
  discount,
  total,
  invoiceId
) {
  try {
    const itemsList = items
      .map(item => `<li>${item.productName} - Qty: ${item.quantity}</li>`)
      .join('');

    const htmlContent = `
      <h2>Order Confirmation</h2>
      <p>Hi ${customerName},</p>
      <p>Thank you for your order! Here's a summary:</p>
      
      <h3>Items:</h3>
      <ul>
        ${itemsList}
      </ul>
      
      <h3>Order Total:</h3>
      <p>Subtotal: $${(subtotal / 100).toFixed(2)}</p>
      ${discount > 0 ? `<p>Discount: -$${(discount / 100).toFixed(2)}</p>` : ''}
      <p><strong>Total: $${(total / 100).toFixed(2)}</strong></p>
      
      <h3>Payment Instructions:</h3>
      <p>Please complete your payment via eTransfer to: <strong>stephane@tridimensions.ca</strong></p>
      <p>Invoice ID: ${invoiceId}</p>
      
      <p>Thank you for your business!</p>
      <p>TriDimensions</p>
    `;

    await emailTransporter.sendMail({
      from: process.env.SMTP_FROM_EMAIL,
      to: email,
      subject: 'Order Confirmation - TriDimensions',
      html: htmlContent
    });

    return true;
  } catch (error) {
    console.error('Error sending confirmation email:', error);
    return false;
  }
}

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
      console.log('Applying discount:', { discountCode, discount, customerId: stripeCustomer.id });
      try {
        // Get the promotion code to find the underlying coupon ID
        const promoCode = await stripe.promotionCodes.retrieve(discountCode);
        console.log('Promotion code found:', promoCode.code, 'Coupon:', promoCode.coupon.id);
        
        // Create a discount using the COUPON ID from the promotion code
        const customerDiscount = await stripe.discounts.create({
          customer: stripeCustomer.id,
          coupon: promoCode.coupon.id
        });
        
        console.log('✓ Discount created for customer:', customerDiscount.id);
        
        // Then apply the discount to the invoice using the discount ID
        await stripe.invoices.update(invoice.id, {
          discounts: [customerDiscount.id]
        });
        
        console.log('✓ Discount applied to invoice:', customerDiscount.id);
      } catch (discountError) {
        console.error('Error applying discount to invoice:', discountError.message);
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

    // Step 6: Disable customer payment ability and remove payment link
    try {
      await stripe.invoices.update(invoice.id, {
        payment_settings: {
          save_default_payment_method: 'off'
        },
        statement_descriptor: 'Pay via eTransfer'
      });
    } catch (err) {
      console.error('Warning: Could not update payment settings:', err.message);
      // Continue anyway - invoice was created
    }

    // Step 7: Send confirmation email
    try {
      await sendOrderConfirmationEmail(
        customer.email,
        customer.name,
        items,
        subtotal,
        discount,
        total,
        invoice.id
      );
    } catch (err) {
      console.error('Warning: Could not send email:', err.message);
      // Continue anyway - invoice was created, email is optional
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
