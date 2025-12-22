const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 5001;

// Middleware
app.use(cors({
    origin: [
        'http://localhost:5173', 
        'http://localhost:5174'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    optionsSuccessStatus: 200
}));
app.use(express.json());

// MongoDB Connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@aimodelmanagerdb.du0jjco.mongodb.net/AssetVerseDB?retryWrites=true&w=majority&appName=AIModelManagerDB`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // ডাটাবেজ কানেকশন
    const db = client.db("AssetVerseDB");
    const usersCollection = db.collection("users");
    const assetsCollection = db.collection("assets");
    const requestsCollection = db.collection("requests");

    console.log("Connected successfully to MongoDB (AssetVerseDB)");

    // -------------------------------------------------------------------------
    // ১. ইউজার এবং রোল ম্যানেজমেন্ট
    // -------------------------------------------------------------------------

    // ইউজারের রোল চেক করা
    app.get('/users/role/:email', async (req, res) => {
        const email = req.params.email;
        const user = await usersCollection.findOne({ email: email });
        if (!user) return res.send({ role: null });
        res.send({ role: user?.role });
    });

    // নতুন ইউজার রেজিস্টার করা
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

    // -------------------------------------------------------------------------
    // ২. অ্যাসেট ম্যানেজমেন্ট (HR Manager)
    // -------------------------------------------------------------------------

    // নতুন অ্যাসেট যোগ করা
    app.post('/assets', async (req, res) => {
        const asset = req.body;
        const result = await assetsCollection.insertOne(asset);
        res.send(result);
    });

    // সব অ্যাসেট দেখা (Search, Filter, Sort সহ)
    app.get('/assets/:email', async (req, res) => {
        const email = req.params.email;
        const search = req.query.search || "";
        const filter = req.query.filter || "";
        const sort = req.query.sort || "";

        let query = { 
            hrEmail: email,
            productName: { $regex: search, $options: 'i' } 
        };

        if (filter) query.productType = filter;

        let options = {};
        if (sort === 'asc') options.sort = { productQuantity: 1 };
        else if (sort === 'desc') options.sort = { productQuantity: -1 };

        const result = await assetsCollection.find(query, options).toArray();
        res.send(result);
    });

    // অ্যাসেট ডিলিট করা
    app.delete('/assets/:id', async (req, res) => {
        const id = req.params.id;
        const result = await assetsCollection.deleteOne({ _id: new ObjectId(id) });
        res.send(result);
    });

    // অ্যাসেট আপডেট করা
    app.put('/assets/:id', async (req, res) => {
        const id = req.params.id;
        const updatedAsset = req.body;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
            $set: {
                productName: updatedAsset.productName,
                productType: updatedAsset.productType,
                productQuantity: updatedAsset.productQuantity,
            },
        };
        const result = await assetsCollection.updateOne(filter, updateDoc);
        res.send(result);
    });

    // -------------------------------------------------------------------------
    // ৩. রিকোয়েস্ট ম্যানেজমেন্ট (All Requests for HR)
    // -------------------------------------------------------------------------

    // সব এমপ্লয়ি রিকোয়েস্ট দেখা (HR এর জন্য)
    app.get('/all-requests/:email', async (req, res) => {
        const email = req.params.email;
        const search = req.query.search || "";
        const query = { 
            hrEmail: email,
            $or: [
                { userName: { $regex: search, $options: 'i' } },
                { userEmail: { $regex: search, $options: 'i' } }
            ]
        };
        const result = await requestsCollection.find(query).toArray();
        res.send(result);
    });

    // রিকোয়েস্ট অ্যাপ্রুভ বা রিজেক্ট করা
    app.patch('/requests/:id', async (req, res) => {
        const id = req.params.id;
        const { status, approvalDate } = req.body;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
            $set: { status, approvalDate }
        };
        const result = await requestsCollection.updateOne(filter, updateDoc);
        res.send(result);
    });

    // -------------------------------------------------------------------------
    // ৪. এমপ্লয়ি সাইড API
    // -------------------------------------------------------------------------

    // এমপ্লয়ি দ্বারা অ্যাসেট রিকোয়েস্ট পাঠানো
    app.post('/requests', async (req, res) => {
        const request = req.body;
        const result = await requestsCollection.insertOne(request);
        res.send(result);
    });

    // এমপ্লয়ি তার নিজের রিকোয়েস্টগুলো দেখা
    app.get('/my-requests/:email', async (req, res) => {
        const email = req.params.email;
        const result = await requestsCollection.find({ userEmail: email }).toArray();
        res.send(result);
    });

    console.log("Server routes are fully operational!");
  } finally { }
}
run().catch(console.dir);

app.get('/', (req, res) => res.send('AssetVerse Server is Active'));

app.listen(port, () => console.log(`Server running on port: ${port}`));