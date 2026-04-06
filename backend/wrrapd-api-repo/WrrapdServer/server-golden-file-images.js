require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const formData = require('form-data');
const Mailgun = require('mailgun.js');
const OpenAI = require('openai');
const { Storage } = require('@google-cloud/storage');
const fs = require('fs');
const QRCode = require('qrcode');
const https = require('https');
const http = require('http');

// Initialize Google Cloud Storage
let storageOptions = {
    projectId: process.env.GCS_PROJECT_ID
};

// If GOOGLE_APPLICATION_CREDENTIALS is set in the .env file and starts with ./
// use the keyFilename option for local file path
if (process.env.GOOGLE_APPLICATION_CREDENTIALS && 
    process.env.GOOGLE_APPLICATION_CREDENTIALS.startsWith('./')) {
    storageOptions.keyFilename = path.join(__dirname, process.env.GOOGLE_APPLICATION_CREDENTIALS.substring(2));
}

const storage = new Storage(storageOptions);

const app = express();

// Configure CORS to allow requests from Amazon domains
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        const allowedOrigins = [
            'https://www.amazon.com',
            'https://www.amazon.ca',
            'https://www.amazon.co.uk',
            'https://www.amazon.de',
            'https://www.amazon.fr',
            'https://www.amazon.es',
            'https://www.amazon.it',
            'https://www.amazon.nl',
            'https://www.amazon.co.jp',
            'https://www.amazon.in',
            'https://www.amazon.com.au',
            'https://www.amazon.com.br',
            'https://www.amazon.mx'
        ];
        
        if (allowedOrigins.indexOf(origin) !== -1 || origin.includes('amazon.com')) {
            callback(null, true);
        } else {
            callback(null, true); // Allow all for now, can restrict later
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'X-Requested-With'],
    preflightContinue: false,
    optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const mailgun = new Mailgun(formData);
const mg = mailgun.client({
    username: 'api',
    key: process.env.MAILGUN_API_KEY
});

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Middleware to verify the domain
app.use((req, res, next) => {
    if (req.hostname === 'pay.wrrapd.com') {
        req.isPayDomain = true;
    } else if (req.hostname === 'api.wrrapd.com') {
        req.isApiDomain = true;
    }
    next();
});

// Endpoints specific to pay.wrrapd.com
app.get('/success', (req, res) => {
    if (!req.isPayDomain) {
        return res.status(403).send('Access forbidden.');
    }
    res.sendFile(path.join(__dirname, 'public', 'success.html'));
});

app.get('/cancel', (req, res) => {
    if (!req.isPayDomain) {
        return res.status(403).send('Access forbidden.');
    }
    res.sendFile(path.join(__dirname, 'public', 'cancel.html'));
});

app.get('/checkout', (req, res) => {
    if (!req.isPayDomain) {
        return res.status(403).send('Access forbidden.');
    }
    res.sendFile(path.join(__dirname, 'public', 'checkout.html'));
});

// Endpoint specific to api.wrrapd.com
app.post('/create-payment-intent', async (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).send('Access forbidden.');
    }

    const { total, orderNumber } = req.body;

    try {
        if (!total || total <= 0) {
            return res.status(400).json({ error: 'Invalid total amount' });
        }

        const paymentIntent = await stripe.paymentIntents.create({
            amount: total, // Total in cents
            currency: 'usd',
            payment_method_types: ['card'],
            // billing_address_collection: 'required',
            metadata: {
                orderNumber: orderNumber || 'N/A'
            }
        });

        res.status(200).json({ clientSecret: paymentIntent.client_secret });
    } catch (error) {
        console.error('Error creating PaymentIntent:', error);
        res.status(500).json({ error: 'Failed to create PaymentIntent' });
    }
});

