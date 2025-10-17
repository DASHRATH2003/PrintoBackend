import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI is not set in environment');
  process.exit(1);
}

const run = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const result = await db.collection('products').updateMany({}, { $unset: { variant: 1 } });
    console.log(`🧹 Unset 'variant' from ${result.modifiedCount} documents`);

    await mongoose.disconnect();
    console.log('✅ Disconnected. Cleanup done.');
  } catch (err) {
    console.error('❌ Error during cleanup:', err);
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  }
};

run();