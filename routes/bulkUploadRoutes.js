import express from 'express';
import multer from 'multer';
import csv from 'csv-parser';
import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Product from '../models/Product.js';
import Subcategory from '../models/Subcategory.js';
import User from '../models/User.js';
import Seller from '../models/Seller.js';
import { authenticateToken } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/bulk');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `bulk-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.csv', '.xlsx', '.xls'];
    const fileExt = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(fileExt)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and Excel files are allowed'), false);
    }
  }
});

// Helper function to parse CSV file
const parseCSV = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
};

// Helper function to parse Excel file
const parseExcel = (filePath) => {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    return data;
  } catch (error) {
    throw new Error(`Failed to parse Excel file: ${error.message}`);
  }
};

// Helper function to validate product data
const validateProductData = (product, index) => {
  const errors = [];
  const requiredFields = ['name', 'price', 'category', 'subcategory'];
  
  requiredFields.forEach(field => {
    if (!product[field] || product[field].toString().trim() === '') {
      errors.push(`Row ${index + 1}: ${field} is required`);
    }
  });

  // Validate price
  if (product.price && isNaN(parseFloat(product.price))) {
    errors.push(`Row ${index + 1}: Price must be a valid number`);
  }

  // Validate offerPrice if provided
  if (product.offerPrice && product.offerPrice !== '' && isNaN(parseFloat(product.offerPrice))) {
    errors.push(`Row ${index + 1}: Offer price must be a valid number`);
  }

  // Validate originalPrice if provided
  if (product.originalPrice && product.originalPrice !== '' && isNaN(parseFloat(product.originalPrice))) {
    errors.push(`Row ${index + 1}: Original price must be a valid number`);
  }

  // Validate discount if provided
  if (product.discount && (isNaN(parseFloat(product.discount)) || parseFloat(product.discount) < 0 || parseFloat(product.discount) > 100)) {
    errors.push(`Row ${index + 1}: Discount must be a number between 0 and 100`);
  }

  // Validate stockQuantity if provided
  if (product.stockQuantity && isNaN(parseInt(product.stockQuantity))) {
    errors.push(`Row ${index + 1}: Stock quantity must be a valid number`);
  }

  // Validate category
  const validCategories = ['l-mart', 'localmarket', 'printing', 'oldee', 'news'];
  if (product.category && !validCategories.includes(product.category.toLowerCase())) {
    errors.push(`Row ${index + 1}: Category must be one of: ${validCategories.join(', ')}`);
  }

  return errors;
};

