import mongoose from 'mongoose';
import Product from './models/Product.js';
import dotenv from 'dotenv';

dotenv.config();

const testVariantField = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Create a test product with variant
    const testProduct = new Product({
      name: 'Test Variant Product',
      description: 'Testing variant field',
      price: 100,
      category: 'l-mart',
      subcategory: 'test',
      variant: 'test-variant-value',
      createdBy: new mongoose.Types.ObjectId()
    });

    console.log('📝 Product data before save:', {
      name: testProduct.name,
      variant: testProduct.variant,
      variantType: typeof testProduct.variant,
      variantLength: testProduct.variant.length
    });

    // Save the product
    const savedProduct = await testProduct.save();
    console.log('💾 Product saved successfully');

    // Fetch the product back from database
    const fetchedProduct = await Product.findById(savedProduct._id);
    console.log('📖 Fetched product variant details:', {
      id: fetchedProduct._id,
      name: fetchedProduct.name,
      variant: fetchedProduct.variant,
      variantType: typeof fetchedProduct.variant,
      variantLength: fetchedProduct.variant ? fetchedProduct.variant.length : 'null/undefined',
      hasVariantField: fetchedProduct.hasOwnProperty('variant'),
      variantInToObject: fetchedProduct.toObject().variant
    });

    // Check if variant field exists in raw MongoDB document
    const rawDoc = await mongoose.connection.db.collection('products').findOne({_id: savedProduct._id});
    console.log('🔍 Raw MongoDB document variant:', {
      hasVariant: rawDoc.hasOwnProperty('variant'),
      variantValue: rawDoc.variant,
      variantType: typeof rawDoc.variant
    });

    // Clean up - delete the test product
    await Product.findByIdAndDelete(savedProduct._id);
    console.log('🗑️ Test product deleted');

    await mongoose.disconnect();
    console.log('✅ Test completed successfully');

  } catch (error) {
    console.error('❌ Error in test:', error);
    await mongoose.disconnect();
  }
};

testVariantField();