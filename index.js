const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
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
    // কানেক্ট করা (ঐচ্ছিক কিন্তু ভালো প্র্যাকটিস)
    // await client.connect(); 

    const db = client.db("AssetVerseDB");
    const usersCollection = db.collection("users");
    const assetsCollection = db.collection("assets");
    const requestsCollection = db.collection("requests");
    const affiliationCollection = db.collection("employeeAffiliations");

    // --- API শুরু ---

    // ১. ইউজার সেভ করার জন্য API (Registration)
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

    // --- API শেষ ---

    console.log("Successfully connected to MongoDB (AssetVerseDB)!");
  } catch (error) {
    console.error("MongoDB Connection Error:", error);
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('AssetVerse Server is running');
});

app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});