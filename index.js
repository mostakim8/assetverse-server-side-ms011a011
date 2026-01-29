const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); // Stripe initialized

const app = express();
const port = process.env.PORT || 5001;

// Middleware
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
        const noticesCollection = db.collection("notices"); // Added Notice Collection

        console.log("Connected to AssetVerseDB Successfully!");

        // --- JWT & Security Middlewares ---
        
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

        // --- User and Team Management ---
        
        // app.get('/users/role/:email', async (req, res) => {
        //     const user = await usersCollection.findOne({ email: req.params.email });
        //     res.send({ role: user?.role || null });
        // });

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

        app.get('/unaffiliated-employees', verifyToken, verifyHR, async (req, res) => {
            const result = await usersCollection.find({ role: 'employee', hrEmail: { $exists: false } }).toArray();
            res.send(result);
        });

        app.get('/team-count/:email', verifyToken, verifyHR, async (req, res) => {
            const hrEmail = req.params.email;
            const count = await usersCollection.countDocuments({ hrEmail:hrEmail,
                status: 'joined'
             });




            res.send({ count });
        });

        app.patch('/add-to-team', verifyToken, verifyHR, async (req, res) => {

            const { employeeIds, hrEmail, companyName, companyLogo } = req.body;
            // ১. HR-এর বর্তমান লিমিট চেক করুন
    const hr = await usersCollection.findOne({ email: hrEmail });
    const currentTeamCount = await usersCollection.countDocuments({ hrEmail: hrEmail });

    if (currentTeamCount >= hr.employeeLimit) {
        return res.status(400).send({ message: "Package limit exceeded. Please upgrade!" });
    }
            const result = await usersCollection.updateMany(
                { _id: { $in: employeeIds.map(id => new ObjectId(id)) } },
                { $set: { hrEmail, companyName, companyLogo, joinedDate: new Date().toLocaleDateString() } }
            );
            res.send(result);
        });

        app.get('/my-employees/:email', verifyToken, verifyHR, async (req, res) => {
    try {
        const hrEmail = req.params.email;
        const searchText = req.query.search || ""; // ফ্রন্টএন্ড থেকে আসা সার্চ প্যারামিটার

        // কোয়েরি অবজেক্ট তৈরি
        let query = { 
            hrEmail: hrEmail ,
            status: 'joined',
        };

        // যদি সার্চ বক্সে কিছু লেখা থাকে, তবেই ফিল্টার যোগ হবে
        if (searchText) {
            query.$or = [
                { name: { $regex: searchText, $options: 'i' } }, // i মানে Case-Insensitive (বড়/ছোট হাতের অক্ষর ম্যাটার করবে না)
                { email: { $regex: searchText, $options: 'i' } }
            ];
        }

        const result = await usersCollection.find(query).toArray();
        res.send(result);
    } catch (error) {
        console.error("Search Error:", error);
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

        // --- Asset Management APIs ---
        // employee page এ অ্যাসেট দেখানোর জন্য এপিআই
app.get('/my-company-assets/:email', verifyToken, async (req, res) => {
    const email = req.params.email;
    const { search, filter } = req.query;

    // ১. প্রথমে ইউজার থেকে তার HR এর ইমেইল বের করা
    const user = await usersCollection.findOne({ email: email });
    if (!user || !user.hrEmail) {
        return res.send([]);
    }

    // ২. কুয়েরি তৈরি (শুধুমাত্র সেই কোম্পানির এবং স্টকে থাকা অ্যাসেট)
    let query = { 
        hrEmail: user.hrEmail, 
        productQuantity: { $gt: 0 } 
    };

    if (search) {
        query.productName = { $regex: search, $options: 'i' };
    }
    if (filter) {
        query.productType = filter;
    }

    const result = await assetsCollection.find(query).toArray();
    res.send(result);
});

// ৩. অ্যাসেট রিকোয়েস্ট সেভ করার এপিআই (সঠিক কালেকশন নাম নিশ্চিত করুন)
app.post('/asset-requests', verifyToken, async (req, res) => {
    const requestData = req.body;
    const result = await requestsCollection.insertOne(requestData);
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

        app.get('/available-assets/:hrEmail', verifyToken, async (req, res) => {
            const { search, type } = req.query;
            let query = { hrEmail: req.params.hrEmail, productQuantity: { $gt: 0 } };
            if (search) query.productName = { $regex: search, $options: 'i' };
            if (type) query.productType = type;
            const result = await assetsCollection.find(query).toArray();
            res.send(result);
        });

        // --- Notice APIs ---

        app.post('/notices', verifyToken, verifyHR, async (req, res) => {
            const notice = req.body;
            const result = await noticesCollection.insertOne(notice);
            res.send(result);
        });

        app.get('/notices/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            // Get user to find their HR
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

    const teamMembers = await usersCollection.find({ 
        hrEmail: user.hrEmail,
        dob: { $exists: true } 
    }).toArray();

    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentDate = today.getDate();

    const upcomingBirthdays = teamMembers.filter(member => {
        if (!member.dob) return false;
        const [year, month, day] = member.dob.split('-').map(Number); // dob ব্যবহার করুন
        return month === currentMonth && day >= currentDate;
    }).sort((a, b) => {
        const dayA = parseInt(a.dob.split('-')[2]);
        const dayB = parseInt(b.dob.split('-')[2]);
        return dayA - dayB;
    });

    res.send(upcomingBirthdays);
});
        // --- Payment & Stripe APIs ---

        // ১. পেমেন্ট ইনটেন্ট তৈরি
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

        // backend (index.js)


// ২. মেম্বারশিপ প্যাকেজ আপডেট
app.patch('/upgrade-package/:email', verifyToken, async (req, res) => {
    const email = req.params.email;
    const { newLimit, transactionId } = req.body;
    
    const query = { email: email };
    const updateDoc = {
        $set: { 
            employeeLimit: parseInt(newLimit),
            status: 'active',
            lastTransactionId: transactionId 
        }
    };

    const result = await usersCollection.updateOne(query, updateDoc);
    res.send({ 
        success: result.modifiedCount > 0 || result.matchedCount > 0, 
        matchedCount: result.matchedCount 
    });
});
        // --- Request Management APIs ---

        app.post('/requests', verifyToken, async (req, res) => {
            const request = req.body;
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
            const { status, assetId } = req.body;
            const id = req.params.id;
            const result = await requestsCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { status, approvalDate: new Date().toLocaleDateString() } }
            );
            if (status === 'Approved') {
                await assetsCollection.updateOne({ _id: new ObjectId(assetId) }, { $inc: { productQuantity: -1 } });
            }
            res.send(result);
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

        // --- Dashboard Stats APIs ---
        
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
            res.send({ userData,pendingRequests, monthlyCount, monthlyAssets});
        });

        app.get('/user-info/:email', verifyToken, async (req, res) => {
    const email = req.params.email;
    const user = await usersCollection.findOne({ email: email });
    // যদি ইউজারের hrEmail বা companyName থাকে, তবেই সে অ্যাফিলিয়েটেড
    res.send(user); 
});


// join from employee side
// Join Request API
app.patch('/users/join-request/:email', async (req, res) => {
    const email = req.params.email;
    const {hrEmail} = req.body;

    if (!hrEmail) {
        return res.status(400).send({ message: "HR Email is required!" });
    }
    const filter = { email: email };
    
    // চেক করুন ইউজার আগে থেকেই অন্য কোনো কোম্পানিতে আছে কি না
    const user = await usersCollection.findOne(filter);


    if(user?.hrEmail || user?.status==='pending') {
        return res.status(400).send({ message: "You are already pending request or affiliation a company!" });
    }

    const updateDoc = {
        $set: {
            hrEmail: hrEmail,
            status: 'pending' // শুরুতে পেন্ডিং থাকবে
        }
    };
    const result = await usersCollection.updateOne(filter, updateDoc);
    res.send(result);
});

// সব HR বা কোম্পানিদের লিস্ট পেতে
app.get('/all-companies', async (req, res) => {
    // যারা HR হিসেবে রেজিস্টার্ড এবং যাদের কোম্পানির নাম আছে তাদের খুঁজে বের করা
    const query = { role: 'hr', companyName: { $exists: true } };
    const result = await usersCollection.find(query).toArray();
    res.send(result);
});
// নির্দিষ্ট HR এর জন্য পেন্ডিং রিকোয়েস্টগুলো দেখা
app.get('/pending-requests/:hrEmail', async (req, res) => {
    const hrEmail = req.params.hrEmail;
    const query = { 
        hrEmail: hrEmail, 
        status: 'pending' 
    };
    const result = await usersCollection.find(query).toArray();
    res.send(result);
});

app.patch('/users/approve-request/:email', async (req, res) => {
    const email = req.params.email;
    const { hrEmail } = req.body;

    // ১. HR এর বর্তমান প্যাকেজ লিমিট এবং মেম্বার সংখ্যা বের করুন
    const hr = await usersCollection.findOne({ email: hrEmail });

    
    const currentMemberCount = await usersCollection.countDocuments({ 
        hrEmail: hrEmail, 
        status: 'joined' 
    });

    // ২. চেক করুন লিমিট শেষ কি না
    if (currentMemberCount >= hr.packageLimit) {
        return res.status(400).send({ 
            message: "Your package limit is full! Please upgrade your package." 
        });
    }

    // ৩. যদি লিমিট থাকে, তবে স্ট্যাটাস 'joined' করে দিন
    const filter = { email: email };
    const updateDoc = {
        $set: { 
            status: 'joined',
            companyName: hr.companyName, // HR এর কোম্পানি নাম এখানে সেট হচ্ছে
            companyLogo: hr.companyLogo,
            joinedDate: new Date().toLocaleDateString()
         }
    };
    const result = await usersCollection.updateOne(filter, updateDoc);
    res.send(result);
});





    } finally { }
}
run().catch(console.dir);

app.get('/', (req, res) => res.send('AssetVerse Server is Secure and Running'));
app.listen(port, () => console.log(`Server on port ${port}`));