// Helper function to download image from GCS for email attachment
const getImageForEmail = async (filePath) => {
    if (!filePath) return null;
    
    console.log(`Attempting to download image from path: ${filePath}`);
    
    try {
        // Check if file exists first
        const [exists] = await storage.bucket('wrrapd-media').file(filePath).exists();
        if (!exists) {
            console.error(`File does not exist in bucket: ${filePath}`);
            return null;
        }
        
        // Download the file from GCS
        const [fileContent] = await storage.bucket('wrrapd-media').file(filePath).download();
        
        console.log(`Successfully downloaded file: ${filePath}, size: ${fileContent.length} bytes`);
        
        return {
            contentType: filePath.toLowerCase().endsWith('.png') ? 'image/png' : 
                         filePath.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/jpeg',
            data: fileContent
        };
    } catch (error) {
        console.error(`Error downloading image ${filePath}:`, error);
        return null;
    }
};

// Function to save order data to a JSON file
const saveOrderToJsonFile = (orderData, paymentData, customerData, orderNumber) => {
    // Create 'orders' directory if it doesn't exist
    const ordersDir = path.join(__dirname, 'orders');
    if (!fs.existsSync(ordersDir)) {
        fs.mkdirSync(ordersDir);
    }

    // Create a timestamp for the filename
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const filename = `order_${timestamp}.json`;
    const filePath = path.join(ordersDir, filename);

    // Prepare the data to be saved
    const saveData = {
        orderNumber: orderNumber,
        timestamp: new Date().toISOString(),
        orderItems: orderData,
        payment: {
            id: paymentData.id,
            amount: paymentData.amount,
            status: paymentData.status
        },
        customer: {
            email: customerData.email,
            phone: customerData.phone
        }
    };

    // Write the data to the file
    fs.writeFileSync(filePath, JSON.stringify(saveData, null, 2));
    
    console.log(`Order data saved to ${filePath}`);
    return filePath;
};

