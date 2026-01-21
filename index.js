const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); // Must be in .env

const app = express();
const port = process.env.PORT || 5001;

// Middleware
app.use(cors({
    origin: ['http://localhost:5173', 'https://inspiring-medovik-fc9331.netlify.app'],
    credentials: true
}));
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@aimodelmanagerdb.du0jjco.mongodb.net/AssetVerseDB?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true } });

async function run() {
    try {
        const db = client.db("AssetVerseDB");
        const usersCollection = db.collection("users");
        const assetsCollection = db.collection("assets");
        const requestsCollection = db.collection("requests");
        const noticesCollection = db.collection("notices");

        // JWT Middleware
        const verifyToken = (req, res, next) => {
            if (!req.headers.authorization) return res.status(401).send({ message: 'unauthorized' });
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) return res.status(401).send({ message: 'unauthorized' });
                req.decoded = decoded;
                next();
            });
        };

        app.post('/create-payment-intent', verifyToken, async (req, res) => {
              const { price } = req.body;
              const amount = parseInt(price * 100);

          try {
             const paymentIntent = await stripe.paymentIntents.create({
               amount: amount,
                currency: 'usd',
            // automatic_payment_methods বাদ দিয়ে নিচের লাইনটি ব্যবহার করুন
                payment_method_types: ['card'], 
        });

         res.send({
            clientSecret: paymentIntent.client_secret,
        });
              } catch (error) {
        res.status(500).send({ message: error.message });
           }
         });
        // Upgrade Package Route
        app.patch('/upgrade-package/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const { newLimit, transactionId } = req.body;
            const result = await usersCollection.updateOne(
                { email },
                { $set: { memberLimit: parseInt(newLimit), paymentStatus: 'paid', transactionId } }
            );
            res.send(result);
        });

        // Notice & Other Routes
        app.post('/notices', verifyToken, async (req, res) => {
            const result = await noticesCollection.insertOne(req.body);
            res.send(result);
        });

        app.get('/assets/:email', verifyToken, async (req, res) => {
            const query = { hrEmail: req.params.email };
            const result = await assetsCollection.find(query).toArray();
            res.send({ result, totalCount: result.length });
        });

        // Add other routes as needed...

        console.log("Server Connected!");
    } finally { }
}
run().catch(console.dir);
app.get('/', (req, res) => res.send('Server Running'));
app.listen(port, () => console.log(`Port: ${port}`));