// Helper function to process product data
const processProductData = async (rawData, userId, sellerId = null, sellerName = '') => {
  const processedProducts = [];
  const errors = [];
  
  // Helper function to parse comma or semicolon separated lists
  const parseList = (raw) => {
    if (!raw) return [];
    try {
      if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (trimmed.startsWith('[')) return JSON.parse(trimmed).map(String);
        // Handle both comma and semicolon separated values
        return trimmed.split(/[,;]/).map(s => s.trim()).filter(Boolean);
      }
      if (Array.isArray(raw)) return raw.map(String);
      return [String(raw)].filter(Boolean);
    } catch (e) {
      return String(raw).split(/[,;]/).map(s => s.trim()).filter(Boolean);
    }
  };

  // Helper: clean stray quotes/backticks around values
  const cleanStr = (val) => {
    if (!val) return '';
    let s = String(val).trim();
    // Remove leading/trailing quotes/backticks
    s = s.replace(/^['"`]+|['"`]+$/g, '');
    return s.trim();
  };

  // Helper: parse URL list from comma/semicolon-separated string and clean each URL
  const parseUrlList = (raw) => {
    if (!raw) return [];
    const s = cleanStr(raw);
    return s
      .split(/[,;]/)
      .map(u => cleanStr(u))
      .filter(Boolean);
  };

  // Helper function to build color variants from colors and images
  const buildColorVarientsObjects = (colors, images) => {
    const variants = [];
    const normColor = (c) => String(c).trim().toLowerCase();

    if (Array.isArray(colors) && colors.length > 0) {
      colors.forEach((c, i) => {
        const color = normColor(c);
        const url = images?.[i] ? [images[i]] : [];
        variants.push({ color, images: url });
      });
    }
    return variants;
  };
  
  for (let i = 0; i < rawData.length; i++) {
    const product = rawData[i];
    
    // Validate product data
    const validationErrors = validateProductData(product, i);
    if (validationErrors.length > 0) {
      errors.push(...validationErrors);
      continue;
    }

    try {
      // Parse color and size variants
      const colorsList = parseList(product.colorVarients);
      const sizesList = parseList(product.sizeVarients);

      // Clean and parse main image and additional images
      const mainImage = product.image ? cleanStr(product.image) : null;
      const imagesList = parseUrlList(product.images);

      // Compose allImages with main image first to keep indices consistent with UI
      const allImages = [mainImage, ...imagesList].filter(Boolean);

      // Build color variants with image mapping (map each color to corresponding image index)
      const colorVarients = buildColorVarientsObjects(colorsList, allImages);

      // Process product data to match exact model structure
      const processedProduct = {
        name: product.name.trim(),
        description: product.description || '',
        price: parseFloat(product.price),
        offerPrice: product.offerPrice && product.offerPrice !== '' ? parseFloat(product.offerPrice) : null,
        originalPrice: product.originalPrice && product.originalPrice !== '' ? parseFloat(product.originalPrice) : null,
        discount: product.discount ? parseFloat(product.discount) : 0,
        category: product.category.toLowerCase(),
        subcategory: product.subcategory || '',
        colorVarients: colorVarients,
        sizeVarients: sizesList,
        image: mainImage || imagesList[0] || 'https://via.placeholder.com/400x300?text=No+Image',
        // Avoid duplicating the main image inside `images` when mainImage is absent and we fallback to imagesList[0]
        images: mainImage ? imagesList : imagesList.slice(1),
        videoUrl: product.videoUrl || null,
        inStock: product.inStock !== undefined ? 
          (product.inStock.toString().toLowerCase() === 'true') : true,
        stockQuantity: product.stockQuantity ? parseInt(product.stockQuantity) : 0,
        isActive: product.isActive !== undefined ? 
          (product.isActive.toString().toLowerCase() === 'true') : true,
        createdBy: userId,
        sellerId: sellerId || null,
        sellerName: sellerName || '',
        updatedBy: null
      };

      processedProducts.push(processedProduct);
    } catch (error) {
      errors.push(`Row ${i + 1}: Error processing product - ${error.message}`);
    }
  }

  return { processedProducts, errors };
};

// Bulk upload products
router.post('/products', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const filePath = req.file.path;
    const fileExt = path.extname(req.file.originalname).toLowerCase();
    
    let rawData;
    
    // Parse file based on extension
    if (fileExt === '.csv') {
      rawData = await parseCSV(filePath);
    } else if (fileExt === '.xlsx' || fileExt === '.xls') {
      rawData = parseExcel(filePath);
    } else {
      return res.status(400).json({
        success: false,
        message: 'Unsupported file format'
      });
    }

    if (!rawData || rawData.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No data found in file'
      });
    }

    // Get seller information if user is a seller
    let sellerId = null;
    let sellerName = '';
    
    if (req.user.role === 'seller') {
      const seller = await Seller.findOne({ email: req.user.email });
      if (seller) {
        sellerId = seller._id;
        sellerName = seller.businessName || seller.name || '';
      }
    }

    // Process and validate data
    const { processedProducts, errors } = await processProductData(rawData, req.user.userId, sellerId, sellerName);

    // Insert valid products
    let insertedCount = 0;
    const insertErrors = [];

    if (processedProducts.length > 0) {
      try {
        const result = await Product.insertMany(processedProducts, { ordered: false });
        insertedCount = result.length;
      } catch (error) {
        if (error.writeErrors) {
          error.writeErrors.forEach(writeError => {
            insertErrors.push(`Product ${writeError.index + 1}: ${writeError.errmsg}`);
          });
          insertedCount = processedProducts.length - error.writeErrors.length;
        } else {
          insertErrors.push(`Bulk insert error: ${error.message}`);
        }
      }
    }

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    // Prepare response
    const allErrors = [...errors, ...insertErrors];
    
    res.json({
      success: true,
      message: `Bulk upload completed. ${insertedCount} products inserted successfully.`,
      successCount: insertedCount,
      errorCount: allErrors.length,
      totalProcessed: processedProducts.length,
      total: rawData.length,
      successful: insertedCount,
      failed: allErrors.length,
      errors: allErrors.slice(0, 50), // Limit errors to first 50
      data: {
        totalRows: rawData.length,
        processedRows: processedProducts.length,
        insertedCount: insertedCount,
        errorCount: allErrors.length,
        errors: allErrors.slice(0, 50)
      }
    });

  } catch (error) {
    // Clean up file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    console.error('Bulk upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Bulk upload failed',
      error: error.message
    });
  }
});