app.post('/process-payment', async (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).send('Access forbidden.');
    }

    const { paymentIntentId, orderData, customerEmail, customerPhone, orderNumber } = req.body;

    // Validate that all parameters are present
    if (!paymentIntentId || !orderData || !customerEmail || !customerPhone || !orderNumber) {
        return res.status(400).json({ error: 'Missing required parameters' });
    }

    try {
        // Verify the PaymentIntent with Stripe
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        if (paymentIntent.status !== 'succeeded') {
            return res.status(400).json({ error: 'Payment not confirmed' });
        }

        // Process the order information
        const amount = (paymentIntent.amount / 100).toFixed(2);

        console.log('Order Data:', orderData);
        console.log(`Using order number: ${orderNumber}`);

        // Save order data to a local JSON file
        saveOrderToJsonFile(orderData, paymentIntent, { 
            email: customerEmail, 
            phone: customerPhone 
        }, orderNumber);
        
        // Generate QR code for the order
        const qrData = {
            orderNumber,
            timestamp: new Date().toISOString(),
            amount,
            items: orderData.length
        };
        
        // Create a temporary file for the QR code
        const qrTempPath = path.join(__dirname, `temp_qr_${orderNumber}.png`);
        
        // Generate the QR code as a PNG file
        await QRCode.toFile(qrTempPath, JSON.stringify(qrData), {
            errorCorrectionLevel: 'H',
            type: 'png',
            margin: 1,
            width: 300
        });
        
        // Upload the QR code to Google Cloud Storage
        const qrDestPath = `qr-codes/${orderNumber}.png`;
        await storage.bucket('wrrapd-media').upload(qrTempPath, {
            destination: qrDestPath,
            metadata: {
                contentType: 'image/png',
            },
        });
        
        // Delete the temporary file after upload
        fs.unlinkSync(qrTempPath);
        
        console.log(`QR code generated and uploaded to gs://wrrapd-media/${qrDestPath}`);

        // Collect images for both emails
        const adminAttachments = [];
        const customerAttachments = [];
        
        // Process order items to collect images and build custom design HTML
        const processedItems = await Promise.all(orderData.map(async (item, index) => {
            const shippingAddress = item.shippingAddress 
                ? `
                    ${item.shippingAddress.name || 'N/A'},<br>
                    ${item.shippingAddress.street || 'N/A'},<br>
                    ${item.shippingAddress.city || 'N/A'}, 
                    ${item.shippingAddress.state || 'N/A'}, 
                    ${item.shippingAddress.postalCode || 'N/A'},<br>
                    ${item.shippingAddress.country || 'N/A'}
                `
                : 'Unknown';

            // Format delivery instructions if they exist
            let deliveryInstructionsFormatted = '';
            if (item.deliveryInstructions) {
                deliveryInstructionsFormatted = `
                    <strong>Delivery Instructions:</strong><br>
                    ${item.deliveryInstructions.propertyType ? `Property Type: ${item.deliveryInstructions.propertyType}<br>` : ''}
                    ${item.deliveryInstructions.securityCode ? `Security Code: ${item.deliveryInstructions.securityCode}<br>` : ''}
                    ${item.deliveryInstructions.callBox ? `Call Box: ${item.deliveryInstructions.callBox}<br>` : ''}
                    ${item.deliveryInstructions.preferredLocation ? `Preferred Location: ${item.deliveryInstructions.preferredLocation}<br>` : ''}
                    ${item.deliveryInstructions.businessHours ? `Business Hours: ${item.deliveryInstructions.businessHours}<br>` : ''}
                    ${item.deliveryInstructions.additionalInstructions ? `Additional Instructions: ${item.deliveryInstructions.additionalInstructions}` : ''}
                `;
            }

            // Format AI design if it exists
            let aiDesignFormatted = 'None';
            if (item.selected_ai_design && typeof item.selected_ai_design === 'object') {
                aiDesignFormatted = `<strong>${item.selected_ai_design.title}</strong><br>${item.selected_ai_design.description}`;
            }

            // Check if there's a custom design and prepare to attach it
            let adminCustomDesignHtml = 'None';
            let customerCustomDesignHtml = '';
            
            if (item.uploaded_design_path && item.selected_wrapping_option === 'upload') {
                const imageData = await getImageForEmail(item.uploaded_design_path);
                
                if (imageData) {
                    // Extract the original filename from the path
                    const originalFilename = item.uploaded_design_path.split('/').pop();
                    
                    // Add attachments for admin email
                    adminAttachments.push({
                        filename: originalFilename,
                        data: imageData.data
                    });
                    
                    // Add attachments for customer email
                    customerAttachments.push({
                        filename: originalFilename,
                        data: imageData.data
                    });
                    
                    // Create HTML with CID references
                    adminCustomDesignHtml = `
                        <p>Custom Design:</p>
                        <img src="cid:${originalFilename}" alt="Custom Design" style="max-width: 100px; max-height: 100px;">
                    `;
                    
                    customerCustomDesignHtml = `
                        <div style="margin-top: 15px; margin-bottom: 15px;">
                            <p><strong>Your Custom Design:</strong></p>
                            <img src="cid:${originalFilename}" alt="Your Custom Design" style="max-width: 300px; max-height: 300px; border: 1px solid #ddd;">
                        </div>
                    `;
                }
            }

            // Handle product image display (without attachment)
            let adminProductImageHtml = '';
            let customerProductImageHtml = '';
            
            if (item.imageUrl) {
                // Just reference the image directly instead of downloading and attaching it
                adminProductImageHtml = `
                    <div style="margin-right: 20px; margin-bottom: 15px;">
                        <img src="${item.imageUrl}" alt="Product image" style="max-width: 150px; max-height: 150px; border: 1px solid #ddd; border-radius: 4px;">
                    </div>
                `;
                
                customerProductImageHtml = `
                    <div style="margin-right: 20px; margin-bottom: 15px;">
                        <img src="${item.imageUrl}" alt="Product image" style="max-width: 150px; max-height: 150px; border: 1px solid #ddd; border-radius: 4px;">
                    </div>
                `;
            }

            // Return the processed data for admin and customer emails
            return {
                adminRow: `
                    <div style="border: 1px solid #e1e1e1; margin-bottom: 20px; padding: 15px; border-radius: 5px;">
                        <div style="display: flex; flex-wrap: wrap;">
                            ${adminProductImageHtml}
                            <div style="flex: 1; min-width: 300px;">
                                <h3 style="margin-top: 0;">Item: ${item.title}</h3>
                                <p><strong>ASIN:</strong> ${item.asin}</p>
                                <p><strong>Flowers:</strong> ${item.checkbox_flowers ? 'Yes' : 'No'}</p>
                                ${item.selected_flower_design ? `<p><strong>Flower Design:</strong> ${item.selected_flower_design}</p>` : ''}
                                ${item.selected_wrapping_option ? `<p><strong>Wrapping Option:</strong> ${item.selected_wrapping_option}</p>` : ''}
                                
                                ${item.selected_wrapping_option === 'ai' && item.selected_ai_design ? 
                                  `<div style="margin: 10px 0;">
                                     <p><strong>AI Design:</strong> ${item.selected_ai_design.title}</p>
                                     <p style="margin-left: 15px;">${item.selected_ai_design.description}</p>
                                   </div>` : 
                                  ''}
                                
                                ${item.occasion ? `<p><strong>Occasion:</strong> ${item.occasion}</p>` : ''}
                                
                                ${item.senderName ? `<p><strong>From:</strong> ${item.senderName}</p>` : ''}
                                ${item.giftMessage ? 
                                  `<div style="margin: 10px 0; padding: 10px; background-color: #f5f5f5; border-radius: 5px; font-style: italic;">
                                     <p style="margin: 0;"><strong>Gift Message:</strong> "${item.giftMessage}"</p>
                                   </div>` : 
                                  ''}
                            </div>
                        </div>
                        
                        <div style="margin-top: 15px; padding: 10px; background-color: #f9f9f9; border-radius: 5px;">
                            <h4 style="margin-top: 0;">Shipping Address</h4>
                            <p style="white-space: pre-line;">${shippingAddress.replace(/<br>/g, "\n")}</p>
                        </div>
                        
                        ${deliveryInstructionsFormatted ? 
                          `<div style="margin-top: 15px; padding: 10px; background-color: #f9f9f9; border-radius: 5px;">
                             <h4 style="margin-top: 0;">Delivery Instructions</h4>
                             ${deliveryInstructionsFormatted.replace('<strong>Delivery Instructions:</strong><br>', '')}
                           </div>` : 
                          ''}
                        
                        ${item.uploaded_design_path && item.selected_wrapping_option === 'upload' ?
                          `<div style="margin-top: 15px;">
                             <h4 style="margin-top: 0;">Custom Design</h4>
                             ${adminCustomDesignHtml.replace('<p>Custom Design:</p>', '')}
                           </div>` :
                          ''}
                    </div>
                `,
                customerRow: `
                    <div style="border: 1px solid #e1e1e1; margin-bottom: 20px; padding: 15px; border-radius: 5px;">
                        <div style="display: flex; flex-wrap: wrap;">
                            ${customerProductImageHtml}
                            <div style="flex: 1; min-width: 300px;">
                                <h3 style="margin-top: 0;">${item.title}</h3>
                                
                                ${item.senderName ? `<p><strong>From:</strong> ${item.senderName}</p>` : ''}
                                ${item.giftMessage ? 
                                  `<div style="margin: 10px 0; padding: 10px; background-color: #f5f5f5; border-radius: 5px; font-style: italic; border-left: 3px solid #ccc;">
                                     <p style="margin: 0;"><strong>Your Gift Message:</strong> "${item.giftMessage}"</p>
                                   </div>` : 
                                  ''}
                            </div>
                        </div>
                        
                        <div style="margin: 10px 0; padding: 10px; background-color: #f9f9f9; border-radius: 5px;">
                            <h4 style="margin-top: 0;">Wrapping Details</h4>
                            <p><strong>Flowers:</strong> ${item.checkbox_flowers ? 'Yes' : 'No'}</p>
                            <p><strong>Wrapping Paper:</strong> ${
                                item.selected_wrapping_option === 'ai' ? 'AI Generated Design' :
                                item.selected_wrapping_option === 'wrrapd' ? 'Selected by Wrrapd' :
                                item.selected_wrapping_option === 'upload' ? 'Your Own Design' :
                                item.selected_wrapping_option || 'None'
                            }</p>
                            ${item.selected_wrapping_option === 'ai' && item.selected_ai_design ? 
                              `<p><strong>Design Details:</strong> ${item.selected_ai_design.title} - ${item.selected_ai_design.description}</p>` : 
                              ''}
                            ${customerCustomDesignHtml}
                        </div>
                        
                        <div style="margin-top: 15px; padding: 10px; background-color: #f9f9f9; border-radius: 5px;">
                            <h4 style="margin-top: 0;">Shipping Address</h4>
                            <p style="white-space: pre-line;">${shippingAddress.replace(/<br>/g, "\n")}</p>
                        </div>
                        
                        ${deliveryInstructionsFormatted ? 
                          `<div style="margin-top: 15px; padding: 10px; background-color: #f9f9f9; border-radius: 5px;">
                             <h4 style="margin-top: 0;">Delivery Instructions</h4>
                             ${deliveryInstructionsFormatted.replace('<strong>Delivery Instructions:</strong><br>', '')}
                           </div>` : 
                          ''}
                    </div>
                `
            };
        }));

        // Admin email template
        const adminEmailBody = `
            <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
                <h1 style="color: #333;">New Payment Received</h1>
                <p>A payment of <strong>$${amount}</strong> has been successfully processed.</p>
                <p><strong>Order Number:</strong> ${orderNumber}</p>
                
                <div style="margin: 20px 0; padding: 15px; background-color: #f2f2f2; border-radius: 5px;">
                    <h2 style="margin-top: 0; color: #333;">Customer Contact</h2>
                    <p><strong>Email:</strong> ${customerEmail}</p>
                    <p><strong>Phone:</strong> ${customerPhone}</p>
                </div>
                
                <h2 style="color: #333;">Order Details</h2>
                ${processedItems.map(item => item.adminRow).join('')}
            </div>
        `;
        
        // Customer email template
        const customerEmailBody = `
            <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
                <h1 style="color: #333;">Thank you for your order!</h1>
                <p>We've received your payment of <strong>$${amount}</strong>.</p>
                <p><strong>Order Number:</strong> ${orderNumber}</p>
                
                <h2 style="color: #333;">Order Details</h2>
                ${processedItems.map(item => item.customerRow).join('')}
                
                <p>We'll start processing your order right away!</p>
                <p>If you have any questions, please don't hesitate to contact us.</p>
                <br>
                <p>Best regards,</p>
                <p>The Wrrapd Team</p>
            </div>
        `;

        // Send email to admin
        await mg.messages.create(process.env.MAILGUN_DOMAIN, {
            from: "Wrrapd <noreply@wrrapd.com>",
            to: ["angel@wrrapd.com", "admin@wrrapd.com"],
            subject: `New order #${orderNumber}`,
            html: adminEmailBody,
            ...(adminAttachments.length > 0 ? { inline: adminAttachments } : {})
        });

        // Send confirmation email to customer
        await mg.messages.create(process.env.MAILGUN_DOMAIN, {
            from: "Wrrapd Orders <orders@wrrapd.com>",
            to: customerEmail,
            subject: `Your Wrrapd Order Confirmation #${orderNumber}`,
            html: customerEmailBody,
            'h:Reply-To': 'support@wrrapd.com',
            'h:X-Mailgun-Attachments': 'inline',
            'o:tag': 'order-confirmation',
            'o:tracking': true,
            ...(customerAttachments.length > 0 ? { inline: customerAttachments } : {})
        });

        // Respond to client
        res.status(200).json({ 
            success: true, 
            message: 'Payment and order processed successfully',
            orderNumber: orderNumber
        });
    } catch (error) {
        console.error('Error processing payment:', error);
        res.status(500).json({ error: 'Failed to process payment' });
    }
});

