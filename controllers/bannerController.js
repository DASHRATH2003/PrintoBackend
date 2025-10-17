import Banner from '../models/Banner.js';
import cloudinary from '../utils/cloudinary.js';
import mongoose from 'mongoose';
import Product from '../models/Product.js';

// Create banner with image upload handled via upload_stream
export const createBanner = async (req, res) => {
  try {
    const { name, imageTitle, productId } = req.body;
    const uploadResult = req.fileUploadResult;
    if (!uploadResult || !uploadResult.secure_url) {
      return res.status(400).json({ message: 'Image upload failed' });
    }
    let linkedProductId = null;
    let linkedProduct = null;
    if (productId) {
      // Validate and ensure product exists before linking
      try {
        const isValid = mongoose.Types.ObjectId.isValid(productId);
        if (!isValid) {
          return res.status(400).json({ message: 'Invalid productId' });
        }
        linkedProduct = await Product.findById(productId).select('_id category');
        if (!linkedProduct) {
          return res.status(404).json({ message: 'Product not found for provided productId' });
        }
        linkedProductId = linkedProduct._id;
      } catch (e) {
        console.error('Product validation error', e);
        return res.status(500).json({ message: 'Server error validating product' });
      }
    }

    const banner = await Banner.create({
      name: name || '',
      imageTitle: imageTitle || '',
      imageUrl: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      category: (linkedProduct ? linkedProduct.category : ''),
      productId: linkedProductId,
      createdBy: req.user?.userId || null,
    });

    return res.status(201).json(banner);
  } catch (error) {
    console.error('Error creating banner', error);
    return res.status(500).json({ message: 'Server error creating banner' });
  }
};

export const getAllBanners = async (req, res) => {
  try {
    const { productId } = req.query;
    const filter = {};
    if (productId) filter.productId = productId;
    // Populate product category to enable frontend navigation from banners
    const banners = await Banner.find(filter)
      .sort({ createdAt: -1 })
      .populate('productId', 'category name');
    return res.json(banners);
  } catch (error) {
    console.error('Error fetching banners', error);
    return res.status(500).json({ message: 'Server error fetching banners' });
  }
};

export const deleteBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const banner = await Banner.findById(id);
    if (!banner) return res.status(404).json({ message: 'Banner not found' });

    if (banner.publicId) {
      try {
        await cloudinary.uploader.destroy(banner.publicId);
      } catch (e) {
        console.warn('Cloudinary deletion failed', e);
      }
    }

    await Banner.findByIdAndDelete(id);
    return res.json({ message: 'Banner deleted' });
  } catch (error) {
    console.error('Error deleting banner', error);
    return res.status(500).json({ message: 'Server error deleting banner' });
  }
};