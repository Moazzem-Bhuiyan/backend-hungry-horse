const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.SECRET_API_KEY);

// middleware
app.use(cors());
app.use(express.json());

//

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.7kns6.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const menuCollection = client.db("bistrodb").collection("menu");
    const reviewCollection = client.db("bistrodb").collection("reviews");
    const cartsCollection = client.db("bistrodb").collection("carts");
    const usersCollection = client.db("bistrodb").collection("users");
    const paymentCollection = client.db("bistrodb").collection("payments");

    //  JWT RELATED API --------

    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // VERIFY TOKEN MIDDLEWAREEE---

    const verifyToken = async (req, res, next) => {
      console.log(req.headers.authorization);

      if (!req.headers.authorization) {
        return res.status(401).send({ message: "forbidden access" });
      }

      const token = req.headers.authorization.split(" ")[1];

      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "forbidden access " });
        }

        req.decoded = decoded;
        next();
      });
    };

    // VARIFY aDMIN ----after veerify token

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbiidden access " });
      }

      next();
    };

    // users relted apiii----------------------------------start
    app.get("/users", verifyToken, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "unauthoized Access" });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    app.delete("/users/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });

    app.patch("/users/admin/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };

      const updateDoc = {
        $set: {
          role: "admin",
        },
      };

      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      // email cheking---
      const query = { email: user.email };
      const exixtingUser = await usersCollection.findOne(query);
      if (exixtingUser) {
        return res.send({ message: "user Alrady exit ", insertedId: null });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });
    // USERS RELATED API END ----------------

    // cartss api ------------------------------------------start

    app.post("/carts", async (req, res) => {
      const cartinfo = req.body;
      const result = await cartsCollection.insertOne(cartinfo);
      res.send(result);
    });

    app.get("/carts", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };

      const result = await cartsCollection.find(query).toArray();
      res.send(result);
    });

    app.delete("/carts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartsCollection.deleteOne(query);
      res.send(result);
    });

    // menu apis------------------------------------------start

    app.get("/menu", async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    });

    app.get("/menu/:id", async (req, res) => {
      const id = req.params.id;

      const query = { _id: new ObjectId(id) };

      const result = await menuCollection.findOne(query);

      res.send(result);
    });

    app.post("/menu", verifyToken, verifyAdmin, async (req, res) => {
      const item = req.body;
      const result = await menuCollection.insertOne(item);
      res.send(result);
    });

    app.patch("/menu/:id", async (req, res) => {
      const item = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          name: item.recepiename,
          category: item.category,
          price: item.price,
          recipe: item.recepiedetails,
          image: item.image,
        },
      };
      const result = await menuCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.delete("/menu/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      // const query = {_id :new ObjectId (id)}
      const query = { _id: new ObjectId(id) };
      const result = await menuCollection.deleteOne(query);
      res.send(result);
    });

    // menu apis------------------------------------------end

    //  review apis -------------------------------------start

    app.get("/reviews", async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    });

    //  review apis -------------------------------------end

    // payment related api----------------

    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;

      // Validate price
      if (!price || isNaN(price)) {
        return res.status(400).send({ message: "Invalid price provided" });
      }

      const amount = parseInt(price * 100); // Convert price to cents
      console.log(amount, "Amount in cents");

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (error) {
        console.error("Error creating payment intent: ", error);
        res
          .status(500)
          .send({ message: "Payment Intent creation failed", error });
      }
    });

    app.get("/payment/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (req.params.email !== req.decoded?.email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }

      try {
        const query = { email: email };
        const result = await paymentCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching payment history: ", error);
        res
          .status(500)
          .send({ message: "Failed to fetch payment history", error });
      }
    });

    app.post("/payment", async (req, res) => {
      const payment = req.body;

      try {
        // Insert payment details into paymentCollection
        const paymentResult = await paymentCollection.insertOne(payment);
        console.log("Payment info:", payment);

        // Validate cartIds
        if (!Array.isArray(payment.cartIds)) {
          return res.status(400).send({ message: "Invalid cart IDs" });
        }

        // Delete items from the cart after successful payment
        const query = {
          _id: {
            $in: payment.cartIds.map((id) => new ObjectId(id)), // Ensure cartIds are valid ObjectIds
          },
        };

        const deleteResult = await cartsCollection.deleteMany(query);

        res.send({ paymentResult, deleteResult });
      } catch (error) {
        console.error(
          "Error processing payment or deleting cart items:",
          error
        );
        res
          .status(500)
          .send({ message: "Payment or Cart deletion failed", error });
      }
    });

    // sasts Related Apis

    app.get("/admin-sats", verifyToken, verifyAdmin, async (req, res) => {
      const user = await usersCollection.estimatedDocumentCount();
      const menuItems = await menuCollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount();

      const result = await paymentCollection
        .aggregate([
          {
            $group: {
              _id: null,
              totalRevenue: {
                $sum: "$price",
              },
            },
          },
        ])
        .toArray();

      const revenue = result.length > 0 ? result[0].totalRevenue : 0;

      res.send({ user, menuItems, orders, revenue });
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

//
app.get("/", (req, res) => {
  res.send("Boss Is Sitting");
});

app.listen(port, () => {
  console.log(`Server started on port${port}`);
});
