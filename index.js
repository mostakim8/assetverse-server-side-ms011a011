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

let usersCollection;
let assetsCollection;
let requestsCollection; // নতুন কালেকশন

async function run() {
    try {
        const db = client.db("AssetVerseDB");
        usersCollection = db.collection("users");
        assetsCollection = db.collection("assets");
        requestsCollection = db.collection("assetRequests");

        console.log("Successfully connected to MongoDB!");
    } catch (error) {
        console.error("MongoDB Connection Error:", error);
    }
}
run().catch(console.dir);

// --- API ROUTES ---

app.get('/', (req, res) => res.send('AssetVerse Server is running...'));

// ১. JWT API
app.post('/jwt', async (req, res) => {
    const user = req.body;
    const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
    res.send({ token });
});

// ২. User Role API
app.get('/users/role/:email', async (req, res) => {
    try {
        const email = req.params.email;
        const user = await usersCollection.findOne({ email });
        res.send({ role: user?.role || null });
    } catch (error) { res.status(500).send(error.message) }
});

// ৩. Add Asset (HR adds assets)
app.post('/assets', async (req, res) => {
    const asset = req.body;
    const result = await assetsCollection.insertOne(asset);
    res.send(result);
});

// ৪. Request Workflow: Employee requests an asset
app.post('/asset-requests', async (req, res) => {
    const request = req.body; // { assetId, assetName, userEmail, userName, hrEmail, status: 'pending' }
    const result = await requestsCollection.insertOne(request);
    res.send(result);
});

// ৫. Approval & Affiliation: HR approves request
app.patch('/asset-requests/approve/:id', async (req, res) => {
    const id = req.params.id;
    const { userEmail, hrEmail, companyName, assetId } = req.body;

    // ক) আপডেট রিকোয়েস্ট স্ট্যাটাস
    await requestsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: 'approved', approvalDate: new Date() } }
    );

    // খ) অটো-অ্যাফিলিয়েশন (এমপ্লয়ির প্রোফাইলে কোম্পানি সেট করা)
    await usersCollection.updateOne(
        { email: userEmail },
        { $set: { hrEmail, companyName } }
    );

    // গ) ইনভেন্টরি থেকে স্টক কমানো
    await assetsCollection.updateOne(
        { _id: new ObjectId(assetId) },
        { $inc: { productQuantity: -1 } }
    );

    res.send({ success: true });
});

// ৬. Direct Assignment: HR manually assigns
app.post('/direct-assign', async (req, res) => {
    const assignment = req.body; 
    const assignmentData = { ...assignment, status: 'approved', assignedDate: new Date() };
    
    const result = await requestsCollection.insertOne(assignmentData);

    // স্টক কমানো
    await assetsCollection.updateOne(
        { _id: new ObjectId(assignment.assetId) },
        { $inc: { productQuantity: -1 } }
    );
    res.send(result);
});

// ৭. Return Process: Employee returns asset
app.patch('/asset-return/:id', async (req, res) => {
    const id = req.params.id;
    const { assetId } = req.body;

    // ক) স্ট্যাটাস আপডেট
    await requestsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: 'returned', returnDate: new Date() } }
    );

    // খ) স্টক বাড়ানো
    await assetsCollection.updateOne(
        { _id: new ObjectId(assetId) },
        { $inc: { productQuantity: 1 } }
    );

    res.send({ success: true });
});

app.listen(port, () => console.log(`Port: ${port}`));