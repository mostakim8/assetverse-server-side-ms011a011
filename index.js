const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 5001;

// Middleware
app.use(cors({
    origin: [
        "http://localhost:5173",
        "https://your-vercel-frontend-link.vercel.app" // এখানে আপনার ফ্রন্টএন্ড লিঙ্ক দিন
    ],
    credentials: true
}));
app.use(express.json());

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

        // 1. JWT Related API
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ token });
        });

        // 2. Role Check API (এটি আপনার রোলের সমস্যা সমাধান করবে)
        app.get('/users/role/:email', async (req, res) => {
            const email = req.params.email;
            const user = await usersCollection.findOne({ email });
            res.send({ role: user?.role || null });
        });

        // 3. Available Assets API (Employee এর জন্য)
        app.get('/all-available-assets', async (req, res) => {
            const result = await assetsCollection.find({ productQuantity: { $gt: 0 } }).toArray();
            res.send(result);
        });

        // 4. Save User Info
        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email };
            const existingUser = await usersCollection.findOne(query);
            if (existingUser) return res.send({ message: 'user already exists' });
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        console.log("Connected to MongoDB!");
    } finally { }
}
run().catch(console.dir);

app.get('/', (req, res) => res.send('Server is running'));
app.listen(port, () => console.log(`Server on port ${port}`));