// Updated /generate-ideas endpoint for server.js
// Replace the existing endpoint (lines 501-570 approximately) with this code

app.post('/generate-ideas', async (req, res) => {
    if (!req.isApiDomain) {
        res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
        res.header('Access-Control-Allow-Credentials', 'true');
        return res.status(403).send('Access forbidden.');
    }

    const { occasion } = req.body;

    if (!occasion) {
        return res.status(400).json({ error: 'Occasion is required' });
    }

    try {
        console.log(`[generate-ideas] Received occasion: ${occasion}`);

        // Step 1: Generate text descriptions using GPT-4o
        console.log('[generate-ideas] Generating design descriptions...');
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{
                role: "system",
                content: "You are a creative gift wrapping designer. Generate 3 unique wrapping paper design ideas. Keep each description brief and impactful - maximum two short sentences per design."
            }, {
                role: "user",
                content: `Generate 3 concise wrapping paper designs for this occasion: ${occasion}`
            }],
            temperature: 0.7,
            max_tokens: 200,
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "wrapping_paper_designs",
                    schema: {
                        type: "object",
                        properties: {
                            designs: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        title: {
                                            type: "string",
                                            description: "A short, catchy title for the wrapping paper design"
                                        },
                                        description: {
                                            type: "string",
                                            description: "A detailed description of the wrapping paper design"
                                        }
                                    },
                                    required: ["title", "description"],
                                    additionalProperties: false
                                }
                            }
                        },
                        required: ["designs"],
                        additionalProperties: false
                    },
                    strict: true
                }
            }
        });

        // Parse the JSON response
        const designsData = JSON.parse(completion.choices[0].message.content);
        const designs = designsData.designs || [];

        console.log(`[generate-ideas] Generated ${designs.length} design descriptions`);

        // Step 2: Generate images for each design using DALL-E 3
        const designsWithImages = [];
        
        for (let i = 0; i < designs.length; i++) {
            const design = designs[i];
            console.log(`[generate-ideas] Generating image ${i + 1}/3 for: ${design.title}`);
            
            try {
                // Create a refined prompt for DALL-E
                const imagePrompt = `Create a seamless, repeating pattern for gift-wrapping paper based on this description: ${design.description}. Make it perfectly tileable for wrapping paper. No text, no symbols, no gift boxes.`;
                
                console.log(`[generate-ideas] DALL-E prompt: ${imagePrompt.substring(0, 100)}...`);
                
                // Generate image using DALL-E 3
                const imageResponse = await openai.images.generate({
                    model: "dall-e-3",
                    prompt: imagePrompt,
                    n: 1,
                    size: "1024x1024",
                    quality: "standard"
                });

                const imageUrl = imageResponse.data[0].url;
                console.log(`[generate-ideas] ✓ Image ${i + 1} generated: ${imageUrl.substring(0, 50)}...`);

                // Add imageUrl to the design
                designsWithImages.push({
                    title: design.title,
                    description: design.description,
                    imageUrl: imageUrl
                });

                // Small delay between image generations to avoid rate limits
                if (i < designs.length - 1) {
                    console.log('[generate-ideas] Waiting 2 seconds before next image...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }

            } catch (imageError) {
                console.error(`[generate-ideas] Error generating image for design ${i + 1}:`, imageError);
                // Still add the design without image if generation fails
                designsWithImages.push({
                    title: design.title,
                    description: design.description,
                    imageUrl: null
                });
            }
        }

        // Step 3: Return the response with images
        const responseData = {
            designs: designsWithImages
        };

        console.log(`[generate-ideas] Successfully generated ${designsWithImages.length} designs with images`);
        
        // Return double-stringified JSON (as expected by the extension)
        res.status(200).json(JSON.stringify(responseData));

    } catch (error) {
        console.error('[generate-ideas] Error generating design ideas:', error);
        // Make sure CORS headers are sent even on error
        res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
        res.header('Access-Control-Allow-Credentials', 'true');
        res.status(500).json({ error: 'Failed to generate design ideas' });
    }
});