// Get bulk upload template
router.get('/template/products', authenticateToken, (req, res) => {
  try {
    // Header order matches desired CSV/Excel format
    const templateData = [
      {
        name: 'Product1',
        description: 'Sample description 1',
        price: 110,
        offerPrice: 100,
        originalPrice: '',
        discount: 0,
        category: 'localmarket',
        subcategory: 'general',
        colorVarients: 'green;red;gray',
        sizeVarients: 'm;l;xl',
        image: 'https://nobero.com/cdn/shop/files/og.jpg?v=1744007258',
        images: 'https://teetall.pk/cdn/shop/products/354f50347f49b27c850e735e7f570b10-_1.webp?crop=center&height=1733&v=1694555029&width=1300;https://media.istockphoto.com/id/471188329/photo/plain-red-tee-shirt-isolated-on-white-background.jpg?s=612x612&w=0&k=20&c=h1n990JR40ZFbPRDpxKppFziIWrisGcE_d9OqkLVAC4=',
        inStock: true,
        stockQuantity: 101,
        isActive: true
      },
      {
        name: 'Product2',
        description: 'Sample description 2',
        price: 120,
        offerPrice: 110,
        originalPrice: '',
        discount: 0,
        category: 'printing',
        subcategory: 'general',
        colorVarients: 'black;white;blue',
        sizeVarients: 'l;xl',
        image: 'https://images.pexels.com/photos/8532616/pexels-photo-8532616.jpeg?cs=srgb&dl=pexels-anna-nekrashevich-8532616.jpg&fm=jpg',
        images: 'https://i.pinimg.com/564x/c1/1d/16/c11d164de692594acf53c9a855093139.jpg;https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS1I4GPMgj9q7UQMU89T-_1FEVKmxzdS6ikXA&s',
        inStock: true,
        stockQuantity: 102,
        isActive: true
      },
      {
        name: 'Product3',
        description: 'Sample description 3',
        price: 130,
        offerPrice: 120,
        originalPrice: '',
        discount: 0,
        category: 'printing',
        subcategory: 'general',
        colorVarients: 'red;black;blue',
        sizeVarients: 'l;xl',
        image: 'https://img.freepik.com/premium-photo/tshirt-isolated_719385-716.jpg?cs=srgb&dl=pexels-anna-nekrashevich-8532616.jpg&fm=jpg',
        images: 'https://printmytee.in/wp-content/uploads/2021/05/Ruffty-Black-With-Red-Tipping.jpg;https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS1I4GPMgj9q7UQMU89T-_1FEVKmxzdS6ikXA&s',
        inStock: true,
        stockQuantity: 102,
        isActive: true
      }
    ];

    // Create Excel file
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Products');

    // Set response headers for file download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=bulk_upload_template.xlsx');

    // Send file
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.send(buffer);

  } catch (error) {
    console.error('Template generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate template',
      error: error.message
    });
  }
});

// Get upload history
router.get('/history', authenticateToken, async (req, res) => {
  try {
    // This would require a separate model to track upload history
    // For now, return a simple response
    res.json({
      success: true,
      message: 'Upload history feature coming soon',
      data: []
    });
  } catch (error) {
    console.error('Upload history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch upload history',
      error: error.message
    });
  }
});

export default router;