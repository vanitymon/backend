// Backend Server for Stripe Checkout
// Run with: node server.js
// Make sure to install dependencies: npm install express stripe dotenv cors

require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: [
        'https://stealthdma.com',
        'https://www.stealthdma.com',
        'http://localhost:3000',
        'http://127.0.0.1:3000'
    ],
    credentials: true
}));
app.use(express.json());
app.use(express.static('.')); // Serve static files

// Product configuration
const PRODUCTS = {
    tier1: {
        name: 'TIER 1 Firmware EAC/ACE',
        price: 15000, // Amount in cents ($150.00)
    },
    tier2: {
        name: 'TIER 2 Firmware EAC/BE/ACE/VGK',
        price: 25000, // Amount in cents ($250.00)
        // stripeProductId: 'prod_TLrFmlg2jPfIsn', // Stripe Product ID (commented out - using dynamic price instead)
    },
};

// Create Stripe Checkout Session
app.post('/api/create-checkout-session', async (req, res) => {
    try {
        const { productId, amount, productName } = req.body;

        // Validate product ID
        if (!PRODUCTS[productId]) {
            return res.status(400).json({ error: 'Invalid product ID' });
        }

        const product = PRODUCTS[productId];
        const sessionAmount = amount * 100; // Convert to cents

        // Prepare line items
        let lineItems;
        
        // If product has a Stripe Product ID, fetch its default price
        if (product.stripeProductId) {
            try {
                // Fetch the product to get its default price
                const stripeProduct = await stripe.products.retrieve(product.stripeProductId);
                // Get the first price (default price) for the product
                const prices = await stripe.prices.list({
                    product: product.stripeProductId,
                    active: true,
                    limit: 1,
                });
                
                if (prices.data.length > 0) {
                    // Use the Stripe price ID
                    lineItems = [
                        {
                            price: prices.data[0].id,
                            quantity: 1,
                        },
                    ];
                } else {
                    throw new Error(`No active price found for product ${product.stripeProductId}`);
                }
            } catch (error) {
                console.error('Error fetching Stripe product/price:', error);
                console.log('Falling back to dynamic price_data for product:', product.name);
                // Fallback to dynamic price_data if product lookup fails
                lineItems = [
                    {
                        price_data: {
                            currency: 'usd',
                            product_data: {
                                name: productName || product.name,
                                description: `Purchase ${product.name}`,
                            },
                            unit_amount: sessionAmount,
                        },
                        quantity: 1,
                    },
                ];
            }
        } else {
            // Use dynamic price_data for products without Stripe Product ID
            lineItems = [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: productName || product.name,
                            description: `Purchase ${product.name}`,
                        },
                        unit_amount: sessionAmount,
                    },
                    quantity: 1,
                },
            ];
        }

        // Determine origin URL (production or development)
        const origin = req.headers.origin || req.headers.referer?.split('/').slice(0, 3).join('/') || 'http://localhost:3000';
        const isProduction = origin.includes('stealthdma.com');
        const baseUrl = isProduction ? 'https://stealthdma.com' : 'http://localhost:3000';

        // Create Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: lineItems,
            mode: 'payment',
            success_url: `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/product${productId === 'tier1' ? '' : '2'}.html`,
            metadata: {
                productId: productId,
            },
        });

        res.json({ id: session.id });
    } catch (error) {
        console.error('Error creating checkout session:', error);
        res.status(500).json({ error: error.message });
    }
});

// Success page handler (optional - for checking payment status)
app.get('/success.html', async (req, res) => {
    const sessionId = req.query.session_id;
    
    if (sessionId) {
        try {
            const session = await stripe.checkout.sessions.retrieve(sessionId);
            
            // You can customize this page based on payment status
            res.sendFile(path.join(__dirname, 'success.html'));
        } catch (error) {
            console.error('Error retrieving session:', error);
            res.sendFile(path.join(__dirname, 'success.html'));
        }
    } else {
        res.sendFile(path.join(__dirname, 'success.html'));
    }
});

// Webhook endpoint for handling Stripe events (optional but recommended)
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
        case 'checkout.session.completed':
            const session = event.data.object;
            console.log('Payment successful for session:', session.id);
            // Handle successful payment (e.g., send confirmation email, update database, etc.)
            break;
        case 'payment_intent.succeeded':
            const paymentIntent = event.data.object;
            console.log('PaymentIntent succeeded:', paymentIntent.id);
            break;
        default:
            console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Make sure to set STRIPE_SECRET_KEY in your .env file');
});

