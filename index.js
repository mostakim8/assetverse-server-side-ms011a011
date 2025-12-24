const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5001;

// Middleware
app.use(cors({
    origin: [
        'http://localhost:5173',
        'https://your-vercel-frontend-link.vercel.app' // আপনার ফ্রন্টএন্ড লিংক দিন
    ],
    credentials: true
}));
app.use(express.json());

// Verify Token Middleware
const verifyToken = (req, res, next) => {
    if (!req.headers.authorization) {
        return res.status(401).send({ message: 'unauthorized access' });
    }
    const token = req.headers.authorization.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: 'unauthorized access' });
        }
        req.decoded = decoded;
        next();
    });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        const db = client.db("assetVerseDB");
        const usersCollection = db.collection("users");
        const assetsCollection = db.collection("assets");
        const requestsCollection = db.collection("requests");

        // --- AUTH RELATED API (JWT) ---
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ token });
        });

        // --- ROLE API (এটি আপনার রোলের সমস্যা ঠিক করবে) ---
        app.get('/users/role/:email', async (req, res) => {
            const email = req.params.email;
            const user = await usersCollection.findOne({ email });
            res.send({ role: user?.role || null });
        });

        // --- ASSETS RELATED API ---
        // এমপ্লয়িদের জন্য সব অ্যাভেলেবল অ্যাসেট দেখা
        app.get('/all-available-assets', async (req, res) => {
            const { search, type } = req.query;
            let query = { productQuantity: { $gt: 0 } }; // শুধুমাত্র স্টকে থাকা পণ্য
            
            if (search) {
                query.productName = { $regex: search, $options: 'i' };
            }
            if (type && type !== 'All') {
                query.productType = type;
            }

            const result = await assetsCollection.find(query).toArray();
            res.send(result);
        });

        // --- USER API ---
        app.get('/users/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const result = await usersCollection.findOne({ email });
            res.send(result);
        });

        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email };
            const existingUser = await usersCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user already exists', insertedId: null });
            }
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        console.log("Connected to MongoDB!");
    } finally {
        // 
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('AssetVerse Server is running');
});

app.listen(port, () => {
    console.log(`Server is sitting on port ${port}`);
});