// Add the new upload URL generation endpoint
app.post('/api/get-upload-url', async (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).send('Access forbidden.');
    }

    const { filename, contentType, fileSize } = req.body;

    // Basic validation
    if (!filename || !contentType) {
        return res.status(400).json({ error: 'Missing filename or contentType' });
    }

    // Check that file is an image type
    const validContentTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validContentTypes.includes(contentType)) {
        return res.status(400).json({ error: 'Invalid content type. Only jpg, png, and webp are allowed.' });
    }

    // Check file size (5MB limit)
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes
    if (fileSize && fileSize > MAX_FILE_SIZE) {
        return res.status(400).json({ error: 'File size exceeds the 5MB limit.' });
    }

    // Use the provided filename directly without adding a timestamp
    const filePath = `designs/${filename}`;

    try {
        // Get a signed URL for uploading
        const [signedUrl] = await storage.bucket('wrrapd-media').file(filePath).getSignedUrl({
            version: 'v4',
            action: 'write',
            expires: Date.now() + 10 * 60 * 1000, // 10 minutes
            contentType: contentType,
            method: 'PUT',
        });

        // Return the URL and path to the client
        res.status(200).json({
            signedUrl,
            filePath
        });
    } catch (error) {
        console.error('Error generating signed URL:', error);
        res.status(500).json({ error: 'Failed to generate upload URL' });
    }
});

