const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 5001;

// Middleware
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:5174', 'https://inspiring-medovik-fc9331.netlify.app'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
}));
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@aimodelmanagerdb.du0jjco.mongodb.net/AssetVerseDB?retryWrites=true&w=majority&appName=AIModelManagerDB`;
const client = new MongoClient(uri, { serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true } });

async function run() {
    try {
        const db = client.db("AssetVerseDB");
        const usersCollection = db.collection("users");
        const assetsCollection = db.collection("assets");
        const requestsCollection = db.collection("requests");

        // --- JWT ---
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ token });
        });

        const verifyToken = (req, res, next) => {
            if (!req.headers.authorization) return res.status(401).send({ message: 'unauthorized' });
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) return res.status(401).send({ message: 'unauthorized' });
                req.decoded = decoded;
                next();
            });
        };

        const verifyHR = async (req, res, next) => {
            const email = req.decoded.email;
            const user = await usersCollection.findOne({ email });
            if (user?.role !== 'hr') return res.status(403).send({ message: 'forbidden' });
            next();
        };

        // --- User & Affiliation APIs ---

        app.get('/users/:email', verifyToken, async (req, res) => {
            const result = await usersCollection.findOne({ email: req.params.email });
            res.send(result);
        });

        app.post('/users', async (req, res) => {
            const user = req.body;
            const existingUser = await usersCollection.findOne({ email: user.email });
            if (existingUser) return res.send({ message: 'user exists', insertedId: null });
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        // সিনারিও: HR reaches package limit (Add to Team Logic)
        app.patch('/add-to-team', verifyToken, verifyHR, async (req, res) => {
            const { employeeIds, hrEmail } = req.body;
            const hrUser = await usersCollection.findOne({ email: hrEmail });
            const currentTeamCount = await usersCollection.countDocuments({ hrEmail });

            if (currentTeamCount + employeeIds.length > hrUser.packageLimit) {
                return res.status(400).send({ message: 'Package limit exceeded. Please upgrade.' });
            }

            const result = await usersCollection.updateMany(
                { _id: { $in: employeeIds.map(id => new ObjectId(id)) } },
                { $set: { hrEmail, companyName: hrUser.companyName, companyLogo: hrUser.companyLogo, joinedDate: new Date().toLocaleDateString() } }
            );
            res.send(result);
        });

        // সিনারিও: HR removes employee (Affiliation Removal)
        app.patch('/employees/remove/:id', verifyToken, verifyHR, async (req, res) => {
            const result = await usersCollection.updateOne(
                { _id: new ObjectId(req.params.id) },
                { $unset: { hrEmail: "", companyName: "", companyLogo: "", joinedDate: "" } }
            );
            res.send(result);
        });

        // --- Asset Management ---

        // সিনারিও: Employee requests from multiple companies (Unaffiliated search)
        app.get('/all-available-assets',  async (req, res) => {
            const { search, type } = req.query;
            let query = { productQuantity: { $gt: 0 } };
            if (search) query.productName = { $regex: search, $options: 'i' };
            if (type) query.productType = type;
            const result = await assetsCollection.find(query).toArray();
            res.send(result);
        });

        app.get('/available-assets/:hrEmail', verifyToken, async (req, res) => {
            const { search, type } = req.query;
            let query = { hrEmail: req.params.hrEmail, productQuantity: { $gt: 0 } };
            if (search) query.productName = { $regex: search, $options: 'i' };
            if (type) query.productType = type;
            const result = await assetsCollection.find(query).toArray();
            res.send(result);
        });

        app.post('/assets', verifyToken, verifyHR, async (req, res) => {
            const assetData = req.body;
            const result = await assetsCollection.insertOne({
                ...assetData,
                productQuantity: parseInt(assetData.productQuantity),
                addedDate: new Date().toLocaleDateString()
            });
            res.send(result);
        });

        // --- Request & Auto-Affiliation ---

        app.post('/requests', verifyToken, async (req, res) => {
            const request = req.body;
            const result = await requestsCollection.insertOne(request);
            res.send(result);
        });

        // সিনারিও: HR approves → auto-affiliation
        app.patch('/requests/:id', verifyToken, verifyHR, async (req, res) => {
            const { status, assetId, userEmail } = req.body;
            const id = req.params.id;

            const result = await requestsCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { status, approvalDate: new Date().toLocaleDateString() } }
            );

            if (status === 'Approved') {
                // ১. স্টক কমানো
                await assetsCollection.updateOne({ _id: new ObjectId(assetId) }, { $inc: { productQuantity: -1 } });
                
                // ২. অটো-অ্যাফিলিয়েশন (Employee gets company info)
                const hrInfo = await usersCollection.findOne({ email: req.decoded.email });
                await usersCollection.updateOne(
                    { email: userEmail },
                    { $set: { hrEmail: hrInfo.email, companyName: hrInfo.companyName, companyLogo: hrInfo.companyLogo, joinedDate: new Date().toLocaleDateString() } }
                );
            }
            res.send(result);
        });

        // সিনারিও: Employee returns returnable assets → stock increases
        app.patch('/requests/return/:id', verifyToken, async (req, res) => {
            const { assetId } = req.body;
            const result = await requestsCollection.updateOne(
                { _id: new ObjectId(req.params.id) },
                { $set: { status: 'Returned' } }
            );
            if (result.modifiedCount > 0) {
                await assetsCollection.updateOne({ _id: new ObjectId(assetId) }, { $inc: { productQuantity: 1 } });
            }
            res.send(result);
        });

        // --- Payment Placeholder for Upgrade ---
        app.patch('/upgrade-package/:email', verifyToken, verifyHR, async (req, res) => {
            const { newLimit } = req.body;
            const result = await usersCollection.updateOne(
                { email: req.params.email },
                { $set: { packageLimit: newLimit } }
            );
            res.send(result);
        });

        console.log("AssetVerse APIs are fully operational!");
    } finally { }
}
run().catch(console.dir);
app.get('/', (req, res) => res.send('AssetVerse Server Running'));
app.listen(port, () => console.log(`Server port: ${port}`));