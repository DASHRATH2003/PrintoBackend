import Poster from '../models/Poster.js';
import cloudinary from '../utils/cloudinary.js';

// Create a poster with image upload already handled by multer and cloudinary stream
export const createPoster = async (req, res) => {
  try {
    const { title } = req.body;

    // Expect cloudinary upload result on req.fileUploadResult when using upload_stream
    const uploadResult = req.fileUploadResult;
    if (!uploadResult || !uploadResult.secure_url) {
      return res.status(400).json({ message: 'Image upload failed' });
    }

    const poster = await Poster.create({
      title: title || '',
      imageUrl: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      createdBy: req.user?.userId || null,
    });

    return res.status(201).json(poster);
  } catch (error) {
    console.error('Error creating poster', error);
    return res.status(500).json({ message: 'Server error creating poster' });
  }
};

// Get all posters
export const getAllPosters = async (req, res) => {
  try {
    const posters = await Poster.find({}).sort({ createdAt: -1 });
    return res.json(posters);
  } catch (error) {
    console.error('Error fetching posters', error);
    return res.status(500).json({ message: 'Server error fetching posters' });
  }
};

// Delete poster (also remove from Cloudinary if available)
export const deletePoster = async (req, res) => {
  try {
    const { id } = req.params;
    const poster = await Poster.findById(id);
    if (!poster) return res.status(404).json({ message: 'Poster not found' });

    if (poster.publicId) {
      try {
        await cloudinary.uploader.destroy(poster.publicId);
      } catch (e) {
        console.warn('Cloudinary deletion failed', e);
      }
    }

    await Poster.findByIdAndDelete(id);
    return res.json({ message: 'Poster deleted' });
  } catch (error) {
    console.error('Error deleting poster', error);
    return res.status(500).json({ message: 'Server error deleting poster' });
  }
};