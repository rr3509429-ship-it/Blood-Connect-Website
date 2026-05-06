// backend/seed.js
// Seed some test donors for development

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Connected');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

const seedDonors = async () => {
  const donors = [
    {
      name: 'Ali Khan',
      email: 'ali@example.com',
      password: 'password123',
      roles: ['donor'],
      blood_group: 'O+',
      city: 'Lahore',
      phone: '03001234567',
      age: 25,
      weight: 70,
      availability: true,
      isVerified: true,
      location: { lat: 31.5497, lng: 74.3436 }
    },
    {
      name: 'Sara Ahmed',
      email: 'sara@example.com',
      password: 'password123',
      roles: ['donor'],
      blood_group: 'A+',
      city: 'Karachi',
      phone: '03007654321',
      age: 28,
      weight: 65,
      availability: true,
      isVerified: true,
      location: { lat: 24.8607, lng: 67.0011 }
    },
    {
      name: 'Ahmed Raza',
      email: 'ahmed@example.com',
      password: 'password123',
      roles: ['donor'],
      blood_group: 'B+',
      city: 'Islamabad',
      phone: '03009876543',
      age: 30,
      weight: 75,
      availability: true,
      isVerified: true,
      location: { lat: 33.6844, lng: 73.0479 }
    }
  ];

  for (const donor of donors) {
    const existing = await User.findOne({ email: donor.email });
    if (!existing) {
      const user = new User(donor);
      await user.save();
      console.log(`Seeded donor: ${donor.name}`);
    } else {
      console.log(`Donor ${donor.name} already exists`);
    }
  }
};

const run = async () => {
  await connectDB();
  await seedDonors();
  console.log('Seeding complete');
  process.exit();
};

run();