// Endpoint to save AI-generated design image to GCS
app.post('/api/save-ai-design', async (req, res) => {
    if (!req.isApiDomain) {
        res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
        res.header('Access-Control-Allow-Credentials', 'true');
        return res.status(403).send('Access forbidden.');
    }

    const { imageUrl, designTitle, orderNumber, itemTitle, prompt, folder = 'designs', asin, index } = req.body;

    if (!imageUrl || !designTitle) {
        return res.status(400).json({ error: 'Missing imageUrl or designTitle' });
    }

    try {
        console.log(`[save-ai-design] Saving design "${designTitle}" from ${imageUrl.substring(0, 50)}...`);
        console.log(`[save-ai-design] Folder: ${folder}, OrderNumber: ${orderNumber || 'N/A'}`);

        // Download the image from DALL-E URL
        const imageBuffer = await new Promise((resolve, reject) => {
            const url = new URL(imageUrl);
            const client = url.protocol === 'https:' ? https : http;
            
            client.get(url.href, (response) => {
                if (response.statusCode !== 200) {
                    reject(new Error(`Failed to download image: ${response.statusCode} ${response.statusMessage}`));
                    return;
                }
                
                const chunks = [];
                response.on('data', (chunk) => chunks.push(chunk));
                response.on('end', () => resolve(Buffer.concat(chunks)));
                response.on('error', reject);
            }).on('error', reject);
        });

        const contentType = 'image/png'; // DALL-E images are PNG

        // Generate filename based on whether it's selected (has order number) or unused
        let filename;
        if (orderNumber && asin && index !== undefined) {
            // Selected design: use order number format (e.g., 100-xxxx-xxxxx-asin-0.png)
            const paddedIndex = String(index).padStart(2, '0');
            filename = `${orderNumber}-${asin}-${paddedIndex}.png`;
        } else {
            // Unused design: use timestamp-based filename
            const timestamp = Date.now();
            const sanitizedTitle = designTitle.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
            filename = `ai-design-${sanitizedTitle}-${timestamp}.png`;
        }

        const filePath = `${folder}/${filename}`;

        // Upload to GCS
        const bucket = storage.bucket('wrrapd-media');
        const file = bucket.file(filePath);

        await file.save(imageBuffer, {
            metadata: {
                contentType: contentType,
                metadata: {
                    designTitle: designTitle,
                    orderNumber: orderNumber || 'unused',
                    itemTitle: itemTitle || 'N/A',
                    asin: asin || 'N/A',
                    prompt: prompt || 'N/A',
                    source: 'dall-e-3',
                    uploadedAt: new Date().toISOString(),
                    isSelected: orderNumber ? 'true' : 'false'
                }
            }
        });

        // Make the file publicly accessible
        await file.makePublic();

        const publicUrl = `https://storage.googleapis.com/wrrapd-media/${filePath}`;

        console.log(`[save-ai-design] Successfully saved to ${filePath}`);

        res.status(200).json({
            success: true,
            filePath: filePath,
            publicUrl: publicUrl
        });

    } catch (error) {
        console.error('[save-ai-design] Error saving AI design:', error);
        res.status(500).json({ error: 'Failed to save AI design image' });
    }
});

app.get('/flowers.json', (req, res) => {
    if (!req.isApiDomain) return res.status(403).send('Access forbidden.');
    
    const filePath = path.join(__dirname, 'data/flowers.json');
    res.sendFile(filePath);
});

const PORT = 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
