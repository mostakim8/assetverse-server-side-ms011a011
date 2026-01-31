const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); 

const app = express();
const port = process.env.PORT || 5001;

// --- Middleware ---
app.use(cors({
    origin: [
      'http://localhost:5173', 
      'http://localhost:5175',  
      'http://localhost:5177',
      'https://inspiring-medovik-fc9331.netlify.app'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    optionsSuccessStatus: 200,
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// --- MongoDB Connection ---
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
        const noticesCollection = db.collection("notices"); 

        console.log("Connected to AssetVerseDB Successfully!");

        // 1. Authentication & Security (JWT) 
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ token });
        });

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

        const verifyHR = async (req, res, next) => {
            const email = req.decoded.email;
            const user = await usersCollection.findOne({ email });
            if (user?.role !== 'hr') {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        };

        //  User Profile & Role APIs
        app.get('/users/role/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            res.send({ role: user?.role });
        });

        app.get('/users/:email', verifyToken, async (req, res) => {
            const result = await usersCollection.findOne({ email: req.params.email });
            res.send(result);
        });

        app.get('/user-info/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const user = await usersCollection.findOne({ email: email });
            res.send(user); 
        });

        app.post('/users', async (req, res) => {
            const user = req.body;
            const existingUser = await usersCollection.findOne({ email: user.email });
            if (existingUser) return res.send({ message: 'user exists', insertedId: null });
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        app.patch('/users/update/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const updatedData = req.body;
            const result = await usersCollection.updateOne(
                { email: email },
                { $set: { name: updatedData.name, photo: updatedData.image } }
            );
            res.send(result);
        });

        // Join Request & HR Approval Process
        app.get('/all-companies', async (req, res) => {
            const query = { role: 'hr', companyName: { $exists: true } };
            const result = await usersCollection.find(query).toArray();
            res.send(result);
        });

        app.patch('/users/join-request/:email', async (req, res) => {
            const email = req.params.email;
            const {hrEmail} = req.body;
            if (!hrEmail) {
                return res.status(400).send({ message: "HR Email is required!" });
            }
            const filter = { email: email };
            const user = await usersCollection.findOne(filter);
            if(user?.hrEmail || user?.status==='pending') {
                return res.status(400).send({ message: "You are already pending request or affiliation a company!" });
            }
            const updateDoc = {
                $set: { hrEmail: hrEmail, status: 'pending' }
            };
            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);
        });

        app.get('/pending-requests/:hrEmail', async (req, res) => {
            const hrEmail = req.params.hrEmail;
            const query = { hrEmail: hrEmail, status: 'pending' };
            const result = await usersCollection.find(query).toArray();
            res.send(result);
        });

        app.patch('/users/approve-request/:email', async (req, res) => {
            const email = req.params.email;
            const { hrEmail } = req.body;
            const hr = await usersCollection.findOne({ email: hrEmail });
            const currentMemberCount = await usersCollection.countDocuments({ hrEmail: hrEmail, status: 'joined' });
            
            if (currentMemberCount >= hr.packageLimit) {
                return res.status(400).send({ message: "Your package limit is full! Please upgrade your package." });
            }

            const filter = { email: email };
            const updateDoc = {
                $set: { 
                    status: 'joined',
                    companyName: hr.companyName, 
                    companyLogo: hr.companyLogo,
                    joinedDate: new Date().toLocaleDateString()
                 }
            };
            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);
        });

        // Team & Employee Management (HR Side)
        app.get('/unaffiliated-employees', verifyToken, verifyHR, async (req, res) => {
            const result = await usersCollection.find({ role: 'employee', hrEmail: { $exists: false } }).toArray();
            res.send(result);
        });

        app.get('/team-count/:email', verifyToken, verifyHR, async (req, res) => {
            const hrEmail = req.params.email;
            const count = await usersCollection.countDocuments({ hrEmail:hrEmail, status: 'joined' });
            res.send({ count });
        });
        // Bulk Add Employees to Team with Limit Check
        app.patch('/add-to-team', verifyToken, verifyHR, async (req, res) => {
         try {
        const { employeeIds, hrEmail, companyName, companyLogo } = req.body;
        const hr = await usersCollection.findOne({ email: hrEmail });
        const currentTeamCount = await usersCollection.countDocuments({ hrEmail: hrEmail });

        
        if (currentTeamCount + employeeIds.length > hr.employeeLimit) {
            return res.status(400).send({ 
                message: `Limit exceeded! You can only add ${hr.employeeLimit - currentTeamCount} more members.` 
            });
        }

        const result = await usersCollection.updateMany(
            { _id: { $in: employeeIds.map(id => new ObjectId(id)) } },
            { 
                $set: { 
                    hrEmail, 
                    companyName, 
                    companyLogo, 
                    status: 'joined', 
                    joinedDate: new Date().toLocaleDateString() 
                } 
            }
        );
        res.send(result);
        } catch (error) {
        res.status(500).send({ message: "Internal Server Error" });
       }
});

         // Get My Employees with Search Functionality
        app.get('/my-employees/:email', verifyToken, verifyHR, async (req, res) => {
        try {
        const hrEmail = req.params.email;
        const searchText = req.query.search || "";
        
        
        let query = { hrEmail: hrEmail, status: 'joined' };

    
        if (searchText) {
            query.$or = [
                { name: { $regex: searchText, $options: 'i' } }, 
                { email: { $regex: searchText, $options: 'i' } }
            ];
        }

        const employees = await usersCollection.find(query).toArray();

        const employeesWithAssetCount = await Promise.all(employees.map(async (emp) => {
            const assetCount = await requestsCollection.countDocuments({
                userEmail: emp.email.toLowerCase(),
                status: 'Approved' 
            });
            return { ...emp, assetCount }; 
        }));

        res.send(employeesWithAssetCount);
    } catch (error) {
        console.error("My Employee Fetch Error:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
});

        app.patch('/employees/remove/:id', verifyToken, verifyHR, async (req, res) => {
            const result = await usersCollection.updateOne(
                { _id: new ObjectId(req.params.id) },
                { $unset: { hrEmail: "", companyName: "", companyLogo: "", joinedDate: "" } }
            );
            res.send(result);
        });

        app.get('/my-team/:email', verifyToken, async (req, res) => {
            const user = await usersCollection.findOne({ email: req.params.email });
            if (!user || !user.hrEmail) return res.send([]);
            const team = await usersCollection.find({ hrEmail: user.hrEmail }).toArray();
            res.send(team);
        });

        //  Asset Management (Add, Get, Update, Delete) 
         app.post('/assets', verifyToken, verifyHR, async (req, res) => {
            const assetData = req.body;
            const result = await assetsCollection.insertOne({
                ...assetData,
                productQuantity: parseInt(assetData.productQuantity),
                addedDate: new Date().toLocaleDateString()
            });
            res.send(result);
        });

        app.get('/assets/:email', verifyToken, verifyHR, async (req, res) => {
            try {
                const { search, filter, sort, page, limit } = req.query;
                const email = req.params.email;
                let query = { hrEmail: email };
                if (search) query.productName = { $regex: search, $options: 'i' };
                if (filter) query.productType = filter;
                let sortOption = {};
                if (sort === 'quantity') sortOption.productQuantity = -1;

                const pageNumber = parseInt(page) || 1;
                const limitNumber = parseInt(limit) || 10;
                const skip = (pageNumber - 1) * limitNumber;

                const result = await assetsCollection.find(query).sort(sortOption).skip(skip).limit(limitNumber).toArray();
                const totalCount = await assetsCollection.countDocuments(query);
                res.send({ result, totalCount });
            } catch (error) {
                res.status(500).send({ message: "Internal Server Error" });
            }
        });

        app.put('/assets/:id', verifyToken, verifyHR, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedAsset = req.body;
            const result = await assetsCollection.updateOne(filter, { $set: updatedAsset });
            res.send(result);
        });

        app.delete('/assets/:id', verifyToken, verifyHR, async (req, res) => {
            const result = await assetsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
            res.send(result);
        });

         // Available Assets for Employees with Search and Type Filter
        app.get('/available-assets/:hrEmail', verifyToken, async (req, res) => {
        try {
        const { search, type } = req.query;
        const hrEmail = req.params.hrEmail;

        let query = { hrEmail: hrEmail, productQuantity: { $gt: 0 } };

        // check search filter
        if (search && search.trim() !== "") {
            query.productName = { $regex: search, $options: 'i' };
        }

        
        if (type && type !== "" && type !== "All") {
            query.productType = type;
        }

        const result = await assetsCollection.find(query).toArray();
        res.send(result);
        } catch (error) {
        res.status(500).send({ message: "Error fetching assets" });
    }
});
      // see all company assets (for employee side)
        app.get('/all-assets', verifyToken, async (req, res) => {
            const { search, type } = req.query;
            let query = { productQuantity: { $gt: 0 } };

            if (search && search.trim() !== "") {
                query.productName = { $regex: search, $options: 'i' };
            }
            if (type && type !== "" && type !== "All") {
                query.productType = type;
            }

            const result = await assetsCollection.find(query).toArray();
            res.send(result);
        });

        // see all HR companies (for employee side)
        app.get('/hr-companies', verifyToken, async (req, res) => {
            const query = { role: 'hr', companyName: { $exists: true } };
            const result = await usersCollection.find(query, {
                projection: { name: 1, email: 1, companyName: 1, companyLogo: 1 }
            }).toArray();
            res.send(result);
        });

        // Join Company Request by Employee
        app.post('/join-requests', verifyToken, async (req, res) => {
            const joinData = req.body;
            const user = await usersCollection.findOne({ email: joinData.userEmail });
            
            if (user?.hrEmail || user?.status === 'pending') {
                return res.status(400).send({ message: "Already affiliated or pending!" });
            }

            const filter = { email: joinData.userEmail };
            const updateDoc = {
                $set: { 
                    hrEmail: joinData.hrEmail, 
                    status: 'pending',
                    requestDate: joinData.requestDate 
                }
            };
            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);
        });

        //   Asset Requesting Process
        app.get('/my-company-assets/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const { search, filter } = req.query;
            const user = await usersCollection.findOne({ email: email });
            if (!user || !user.hrEmail) return res.send([]);

            let query = { hrEmail: user.hrEmail, productQuantity: { $gt: 0 } };
            if (search) query.productName = { $regex: search, $options: 'i' };
            if (filter) query.productType = filter;

            const result = await assetsCollection.find(query).toArray();
            res.send(result);
        });

        app.post('/asset-requests', verifyToken, async (req, res) => {
            const requestData = req.body;
            const result = await requestsCollection.insertOne(requestData);
            res.send(result);
        });

        app.post('/requests', verifyToken, async (req, res) => {
            const request = req.body;
            // if employee click different company assets request for join company
            if (request.type==="JoinRequest"){
                const filter={email:request.userEmail};
                const updateDoc={
                    $set:{hrEmail:request.hrEmail,
                        status:'pending'
                    }
                }
                await usersCollection.updateOne(filter, updateDoc);
            }
            //save main assets request
            const result = await requestsCollection.insertOne(request);
            res.send(result);
        });

        app.get('/all-requests/:email', verifyToken, verifyHR, async (req, res) => {
            const { search } = req.query;
            let query = { hrEmail: req.params.email };
            if (search) {
                query.$or = [
                    { userEmail: { $regex: search, $options: 'i' } },
                    { userName: { $regex: search, $options: 'i' } }
                ];
            }
            const result = await requestsCollection.find(query).toArray();
            res.send(result);
        });

        app.patch('/requests/:id', verifyToken, verifyHR, async (req, res) => {
    try {
        const { status, assetId } = req.body; // status: 'Approved' or 'Rejected'
        const id = req.params.id;

        const result = await requestsCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { status, approvalDate: new Date().toLocaleDateString() } }
        );

        if (status === 'Approved' && result.modifiedCount > 0) {
            await assetsCollection.updateOne(
                { _id: new ObjectId(assetId) },
                { $inc: { productQuantity: -1 } }
            );
        }

        res.send(result);
        } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Internal Server Error" });
       }
});

        app.get('/my-requests/:email', verifyToken, async (req, res) => {
            const { search, status, type } = req.query;
            let query = { userEmail: req.params.email };
            if (search) query.productName = { $regex: search, $options: 'i' };
            if (status) query.status = status;
            if (type) query.productType = type;
            const result = await requestsCollection.find(query).toArray();
            res.send(result);
        });

        app.delete('/requests/cancel/:id', verifyToken, async (req, res) => {
            const result = await requestsCollection.deleteOne({ _id: new ObjectId(req.params.id), status: 'Pending' });
            res.send(result);
        });

        app.patch('/requests/return/:id', verifyToken, async (req, res) => {
            const { assetId } = req.body;
            const updateRequest = await requestsCollection.updateOne(
                { _id: new ObjectId(req.params.id) },
                { $set: { status: 'Returned' } }
            );
            if (updateRequest.modifiedCount > 0) {
                await assetsCollection.updateOne({ _id: new ObjectId(assetId) }, { $inc: { productQuantity: 1 } });
            }
            res.send(updateRequest);
        });

        //  Notice & Birthdays
        app.post('/notices', verifyToken, verifyHR, async (req, res) => {
            const notice = req.body;
            const result = await noticesCollection.insertOne(notice);
            res.send(result);
        });

        app.get('/notices/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const user = await usersCollection.findOne({ email });
            const hrEmail = user?.role === 'hr' ? email : user?.hrEmail;
            if (!hrEmail) return res.send([]);
            const result = await noticesCollection.find({ hrEmail }).sort({ createdAt: -1 }).toArray();
            res.send(result);
        });

        app.get('/team-birthdays/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const user = await usersCollection.findOne({ email });
            if (!user || !user.hrEmail) return res.send([]);
            const teamMembers = await usersCollection.find({ hrEmail: user.hrEmail, dob: { $exists: true } }).toArray();
            const today = new Date();
            const currentMonth = today.getMonth() + 1;
            const currentDate = today.getDate();
            const upcomingBirthdays = teamMembers.filter(member => {
                if (!member.dob) return false;
                const [year, month, day] = member.dob.split('-').map(Number);
                return month === currentMonth && day >= currentDate;
            }).sort((a, b) => {
                const dayA = parseInt(a.dob.split('-')[2]);
                const dayB = parseInt(b.dob.split('-')[2]);
                return dayA - dayB;
            });
            res.send(upcomingBirthdays);
        });

        //  Payment & Subscription Upgrade 
        app.post('/create-payment-intent', verifyToken, async (req, res) => {
            const { price } = req.body;
            const amount = Math.round(price * 100); 
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card'],
            });
            res.send({ clientSecret: paymentIntent.client_secret });
        });

        app.patch('/upgrade-package/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const { newLimit, transactionId } = req.body;
            const updateDoc = {
                $set: { employeeLimit: parseInt(newLimit), status: 'active', lastTransactionId: transactionId }
            };
            const result = await usersCollection.updateOne({ email: email }, updateDoc);
            res.send({ success: result.modifiedCount > 0 || result.matchedCount > 0 });
        });

        // Dashboard Statistics
        app.get('/hr-stats/:email', verifyToken, verifyHR, async (req, res) => {
            const email = req.params.email;
            const pendingRequests = await requestsCollection.find({ hrEmail: email, status: 'Pending' }).limit(5).toArray();
            const limitedStock = await assetsCollection.find({ hrEmail: email, productQuantity: { $lt: 10 } }).toArray();
            const returnableCount = await assetsCollection.countDocuments({ hrEmail: email, productType: 'Returnable' });
            const nonReturnableCount = await assetsCollection.countDocuments({ hrEmail: email, productType: 'Non-returnable' });
            res.send({ pendingRequests, limitedStock, chartData: [{ name: 'Returnable', value: returnableCount }, { name: 'Non-returnable', value: nonReturnableCount }] });
        });

        app.get('/employee-stats/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const userData = await usersCollection.findOne({ email: email });
            const pendingRequests = await requestsCollection.find({ userEmail: email, status: 'Pending' }).toArray();
            const allRequests = await requestsCollection.find({ userEmail: email }).toArray();
            const currentMonth = new Date().getMonth();
            const monthlyCount = allRequests.filter(r => new Date(r.requestDate).getMonth() === currentMonth).length;
            const monthlyAssets = allRequests.filter(r => r.status === 'Approved');
            res.send({ userData, pendingRequests, monthlyCount, monthlyAssets});
        });

    } finally { }
}
run().catch(console.dir);

app.get('/', (req, res) => res.send('AssetVerse Server is Secure and Running'));
app.listen(port, () => console.log(`Server on port ${port}`));