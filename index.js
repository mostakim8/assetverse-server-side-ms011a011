const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 5001;

// Middleware
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:5174'],
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
    const db = client.db("AssetVerseDB");
    const usersCollection = db.collection("users");
    const assetsCollection = db.collection("assets");
    const requestsCollection = db.collection("requests");

    console.log("Connected to AssetVerseDB Successfully!");

    // -------------------------------------------------------------------------
    // ১. ইউজার ও প্রোফাইল ম্যানেজমেন্ট
    // -------------------------------------------------------------------------
    
    app.get('/users/role/:email', async (req, res) => {
        const user = await usersCollection.findOne({ email: req.params.email });
        res.send({ role: user?.role || null });
    });

    app.get('/users/:email', async (req, res) => {
        const result = await usersCollection.findOne({ email: req.params.email });
        res.send(result);
    });

    app.post('/users', async (req, res) => {
        const user = req.body;
        const query = { email: user.email };
        const existingUser = await usersCollection.findOne(query);
        if (existingUser) return res.send({ message: 'user exists', insertedId: null });
        const result = await usersCollection.insertOne(user);
        res.send(result);
    });

    app.patch('/users/update/:email', async (req, res) => {
        const { name, image } = req.body;
        const result = await usersCollection.updateOne(
            { email: req.params.email },
            { $set: { name, image } }
        );
        res.send(result);
    });

    app.patch('/users/upgrade-package/:email', async (req, res) => {
        const { newLimit } = req.body;
        const result = await usersCollection.updateOne(
            { email: req.params.email },
            { $inc: { memberLimit: newLimit } }
        );
        res.send(result);
    });

    // -------------------------------------------------------------------------
    // ২. অ্যাসেট ম্যানেজমেন্ট (CRUD)
    // -------------------------------------------------------------------------
    
    app.post('/assets', async (req, res) => {
        const assetData = req.body;
        const newAsset = {
            ...assetData,
            productQuantity: parseInt(assetData.productQuantity),
            addedDate: new Date().toLocaleDateString()
        };
        const result = await assetsCollection.insertOne(newAsset);
        res.send(result);
    });

    app.get('/assets/:email', async (req, res) => {
        const { search, filter, sort } = req.query;
        let query = { hrEmail: req.params.email };
        if (search) query.productName = { $regex: search, $options: 'i' };
        if (filter) query.productType = filter;

        let sortOption = {};
        if (sort === 'quantity') sortOption.productQuantity = -1;

        const result = await assetsCollection.find(query).sort(sortOption).toArray();
        res.send(result);
    });

    app.put('/assets/:id', async (req, res) => {
        const filter = { _id: new ObjectId(req.params.id) };
        const updateDoc = {
            $set: {
                productName: req.body.productName,
                productType: req.body.productType,
                productQuantity: parseInt(req.body.productQuantity),
                productImage: req.body.productImage 
            }
        };
        const result = await assetsCollection.updateOne(filter, updateDoc);
        res.send(result);
    });

    app.delete('/assets/:id', async (req, res) => {
        const result = await assetsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        res.send(result);
    });

    // -------------------------------------------------------------------------
    // ৩. রিকোয়েস্ট ম্যানেজমেন্ট (All Requests Page logic)
    // -------------------------------------------------------------------------

    // HR এর সকল রিকোয়েস্ট দেখা (সার্চ লজিকসহ)
    app.get('/all-requests/:email', async (req, res) => {
        const email = req.params.email;
        const { search } = req.query;
        let query = { hrEmail: email };

        if (search) {
            query.$or = [
                { userName: { $regex: search, $options: 'i' } },
                { userEmail: { $regex: search, $options: 'i' } }
            ];
        }
        const result = await requestsCollection.find(query).toArray();
        res.send(result);
    });

    // রিকোয়েস্ট Approve বা Reject করা
    app.patch('/requests/:id', async (req, res) => {
        const id = req.params.id;
        const { status, assetId, userEmail, hrEmail, companyName, companyLogo } = req.body;
        
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
            $set: { 
                status: status, 
                approvalDate: status === 'Approved' ? new Date().toLocaleDateString() : null 
            }
        };

        const requestResult = await requestsCollection.updateOne(filter, updateDoc);

        if (status === 'Approved') {
            // ১. স্টক থেকে ১ পিস কমানো
            await assetsCollection.updateOne(
                { _id: new ObjectId(assetId) }, 
                { $inc: { productQuantity: -1 } }
            );
            
            // ২. এমপ্লয়িকে কোম্পানির সাথে যুক্ত করা (Affiliation)
            await usersCollection.updateOne(
                { email: userEmail },
                { $set: { hrEmail, companyName, companyLogo, joinedDate: new Date().toLocaleDateString() } }
            );
        }
        res.send(requestResult);
    });

    // -------------------------------------------------------------------------
    // ৪. ড্যাশবোর্ড স্ট্যাটস (HR Home Page)
    // -------------------------------------------------------------------------

    app.get('/hr-stats/:email', async (req, res) => {
        const email = req.params.email;

        // ৫টি পেন্ডিং রিকোয়েস্ট
        const pendingRequests = await requestsCollection.find({ hrEmail: email, status: 'Pending' })
            .limit(5).toArray();

        // ১০টির কম স্টক আছে এমন অ্যাসেট
        const limitedStock = await assetsCollection.find({ hrEmail: email, productQuantity: { $lt: 10 } })
            .toArray();

        // পাই চার্টের ডাটা
        const returnableCount = await assetsCollection.countDocuments({ hrEmail: email, productType: 'Returnable' });
        const nonReturnableCount = await assetsCollection.countDocuments({ hrEmail: email, productType: 'Non-returnable' });

        res.send({
            pendingRequests,
            limitedStock,
            chartData: [
                { name: 'Returnable', value: returnableCount },
                { name: 'Non-returnable', value: nonReturnableCount }
            ]
        });
    });


    // team management


    app.get('/unaffiliated-employees', async (req, res) => {
        const result = await usersCollection.find({ role: 'employee', hrEmail: null }).toArray();
        res.send(result);
    });

    app.get('/team-count/:email', async (req, res) => {
        const count = await usersCollection.countDocuments({ hrEmail: req.params.email });
        res.send({ count });
    });

    app.patch('/add-to-team-bulk', async (req, res) => {
        const { hrEmail, companyName, companyLogo, employeeIds } = req.body;
        const ids = employeeIds.map(id => new ObjectId(id));
        const result = await usersCollection.updateMany(
            { _id: { $in: ids } },
            { $set: { hrEmail, companyName, companyLogo, joinedDate: new Date().toLocaleDateString() } }
        );
        res.send(result);
    });

    app.get('/my-employees/:email', async (req, res) => {
        const employees = await usersCollection.aggregate([
            { $match: { hrEmail: req.params.email, role: 'employee' } },
            {
                $lookup: {
                    from: 'requests',
                    localField: 'email',
                    foreignField: 'userEmail',
                    as: 'allRequests'
                }
            },
            {
                $project: {
                    name: 1, email: 1, image: 1, joinedDate: 1,
                    assetsCount: { 
                        $size: { 
                            $filter: { 
                                input: "$allRequests", 
                                as: "r", 
                                cond: { $eq: ["$$r.status", "Approved"] } 
                            } 
                        } 
                    }
                }
            }
        ]).toArray();
        res.send(employees);
    });

    app.patch('/employees/remove/:id', async (req, res) => {
        const result = await usersCollection.updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { hrEmail: null, companyName: null, companyLogo: null } }
        );
        res.send(result);
    });

  } finally {}
}
run().catch(console.dir);

app.get('/', (req, res) => res.send('AssetVerse Server running'));
app.listen(port, () => console.log(`Server on port ${port}`));