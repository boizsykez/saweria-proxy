const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// In-memory storage for donations
// In a production environment, you might want to use a database (SQLite, MongoDB, etc.)
// But for a simple free-tier host, this array works (it clears on restart)
let donations = [];

/**
 * Endpoint for Saweria to send notifications to.
 * Set your Saweria Webhook URL to: https://your-app-name.com/webhook
 */
app.post('/webhook', (req, res) => {
    const data = req.body;
    console.log('Received webhook:', data);

    // Validate incoming data
    // Saweria typically sends: { id, amount_raw, donator_name, message, ... }
    if (!data || !data.amount_raw) {
        return res.status(400).json({ error: 'Invalid payload' });
    }

    // Structure the donation object
    const donation = {
        id: data.id || Date.now().toString(), // Fallback ID if not provided
        donator_name: data.donator_name || 'Anonymous',
        amount_raw: Number(data.amount_raw),
        message: data.message || '',
        timestamp: Date.now()
    };

    // Add to our list
    donations.push(donation);

    // Keep list size manageable (e.g., last 100 donations)
    if (donations.length > 100) {
        donations.shift();
    }

    res.status(200).send('OK');
});

/**
 * Endpoint for Roblox to poll.
 * Matches the user's script request structure:
 * GET /get-donation/atasatap?after_id=...
 */
app.get('/get-donation/atasatap', (req, res) => {
    const afterId = req.query.after_id;

    // Default response structure
    let response = {
        success: true,
        donations: [],
        latest_id: donations.length > 0 ? donations[donations.length - 1].id : null
    };

    // Prevent caching on Vercel/Roblox
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    if (donations.length === 0) {
        return res.json(response);
    }

    if (afterId) {
        if (index !== -1 && index < donations.length - 1) {
            // Return all donations AFTER the given ID
            response.donations = donations.slice(index + 1);
        } else if (index === -1) {
            // ID not found (Server restarted & Memory wiped). 
            // We MUST return all current data, otherwise the client gets "stuck" on the old ID.
            // Safe to do now because Roblox script V2 has Timestamp Filtering (ignores old data).
            response.donations = donations;
        }
    } else {
        // Only return all if no ID was provided at all (first connection)
        response.donations = donations;
    }

    // Update latest_id in response based on what we are sending
    if (response.donations.length > 0) {
        response.latest_id = response.donations[response.donations.length - 1].id;
    } else {
        // If we serve no new donations, ensure we keep the latest known ID so client doesn't reset
        if (donations.length > 0) {
            response.latest_id = donations[donations.length - 1].id;
        }
    }

    res.json(response);
});

// Basic health check
app.get('/', (req, res) => {
    res.send('Saweria Middleware is Running!');
});

// For Vercel, we export the app
module.exports = app;

// Only listen if running locally (not in Vercel)
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}
