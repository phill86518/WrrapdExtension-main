const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const stripeSecret = process.env.STRIPE_SECRET_KEY;
if (!stripeSecret) {
    throw new Error('STRIPE_SECRET_KEY environment variable is required');
}
const stripe = require('stripe')(stripeSecret);

const app = express();

app.use(cors());
app.use(bodyParser.json());

app.post('/create-checkout-session', async (req, res) => {
    const { gifts, flowers } = req.body;

    try {
        // Validación básica de los datos recibidos
        if (typeof gifts !== 'number' || typeof flowers !== 'number' || gifts < 0 || flowers < 0) {
            return res.status(400).json({ error: 'Datos inválidos' });
        }

        // Construir el array de line_items dinámicamente
        const lineItems = [];

        if (gifts > 0) {
            lineItems.push({ price: 'price_1QVEZyCZ6tFiFwmsxoKoBppQ', quantity: gifts });
        }

        if (flowers > 0) {
            lineItems.push({ price: 'price_1QVF0LCZ6tFiFwmsWN92ZKOL', quantity: flowers });
        }

        // Validar que haya al menos un ítem en el carrito
        if (lineItems.length === 0) {
            return res.status(400).json({ error: 'Debe haber al menos un artículo en el carrito.' });
        }

        // Crear la sesión de Stripe
        const session = await stripe.checkout.sessions.create({
            line_items: lineItems,
            mode: 'payment',
            success_url: 'http://your-domain/success',
            cancel_url: 'http://your-domain/cancel',
            shipping_address_collection: {
                allowed_countries: ['US'],
            },
            shipping_options: [
                {
                    shipping_rate_data: {
                        type: 'fixed_amount',
                        fixed_amount: {
                            amount: 0,
                            currency: 'usd',
                        },
                        display_name: 'Free Shipping',
                        delivery_estimate: {
                            minimum: { unit: 'business_day', value: 3 },
                        },
                    },
                },
            ],
        });

        res.status(200).json({ url: session.url });
    } catch (error) {
        console.error('Error creating checkout session:', error);
        res.status(500).json({ error: 'Error creando la sesión de pago.' });
    }
});


const PORT = 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
