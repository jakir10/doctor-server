const express = require("express");
const multer = require("multer");
const upload = multer({ dest: "uploads/" });

const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
var nodemailer = require("nodemailer");
const mg = require("nodemailer-mailgun-transport");
const stripe = require("stripe")(process.env.STRIPE_SECRETE_KEY);

const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.fvtteka.mongodb.net/?retryWrites=true&w=majority`;

//mongodb client
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

// verfiy json web token
function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "UnAuthorized access" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

// Mailgun Test
function sendBookingEmail(booking) {
  const { patient, patientName, treatment, date, slot } = booking;

  const auth = {
    auth: {
      api_key: process.env.EMAIL_SEND_KEY,
      domain: process.env.EMAIL_SEND_DOMAIN,
    },
  };

  const transporter = nodemailer.createTransport(mg(auth));

  console.log("sending email", patient);
  transporter.sendMail(
    {
      from: "jakir.cse.bubt@gmail.com", // verified sender email
      to: patient || "jakir.cse.bubt@gmail.com", // recipient email
      subject: `Your Appointment for ${treatment} is on ${date} at ${slot} is Confirmed!!`,
      text: `Your Appointment for ${treatment} is on ${date} at ${slot} is Confirmed!!`,
      html: `
        <div>
        <p>Hello Dear ${patientName},</p>
        <h3>Your Appointment for ${treatment} is confirmed</h3>
        <p>You will meet our Doctor on ${date} at ${slot} </p>
        <p>Our Address</p>
        <p>Dhaka,Mirpur 1212</p>
        </div>
        `, // html body
    },
    function (error, info) {
      if (error) {
        console.log("Email send error", error);
      } else {
        console.log("Email sent: " + info);
      }
    }
  );
}

// payment confirmation email send to patient
function sendPaymentConfirmationEmail(booking) {
  const { patient, patientName, treatment, date, slot } = booking;

  var email = {
    from: process.env.EMAIL_SENDER,
    to: patient,
    subject: `We have received your payment for ${treatment} is on ${date} at ${slot} is Confirmed`,
    text: `Your payment for this Appointment ${treatment} is on ${date} at ${slot} is Confirmed`,
    html: `
        <div>
          <p> Hello ${patientName}, </p>
          <h3>Thank you for your payment . </h3>
          <h3>We have received your payment</h3>
          <p>Looking forward to seeing you on ${date} at ${slot}.</p>
          <h3>Our Address</h3>
          <p>Mirpur, 1212</p>
          <p>Bangladesh</p>          
        </div>
      `,
  };

  emailClient.sendMail(email, function (err, info) {
    if (err) {
      console.log(err);
    } else {
      console.log("Message sent: ", info);
    }
  });
}

async function run() {
  try {
    await client.connect();
    // const treatmentCollection = client.db('doctors_app').collection('treatments');
    const serviceCollection = client.db("doctors_app").collection("services");
    const bookingCollection = client.db("doctors_app").collection("bookings");
    const userCollection = client.db("doctors_app").collection("users");
    const doctorCollection = client.db("doctors_app").collection("doctors");
    const patientCollection = client.db("doctors_app").collection("patients");
    const paymentCollection = client.db("doctors_app").collection("payments");
    const reviewsCollection = client.db("doctors_app").collection("reviews");
    const profileCollection = client.db("doctors_app").collection("profiles");
    const prescriptionCollection = client
      .db("doctors_app")
      .collection("prescriptions");

    // app.get('/treatment', async (req, res) => {
    //     const query = {};
    //     const cursor = treatmentCollection.find(query);
    //     const treatments = await cursor.toArray();
    //     res.send(treatments);
    // });

    // for verify Admin
    const verifyAdmin = async (req, res, next) => {
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({
        email: requester,
      });
      if (requesterAccount.role === "admin") {
        next();
      } else {
        res.status(403).send({ message: "forbidden" });
      }
    };

    app.get("/service", async (req, res) => {
      const query = {};
      const cursor = serviceCollection.find(query).project({ name: 1 });
      const services = await cursor.toArray();
      res.send(services);
    });

    // get All user
    app.get("/user", async (req, res) => {
      const query = {};
      const users = await userCollection.find(query).toArray();
      res.send(users);
    });

    app.post("/profile", async (req, res) => {
      const profile = req.body;
      const result = await profileCollection.insertOne(profile);
      res.send(result);
    });
    app.get("/profile", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await profileCollection.findOne(query);
      res.send(result);
    });

    // finding a user is admin
    app.get("/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      const isAdmin = user.role === "admin";
      res.send({ admin: isAdmin });
    });
    // finding a user is doctor
    app.get("/doctor/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      const isDoctor = user.role === "doctor";
      res.send({ doctor: isDoctor });
    });

    // make a user admin
    app.put("/user/admin/:email", verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const updateDoc = {
        $set: { role: "admin" },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // register as doctor role
    app.post("/register-doctor", async (req, res) => {
      const doctor = req.body;
      const result = await doctorCollection.insertOne(doctor);
      res.send(result);
    });
    app.post("/patient", async (req, res) => {
      const patient = req.body;
      const result = await patientCollection.insertOne(patient);
      res.send(result);
    });
    app.get("/patient", async (req, res) => {
      try {
        const patients = await patientCollection.find().toArray();
        res.send(patients);
      } catch (error) {
        console.error("Error fetching patient data", error);
        res.status(500).send("Error fetching patient data");
      }
    });
    app.post("/prescription", async (req, res) => {
      const prescription = req.body;
      const result = await prescriptionCollection.insertOne(prescription);
      res.send(result);
    });
    app.get("/prescription", async (req, res) => {
      const prescriptions = await prescriptionCollection.find({}).toArray();
      res.send(prescriptions);
    });
    app.get("/prescription/:id", async (req, res) => {
      const id = req.query._id;
      const prescription = await prescriptionCollection.findOne({ id });
      res.send(prescription);
    });
    // create a user using email
    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign(
        { email: email },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "1h" }
      );
      res.send({ result, token });
    });
    // register a user doctor
    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: { role: user.role },
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign(
        { email: email },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "1h" }
      );
      res.send({ result, token });
    });

    // user Delete
    app.delete("/user/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    // get all doctors
    app.get("/doctor", async (req, res) => {
      const doctors = await doctorCollection.find().toArray();
      res.send(doctors);
    });
    app.get("/user/doctor", async (req, res) => {
      const filter = { role: "doctor" }; // filter to retrieve only doctors
      const doctors = await userCollection.find(filter).toArray();
      res.send(doctors);
    });

    // add doctors
    // app.post("/doctor", async (req, res) => {
    //   const doctor = req.body;
    //   const result = await doctorCollection.insertOne(doctor);
    //   res.send(result);
    // });

    // Delete a doctor
    app.delete("/doctor/:email", async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const result = await userCollection.deleteOne(filter);
      res.send(result);
    });

    app.get("/available", async (req, res) => {
      const date = req.query.date;

      // step 1:  get all services
      const services = await serviceCollection.find().toArray();

      // step 2: get the booking of that day. output: [{}, {}, {}, {}, {}, {}]
      const query = { date: date };
      const bookings = await bookingCollection.find(query).toArray();

      // step 3: for each service
      services.forEach((service) => {
        // step 4: find bookings for that service. output: [{}, {}, {}, {}]
        const serviceBookings = bookings.filter(
          (book) => book.treatment === service.name
        );
        // step 5: select slots for the service Bookings: ['', '', '', '']
        const bookedSlots = serviceBookings.map((book) => book.slot);
        // step 6: select those slots that are not in bookedSlots
        const available = service.slots.filter(
          (slot) => !bookedSlots.includes(slot)
        );
        //step 7: set available to slots to make it easier
        service.slots = available;
      });

      res.send(services);
    });

    /**
     * API Naming Convention
     * app.get('/booking') get all booking in this collection
     * app.get('/booking/:id') // get a single booking
     * app.post('/booking/') // add a new booking
     * app.patch('/booking/:id') // update a booking
     * app.delete('/booking/:id') // delete a booking
     */

    // app.get('/booking', async (req, res) => {
    //     const patient = req.query.patient;
    //     const query = { patient: patient };
    //     const bookings = await bookingCollection.find(query).toArray();
    //     res.send(bookings);
    // });
    app.get("/booking", verifyJWT, async (req, res) => {
      const patient = req.query.patient;
      const decodedEmail = req.decoded.email;
      if (patient === decodedEmail) {
        const query = { patient: patient };
        const bookings = await bookingCollection.find(query).toArray();
        return res.send(bookings);
      } else {
        return res.status(403).send({ message: "forbidden access" });
      }
    });

    app.get("/booking/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const booking = await bookingCollection.findOne(query);
      res.send(booking);
    });

    app.get("/bookings", async (req, res) => {
      const doctor = req.query.doctor;
      const query = { doctor: doctor };
      const cursor = bookingCollection.find(query);
      const bookings = await cursor.toArray();
      res.send(bookings);
    });

    // all patient bookings admin view
    app.get("/bookings/all", async (req, res) => {
      const query = {};
      const cursor = bookingCollection.find(query);
      const bookings = await cursor.toArray();
      res.send(bookings);
    });

    app.patch("/bookings/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const status = req.body.status;
      const query = { _id: ObjectId(id) };
      const updatedDoc = {
        $set: {
          status: status,
        },
      };
      const result = await bookingCollection.updateOne(query, updatedDoc);
      res.send(result);
    });
    // all patients bookings end

    app.post("/booking", async (req, res) => {
      const booking = req.body;
      const query = {
        treatment: booking.treatment,
        date: booking.date,
        patient: booking.patient,
      };
      const exist = await bookingCollection.findOne(query);
      if (exist) {
        return res.send({ success: false, booking: exist });
      }
      const result = await bookingCollection.insertOne(booking);
      console.log("sending email");
      sendBookingEmail(booking);
      return res.send({ success: true, result });
    });

    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const service = req.body;
      const price = service.price;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    });

    app.patch("/booking/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updatedDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId,
        },
      };

      const result = await paymentCollection.insertOne(payment);
      const updatedBooking = await bookingCollection.updateOne(
        filter,
        updatedDoc
      );
      res.send(updatedBooking);
    });

    // for reviews section data
    app.get("/review", async (req, res) => {
      const query = {};
      const cursor = reviewsCollection.find(query);
      const reviews = await cursor.toArray();
      res.send(reviews);
    });

    // for user review post
    app.post("/review", async (req, res) => {
      const review = req.body;
      const result = await reviewsCollection.insertOne(review);
      res.send(result);
    });
  } finally {
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello Doctors & Patients");
});

app.listen(port, () => {
  console.log(`Doctors Application on port ${port}`);
});
