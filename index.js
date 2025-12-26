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
        "https://assetverse-server-side-ms011a011.vercel.app",
        "https://inspiring-medovik-fc9331.netlify.app"
    ],

    credentials: true
}));
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@aimodelmanagerdb.du0jjco.mongodb.net/AssetVerseDB?retryWrites=true&w=majority&appName=AssetVerseDB`;;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        
        const db = client.db("AssetVerseDB"); 
        const usersCollection = db.collection("users");
        const assetsCollection = db.collection("assets");

        console.log("Successfully connected to AssetVerseDB!");

        //ROLE API
        app.get('/users/role/:email', async (req, res) => {
            try {
                const email = req.params.email;
                if (!email) return res.status(400).send({ message: "Email required" });

                
                const user = await usersCollection.findOne({ email: email });
                
                res.send({ role: user?.role || null });
            } catch (error) {
                console.error("Role API Error:", error.message);
                res.status(500).send({ message: "Internal Server Error", error: error.message });
            }
        });

        // JWT API
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ token });
        });

        //USER API
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

    } catch (error) {
        console.error("Database Connection Failed:", error);
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('AssetVerse Server is running with AssetVerseDB');
});

app.listen(port, () => {
    console.log(`Server is running on port: ${port}`);
});