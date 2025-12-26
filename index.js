const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 5001;

app.use(cors({
   origin: [
        "http://localhost:5173",   //localhost for development
        "https://assetverse-server-side-ms011a011.vercel.app", //vercel deployment
    
        "https://assetverse-5cb01.web.app", //

        "https://inspiring-medovik-fc9331.netlify.app", // netlify deployment
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

async function run() {
    try {
        // Vercel এ ডাটাবেস কানেকশন ঠিক রাখতে এটি জরুরি
        await client.connect(); 
        
        const db = client.db("AssetVerseDB");
        const usersCollection = db.collection("users");
        const assetsCollection = db.collection("assets");

        console.log("Successfully connected to AssetVerseDB!");

        // --- AUTH / JWT API ---
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ token });
        });

        // --- USERS API ---
        
        // ইউজারের রোল চেক করা (আপনার কনসোলের ৪o৪ এরর দূর করতে এটি সঠিক পাথ)
        app.get('/users/role/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            res.send({ role: user?.role || null });
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

        // --- ASSETS API ---

        // আপনার কনসোলে /all-available-assets এর ৪o৪ এরর দূর করার জন্য এই এপিআই
        app.get('/all-available-assets', async (req, res) => {
            const search = req.query.search || "";
            const query = {
                productName: { $regex: search, $options: 'i' }
            };
            const result = await assetsCollection.find(query).toArray();
            res.send(result);
        });

    } catch (error) {
        console.error("Database Connection Error:", error);
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('AssetVerse Server is running with Full Support');
});

app.listen(port, () => {
    console.log(`Server is running on port: ${port}`);
});