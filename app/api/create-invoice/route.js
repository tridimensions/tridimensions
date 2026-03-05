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
      <p>Tri Dimensions</p>
    `;

    await emailTransporter.sendMail({
      from: process.env.SMTP_FROM_EMAIL,
      to: email,
      subject: 'Order Confirmation - Tri Dimensions',
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
          company: 'Tri Dimensions'
        }
      });
    }

    // Step 2: Prepare invoice line items
    const invoiceLineItems = [];

    for (const item of items) {
      invoiceLineItems.push({
        price: item.stripePriceId || item.productId,
        quantity: item.quantity,
        description: item.productName
      });
    }

    // Add discount as a manual line item if applicable
    if (discount > 0 && discountCode) {
      invoiceLineItems.push({
        price_data: {
          currency: 'cad',
          product_data: {
            name: `Discount: ${discountCode}`,
            type: 'service'
          },
          unit_amount: -Math.round(discount * 100)
        },
        quantity: 1
      });
    }

    // Step 3: Create draft invoice
    const invoice = await stripe.invoices.create({
      customer: stripeCustomer.id,
      description: `Order from Tri Dimensions - ${new Date().toLocaleDateString()}`,
      metadata: {
        order_source: 'Tri Dimensions Portal',
        discount_code: discountCode || 'none'
      },
      collection_method: 'send_invoice',
      days_until_due: 30
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

    // Step 5: Send confirmation email
    await sendOrderConfirmationEmail(
      customer.email,
      customer.name,
      items,
      subtotal,
      discount,
      total,
      invoice.id
    );

    return NextResponse.json({
      success: true,
      message: 'Order created successfully! Your draft invoice is ready. Please complete payment via eTransfer to stephane@tridimensions.ca',
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
