const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 5001;

// ১. Middleware setup
app.use(cors({
    origin: [
        "http://localhost:5173",
        "https://assetverse-5cb01.web.app",
        "https://assetverse-5cb01.firebaseapp.com",
        "https://inspiring-medovik-fc9331.netlify.app"
    ],
    credentials: true
}));
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@aimodelmanagerdb.du0jjco.mongodb.net/?retryWrites=true&w=majority&appName=AssetVerseDB`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

// কালেকশনগুলো গ্লোবাল ভেরিয়েবল হিসেবে রাখা ভালো
let usersCollection;
let assetsCollection;

async function run() {
    try {
        // Vercel এর জন্য কানেকশন
        // await client.connect(); // সার্ভারলেস এনভায়রনমেন্টে এটি অপশনাল হতে পারে
        
        const db = client.db("AssetVerseDB");
        usersCollection = db.collection("users");
        assetsCollection = db.collection("assets");

        console.log("Successfully connected to MongoDB!");
    } catch (error) {
        console.error("MongoDB Connection Error:", error);
    }
}
run().catch(console.dir);

// --- API ROUTES (run ফাংশনের বাইরে) ---

app.get('/', (req, res) => {
    res.send('AssetVerse Server is running...');
});

// ১. JWT API
app.post('/jwt', async (req, res) => {
    const user = req.body;
    const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
    res.send({ token });
});

// ২. ইউজারের রোল চেক করার এপিআই
app.get('/users/role/:email', async (req, res) => {
    try {
        const email = req.params.email;
        if (!usersCollection) {
            return res.status(500).send({ message: "Database not initialized" });
        }
        const query = { email: email };
        const user = await usersCollection.findOne(query);
        res.send({ role: user?.role || null });
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

// ৩. ইউজার ডাটা সেভ করা
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

// ৪. সব অ্যাসেট লোড করার এপিআই
app.get('/all-available-assets', async (req, res) => {
    try {
        const search = req.query.search || "";
        const query = {
            productName: { $regex: search, $options: 'i' }
        };
        const result = await assetsCollection.find(query).toArray();
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server is running on port: ${port}`);
});