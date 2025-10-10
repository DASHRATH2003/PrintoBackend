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

    const matchEmartVariants = {
      $or: [
        { category: { $regex: /^emart$/i } },
        { category: { $regex: /^e-mart$/i } },
        { category: { $regex: /^lmart$/i } }
      ]
    };

    // Products collection
    const prodResult = await db.collection('products').updateMany(
      matchEmartVariants,
      { $set: { category: 'l-mart' } }
    );
    console.log(`🛍️ Products updated: ${prodResult.modifiedCount}`);

    // Subcategories collection
    const subResult = await db.collection('subcategories').updateMany(
      matchEmartVariants,
      { $set: { category: 'l-mart' } }
    );
    console.log(`🧩 Subcategories updated: ${subResult.modifiedCount}`);

    await mongoose.disconnect();
    console.log('✅ Migration completed and disconnected.');
  } catch (err) {
    console.error('❌ Error during migration:', err);
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  }
};

run();